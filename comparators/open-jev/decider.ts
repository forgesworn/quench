// Open-Jev behind the Q1 interface: rebuild the snapshot at each point and look
// up Open-Jev's precomputed probability that the agent has enough evidence.
// Open-Jev is independent research inspired by Jev; it is not Jev.
import { readFileSync } from 'node:fs'
import type { Decider, DeciderFactory } from '../../src/decider.ts'
import { snapshotKey, snapshotter } from '../snapshot.ts'

export function openJevDecider(answersPath: string, threshold: number): DeciderFactory {
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
        if (p === undefined) throw new Error(`no Open-Jev answer for this snapshot in ${answersPath}`)
        const reason = `open-jev p=${p.toFixed(3)}`
        return p >= threshold ? { decision: 'stop', reason } : { decision: 'continue', reason }
      },
    }
  }
}
