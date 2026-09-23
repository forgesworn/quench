#!/usr/bin/env node
// Where Claude Code spend goes, from local transcripts. Aggregates only: prints no content and no project names.
// Usage: quench-anatomy [--root ~/.claude/projects] [--days 30]
// Cost is in base-input units at the multipliers Claude Code incurs: one-hour cache write 2x (five-minute 1.25x),
// cache read 0.1x (0.05x on Opus 5.5, 0.025x on Fable and Mythos), output 5x.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const option = (name: string, fallback: string): string => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] ?? fallback : fallback }
const root = option('--root', join(homedir(), '.claude', 'projects'))
const since = Date.now() - Number(option('--days', '30')) * 864e5

interface Request { model: string; ctx: number; read: number; w1h: number; w5m: number; fresh: number; out: number; think: number }
interface Session { sub: boolean; requests: Request[] }

const files: Array<{ path: string; sub: boolean }> = []
const walk = (dir: string, depth: number): void => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    const stat = statSync(path)
    if (stat.isDirectory() && depth < 3) walk(path, depth + 1)
    else if (name.endsWith('.jsonl') && stat.mtimeMs > since) files.push({ path, sub: path.includes('/subagents/') })
  }
}
walk(root, 0)

const sessions: Session[] = []
for (const file of files) {
  let text: string
  try { text = readFileSync(file.path, 'utf8') } catch { continue }
  const byId = new Map<string, Request>()
  const order: string[] = []
  for (const line of text.split('\n')) {
    if (!line) continue
    let e: { type?: string; message?: { id?: string; model?: string; usage?: Record<string, any> } }
    try { e = JSON.parse(line) } catch { continue }
    const u = e.message?.usage
    const id = e.message?.id
    if (e.type !== 'assistant' || !u || !id || e.message?.model === '<synthetic>') continue
    const w1h = u.cache_creation?.ephemeral_1h_input_tokens ?? 0
    const w5m = u.cache_creation?.ephemeral_5m_input_tokens ?? Math.max(0, (u.cache_creation_input_tokens ?? 0) - w1h)
    // A message streams in several lines; the last carries its final usage.
    if (!byId.has(id)) order.push(id)
    byId.set(id, {
      model: e.message?.model ?? '', ctx: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
      read: u.cache_read_input_tokens ?? 0, w1h, w5m, fresh: u.input_tokens ?? 0, out: u.output_tokens ?? 0,
      think: u.output_tokens_details?.thinking_tokens ?? 0,
    })
  }
  if (order.length) sessions.push({ sub: file.sub, requests: order.map((id) => byId.get(id) as Request) })
}

const readMultiplier = (model: string): number => (/opus-5-5/.test(model) ? 0.05 : /fable|mythos/.test(model) ? 0.025 : 0.1)
const parts = (r: Request) => ({ read: readMultiplier(r.model) * r.read, write: 2 * r.w1h + 1.25 * r.w5m + r.fresh, out: 5 * r.out })
const cost = (r: Request): number => { const p = parts(r); return p.read + p.write + p.out }
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0)
const pct = (x: number, total: number): string => `${total ? ((100 * x) / total).toFixed(0) : '0'}%`
const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0

const main = sessions.filter((s) => !s.sub)
const all = sessions.flatMap((s) => s.requests)
const total = sum(all.map(cost))
const out = (line: string): void => { process.stdout.write(`${line}\n`) }
out(`transcripts ${files.length}: main sessions ${main.length}, subagent transcripts ${sessions.length - main.length}; requests ${all.length}`)
out(`subagents: ${pct(sum(sessions.filter((s) => s.sub).flatMap((s) => s.requests).map(cost)), total)} of cost`)
out(`components: cache reads ${pct(sum(all.map((r) => parts(r).read)), total)}, cache writes and fresh input ${pct(sum(all.map((r) => parts(r).write)), total)}, output ${pct(sum(all.map((r) => parts(r).out)), total)} (thinking ${pct(sum(all.map((r) => r.think)), sum(all.map((r) => r.out)))} of output tokens)`)

