// Reference bound: the recorded behaviour, never stopping early.
import type { Decider } from '../decider.ts'

export function alwaysContinue(): Decider {
  return {
    observe() {},
    decide: () => ({ decision: 'continue', reason: 'recorded behaviour' }),
  }
}
