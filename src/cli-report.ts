#!/usr/bin/env node
// Where your coding agent's spend goes, from its local transcripts. Aggregates only: no content, project names
// or paths are printed.
// Usage: quench-report [--agent claude|codex|all] [--days 30] [--json] [--summary <tokens>]
//                      [--claude-root ~/.claude/projects] [--codex-root ~/.codex/sessions]
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { agentReport, claudeParser, codexParser, premiumSubagentShare, type Agent, type AgentReport, type LineParser, type Session } from './report.ts'
import { quenchHome, readState } from './settings.ts'

const args = process.argv.slice(2)
const option = (name: string): string | undefined => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : undefined }
const agentOption = option('--agent') ?? 'all'
if (!['claude', 'codex', 'all'].includes(agentOption)) throw new Error('--agent must be claude, codex or all')
const days = Number(option('--days') ?? '30')
const summaryOption = option('--summary')
const summary = summaryOption === undefined ? undefined : Number(summaryOption)
const roots: Record<Agent, string> = {
  claude: option('--claude-root') ?? join(homedir(), '.claude', 'projects'),
  codex: option('--codex-root') ?? join(homedir(), '.codex', 'sessions'),
}
const since = Date.now() - days * 864e5
const skipped: Record<Agent, number> = { claude: 0, codex: 0 }

function transcripts(root: string, depth: number): string[] {
  const out: string[] = []
  const walk = (dir: string, level: number): void => {
    let names: string[]
    try { names = readdirSync(dir) } catch { return }
    for (const name of names) {
      const path = join(dir, name)
      let stat
      try { stat = statSync(path) } catch { continue }
      if (stat.isDirectory() && level < depth) walk(path, level + 1)
      else if (name.endsWith('.jsonl') && stat.mtimeMs > since) out.push(path)
    }
  }
  if (existsSync(root)) walk(root, 0)
  return out
}

async function read(agent: Agent, path: string): Promise<Session | null> {
  const parser: LineParser = agent === 'claude' ? claudeParser() : codexParser()
  try {
    for await (const line of createInterface({ input: createReadStream(path), crlfDelay: Infinity })) parser.line(line)
  } catch { return null }
  // Claude Code can route to other models (a gateway, a local server); their prices differ, so they are left out.
  const all = parser.requests()
  const requests = agent === 'claude' ? all.filter((r) => r.model.startsWith('claude')) : all
  skipped[agent] += all.length - requests.length
  const sub = agent === 'claude' ? path.includes('/subagents/') : parser.sub()
  if (!requests.length) return null
  const agentType = sub && agent === 'claude' ? subagentType(path) : undefined
  return { agent, sub, requests, ...(agentType ? { agentType } : {}) }
}

// Claude Code writes <agent>.meta.json beside a subagent transcript. Only built-in type names are kept: a custom
// agent's name could name a project.
const BUILT_IN = new Set(['general-purpose', 'Explore', 'Plan', 'claude-code-guide', 'statusline-setup', 'output-style-setup', 'fork'])
function subagentType(path: string): string | undefined {
  try {
    const type = (JSON.parse(readFileSync(path.replace(/\.jsonl$/, '.meta.json'), 'utf8')) as { agentType?: unknown }).agentType
    return typeof type === 'string' ? (BUILT_IN.has(type) ? type : 'custom') : undefined
  } catch { return undefined }
}

const reports: Array<AgentReport & { otherModelRequests: number }> = []
const sessionsBy: Partial<Record<Agent, Session[]>> = {}
for (const agent of ['claude', 'codex'] as const) {
  if (agentOption !== 'all' && agentOption !== agent) continue
  const files = transcripts(roots[agent], agent === 'claude' ? 3 : 4)
  const sessions: Session[] = []
  let done = 0
  for (const file of files) {
    const session = await read(agent, file)
    if (session) sessions.push(session)
    done += 1
    if (process.stderr.isTTY) process.stderr.write(`\r${agent}: ${done}/${files.length} transcripts`)
  }
  if (process.stderr.isTTY && files.length) process.stderr.write('\r\x1b[K')
  sessionsBy[agent] = sessions
  if (sessions.length) reports.push({ ...agentReport(agent, sessions, summary), otherModelRequests: skipped[agent] })
}

