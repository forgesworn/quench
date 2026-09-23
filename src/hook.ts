// Shared by the per-turn hook client and its per-session background process.
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Decision } from './decider.ts'

export interface HookRequest {
  event: string
  /** 'on' delivers the hint; 'off' logs what would have been delivered (the control arm). */
  mode: 'on' | 'off'
}

export interface HookReply {
  point: number
  hint: string | null
  error?: string
}

/** The decider the hook runs: the held-out primary frozen in docs/HELDOUT.md. */
export const hookDecider = 'stale-5'

export function statePaths(sessionId: string, dir = process.env.QUENCH_STATE_DIR ?? tmpdir()): { socket: string; log: string } {
  const key = createHash('sha256').update(sessionId).digest('hex').slice(0, 16)
  return { socket: join(dir, `quench-${key}.sock`), log: join(dir, `quench-${key}.jsonl`) }
}

export const hintFor = (stop: Decision): string =>
  `Quench: ${stop.reason}. If the evidence you already have answers the task, stop gathering and write the answer now; otherwise continue.`