const mainCost = sum(main.flatMap((s) => s.requests).map(cost))
out('\nmain-session cost by session length (requests)')
for (const [lo, hi] of [[0, 30], [30, 100], [100, 300], [300, 1000], [1000, Infinity]] as const) {
  const group = main.filter((s) => s.requests.length >= lo && s.requests.length < hi)
  out(`  ${lo}-${hi === Infinity ? '' : hi}: ${group.length} sessions, ${pct(sum(group.flatMap((s) => s.requests).map(cost)), mainCost)}`)
}
out('main-session cost by context size at the request')
const mainRequests = main.flatMap((s) => s.requests)
for (const [lo, hi] of [[0, 50e3], [50e3, 100e3], [100e3, 200e3], [200e3, 400e3], [400e3, Infinity]] as const) {
  const group = mainRequests.filter((r) => r.ctx >= lo && r.ctx < hi)
  const c = sum(group.map(cost))
  out(`  ${lo / 1e3}K-${hi === Infinity ? '' : `${hi / 1e3}K`}: ${pct(group.length, mainRequests.length)} of requests, ${pct(c, mainCost)} of cost (reads ${pct(sum(group.map((r) => parts(r).read)), c)} within)`)
}

// Natural compactions: a context drop of more than 40% from above 100K, with 30 requests either side.
const W = 30
const drops: Array<{ before: number; after: number; growth: number }> = []
for (const s of main) {
  const r = s.requests
  const growth = (a: number, b: number): number => { let t = 0; for (let k = a + 1; k <= b; k += 1) t += Math.max(0, (r[k] as Request).ctx - (r[k - 1] as Request).ctx); return t / (b - a) }
  for (let i = W + 1; i + W < r.length; i += 1) {
    const prev = (r[i - 1] as Request).ctx
    if ((r[i] as Request).ctx < 0.6 * prev && prev >= 100e3) drops.push({ before: prev, after: (r[i] as Request).ctx, growth: growth(i, i + W) / Math.max(1, growth(i - 1 - W, i - 1)) })
  }
}
out(`\nnatural compactions (30 requests either side): ${drops.length}; context before ${Math.round(median(drops.map((d) => d.before)) / 1e3)}K, after ${Math.round(median(drops.map((d) => d.after)) / 1e3)}K (medians); growth per request after/before ${median(drops.map((d) => d.growth)).toFixed(2)}`)

// Counterfactual compaction window, same behaviour assumed (an upper bound). Modelled cost with no intervention is
// reported too: the model omits real cache rebuilds, so compare each window with it, not with the recorded cost.
function simulate(s: Session, compactAt: number | null, summary = 30e3): number {
  let modelled = 0
  let ctx = (s.requests[0] as Request).ctx
  s.requests.forEach((r, i) => {
    if (i === 0) { modelled += cost(r); return }
    const prevReal = (s.requests[i - 1] as Request).ctx
    const delta = r.ctx - prevReal
    if (delta < -0.4 * prevReal) { ctx = Math.min(ctx, r.ctx); modelled += cost(r); return }
    const hitPrefix = ctx
    ctx += Math.max(0, delta)
    let extra = 0
    let rewriteFrom = hitPrefix
    if (compactAt !== null && ctx >= compactAt) {
      extra = readMultiplier(r.model) * ctx + (5 * summary) / 3
      ctx = summary
      rewriteFrom = 0
    }
    const hit = Math.min(rewriteFrom, ctx)
    modelled += readMultiplier(r.model) * hit + 2 * (ctx - hit) + 5 * r.out + extra
  })
  return modelled
}
const none = sum(main.map((s) => simulate(s, null)))
out(`\ncompaction window, same behaviour assumed (modelled cost with no intervention is ${pct(none - mainCost, mainCost)} against recorded)`)
for (const window of [600e3, 400e3, 200e3, 120e3]) {
  const modelled = sum(main.map((s) => simulate(s, window)))
  out(`  compact at ${window / 1e3}K: ${(100 * (modelled / none - 1)).toFixed(0)}% against no intervention`)
}