const state = readState()
const day = (iso: string): string => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
function appliedLines(): string[] {
  const lines: string[] = []
  const sub = state.applied['subagent-model']
  if (sub) {
    const at = Date.parse(sub.at)
    const before = premiumSubagentShare(sessionsBy.claude ?? [], since, at)
    const after = premiumSubagentShare(sessionsBy.claude ?? [], at, Infinity)
    lines.push(`subagent-model since ${day(sub.at)}: subagents on models dearer than Sonnet 5 took ${Math.round(100 * after.share)}% of cost (${after.requests.toLocaleString('en-GB')} requests), against ${Math.round(100 * before.share)}% before.`)
  }
  const guard = state.applied['break-guard']
  if (guard) {
    let held: Array<{ at: string; usd?: number | null }> = []
    try { held = readFileSync(join(quenchHome(), 'guard.log'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) } catch {}
    held = held.filter((h) => Date.parse(h.at) >= Date.parse(guard.at))
    const usd = held.reduce((a, h) => a + (h.usd ?? 0), 0)
    lines.push(`break-guard since ${day(guard.at)}: held ${held.length} prompt${held.length === 1 ? '' : 's'} after a break${held.length ? `; sending each straight away would have written about $${usd.toFixed(2)} in all` : ''}.`)
  }
  return lines
}

if (args.includes('--json')) {
  process.stdout.write(`${JSON.stringify({ days, reports, applied: appliedLines() }, null, 2)}\n`)
} else {
  const out = (line = ''): void => { process.stdout.write(`${line}\n`) }
  const pct = (x: number): string => `${Math.round(100 * x)}%`
  const count = (n: number, noun: string): string => `${n.toLocaleString('en-GB')} ${noun}${n === 1 ? '' : 's'}`
  const k = (n: number): string => `${Math.round(n / 1e3)}K`
  const range = (from: number, to: number | null, unit: (n: number) => string): string => (to === null ? `${unit(from)}+` : `${unit(from)}-${unit(to)}`)
  const name: Record<Agent, string> = { claude: 'Claude Code', codex: 'Codex' }
  const model = (id: string): string => (!id.startsWith('claude-') ? id : id.replace(/^claude-/, '').replace(/-(\d+)-(\d+)(?=$|-)/, ' $1.$2').replace(/-(\d+)(?=$|-)/, ' $1').replace(/-\d{8}$/, ''))
  const setting: Record<Agent, string> = {
    claude: '/autocompact <size> in a session (saved as autoCompactWindow; 100K to 1M), or CLAUDE_CODE_AUTO_COMPACT_WINDOW=<tokens> in scripts',
    codex: 'model_auto_compact_token_limit = <tokens> in ~/.codex/config.toml',
  }
  const effortSetting: Record<Agent, string> = { claude: '/effort', codex: 'model_reasoning_effort' }
  out(`quench report: the last ${days} days of local transcripts, aggregates only`)
  if (!reports.length) out('\nNo transcripts found.')
  for (const r of reports) {
    const money = (x: number): string => (r.currency === 'USD' ? `$${x >= 100 ? Math.round(x).toLocaleString('en-GB') : x.toFixed(2)}` : `${Math.round(x / 1e6).toLocaleString('en-GB')}M base-input units`)
    out(`\n${name[r.agent]}: ${count(r.sessions, 'session')}, ${count(r.subagentTranscripts, 'subagent transcript')}, ${count(r.requests, 'request')}`)
    out(`  ${r.currency === 'USD' ? `${money(r.total)} at API list prices (a subscription pays a flat fee; its limits follow the same token costs)` : `${money(r.total)} (relative multipliers; no dollar price is known for these models)`}.`)
    out(`  Priced with ${r.pricing}.${r.otherModelRequests ? ` Left out: ${count(r.otherModelRequests, 'request')} to non-Claude models.` : ''}${r.unpricedRequests ? ` ${count(r.unpricedRequests, 'request')} to models without a known price count as zero.` : ''}`)

    out('\n  Actions')
    let n = 0
    for (const a of r.actions) {
      n += 1
      const f = a.facts
      if (a.id === 'fresh-after-break') {
        out(`  ${n}. After a break of more than an hour, start new work in a fresh session (/clear) instead of carrying on.`)
        out(`     ${count(Number(f.breaks), 'time')} you came back to a session whose prompt cache had expired, so its whole context (median ${k(Number(f.medianContext))}) was written again at 2x.`)
        out(`     A fresh session writes only its ${k(Number(f.basePrompt))} base prompt: up to ${money(a.saving)} (${pct(a.share)}) if the work was new. Keep the session when you are continuing the same task.`)
        if (r.agent === 'claude') out(state.applied['break-guard'] ? `     Applied: the break guard has been on since ${day(state.applied['break-guard'].at)}.` : '     Do it: quench apply break-guard (holds the first prompt after such a break once, with its cost)')
      } else if (a.id === 'subagent-model') {
        out(`  ${n}. Run subagents on Sonnet 5 unless the task needs a stronger model (the model setting on the Agent tool, or CLAUDE_CODE_SUBAGENT_MODEL=sonnet).`)
        out(`     Subagents on dearer models cost ${money(Number(f.premiumCost))} (${pct(Number(f.premiumShare))}), most of it ${f.topType === 'custom' ? 'custom agents' : `${f.topType} agents`} (${money(Number(f.topTypeCost))}).`)
        out(`     The same tokens on Sonnet 5 would cost ${money(a.saving)} (${pct(a.share)}) less. The quality of the switch is not measured.`)
        out(state.applied['subagent-model'] ? `     Applied on ${day(state.applied['subagent-model'].at)}; see Applied below.` : '     Do it: quench apply subagent-model')
      } else if (a.id === 'effort') {
        out(`  ${n}. Do not lower reasoning effort to save money: thinking is only ${pct(a.share)} of cost (${pct(r.components.thinkingShareOfOutput)} of output tokens), so lowering ${effortSetting[r.agent]} saves at most that.`)
      } else if (a.id === 'keep-window') {
        out(`  ${n}. Do not shrink the auto-compact window to save money. In Quench's benchmark (sessions up to about 110K),`)
        out('     compacting at task boundaries cost 16% more and lost accepted steps; above 200K is untested.')
      }
      out(`     Evidence: ${a.evidence}.`)
    }

    const applied = r.agent === 'claude' ? appliedLines() : []
    if (applied.length) {
      out('\n  Applied')
      for (const line of applied) out(`    ${line}`)
    }

    out('\n  Where the cost goes')
    out(`    By kind: cache reads ${pct(r.components.cacheReads)}, cache writes and fresh input ${pct(r.components.writesAndFresh)}, output ${pct(r.components.output)}; subagents ${pct(r.subagentShare)}.`)
    if (r.byModel.length > 1) out(`    By model: ${r.byModel.slice(0, 6).map((m) => `${model(m.model)} ${pct(m.share)}`).join(', ')}.`)
    out('    By session length (requests):')
    for (const g of r.bySessionLength) out(`      ${range(g.from, g.to, String).padEnd(10)} ${String(g.sessions).padStart(5)} sessions  ${pct(g.costShare).padStart(4)} of session cost`)
    out('    By context size at the request:')
    for (const g of r.byContext) out(`      ${range(g.from, g.to, k).padEnd(10)} ${pct(g.requestShare).padStart(4)} of requests  ${pct(g.costShare).padStart(4)} of session cost`)
    if (r.compactions.count) out(`    Compactions seen: ${r.compactions.count}; median context ${k(r.compactions.medianBefore)} before, ${k(r.compactions.medianAfter)} after.`)
    if (r.simulation.windows.length) {
      out(`    Compacting earlier, modelled (an upper bound that assumes the agent works as well afterwards; see action ${r.actions.findIndex((a) => a.id === 'keep-window') + 1}):`)
      out(`      ${r.simulation.windows.map((w) => `${k(w.window)} ${(100 * w.costChange).toFixed(0)}%`).join(', ')}. Set with ${setting[r.agent]}.`)
    }
  }
}
