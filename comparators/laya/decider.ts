// Laya behind the Q1 interface: rebuild the snapshot at each point and look up
// Laya's precomputed probability that the agent has enough evidence.
import { readFileSync } from 'node:fs'
import type { Decider, DeciderFactory } from '../../src/decider.ts'
import { snapshotKey, snapshotter } from '../snapshot.ts'

export function layaDecider(answersPath: string, threshold: number): DeciderFactory {
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
        if (p === undefined) throw new Error('no Laya answer for this snapshot; rerun the export and answer steps')
        return p >= threshold ? { decision: 'stop', reason: `laya p=${p.toFixed(3)}` } : { decision: 'continue', reason: `laya p=${p.toFixed(3)}` }
      },
    }
  }
}
