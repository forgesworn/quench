#!/usr/bin/env node
// One background process per agent session. It holds the decider in memory,
// reads only the bytes appended to the transcript since the last request, and
// answers the per-turn hook over a Unix socket. It logs every decision and
// every hint delivered, and exits after 30 idle minutes (QUENCH_IDLE_MS).
// Usage: node src/live-daemon.ts <transcript> <socket> <log> <decider> [delivered]
import { appendFileSync, closeSync, fstatSync, openSync, readSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { StringDecoder } from 'node:string_decoder'
import { deciders } from './deciders/index.ts'
import { hintFor, type HookReply, type HookRequest } from './hook.ts'
import { LiveSession, type PointDecision } from './live.ts'

const [transcript = '', socketPath = '', logPath = '', deciderName = '', deliveredFlag] = process.argv.slice(2)
const factory = deciders[deciderName]
if (!factory) throw new Error(`unknown decider ${deciderName}`)
const live = new LiveSession(factory())
const decoder = new StringDecoder('utf8')
let offset = 0
let point = 0
let stop: PointDecision | null = null
let delivered = deliveredFlag === '1'

const log = (entry: object): void => appendFileSync(logPath, `${JSON.stringify({ t: new Date().toISOString(), ...entry })}\n`)

function catchUp(): void {
  const fd = openSync(transcript, 'r')
  try {
    const size = fstatSync(fd).size
    const buffer = Buffer.alloc(Math.max(0, size - offset))
    const read = buffer.length ? readSync(fd, buffer, 0, buffer.length, offset) : 0
    offset += read
    for (const decision of live.feed(decoder.write(buffer.subarray(0, read)))) {
      point = decision.point
      log({ point: decision.point, decision: decision.decision, reason: decision.reason })
      if (decision.decision === 'stop' && !stop) stop = decision
    }
  } finally {
    closeSync(fd)
  }
}

function answer(request: HookRequest): HookReply {
  catchUp()
  if (!stop || delivered) return { point, hint: null }
  delivered = true
  const deliver = request.mode !== 'off'
  log({ hint: deliver ? 'delivered' : 'withheld', stopAt: stop.point, at: point, event: request.event })
  return { point, hint: deliver ? hintFor(stop) : null }
}

let idle: NodeJS.Timeout | undefined
const touch = (): void => {
  clearTimeout(idle)
  idle = setTimeout(() => server.close(), Number(process.env.QUENCH_IDLE_MS ?? 30 * 60 * 1000))
}

const server = createServer((socket) => {
  touch()
  let input = ''
  socket.setEncoding('utf8')
  socket.on('data', (data: string) => {
    input += data
    const end = input.indexOf('\n')
    if (end < 0) return
    let reply: HookReply
    try { reply = answer(JSON.parse(input.slice(0, end)) as HookRequest) } catch (error) { reply = { point, hint: null, error: String(error) } }
    socket.end(`${JSON.stringify(reply)}\n`)
  })
  socket.on('error', () => {})
})
server.on('close', () => rmSync(socketPath, { force: true }))
server.on('error', () => process.exit(0))
server.listen(socketPath, () => {
  log({ started: deciderName, transcript })
  touch()
})
