import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { agentReport, claudeParser, codexParser, cost, costOn, idleRebuilds, naturalCompactions, pricing, simulate, type Request, type Session } from '../src/report.ts'

const MARKER = 'zq-private-marker'

const YESTERDAY = new Date(Date.now() - 864e5).toISOString()
const claudeLine = (id: string, usage: Record<string, unknown>, model = 'claude-sonnet-5', text = `${MARKER} content`, timestamp = YESTERDAY): string =>
  JSON.stringify({ type: 'assistant', timestamp, cwd: `/home/${MARKER}/project`, message: { id, model, content: [{ type: 'text', text }], usage } })
const codexLines = (sub: boolean, usages: Array<{ input: number; cached: number; output: number; total: number }>, model = 'gpt-5.6'): string[] => [
  JSON.stringify({ type: 'session_meta', payload: { cwd: `/home/${MARKER}`, source: sub ? { subagent: { thread_spawn: {} } } : 'cli' } }),
  JSON.stringify({ type: 'turn_context', payload: { model, cwd: `/home/${MARKER}` } }),
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

test('Claude requests are priced in dollars at each model\'s list price', () => {
  const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`)
  close(cost(req(1e6, 1e6, 0, 'claude-opus-5-5'), pricing.claude), 0.2)
  close(cost(req(1e6, 1e6, 0, 'claude-fable-5-1'), pricing.claude), 0.25)
  close(cost(req(1e6, 1e6, 0, 'claude-fable-5'), pricing.claude), 1)
  close(cost(req(1e6, 0, 1e6, 'claude-sonnet-5'), pricing.claude), 2 * 2 + 10)
  close(costOn(req(1e6, 0, 1e6, 'claude-opus-5'), pricing.claude, 'claude-sonnet-5'), 14)
  assert.equal(cost(req(1e6, 0, 1e6, 'claude-unknown-9'), pricing.claude), 0)
  // Older ids put the version first.
  close(cost(req(1e6, 1e6, 0, 'claude-3-5-haiku-20241022'), pricing.claude), 0.08)
  close(cost(req(1e6, 1e6, 0, 'claude-3-7-sonnet-20250219'), pricing.claude), 0.3)
  close(cost(req(1e6, 1e6, 0, 'claude-3-opus-20240229'), pricing.claude), 1.5)
})

test('actions: a fresh start after a break, general-purpose subagents on Sonnet, and effort', () => {
  const hour = 3600e3
  const main: Session = { agent: 'claude', sub: false, requests: [req(40e3, 0, 1, 'claude-opus-5', 0), req(300e3, 0, 1, 'claude-opus-5', 2 * hour)] }
  const general: Session = { agent: 'claude', sub: true, agentType: 'general-purpose', requests: [req(100e3, 0, 1e3, 'claude-opus-5', 0)] }
  const explore: Session = { agent: 'claude', sub: true, agentType: 'Explore', requests: [req(100e3, 0, 1e3, 'claude-opus-5', 0)] }
  const report = agentReport('claude', [main, general, explore])
  assert.deepEqual(report.actions.map((a) => a.id), ['fresh-after-break', 'subagent-model', 'effort'])
  const fresh = report.actions[0]!
  // 300K written again at the one-hour rate, less the 40K base prompt, at $5 per million.
  assert.ok(Math.abs(fresh.saving - 2 * (300e3 - 40e3) * 5e-6) < 1e-9)
  // The setting cannot move Explore, so only the general-purpose agent counts.
  const sub = report.actions[1]!
  assert.ok(Math.abs(sub.saving - (cost(general.requests[0]!, pricing.claude) - costOn(general.requests[0]!, pricing.claude, 'claude-sonnet-5'))) < 1e-9)
  assert.equal(sub.facts.unmovedCost, cost(explore.requests[0]!, pricing.claude))
  // Only an Explore agent on Opus: nothing to suggest.
  assert.deepEqual(agentReport('claude', [main, explore]).actions.map((a) => a.id), ['fresh-after-break', 'effort'])
})

test('a break priced at the five-minute rate never saves more than the request cost', () => {
  const hour = 3600e3
  const five = (ctx: number, at: number): Request => ({ model: 'claude-opus-5', ctx, read: 0, write1h: 0, write5m: ctx, fresh: 0, out: 1, think: 0, at })
  const s: Session = { agent: 'claude', sub: false, requests: [five(10e3, 0), five(400e3, 2 * hour)] }
  const a = agentReport('claude', [s]).actions.find((x) => x.id === 'fresh-after-break')!
  assert.ok(Math.abs(a.saving - 1.25 * (400e3 - 10e3) * 5e-6) < 1e-9)
  assert.ok(a.saving <= cost(s.requests[1]!, pricing.claude))
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
  const lines = Array.from({ length: 80 }, (_, i) => claudeLine(`m${i}`, { input_tokens: 1, cache_read_input_tokens: 50e3 + i * 10e3, cache_creation: { ephemeral_1h_input_tokens: 10e3 }, cache_creation_input_tokens: 10e3, output_tokens: 200 }, i === 79 ? 'deepseek-v4-pro:cloud' : 'claude-sonnet-5'))
  writeFileSync(join(claudeRoot, `-home-${MARKER}-project`, `${MARKER}.jsonl`), `${lines.join('\n')}\n`)
  // A subagent of a custom type, whose name must not be printed.
  mkdirSync(join(claudeRoot, `-home-${MARKER}-project`, MARKER, 'subagents'), { recursive: true })
  writeFileSync(join(claudeRoot, `-home-${MARKER}-project`, MARKER, 'subagents', 'agent-a.jsonl'), `${lines.slice(0, 5).map((l) => l.replace('claude-sonnet-5', 'claude-opus-5')).join('\n')}\n`)
  writeFileSync(join(claudeRoot, `-home-${MARKER}-project`, MARKER, 'subagents', 'agent-a.meta.json'), JSON.stringify({ agentType: `${MARKER}-agent`, description: MARKER }))
  const usages = Array.from({ length: 80 }, (_, i) => ({ input: 50e3 + i * 5e3, cached: 45e3 + i * 5e3, output: 300, total: (i + 1) * 1e6 }))
  writeFileSync(join(codexRoot, '2026', '09', '23', `rollout-${MARKER}.jsonl`), `${codexLines(false, usages).join('\n')}\n`)
  // A model name that is not a known vendor's could name a project, so it is not printed.
  writeFileSync(join(codexRoot, '2026', '09', '23', `rollout-${MARKER}-2.jsonl`), `${codexLines(false, usages, `${MARKER}-model`).join('\n')}\n`)
  for (const extra of [[], ['--json']]) {
    const run = spawnSync(process.execPath, ['src/cli-report.ts', '--claude-root', claudeRoot, '--codex-root', codexRoot, ...extra], { encoding: 'utf8' })
    assert.equal(run.status, 0, run.stderr)
    assert.match(run.stdout, extra.length ? /"agent": "codex"/ : /Codex: 2 sessions, 0 subagent transcripts/)
    assert.match(run.stdout, extra.length ? /"otherModelRequests": 1/ : /Claude Code: 1 session, 1 subagent transcript, 84 requests/)
    for (const secret of [MARKER, dir, 'home']) assert.equal(run.stdout.includes(secret) || run.stderr.includes(secret), false, `output contains ${secret}`)
  }
})

test('--days leaves out requests older than the window, even in a recent file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'quench-days-'))
  mkdirSync(join(dir, 'p'), { recursive: true })
  const old = new Date(Date.now() - 90 * 864e5).toISOString()
  const lines = [...Array.from({ length: 50 }, (_, i) => claudeLine(`o${i}`, { input_tokens: 1, output_tokens: 1 }, 'claude-haiku-4-5', 'x', old)), claudeLine('new', { input_tokens: 1, output_tokens: 1 })]
  writeFileSync(join(dir, 'p', 's.jsonl'), `${lines.join('\n')}\n`)
  const run = spawnSync(process.execPath, ['src/cli-report.ts', '--claude-root', dir, '--codex-root', join(dir, 'none'), '--days', '7'], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /1 session, 0 subagent transcripts, 1 request\b/)
})

test('the published build runs without type stripping', () => {
  const out = mkdtempSync(join(tmpdir(), 'quench-build-'))
  const build = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.build.json', '--outDir', out], { encoding: 'utf8' })
  assert.equal(build.status, 0, build.stdout)
  const run = spawnSync(process.execPath, [join(out, 'cli-report.js'), '--claude-root', join(out, 'none'), '--codex-root', join(out, 'none')], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /No transcripts found/)
})
