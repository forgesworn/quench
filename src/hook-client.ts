// The per-turn Claude Code hook (PostToolUse). It asks the session's background
// process for a decision; when there is none yet, it decides in process from
// the transcript so far and starts one. It never fails the agent's turn: any
// error means no hint. QUENCH_HINT=off logs the hint it would have given.
import { spawn } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hookDecider, hintFor, statePaths, type HookReply, type HookRequest } from './hook.ts'

interface HookInput {
  session_id?: string
  transcript_path?: string
  hook_event_name?: string
}

const ask = (socketPath: string, request: HookRequest): Promise<HookReply> => new Promise((resolve, reject) => {
  const socket = connect(socketPath)
  let reply = ''
  socket.setTimeout(500, () => socket.destroy(new Error('timeout')))
  socket.setEncoding('utf8')
  socket.on('connect', () => socket.write(`${JSON.stringify(request)}\n`))
  socket.on('data', (data: string) => { reply += data })
  socket.on('end', () => { try { resolve(JSON.parse(reply) as HookReply) } catch (error) { reject(error) } })
  socket.on('error', reject)
})

async function inProcess(transcript: string, paths: { socket: string; log: string }, request: HookRequest): Promise<HookReply> {
  const [{ LiveSession }, { deciders }] = await Promise.all([import('./live.ts'), import('./deciders/index.ts')])
  const factory = deciders[hookDecider]
  if (!factory) throw new Error(`unknown decider ${hookDecider}`)
  const decisions = new LiveSession(factory()).feed(`${readFileSync(transcript, 'utf8')}\n`)
  const point = decisions.at(-1)?.point ?? 0
  // A process that exited while idle may already have given this session its hint.
  const hinted = existsSync(paths.log) && readFileSync(paths.log, 'utf8').includes('"hint":')
  const stop = hinted ? undefined : decisions.find((decision) => decision.decision === 'stop')
  if (stop) appendFileSync(paths.log, `${JSON.stringify({ t: new Date().toISOString(), hint: request.mode === 'off' ? 'withheld' : 'delivered', stopAt: stop.point, at: point, event: request.event, inProcess: true })}\n`)
  spawn(process.execPath, [join(import.meta.dirname, 'live-daemon.ts'), transcript, paths.socket, paths.log, hookDecider, stop || hinted ? '1' : '0'], { detached: true, stdio: 'ignore' }).unref()
  return { point, hint: stop && request.mode !== 'off' ? hintFor(stop) : null }
}

export async function main(): Promise<void> {
  try {
    const input = JSON.parse(readFileSync(0, 'utf8')) as HookInput
    if (!input.session_id || !input.transcript_path) return
    const request: HookRequest = { event: input.hook_event_name ?? 'PostToolUse', mode: process.env.QUENCH_HINT === 'off' ? 'off' : 'on' }
    const paths = statePaths(input.session_id)
    const reply = await ask(paths.socket, request).catch((error: NodeJS.ErrnoException) => {
      // A socket left by a process that died refuses connections; clear it so a new one can listen.
      if (error.code === 'ECONNREFUSED') rmSync(paths.socket, { force: true })
      return inProcess(input.transcript_path ?? '', paths, request)
    })
    if (reply.hint) process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: request.event, additionalContext: reply.hint } })}\n`)
  } catch (error) {
    // No hint rather than a failed turn; leave a trace where the logs go.
    try { appendFileSync(join(process.env.QUENCH_STATE_DIR ?? tmpdir(), 'quench-errors.jsonl'), `${JSON.stringify({ t: new Date().toISOString(), error: String(error) })}\n`) } catch {}
  }
  // Milliseconds from process start (the time origin) to the decision, for the cold-start budget.
  if (process.env.QUENCH_TIMING) process.stderr.write(`${performance.now().toFixed(2)}\n`)
}
