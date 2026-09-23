// Per-point "stop was already correct" labels from a recorded agent session.
//
// The label at a decision point is whether every required evidence token has
// already appeared in some tool result. No model is involved; labels are only
// as good as the task's declared evidence. Deciders never import this module.
import { parseSession, type ParsedSession } from './session.ts'

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

export function labelParsed(session: ParsedSession, required: RequiredEvidence[], options: LabelOptions = {}): SessionLabels {
  const ignore = new Set(options.ignoreTokens ?? [])
  const tokens = required.map((item) => item.token).filter((token) => !ignore.has(token))
  const seen = new Set<string>()
  // Evidence items, not distinct tokens: two items may share a token (the same line in two files),
  // and each is found once its token has appeared.
  const foundItems = (): number => tokens.filter((token) => seen.has(token)).length
  const points: DecisionPoint[] = []
  let cursor = 0
  for (const point of session.points) {
    for (; cursor < point.eventEnd; cursor += 1) {
      const event = session.events[cursor]
      if (event?.kind !== 'tool_result') continue
      for (const token of tokens) if (!seen.has(token) && event.text.includes(token)) seen.add(token)
    }
    points.push({
      index: point.index,
      toolCalls: point.toolCalls,
      resultBytes: point.resultBytes,
      errors: point.errors,
      found: foundItems(),
      sufficient: tokens.length > 0 && foundItems() === tokens.length,
    })
  }
  for (; cursor < session.events.length; cursor += 1) {
    const event = session.events[cursor]
    if (event?.kind !== 'tool_result') continue
    for (const token of tokens) if (!seen.has(token) && event.text.includes(token)) seen.add(token)
  }
  const firstSufficient = points.find((point) => point.sufficient) ?? null
  const last = points.at(-1) ?? null
  return {
    required: tokens.length,
    found: foundItems(),
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

export function labelSession(streamText: string, required: RequiredEvidence[], options: LabelOptions = {}): SessionLabels {
  return labelParsed(parseSession(streamText), required, options)
}
