// The state a comparator sees at a decision point: the task prompt and the
// newest tool calls with short result excerpts, within a character budget.
// Built from run-time events only, and independent of Quench's own deciders.
import { createHash } from 'node:crypto'
import type { SessionEvent } from '../src/decider.ts'

const clip = (text: string, max: number): string => (text.length <= max ? text : `${text.slice(0, max - 1)}…`)

export interface Snapshotter {
  observe(event: SessionEvent): void
  snapshot(): string
}

export function snapshotter(maxChars = 1900, promptChars = 700): Snapshotter {
  let prompt = ''
  const calls: Array<{ id: string; line: string; result: string }> = []
  return {
    observe(event) {
      if (event.kind === 'prompt') prompt = clip(event.text.replace(/\s+/g, ' '), promptChars)
      else if (event.kind === 'tool_use') calls.push({ id: event.id, line: clip(`${event.name.replace(/^mcp__.*?__/, '')} ${JSON.stringify(event.input)}`, 110), result: '' })
      else if (event.kind === 'tool_result') {
        const call = calls.findLast((c) => c.id === event.id)
        if (call) call.result = clip(`${event.isError ? 'ERROR ' : ''}${event.text.replace(/\s+/g, ' ')}`, 120)
      }
    },
    snapshot() {
      const head = `Task: ${prompt}\nTool calls so far: ${calls.length}. Most recent last:\n`
      const lines: string[] = []
      let budget = maxChars - head.length
      for (let i = calls.length - 1; i >= 0; i -= 1) {
        const call = calls[i]
        if (!call) continue
        const line = `- ${call.line} -> ${call.result}\n`
        if (line.length > budget) break
        lines.unshift(line)
        budget -= line.length
      }
      return head + lines.join('')
    },
  }
}

export const snapshotKey = (snapshot: string): string => createHash('sha256').update(snapshot).digest('hex')
