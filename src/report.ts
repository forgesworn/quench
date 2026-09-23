// Where a coding agent's spend goes, from its local transcripts (GOALS Q7). Parsers keep token counts and model
// names only; nothing here holds transcript content, project names or paths.

export type Agent = 'claude' | 'codex'

export interface Request {
  model: string
  /** Tokens of context sent with the request. */
  ctx: number
  read: number
  write1h: number
  write5m: number
  fresh: number
  out: number
  think: number
}

export interface Session {
  agent: Agent
  sub: boolean
  requests: Request[]
}

export interface LineParser {
  line(text: string): void
  sub(): boolean
  requests(): Request[]
}

/**
 * Claude Code transcript lines. A message streams over several lines and the last carries its final usage, so
 * requests are keyed by message id. Synthetic messages cost nothing.
 */
export function claudeParser(): LineParser {
  const byId = new Map<string, Request>()
  return {
    line(text) {
      if (!text.includes('"usage"')) return
      let e: { type?: string; message?: { id?: string; model?: string; usage?: Record<string, any> } }
      try { e = JSON.parse(text) } catch { return }
      const u = e.message?.usage
      const id = e.message?.id
      if (e.type !== 'assistant' || !u || !id || e.message?.model === '<synthetic>') return
      const write1h = u.cache_creation?.ephemeral_1h_input_tokens ?? 0
      const write5m = u.cache_creation?.ephemeral_5m_input_tokens ?? Math.max(0, (u.cache_creation_input_tokens ?? 0) - write1h)
      const read = u.cache_read_input_tokens ?? 0
      const fresh = u.input_tokens ?? 0
      byId.set(id, {
        model: e.message?.model ?? '', ctx: fresh + write1h + write5m + read, read, write1h, write5m, fresh,
        out: u.output_tokens ?? 0, think: u.output_tokens_details?.thinking_tokens ?? 0,
      })
    },
    sub: () => false,
    // A Map keeps first-insertion order, so requests stay in the order they were sent.
    requests: () => [...byId.values()],
  }
}

/**
 * Codex rollout lines. Each response is followed by a token_count event whose last_token_usage is that request's
 * usage; a repeated event (same running total) is skipped. OpenAI counts cached tokens inside input_tokens.
 */
export function codexParser(): LineParser {
  const requests: Request[] = []
  let model = ''
  let sub = false
  let total = -1
  return {
    line(text) {
      if (!text.includes('"token_count"') && !text.includes('"turn_context"') && !text.includes('"session_meta"')) return
      let e: { type?: string; payload?: Record<string, any> }
      try { e = JSON.parse(text) } catch { return }
      const p = e.payload ?? {}
      if (e.type === 'session_meta') sub = typeof p.source === 'object' && p.source !== null && 'subagent' in p.source
      else if (e.type === 'turn_context' && typeof p.model === 'string') model = p.model
      else if (e.type === 'event_msg' && p.type === 'token_count' && p.info?.last_token_usage) {
        const running = p.info.total_token_usage?.total_tokens ?? -1
        if (running === total) return
        total = running
        const u = p.info.last_token_usage
        const input = u.input_tokens ?? 0
        const read = u.cached_input_tokens ?? 0
        const write = u.cache_write_input_tokens ?? 0
        requests.push({ model, ctx: input, read, write1h: 0, write5m: write, fresh: Math.max(0, input - read - write), out: u.output_tokens ?? 0, think: u.reasoning_output_tokens ?? 0 })
      }
    },
    sub: () => sub,
    requests: () => requests,
  }
}

/** Multipliers in base-input units. `miss` prices context that must be sent again uncached after a compaction. */
export interface Pricing {
  read(model: string): number
  write1h: number
  write5m: number
  fresh: number
  out: number
  miss: number
  note: string
}

export const pricing: Record<Agent, Pricing> = {
  claude: {
    read: (model) => (/opus-5-5/.test(model) ? 0.05 : /fable|mythos/.test(model) ? 0.025 : 0.1),
    write1h: 2, write5m: 1.25, fresh: 1, out: 5, miss: 2,
    note: 'cache read 0.1x (Opus 5.5 0.05x, Fable and Mythos 0.025x), one-hour cache write 2x, five-minute 1.25x, output 5x',
  },
  codex: {
    read: () => 0.1, write1h: 1, write5m: 1, fresh: 1, out: 8, miss: 1,
    note: 'assumed: cached input 0.1x, no cache-write premium, output 8x (GPT-5 list prices)',
  },
}

export const parts = (r: Request, p: Pricing) => ({ read: p.read(r.model) * r.read, write: p.write1h * r.write1h + p.write5m * r.write5m + p.fresh * r.fresh, out: p.out * r.out })
export const cost = (r: Request, p: Pricing): number => { const x = parts(r, p); return x.read + x.write + x.out }
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0)
const share = (x: number, total: number): number => (total ? x / total : 0)
export const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0

/** A drop of more than 40% from at least 100K, with `span` requests either side for the growth comparison. */
export function naturalCompactions(sessions: Session[], span = 30): Array<{ before: number; after: number; growth: number }> {
  const out: Array<{ before: number; after: number; growth: number }> = []
  for (const s of sessions) {
    const r = s.requests
    const ctx = (i: number): number => (r[i] as Request).ctx
    const growth = (a: number, b: number): number => { let t = 0; for (let k = a + 1; k <= b; k += 1) t += Math.max(0, ctx(k) - ctx(k - 1)); return t / (b - a) }
    for (let i = span + 1; i + span < r.length; i += 1) {
      if (ctx(i) < 0.6 * ctx(i - 1) && ctx(i - 1) >= 100e3) out.push({ before: ctx(i - 1), after: ctx(i), growth: growth(i, i + span) / Math.max(1, growth(i - 1 - span, i - 1)) })
    }
  }
  return out
}

