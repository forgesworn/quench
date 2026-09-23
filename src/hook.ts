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

/**
 * The log goes to the state directory; the socket always goes to the system
 * temporary directory, because a Unix socket path over about 104 bytes cannot
 * be bound (macOS) and state directories inside evidence folders are long.
 */
export function statePaths(sessionId: string, dir = process.env.QUENCH_STATE_DIR ?? tmpdir()): { socket: string; log: string } {
  const key = createHash('sha256').update(sessionId).digest('hex').slice(0, 16)
  const socketKey = createHash('sha256').update(`${dir}\0${sessionId}`).digest('hex').slice(0, 16)
  return { socket: join(tmpdir(), `quench-${socketKey}.sock`), log: join(dir, `quench-${key}.jsonl`) }
}

export const hintFor = (stop: Decision): string =>
  `Quench: ${stop.reason}. If the evidence you already have answers the task, stop gathering and write the answer now; otherwise continue.`
