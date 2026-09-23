// Reference bound: stop at the first sufficient point. It reads the labels, so
// it exists only to bound the range; it is never a decider.
import type { DeciderFactory } from './decider.ts'
import type { SessionLabels } from './labels.ts'

export function oracleFor(labels: SessionLabels): DeciderFactory {
  return () => {
    let point = 0
    return {
      observe() {},
      decide() {
        point += 1
        return labels.points[point - 1]?.sufficient
          ? { decision: 'stop', reason: 'oracle: all required evidence has appeared' }
          : { decision: 'continue', reason: 'oracle: evidence incomplete' }
      },
    }
  }
}