/**
 * Modelled cost of a session if it compacted whenever its context reached `compactAt`, the agent behaving as
 * recorded otherwise (an upper bound on the saving). A compaction reads the context and writes a summary; the
 * next request sends the summary uncached. With `compactAt` null it models the session as recorded; compare
 * windows with that, not with the recorded cost, because the model leaves out cache expiries.
 */
export function simulate(s: Session, p: Pricing, compactAt: number | null, summary: number): number {
  const first = s.requests[0]
  if (!first) return 0
  let modelled = cost(first, p)
  let ctx = first.ctx
  for (let i = 1; i < s.requests.length; i += 1) {
    const r = s.requests[i] as Request
    const prev = (s.requests[i - 1] as Request).ctx
    const delta = r.ctx - prev
    // The recorded session compacted or cleared here itself.
    if (delta < -0.4 * prev) { ctx = Math.min(ctx, r.ctx); modelled += cost(r, p); continue }
    let cached = ctx
    ctx += Math.max(0, delta)
    let extra = 0
    if (compactAt !== null && ctx >= compactAt) {
      extra = p.read(r.model) * ctx + (p.out * summary) / 3
      ctx = summary
      cached = 0
    }
    const hit = Math.min(cached, ctx)
    modelled += p.read(r.model) * hit + p.miss * (ctx - hit) + p.out * r.out + extra
  }
  return modelled
}

export interface AgentReport {
  agent: Agent
  pricing: string
  transcripts: number
  sessions: number
  subagentTranscripts: number
  requests: number
  subagentShare: number
  components: { cacheReads: number; writesAndFresh: number; output: number; thinkingShareOfOutput: number }
  bySessionLength: Array<{ from: number; to: number | null; sessions: number; costShare: number }>
  byContext: Array<{ from: number; to: number | null; requestShare: number; costShare: number }>
  compactions: { count: number; medianBefore: number; medianAfter: number; growthAfter: number }
  simulation: { summary: number; summaryFrom: 'your compactions' | 'default' | 'set'; windows: Array<{ window: number; costChange: number; costShareAbove: number }> }
}

const LENGTHS: Array<[number, number | null]> = [[0, 30], [30, 100], [100, 300], [300, 1000], [1000, null]]
const CONTEXTS: Array<[number, number | null]> = [[0, 50e3], [50e3, 100e3], [100e3, 200e3], [200e3, 400e3], [400e3, null]]
export const WINDOWS = [800e3, 600e3, 400e3, 300e3, 200e3, 150e3, 100e3]

export function agentReport(agent: Agent, sessions: Session[], summaryOverride?: number): AgentReport {
  const p = pricing[agent]
  const all = sessions.flatMap((s) => s.requests)
  const main = sessions.filter((s) => !s.sub)
  const mainRequests = main.flatMap((s) => s.requests)
  const total = sum(all.map((r) => cost(r, p)))
  const mainCost = sum(mainRequests.map((r) => cost(r, p)))
  const within = (x: number, [lo, hi]: [number, number | null]): boolean => x >= lo && (hi === null || x < hi)
  const drops = naturalCompactions(main)
  const measured = drops.length >= 10 ? median(drops.map((d) => d.after)) : null
  const summary = summaryOverride ?? measured ?? 30e3
  const none = sum(main.map((s) => simulate(s, p, null, summary)))
  // Only windows that some of the cost lies above are worth showing.
  const windows = WINDOWS.map((window) => ({
    window,
    costChange: none ? sum(main.map((s) => simulate(s, p, window, summary))) / none - 1 : 0,
    costShareAbove: share(sum(mainRequests.filter((r) => r.ctx >= window).map((r) => cost(r, p))), mainCost),
  })).filter((w) => w.costShareAbove >= 0.01 && w.window > summary)
  return {
    agent,
    pricing: p.note,
    transcripts: sessions.length,
    sessions: main.length,
    subagentTranscripts: sessions.length - main.length,
    requests: all.length,
    subagentShare: share(sum(sessions.filter((s) => s.sub).flatMap((s) => s.requests).map((r) => cost(r, p))), total),
    components: {
      cacheReads: share(sum(all.map((r) => parts(r, p).read)), total),
      writesAndFresh: share(sum(all.map((r) => parts(r, p).write)), total),
      output: share(sum(all.map((r) => parts(r, p).out)), total),
      thinkingShareOfOutput: share(sum(all.map((r) => r.think)), sum(all.map((r) => r.out))),
    },
    bySessionLength: LENGTHS.map(([from, to]) => {
      const group = main.filter((s) => within(s.requests.length, [from, to]))
      return { from, to, sessions: group.length, costShare: share(sum(group.flatMap((s) => s.requests).map((r) => cost(r, p))), mainCost) }
    }),
    byContext: CONTEXTS.map(([from, to]) => {
      const group = mainRequests.filter((r) => within(r.ctx, [from, to]))
      return { from, to, requestShare: share(group.length, mainRequests.length), costShare: share(sum(group.map((r) => cost(r, p))), mainCost) }
    }),
    compactions: { count: drops.length, medianBefore: median(drops.map((d) => d.before)), medianAfter: median(drops.map((d) => d.after)), growthAfter: median(drops.map((d) => d.growth)) },
    simulation: { summary, summaryFrom: summaryOverride !== undefined ? 'set' : measured !== null ? 'your compactions' : 'default', windows },
  }
}
