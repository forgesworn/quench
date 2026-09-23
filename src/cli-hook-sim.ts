#!/usr/bin/env node
// Drives the real hook binary over recorded sessions as Claude Code would: the
// transcript grows line by line and the hook runs after each tool result.
// Checks that the hint arrives at the point replay stops, and times each call.
// Usage: node src/cli-hook-sim.ts [--limit N] [--config quench.local.json]
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfig, loadSessions, type Manifest } from './data.ts'
import { deciders } from './deciders/index.ts'
import { median, percentile, replay } from './harness.ts'
import { hookDecider } from './hook.ts'
import { labelParsed } from './labels.ts'
import { parseSession } from './session.ts'

const option = (name: string): string | undefined => {
  const at = process.argv.indexOf(name)
  return at >= 0 ? process.argv[at + 1] : undefined
}
const config = loadConfig(option('--config'))
const limit = Number(option('--limit') ?? Infinity)
const manifest = JSON.parse(readFileSync(join(config.out, 'manifest.json'), 'utf8')) as Manifest
const hook = join(import.meta.dirname, '..', 'bin', 'quench-hook.mjs')
const state = mkdtempSync(join(tmpdir(), 'qh-'))
const ms: number[] = []
const origin: number[] = []
let sessions = 0
let matched = 0
for (const loaded of loadSessions(config, manifest).slice(0, limit)) {
  sessions += 1
  const parsed = parseSession(loaded.stream, loaded.prompt)
  const expected = replay({ run: '', cell: '', task: '', arm: '', parsed, labels: labelParsed(parsed, []) }, deciders[hookDecider]!).score.stopAt
  const transcript = join(state, `t${sessions}.jsonl`)
  const sessionId = `sim-${sessions}`
  writeFileSync(transcript, `${JSON.stringify({ type: 'user', message: { role: 'user', content: loaded.prompt ?? '' } })}\n`)
  let hintAt: number | null = null
  let results = 0
  for (const line of loaded.stream.split('\n')) {
    appendFileSync(transcript, `${line}\n`)
    if (!line.includes('"tool_result"')) continue
    results += 1
    const start = process.hrtime.bigint()
    const run = spawnSync(process.execPath, [hook], { input: JSON.stringify({ session_id: sessionId, transcript_path: transcript, hook_event_name: 'PostToolUse' }), encoding: 'utf8', env: { ...process.env, QUENCH_STATE_DIR: state, QUENCH_IDLE_MS: '5000', QUENCH_TIMING: '1' } })
    origin.push(Number(run.stderr.trim().split('\n').at(-1)))
    ms.push(Number(process.hrtime.bigint() - start) / 1e6)
    if (run.stdout.trim() && hintAt === null) hintAt = pointOfResult(parsed, results)
  }
  if (hintAt === expected) matched += 1
  else console.log(`${loaded.meta.run}/${loaded.meta.cell}: replay stops at ${expected}, hint at ${hintAt}`)
}
console.log(`${matched}/${sessions} sessions: hint at the replay stop point`)
console.log(`hook time origin to decision over ${origin.length} calls: median ${median(origin)?.toFixed(1)} ms, p99 ${percentile(origin, 99)?.toFixed(1)} ms, max ${Math.max(...origin).toFixed(1)} ms`)
console.log(`hook call wall time over ${ms.length} calls: median ${median(ms)?.toFixed(1)} ms, p99 ${percentile(ms, 99)?.toFixed(1)} ms, first-call max ${Math.max(...ms).toFixed(1)} ms`)

/** The decision point that the n-th tool result belongs to. */
function pointOfResult(p: ReturnType<typeof parseSession>, n: number): number {
  let seen = 0
  for (const point of p.points) {
    seen += point.calls.length
    if (seen >= n) return point.index
  }
  return p.points.length
}
