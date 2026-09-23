// Per-turn "stop was already correct" labels from a recorded agent session.
//
// A session is a stream of JSON events (Claude Code stream-json): assistant
// messages carrying tool_use blocks and user messages carrying tool_result
// blocks. A decision point follows each batch of tool results: the agent could
// stop there or call another tool. The label at a point is whether every
// required evidence token has already appeared in some tool result. No model
// is involved; labels are only as good as the task's declared evidence.

export interface RequiredEvidence {
  token: string
}

export interface DecisionPoint {
  index: number
  toolCalls: number
  resultBytes: number
  errors: number
  found: number
  sufficient: boolean
}

export interface SessionLabels {
  required: number
  found: number
  missing: string[]
  points: DecisionPoint[]
  decisionPoints: number
  firstSufficient: number | null
  headroom: { decisionPoints: number; toolCalls: number; resultBytes: number } | null
}

export interface LabelOptions {
  /** Tokens to drop, e.g. ones a tool prints in its own metadata. */
  ignoreTokens?: Iterable<string>
}

interface ContentPart {
  type?: string
  text?: string
  content?: string | ContentPart[]
  is_error?: boolean
}

const textOf = (content: string | ContentPart[] | undefined): string => typeof content === 'string'
  ? content
  : (content ?? []).map((part) => (part.type === 'text' ? part.text ?? '' : '')).join('\n')

export function labelSession(streamText: string, required: RequiredEvidence[], options: LabelOptions = {}): SessionLabels {
  const ignore = new Set(options.ignoreTokens ?? [])
  const tokens = required.map((item) => item.token).filter((token) => !ignore.has(token))
  const seen = new Set<string>()
  const points: DecisionPoint[] = []
  let toolCalls = 0
  let resultBytes = 0
  let pendingResults = 0
  let errors = 0
  const close = (): void => {
    if (pendingResults === 0) return
    points.push({
      index: points.length + 1,
      toolCalls,
      resultBytes,
      errors,
      found: seen.size,
      sufficient: tokens.length > 0 && seen.size === tokens.length,
    })
    pendingResults = 0
  }
  for (const line of streamText.split('\n')) {
    if (!line.trim()) continue
    let event: { type?: string; message?: { content?: unknown } }
    try { event = JSON.parse(line) } catch { continue }
    const content = event.message?.content
    if (!Array.isArray(content)) continue
    const parts = content as ContentPart[]
    if (event.type === 'assistant') {
      close()
      toolCalls += parts.filter((part) => part.type === 'tool_use').length
    } else if (event.type === 'user') {
      for (const part of parts) {
        if (part.type !== 'tool_result') continue
        pendingResults += 1
        if (part.is_error) errors += 1
        const text = textOf(part.content)
        resultBytes += Buffer.byteLength(text)
        for (const token of tokens) if (!seen.has(token) && text.includes(token)) seen.add(token)
      }
    }
  }
  close()
  const firstSufficient = points.find((point) => point.sufficient) ?? null
  const last = points.at(-1) ?? null
  return {
    required: tokens.length,
    found: seen.size,
    missing: tokens.filter((token) => !seen.has(token)),
    points,
    decisionPoints: points.length,
    firstSufficient: firstSufficient?.index ?? null,
    // Upper bound: what stopping at the first sufficient point would have saved.
    headroom: firstSufficient && last
      ? {
          decisionPoints: last.index - firstSufficient.index,
          toolCalls: last.toolCalls - firstSufficient.toolCalls,
          resultBytes: last.resultBytes - firstSufficient.resultBytes,
        }
      : null,
  }
}
