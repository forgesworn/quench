// Q10 lane scoring (docs/LANES.md): accepted results per lane and task class on the Q5 held-out tasks, cost per
// accepted result at each lane's published rate, and the pass rules against the Pro reference. Reads receipts and
// the executor stream's final result only; never prints task content.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface LaneTokens { fresh: number; cacheRead: number; cacheWrite: number; output: number }
export interface LaneSession {
  task: string
  category: string
  rep: string
  accepted: boolean
  seconds: number
  turns: number
  turnLimit: boolean
  tokens: LaneTokens
}

/** Published rates in US dollars per million tokens, read 24 September 2026 (peak where there are two). */
export interface Rate { input: number; cached: number; output: number }
export const RATES: Record<string, Rate> = {
  'deepseek-v4-pro:cloud': { input: 1.32, cached: 0.044, output: 3.96 },
  'deepseek-v4.1-flash:cloud': { input: 0.3, cached: 0.006, output: 1.2 },
  'glm-5.3-flash:cloud': { input: 0.15, cached: 0.03, output: 0.5 },
  // Local: no token charge; its cost is M4 time, reported as seconds.
  'qwen3.8:latest': { input: 0, cached: 0, output: 0 },
}
export const dollars = (t: LaneTokens, rate: Rate): number => ((t.fresh + t.cacheWrite) * rate.input + t.cacheRead * rate.cached + t.output * rate.output) / 1e6

const zero = (): LaneTokens => ({ fresh: 0, cacheRead: 0, cacheWrite: 0, output: 0 })
const add = (a: LaneTokens, b: LaneTokens): LaneTokens => ({ fresh: a.fresh + b.fresh, cacheRead: a.cacheRead + b.cacheRead, cacheWrite: a.cacheWrite + b.cacheWrite, output: a.output + b.output })

/** The final result event of an executor stream: turns, whether the turn limit stopped it, and its tokens. */
export function streamResult(text: string): { turns: number; turnLimit: boolean; tokens: LaneTokens } {
  const lines = text.split('\n')
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i] as string
    if (!line.includes('"type":"result"')) continue
    let e: { type?: string; subtype?: string; num_turns?: number; modelUsage?: Record<string, Record<string, number>> }
    try { e = JSON.parse(line) } catch { continue }
    if (e.type !== 'result') continue
    let tokens = zero()
    for (const u of Object.values(e.modelUsage ?? {})) tokens = add(tokens, { fresh: u.inputTokens ?? 0, cacheRead: u.cacheReadInputTokens ?? 0, cacheWrite: u.cacheCreationInputTokens ?? 0, output: u.outputTokens ?? 0 })
    return { turns: e.num_turns ?? 0, turnLimit: e.subtype === 'error_max_turns', tokens }
  }
  return { turns: 0, turnLimit: false, tokens: zero() }
}

/** Every recorded plain-arm session under <dir>/repN/<task>/plain/receipt.json. Cells moved aside are skipped. */
export function loadLane(dir: string): LaneSession[] {
  const out: LaneSession[] = []
  if (!existsSync(dir)) return out
  for (const rep of readdirSync(dir).filter((d) => /^rep\d+$/.test(d)).sort()) {
    for (const task of readdirSync(join(dir, rep)).sort()) {
      const receiptPath = join(dir, rep, task, 'plain', 'receipt.json')
      if (!existsSync(receiptPath)) continue
      const r = JSON.parse(readFileSync(receiptPath, 'utf8')) as { task: string; category: string; accepted: boolean; executorRun?: { seconds?: number; streamPath?: string } }
      const streamPath = r.executorRun?.streamPath
      const stream = streamPath && existsSync(streamPath) ? streamResult(readFileSync(streamPath, 'utf8')) : { turns: 0, turnLimit: false, tokens: zero() }
      out.push({ task: r.task, category: r.category, rep, accepted: r.accepted === true, seconds: r.executorRun?.seconds ?? 0, ...stream })
    }
  }
  return out
}

export interface ClassSummary { category: string; sessions: number; accepted: number; turnLimits: number; seconds: number[]; tokens: LaneTokens }
export function byClass(sessions: LaneSession[]): Map<string, ClassSummary> {
  const out = new Map<string, ClassSummary>()
  for (const s of sessions) {
    const c = out.get(s.category) ?? { category: s.category, sessions: 0, accepted: 0, turnLimits: 0, seconds: [], tokens: zero() }
    c.sessions += 1
    c.accepted += s.accepted ? 1 : 0
    c.turnLimits += s.turnLimit ? 1 : 0
    c.seconds.push(s.seconds)
    c.tokens = add(c.tokens, s.tokens)
    out.set(s.category, c)
  }
  return out
}

/** Pass rule 1: a class qualifies when the lane is accepted at least as often as the reference, less one. */
export function qualifies(lane: ClassSummary | undefined, reference: ClassSummary | undefined): boolean | null {
  if (!lane || !reference || lane.sessions < reference.sessions) return null
  return lane.accepted >= reference.accepted - 1
}
