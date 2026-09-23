import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { agentReport, claudeParser, codexParser, cost, idleRebuilds, naturalCompactions, pricing, simulate, type Request, type Session } from '../src/report.ts'

const MARKER = 'zq-private-marker'

const claudeLine = (id: string, usage: Record<string, unknown>, model = 'claude-sonnet-5', text = `${MARKER} content`): string =>
  JSON.stringify({ type: 'assistant', timestamp: '2026-09-23T10:00:00Z', cwd: `/home/${MARKER}/project`, message: { id, model, content: [{ type: 'text', text }], usage } })
const codexLines = (sub: boolean, usages: Array<{ input: number; cached: number; output: number; total: number }>): string[] => [
  JSON.stringify({ type: 'session_meta', payload: { cwd: `/home/${MARKER}`, source: sub ? { subagent: { thread_spawn: {} } } : 'cli' } }),
  JSON.stringify({ type: 'turn_context', payload: { model: 'gpt-5.6', cwd: `/home/${MARKER}` } }),
  JSON.stringify({ type: 'response_item', payload: { type: 'message', content: [{ type: 'input_text', text: MARKER }] } }),
  ...usages.map((u) => JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { total_tokens: u.total }, last_token_usage: { input_tokens: u.input, cached_input_tokens: u.cached, output_tokens: u.output, reasoning_output_tokens: 1 } } } })),
]

test('Claude parser keeps one request per message, with its last usage, in order', () => {
  const p = claudeParser()
  p.line(claudeLine('a', { input_tokens: 5, cache_read_input_tokens: 100, output_tokens: 1 }))
  p.line(claudeLine('b', { input_tokens: 1, cache_read_input_tokens: 0, cache_creation: { ephemeral_1h_input_tokens: 50 }, cache_creation_input_tokens: 50, output_tokens: 3 }))
  p.line(claudeLine('a', { input_tokens: 5, cache_read_input_tokens: 100, output_tokens: 9, output_tokens_details: { thinking_tokens: 4 } }))
  p.line(claudeLine('c', { input_tokens: 1, output_tokens: 1 }, '<synthetic>'))
  p.line(JSON.stringify({ type: 'user', message: { id: 'd', usage: { input_tokens: 1 } } }))
  p.line('not json "usage"')
  const r = p.requests()
  assert.deepEqual(r.map((x) => [x.ctx, x.out, x.think, x.write1h]), [[105, 9, 4, 0], [51, 3, 0, 50]])
})

test('Codex parser skips repeated counts and reads cached tokens inside input', () => {
  const p = codexParser()
  for (const line of codexLines(true, [{ input: 100, cached: 60, output: 5, total: 105 }, { input: 100, cached: 60, output: 5, total: 105 }, { input: 150, cached: 100, output: 7, total: 262 }])) p.line(line)
  assert.equal(p.sub(), true)
  assert.deepEqual(p.requests().map((x) => [x.model, x.ctx, x.read, x.fresh, x.out]), [['gpt-5.6', 100, 60, 40, 5], ['gpt-5.6', 150, 100, 50, 7]])
})

const req = (ctx: number, read: number, out = 100, model = 'claude-sonnet-5', at: number | null = null): Request => ({ model, ctx, read, write1h: ctx - read, write5m: 0, fresh: 0, out, think: 0, at })

test('pricing weights cache reads by model', () => {
  assert.equal(cost(req(1000, 1000, 0, 'claude-opus-5-5'), pricing.claude), 50)
  assert.equal(cost(req(1000, 1000, 0, 'claude-fable-5-1'), pricing.claude), 25)
  assert.equal(cost(req(1000, 0, 10), pricing.claude), 2050)
})

test('compacting at a window cuts modelled cost of a growing session, and a window above it changes nothing', () => {
  const requests = Array.from({ length: 200 }, (_, i) => req(20e3 + i * 5e3, i ? 20e3 + (i - 1) * 5e3 : 0))
  const s: Session = { agent: 'claude', sub: false, requests }
  const none = simulate(s, pricing.claude, null, 30e3)
  assert.equal(simulate(s, pricing.claude, 2e6, 30e3), none)
  assert.ok(simulate(s, pricing.claude, 200e3, 30e3) < 0.6 * none)
})

test('a recorded compaction is found and not modelled twice', () => {
  const up = Array.from({ length: 40 }, (_, i) => req(100e3 + i * 5e3, 100e3 + (i - 1) * 5e3))
  const down = Array.from({ length: 40 }, (_, i) => req(30e3 + i * 5e3, 30e3 + (i - 1) * 5e3))
  const s: Session = { agent: 'claude', sub: false, requests: [...up, ...down] }
  const drops = naturalCompactions([s])
  assert.equal(drops.length, 1)
  assert.equal(drops[0]?.after, 30e3)
  const report = agentReport('claude', [s, { ...s, sub: true }])
  assert.equal(report.compactions.count, 1)
  assert.equal(Math.round(report.subagentShare * 100), 50)
  assert.equal(report.simulation.summaryFrom, 'default')
})

test('a large context sent uncached after an hour idle is an idle rebuild', () => {
  const hour = 3600e3
  const s: Session = { agent: 'claude', sub: false, requests: [req(100e3, 0, 1, 'm', 0), req(101e3, 100e3, 1, 'm', 60e3), req(102e3, 0, 1, 'm', 60e3 + 2 * hour), req(103e3, 0, 1, 'm', 60e3 + 2 * hour + 1e3), req(30e3, 0, 1, 'm', 60e3 + 5 * hour)] }
  assert.deepEqual(idleRebuilds(s).map((r) => r.ctx), [102e3])
})

test('the report prints no transcript content, project names or paths', () => {
  const dir = mkdtempSync(join(tmpdir(), 'quench-report-'))
  const claudeRoot = join(dir, 'claude')
  const codexRoot = join(dir, 'codex')
  mkdirSync(join(claudeRoot, `-home-${MARKER}-project`), { recursive: true })
  mkdirSync(join(codexRoot, '2026', '09', '23'), { recursive: true })
  const lines = Array.from({ length: 80 }, (_, i) => claudeLine(`m${i}`, { input_tokens: 1, cache_read_input_tokens: 50e3 + i * 10e3, cache_creation: { ephemeral_1h_input_tokens: 10e3 }, cache_creation_input_tokens: 10e3, output_tokens: 200 }))
  writeFileSync(join(claudeRoot, `-home-${MARKER}-project`, `${MARKER}.jsonl`), `${lines.join('\n')}\n`)
  const usages = Array.from({ length: 80 }, (_, i) => ({ input: 50e3 + i * 5e3, cached: 45e3 + i * 5e3, output: 300, total: (i + 1) * 1e6 }))
  writeFileSync(join(codexRoot, '2026', '09', '23', `rollout-${MARKER}.jsonl`), `${codexLines(false, usages).join('\n')}\n`)
  for (const extra of [[], ['--json']]) {
    const run = spawnSync(process.execPath, ['src/cli-report.ts', '--claude-root', claudeRoot, '--codex-root', codexRoot, ...extra], { encoding: 'utf8' })
    assert.equal(run.status, 0, run.stderr)
    assert.match(run.stdout, extra.length ? /"agent": "codex"/ : /Codex: 1 session, 0 subagent transcripts/)
    for (const secret of [MARKER, dir, 'home']) assert.equal(run.stdout.includes(secret) || run.stderr.includes(secret), false, `output contains ${secret}`)
  }
})
