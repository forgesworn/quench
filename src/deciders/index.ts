// Every decider the harness can score, by name. Deciders see run-time events
// only; the oracle bound is not listed here because it reads labels.
import type { DeciderFactory } from '../decider.ts'
import { alwaysContinue } from './always-continue.ts'
import { variantFactories } from './variants.ts'

export const deciders: Record<string, DeciderFactory> = {
  'always-continue': alwaysContinue,
  ...variantFactories,
}
