// Locked Q2 rule variants. Each is committed here before it is scored, and
// every scored variant is recorded in docs/EVIDENCE.md, including failures.
// Never edit a scored variant; add a new one.
import type { DeciderFactory } from '../decider.ts'
import { ruleDecider, type RuleParams } from './rules.ts'

/** Acceptance thresholds for Q2, fixed before any variant was scored. */
export const acceptance = {
  /** Premature stops (stop at a point that was not sufficient) per arm, as a share of sessions. */
  maxPrematureRatePerArm: 0.05,
  /** Median saved decision points as a share of the recorded session, per arm. */
  minMedianSavedShare: 0.2,
  /** Decision latency budgets from GOALS.md, in microseconds and milliseconds. */
  maxP99Us: 1000,
  maxP50Us: 100,
  maxColdStartMs: 30,
} as const

/** Batch 1, locked 23 September 2026 before scoring. */
export const variants: Record<string, RuleParams> = {
  // Saturation: tests and implementation read, then k points with no new file.
  'stale-3': { requireTestAndImpl: true, staleFor: 3 },
  'stale-5': { requireTestAndImpl: true, staleFor: 5 },
  // Saturation plus every identifier the prompt names seen in a tool result.
  'terms-stale-2': { requireTestAndImpl: true, requirePromptTerms: true, staleFor: 2 },
  // A clean coverage report (only arms with a coverage tool can fire).
  'coverage-clean': { stopOnCleanCoverage: true },
  // Looping: an identical read repeated after tests and implementation were read.
  'repeat': { requireTestAndImpl: true, stopOnRepeat: true },
}

export const variantFactories: Record<string, DeciderFactory> = Object.fromEntries(
  Object.entries(variants).map(([name, params]) => [name, () => ruleDecider(params)]),
)
