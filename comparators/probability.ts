// A comparator behind the Q1 interface that looks up a precomputed probability
// that the agent has enough evidence, keyed by the shared snapshot at each point.
import { readFileSync } from 'node:fs'
import type { Decider, DeciderFactory } from '../src/decider.ts'
import { snapshotKey, snapshotter } from './snapshot.ts'

export function probabilityDecider(label: string, answersPath: string, threshold: number): DeciderFactory {
  let answers: Map<string, number> | undefined
  return (): Decider => {
    answers ??= new Map(readFileSync(answersPath, 'utf8').trim().split('\n').map((line) => {
      const row = JSON.parse(line) as { key: string; p: number }
      return [row.key, row.p]
    }))
    const table = answers
    const snap = snapshotter()
    return {
      observe: (event) => snap.observe(event),
      decide() {
        const p = table.get(snapshotKey(snap.snapshot()))
        if (p === undefined) throw new Error(`no ${label} answer for this snapshot in ${answersPath}`)
        const reason = `${label} p=${p.toFixed(3)}`
        return p >= threshold ? { decision: 'stop', reason } : { decision: 'continue', reason }
      },
    }
  }
}
