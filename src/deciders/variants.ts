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

/** Batch 2, locked 23 September 2026 after batch 1 was scored, before batch 2 was. */
Object.assign(variants, {
  // Novelty from the files the agent chooses to read, ignoring paths merely listed in results.
  'read-stale-2': { requireTestAndImpl: true, staleOn: 'read', staleFor: 2 },
  'read-stale-3': { requireTestAndImpl: true, staleOn: 'read', staleFor: 3 },
  // The two most precise batch 1 signals together.
  'coverage-or-stale-5': { requireTestAndImpl: true, stopOnCleanCoverage: true, staleFor: 5 },
} satisfies Record<string, RuleParams>)

/**
 * Batch 3, locked 23 September 2026 after batches 1 and 2 were scored, before
 * batch 3 was. Hypothesis from the development set: the stale rule saves input
 * only on sessions that run long, and catches them late. These keep
 * coverage-or-stale-5 and add a stricter stale limit once a session is long;
 * ordinary sessions (median 13 points) should be unaffected.
 *
 * Selection rule, fixed with this batch: among all scored variants that keep
 * premature stops at or under 5% and have no stop that lost evidence in every
 * arm, within the latency budgets, the held-out primary is the one with the
 * highest minimum across arms of saved executor input (total over the arm's
 * sessions). Ties go to the variant with fewer parts.
 */
Object.assign(variants, {
  'long15-stale-3': { requireTestAndImpl: true, stopOnCleanCoverage: true, staleFor: 5, longSession: { after: 15, staleFor: 3 } },
  'long15-stale-2': { requireTestAndImpl: true, stopOnCleanCoverage: true, staleFor: 5, longSession: { after: 15, staleFor: 2 } },
  'long20-stale-2': { requireTestAndImpl: true, stopOnCleanCoverage: true, staleFor: 5, longSession: { after: 20, staleFor: 2 } },
  // A hard cap: stop at point 30 whatever the agent is doing, once tests and implementation were read.
  'cap-30': { requireTestAndImpl: true, stopOnCleanCoverage: true, staleFor: 5, longSession: { after: 30, staleFor: 0 } },
} satisfies Record<string, RuleParams>)

export const variantFactories: Record<string, DeciderFactory> = Object.fromEntries(
  Object.entries(variants).map(([name, params]) => [name, () => ruleDecider(params)]),
)
