// A decider fed from a live Claude Code transcript, incrementally.
//
// The transcript is JSONL in the same shape as recorded stream-json. feed()
// takes whatever bytes were appended since the last call, keeps any partial
// last line for the next call, and decides once at each decision point: when
// a batch of tool results is closed by the agent's next action (as in replay),
// or when every tool call so far has its result (the agent is about to act).
// Subagent (sidechain) entries are skipped; the first user text is the prompt.
import type { Decider, Decision } from './decider.ts'
import { eventsOfLine, textOf } from './session.ts'

export interface PointDecision extends Decision {
  /** 1-based decision point, counted as in replay. */
  point: number
}

export class LiveSession {
  private readonly decider: Decider
  private partial = ''
  private promptSeen = false
  private points = 0
  private batch = 0
  private decided = false
  private readonly pending = new Set<string>()

  constructor(decider: Decider) {
    this.decider = decider
  }

  /** Appended transcript text in; the decisions made at points that completed. */
  feed(chunk: string): PointDecision[] {
    const lines = (this.partial + chunk).split('\n')
    this.partial = lines.pop() ?? ''
    const out: PointDecision[] = []
    for (const line of lines) this.line(line, out)
    // Every call has its result: the point is complete although nothing has closed it yet.
    if (this.batch > 0 && this.pending.size === 0 && !this.decided) out.push(this.decide())
    return out
  }

  private line(line: string, out: PointDecision[]): void {
    if (!line.trim()) return
    let entry: { type?: string; isSidechain?: boolean; message?: { content?: unknown } }
    try { entry = JSON.parse(line) } catch { return }
    if (entry.isSidechain === true) return
    if (!this.promptSeen && entry.type === 'user') {
      const content = entry.message?.content
      const isResult = Array.isArray(content) && content.some((part: { type?: string }) => part.type === 'tool_result')
      if (!isResult) {
        this.promptSeen = true
        this.decider.observe({ kind: 'prompt', text: textOf(content as Parameters<typeof textOf>[0]) })
        return
      }
    }
    for (const event of eventsOfLine(line)) {
      if (event.kind === 'tool_use' || event.kind === 'text') {
        if (this.batch > 0 && !this.decided) out.push(this.decide())
        if (this.batch > 0) {
          this.batch = 0
          this.decided = false
        }
      }
      if (event.kind === 'tool_use') this.pending.add(event.id)
      if (event.kind === 'tool_result') {
        this.pending.delete(event.id)
        if (this.batch === 0) this.points += 1
        this.batch += 1
      }
      this.decider.observe(event)
    }
  }

  private decide(): PointDecision {
    this.decided = true
    return { point: this.points, ...this.decider.decide() }
  }
}
