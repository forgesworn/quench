// Replay recorded sessions point by point through a decider and score it.
//
// At each decision point the harness feeds the decider every new event, then
// asks decide(). The first stop ends the session. Scores:
// - premature: the stop point was not sufficient;
// - saved: points, tool calls and result bytes after the stop, minus the
//   finishing steps a stop still requires (the recorded writes and checks
//   after the session's last evidence read);
// - late: points between the first sufficient point and the stop (or the end).
// Savings are also weighted by executor input tokens, where the stream records
// them: every turn resends the conversation, so late turns cost the most.
import type { DeciderFactory } from './decider.ts'
import type { SessionLabels } from './labels.ts'
import type { ParsedSession, SessionPoint } from './session.ts'

export interface ReplaySession {
  run: string
  cell: string
  task: string
  arm: string
  parsed: ParsedSession
  labels: SessionLabels
}

export interface Cost {
  decisionPoints: number
  toolCalls: number
  resultBytes: number
  /** Executor input tokens of the messages that led to these points. */
  inputTokens: number
}

export interface SessionScore {
  run: string
  cell: string
  task: string
  arm: string
  decisionPoints: number
  firstSufficient: number | null
  stopAt: number | null
  reason: string | null
  premature: boolean
  /** The stop missed evidence tokens the recorded session found later (a premature stop that cost something). */
  lostEvidence: boolean
  late: number | null
  finishing: Cost
  saved: Cost
  savedShare: number
  /** Executor input tokens over the whole recorded session. */
  inputTokens: number
  savedInputShare: number
}

export interface ReplayResult {
  score: SessionScore
  /** Nanoseconds per decision: observing the new events plus decide(). */
  decisionNs: number[]
}

const sum = <T>(items: T[], pick: (item: T) => number): number => items.reduce((total, item) => total + pick(item), 0)
/** Cost of the points after `from` up to and including `to`, and of the messages sent after points from..to-1. */
const cost = (parsed: ParsedSession, from: number, to: number): Cost => {
  const points = parsed.points.filter((point) => point.index > from && point.index <= to)
  return {
    decisionPoints: points.length,
    toolCalls: sum(points, (point) => point.calls.length),
    resultBytes: sum(points, (point) => point.calls.reduce((total, call) => total + call.resultBytes, 0)),
    inputTokens: sum(parsed.inputTokensAfter.slice(from, Math.max(from, to)), (tokens) => tokens ?? 0),
  }
}
const none: Cost = { decisionPoints: 0, toolCalls: 0, resultBytes: 0, inputTokens: 0 }

/** Index of the last point with an evidence read; 0 when the session never read. */
export function lastReadPoint(parsed: ParsedSession): number {
  return parsed.points.findLast((point) => point.calls.some((call) => call.class === 'read'))?.index ?? 0
}

/** Recorded finishing steps: every point after the last evidence read (writes and checks only). */
export function finishingPoints(parsed: ParsedSession): SessionPoint[] {
  const lastRead = lastReadPoint(parsed)
  return parsed.points.filter((point) => point.index > lastRead)
}

/** What a stop at stopAt saves against the recorded session; a stop still pays the finishing steps. */
export function savedAfter(parsed: ParsedSession, stopAt: number | null): Cost {
  return stopAt === null ? none : cost(parsed, stopAt, lastReadPoint(parsed))
}

/** Finishing cost: the points after the last read and every message sent from there on. */
export function finishingCost(parsed: ParsedSession): Cost {
  return cost(parsed, lastReadPoint(parsed), parsed.inputTokensAfter.length)
}

export function replay(session: ReplaySession, factory: DeciderFactory): ReplayResult {
  const { parsed, labels } = session
  const decider = factory()
  const decisionNs: number[] = []
  let cursor = 0
  let stopAt: number | null = null
  let reason: string | null = null
  for (const point of parsed.points) {
    const start = process.hrtime.bigint()
    for (; cursor < point.eventEnd; cursor += 1) {
      const event = parsed.events[cursor]
      if (event) decider.observe(event)
    }
    const decision = decider.decide()
    decisionNs.push(Number(process.hrtime.bigint() - start))
    if (decision.decision === 'stop') {
      stopAt = point.index
      reason = decision.reason
      break
    }
  }
  const sufficientAtStop = stopAt === null ? true : labels.points[stopAt - 1]?.sufficient === true
  const end = stopAt ?? parsed.points.length
  const saved = savedAfter(parsed, stopAt)
  const inputTokens = sum(parsed.inputTokensAfter, (tokens) => tokens ?? 0)
  return {
    score: {
      run: session.run,
      cell: session.cell,
      task: session.task,
      arm: session.arm,
      decisionPoints: parsed.points.length,
      firstSufficient: labels.firstSufficient,
      stopAt,
      reason,
      premature: !sufficientAtStop,
      lostEvidence: stopAt !== null && (labels.points[stopAt - 1]?.found ?? 0) < labels.found,
      late: labels.firstSufficient === null || !sufficientAtStop ? null : end - labels.firstSufficient,
      finishing: finishingCost(parsed),
      saved,
      savedShare: parsed.points.length ? saved.decisionPoints / parsed.points.length : 0,
      inputTokens,
      savedInputShare: inputTokens ? saved.inputTokens / inputTokens : 0,
    },
    decisionNs,
  }
}

export interface GroupSummary {
  sessions: number
  reachedSufficiency: number
  stopped: number
  premature: number
  prematureRate: number
  lostEvidence: number
  medianSavedShare: number
  saved: Cost
  medianLate: number | null
  inputTokens: number
  /** Saved executor input over all the group's sessions: the cost view, where long sessions weigh most. */
  savedInputShare: number
  medianSavedInputShare: number
}

export const median = (values: number[]): number | null => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] ?? null : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
}

export const percentile = (values: number[], p: number): number | null => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? null
}

export function summarise(scores: SessionScore[]): GroupSummary {
  const premature = scores.filter((score) => score.premature).length
  const inputTokens = sum(scores, (score) => score.inputTokens)
  return {
    sessions: scores.length,
    reachedSufficiency: scores.filter((score) => score.firstSufficient !== null).length,
    stopped: scores.filter((score) => score.stopAt !== null).length,
    premature,
    prematureRate: scores.length ? premature / scores.length : 0,
    lostEvidence: scores.filter((score) => score.lostEvidence).length,
    medianSavedShare: median(scores.map((score) => score.savedShare)) ?? 0,
    saved: {
      decisionPoints: sum(scores, (score) => score.saved.decisionPoints),
      toolCalls: sum(scores, (score) => score.saved.toolCalls),
      resultBytes: sum(scores, (score) => score.saved.resultBytes),
      inputTokens: sum(scores, (score) => score.saved.inputTokens),
    },
    medianLate: median(scores.flatMap((score) => (score.late === null ? [] : [score.late]))),
    inputTokens,
    savedInputShare: inputTokens ? sum(scores, (score) => score.saved.inputTokens) / inputTokens : 0,
    medianSavedInputShare: median(scores.map((score) => score.savedInputShare)) ?? 0,
  }
}

/** Groups scores by a key, sorted by key, for per-arm, per-run and per-task tables. */
export function groupBy(scores: SessionScore[], key: (score: SessionScore) => string): Array<[string, GroupSummary]> {
  const groups = new Map<string, SessionScore[]>()
  for (const score of scores) groups.set(key(score), [...(groups.get(key(score)) ?? []), score])
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([name, group]) => [name, summarise(group)])
}
