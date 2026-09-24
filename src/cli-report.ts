#!/usr/bin/env node
// Where your coding agent's spend goes, from its local transcripts. Aggregates only: no content, project names
// or paths are printed.
// Usage: quench-report [--agent claude|codex|all] [--days 30] [--json] [--summary <tokens>]
//                      [--claude-root ~/.claude/projects] [--codex-root ~/.codex/sessions]
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { agentReport, claudeParser, codexParser, type Agent, type AgentReport, type LineParser, type Session } from './report.ts'

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
  return requests.length ? { agent, sub, requests } : null
}

const reports: Array<AgentReport & { otherModelRequests: number }> = []
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
  if (sessions.length) reports.push({ ...agentReport(agent, sessions, summary), otherModelRequests: skipped[agent] })
}

if (args.includes('--json')) {
  process.stdout.write(`${JSON.stringify({ days, reports }, null, 2)}\n`)
} else {
  const out = (line = ''): void => { process.stdout.write(`${line}\n`) }
  const pct = (x: number): string => `${Math.round(100 * x)}%`
  const count = (n: number, noun: string): string => `${n.toLocaleString('en-GB')} ${noun}${n === 1 ? '' : 's'}`
  const k = (n: number): string => `${Math.round(n / 1e3)}K`
  const range = (from: number, to: number | null, unit: (n: number) => string): string => (to === null ? `${unit(from)}+` : `${unit(from)}-${unit(to)}`)
  const name: Record<Agent, string> = { claude: 'Claude Code', codex: 'Codex' }
  const setting: Record<Agent, string> = {
    claude: '/autocompact <size> in a session, for example /autocompact 400k (saved as autoCompactWindow; 100K to 1M), or CLAUDE_CODE_AUTO_COMPACT_WINDOW=<tokens> in scripts',
    codex: 'model_auto_compact_token_limit = <tokens> in ~/.codex/config.toml',
  }
  out(`quench report: the last ${days} days of local transcripts, aggregates only`)
  if (!reports.length) out('\nNo transcripts found.')
  for (const r of reports) {
    out(`\n${name[r.agent]}: ${count(r.sessions, 'session')}, ${count(r.subagentTranscripts, 'subagent transcript')}, ${count(r.requests, 'request')}`)
    out(`  Priced at ${r.pricing}.${r.otherModelRequests ? ` Left out: ${count(r.otherModelRequests, 'request')} to non-Claude models, which are priced differently.` : ''}`)
    out(`  Where the cost goes: cache reads ${pct(r.components.cacheReads)}, cache writes and fresh input ${pct(r.components.writesAndFresh)}, output ${pct(r.components.output)}${r.components.thinkingShareOfOutput ? ` (thinking is ${pct(r.components.thinkingShareOfOutput)} of output tokens)` : ''}; subagents ${pct(r.subagentShare)}.`)
    out('  Session cost by session length (requests):')
    for (const g of r.bySessionLength) out(`    ${range(g.from, g.to, String).padEnd(10)} ${String(g.sessions).padStart(5)} sessions  ${pct(g.costShare).padStart(4)} of cost`)
    out('  Session cost by context size at the request:')
    for (const g of r.byContext) out(`    ${range(g.from, g.to, k).padEnd(10)} ${pct(g.requestShare).padStart(4)} of requests  ${pct(g.costShare).padStart(4)} of cost`)
    if (r.compactions.count) out(`  Compactions seen: ${r.compactions.count}; median context ${k(r.compactions.medianBefore)} before, ${k(r.compactions.medianAfter)} after.`)
    if (r.idleRebuilds.requests) out(`  Context sent again after more than an hour idle (the prompt cache had expired): ${count(r.idleRebuilds.requests, 'request')}, median ${k(r.idleRebuilds.medianContext)}, ${pct(r.idleRebuilds.costShare)} of session cost.`)
    if (r.simulation.windows.length) {
      out(`  Compacting earlier, modelled with a ${k(r.simulation.summary)} context after each compaction (${r.simulation.summaryFrom === 'your compactions' ? 'the median after your compactions' : r.simulation.summaryFrom === 'set' ? 'set by --summary' : 'a default'}):`)
      for (const w of r.simulation.windows) out(`    at ${k(w.window).padEnd(6)} ${`${(100 * w.costChange).toFixed(0)}%`.padStart(5)} cost (${pct(w.costShareAbove)} of cost is sent above this size)`)
      out('    An upper bound: it assumes the agent works as well after compacting. In Quench\'s benchmark')
      out('    (sessions up to about 110K) it did not: compacting at task boundaries cost 16% more and lost')
      out('    accepted steps. Sessions above 200K were not tested. No saving is claimed.')
      out(`  The window is set with ${setting[r.agent]}.`)
    }
  }
}
