// Replays a model decider's recorded answers behind the Q1 interface. The
// decider rebuilds the same gated summary at each point and looks its answer
// up by hash; a missing answer means the point was never asked, which the
// runner guarantees happens only after an earlier stop.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import type { Decider, DeciderFactory, SessionEvent } from './decider.ts'
import { modelSettings, type ModelAnswer } from './deciders/model.ts'
import { ruleDecider } from './deciders/rules.ts'
import { sessionSummary } from './deciders/summary.ts'

export interface RecordedAnswer {
  key: string
  answer: ModelAnswer | null
  error?: string
  promptTokens: number
  outputTokens: number
  ms: number
}

export const summaryKey = (summary: string): string => createHash('sha256').update(`${modelSettings.model}\n${summary}`).digest('hex')

export function readAnswers(path: string): Map<string, RecordedAnswer> {
  if (!existsSync(path)) return new Map()
  return new Map(readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map((line) => {
    const row = JSON.parse(line) as RecordedAnswer
    return [row.key, row]
  }))
}

/** The gate and summary the model decider uses; shared by the runner and the replay. */
export function gatedSummary(): { observe(event: SessionEvent): void; next(): string | null } {
  const summary = sessionSummary({ maxChars: modelSettings.summaryChars })
  const gate = ruleDecider({ requireTestAndImpl: true, staleFor: 0 })
  return {
    observe(event) {
      summary.observe(event)
      gate.observe(event)
    },
    next: () => (gate.decide().decision === 'stop' ? summary.render() : null),
  }
}

export function modelReplay(answersPath: string): DeciderFactory {
  let answers: Map<string, RecordedAnswer> | undefined
  return (): Decider => {
    answers ??= readAnswers(answersPath)
    const table = answers
    const state = gatedSummary()
    return {
      observe: (event) => state.observe(event),
      decide() {
        const summary = state.next()
        if (summary === null) return { decision: 'continue', reason: 'gate: no test and implementation read yet' }
        const row = table.get(summaryKey(summary))
        if (!row) throw new Error('no recorded model answer for this point; run src/cli-model.ts first')
        if (!row.answer) return { decision: 'continue', reason: `model error: ${row.error ?? 'unparsed'}` }
        return { decision: row.answer.decision, reason: `model: missing ${row.answer.missing.join('; ') || 'nothing'}` }
      },
    }
  }
}
