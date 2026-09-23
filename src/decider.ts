// The incremental decider interface. A decider sees only run-time events: the
// task prompt, the agent's tool calls and text, and tool results. It keeps its
// own state so a decision costs the same at turn 5 and turn 80.
import type { SessionEvent } from './session.ts'

export type { SessionEvent }

export interface Decision {
  decision: 'stop' | 'continue'
  reason: string
}

export interface Decider {
  observe(event: SessionEvent): void
  decide(): Decision
}

export type DeciderFactory = () => Decider
