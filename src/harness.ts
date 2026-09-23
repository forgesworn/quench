// Replay recorded sessions point by point through a decider and score it.
//
// At each decision point the harness feeds the decider every new event, then
// asks decide(). The first stop ends the session. Scores:
// - premature: the stop point was not sufficient;
// - saved: points, tool calls and result bytes after the stop, minus the
//   finishing steps a stop still requires (the recorded writes and checks
//   after the session's last evidence read);
// - late: points between the first sufficient point and the stop (or the end).
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
  late: number | null
  finishing: Cost
  saved: Cost
  savedShare: number
}

export interface ReplayResult {
  score: SessionScore
  /** Nanoseconds per decision: observing the new events plus decide(). */
  decisionNs: number[]
}

const sum = <T>(items: T[], pick: (item: T) => number): number => items.reduce((total, item) => total + pick(item), 0)
const cost = (points: SessionPoint[]): Cost => ({
  decisionPoints: points.length,
  toolCalls: sum(points, (point) => point.calls.length),
  resultBytes: sum(points, (point) => point.calls.reduce((total, call) => total + call.resultBytes, 0)),
})

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
  if (stopAt === null) return { decisionPoints: 0, toolCalls: 0, resultBytes: 0 }
  const lastRead = lastReadPoint(parsed)
  return cost(parsed.points.filter((point) => point.index > stopAt && point.index <= lastRead))
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
      late: labels.firstSufficient === null || !sufficientAtStop ? null : end - labels.firstSufficient,
      finishing: cost(finishingPoints(parsed)),
      saved,
      savedShare: parsed.points.length ? saved.decisionPoints / parsed.points.length : 0,
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
  medianSavedShare: number
  saved: Cost
  medianLate: number | null
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
  return {
    sessions: scores.length,
    reachedSufficiency: scores.filter((score) => score.firstSufficient !== null).length,
    stopped: scores.filter((score) => score.stopAt !== null).length,
    premature,
    prematureRate: scores.length ? premature / scores.length : 0,
    medianSavedShare: median(scores.map((score) => score.savedShare)) ?? 0,
    saved: {
      decisionPoints: sum(scores, (score) => score.saved.decisionPoints),
      toolCalls: sum(scores, (score) => score.saved.toolCalls),
      resultBytes: sum(scores, (score) => score.saved.resultBytes),
    },
    medianLate: median(scores.flatMap((score) => (score.late === null ? [] : [score.late]))),
  }
}

/** Groups scores by a key, sorted by key, for per-arm, per-run and per-task tables. */
export function groupBy(scores: SessionScore[], key: (score: SessionScore) => string): Array<[string, GroupSummary]> {
  const groups = new Map<string, SessionScore[]>()
  for (const score of scores) groups.set(key(score), [...(groups.get(key(score)) ?? []), score])
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([name, group]) => [name, summarise(group)])
}
