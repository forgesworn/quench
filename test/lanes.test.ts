import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { byClass, dollars, loadLane, qualifies, RATES, streamResult } from '../src/lanes.ts'

const MARKER = 'zq-lane-secret'
const result = (subtype: string, turns: number, usage: Record<string, number>) =>
  JSON.stringify({ type: 'result', subtype, num_turns: turns, result: MARKER, modelUsage: { m: usage } })

function cell(dir: string, rep: string, task: string, category: string, accepted: boolean, subtype = 'success') {
  const cellDir = join(dir, rep, task, 'plain')
  mkdirSync(cellDir, { recursive: true })
  const stream = join(cellDir, 'executor.stream.jsonl')
  writeFileSync(stream, `${JSON.stringify({ type: 'assistant', message: { content: MARKER } })}\n${result(subtype, 10, { inputTokens: 1e6, cacheReadInputTokens: 2e6, cacheCreationInputTokens: 0, outputTokens: 1e5 })}\n`)
  writeFileSync(join(cellDir, 'receipt.json'), JSON.stringify({ task, category, accepted, executorRun: { seconds: 100, streamPath: stream } }))
}

test('a lane is scored per task class against the reference, less one', () => {
  const ref = mkdtempSync(join(tmpdir(), 'quench-ref-'))
  const lane = mkdtempSync(join(tmpdir(), 'quench-lane-'))
  for (const rep of ['rep1', 'rep2', 'rep3']) for (const task of ['orientation-a', 'orientation-b']) cell(ref, rep, task, 'orientation', true)
  for (const rep of ['rep1', 'rep2', 'rep3']) for (const task of ['orientation-a', 'orientation-b']) cell(lane, rep, task, 'orientation', !(rep === 'rep1' && task === 'orientation-a'), rep === 'rep1' && task === 'orientation-a' ? 'error_max_turns' : 'success')
  // A cell moved aside is not counted.
  mkdirSync(join(lane, 'rep1', 'orientation-b.stopped', 'plain'), { recursive: true })
  const c = byClass(loadLane(lane)).get('orientation')!
  assert.deepEqual([c.sessions, c.accepted, c.turnLimits], [6, 5, 1])
  assert.equal(qualifies(c, byClass(loadLane(ref)).get('orientation')), true)
  assert.equal(qualifies({ ...c, accepted: 4 }, byClass(loadLane(ref)).get('orientation')), false)
  assert.equal(qualifies({ ...c, sessions: 3 }, byClass(loadLane(ref)).get('orientation')), null)
  // Six sessions of 1M fresh, 2M cached and 0.1M output at the Flash rate.
  assert.ok(Math.abs(dollars(c.tokens, RATES['deepseek-v4.1-flash:cloud']!) - 6 * (0.3 + 2 * 0.006 + 0.1 * 1.2)) < 1e-9)
  const run = spawnSync(process.execPath, ['src/cli-lanes.ts', '--reference', ref, '--lane', `deepseek-v4.1-flash:cloud=${lane}`], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /orientation\t5\/6\t6\/6\tyes\t1\t/)
  assert.ok(!run.stdout.includes(MARKER))
})

test('the stream result gives turns, the turn limit and tokens', () => {
  const r = streamResult(`noise\n${result('error_max_turns', 80, { inputTokens: 5, cacheReadInputTokens: 7, outputTokens: 3 })}\n`)
  assert.deepEqual(r, { turns: 80, turnLimit: true, tokens: { fresh: 5, cacheRead: 7, cacheWrite: 0, output: 3 } })
})
