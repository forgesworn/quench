// Benchmark comparators only (GOALS Q4): scored on the same harness, never
// adopted or embedded. Thresholds are locked here before scoring.
import type { DeciderFactory } from '../src/decider.ts'
import { layaDecider } from './laya/decider.ts'

/** Laya answers are produced by comparators/laya/answer.py into the results directory. */
export const comparators = (resultsDir: string): Record<string, DeciderFactory> => ({
  'laya-50': layaDecider(`${resultsDir}/laya-answers.jsonl`, 0.5),
  'laya-80': layaDecider(`${resultsDir}/laya-answers.jsonl`, 0.8),
})
