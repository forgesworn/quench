// Benchmark comparators only (GOALS Q4): scored on the same harness, never
// adopted or embedded. Thresholds are locked here before scoring.
import type { DeciderFactory } from '../src/decider.ts'
import { layaDecider } from './laya/decider.ts'
import { openJevDecider } from './open-jev/decider.ts'

/** Laya answers are produced by comparators/laya/answer.py into the results directory. */
export const comparators = (resultsDir: string): Record<string, DeciderFactory> => ({
  'laya-50': layaDecider(`${resultsDir}/laya-answers.jsonl`, 0.5),
  'laya-80': layaDecider(`${resultsDir}/laya-answers.jsonl`, 0.8),
  // Open-Jev (not Jev), locked 23 September 2026 before any answer was produced:
  // the same snapshots, question and thresholds as Laya, for the 2B and 9B packages.
  'open-jev-2b-50': openJevDecider(`${resultsDir}/open-jev-2b-answers.jsonl`, 0.5),
  'open-jev-2b-80': openJevDecider(`${resultsDir}/open-jev-2b-answers.jsonl`, 0.8),
  'open-jev-9b-50': openJevDecider(`${resultsDir}/open-jev-9b-answers.jsonl`, 0.5),
  'open-jev-9b-80': openJevDecider(`${resultsDir}/open-jev-9b-answers.jsonl`, 0.8),
})
