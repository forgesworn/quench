// A bounded, run-time-only summary of a session so far, for a model decider
// (Q3) or a comparator. It holds the task prompt, every tool call in compact
// form, the files read (tests marked) and short excerpts of the latest
// results, and never exceeds maxChars.
import type { SessionEvent } from '../decider.ts'
import { classifyCall } from '../session.ts'
import { isTestPath, pathsIn } from './rules.ts'

export interface SummaryOptions {
  maxChars: number
  promptChars?: number
  callChars?: number
  recentResults?: number
  excerptChars?: number
}

export interface SessionSummary {
  observe(event: SessionEvent): void
  render(): string
}

const clip = (text: string, max: number): string => (text.length <= max ? text : `${text.slice(0, max - 1)}…`)

export function sessionSummary(options: SummaryOptions): SessionSummary {
  const { maxChars, promptChars = 1500, callChars = 120, recentResults = 3, excerptChars = 400 } = options
  let prompt = ''
  const calls: string[] = []
  const read = new Set<string>()
  const names = new Map<string, string>()
  const recent: string[] = []
  return {
    observe(event) {
      if (event.kind === 'prompt') prompt = clip(event.text, promptChars)
      else if (event.kind === 'tool_use') {
        const input = JSON.stringify(event.input)
        names.set(event.id, event.name)
        calls.push(clip(`${event.name.replace(/^mcp__[^_]+(?:-[^_]+)*__/, '')} ${input}`, callChars))
        if (classifyCall(event.name, event.input) === 'read') for (const path of pathsIn(input)) read.add(path)
      } else if (event.kind === 'tool_result') {
        recent.push(clip(`[${names.get(event.id) ?? 'tool'}${event.isError ? ' error' : ''}] ${event.text.replace(/\s+/g, ' ')}`, excerptChars))
        if (recent.length > recentResults) recent.shift()
      }
    },
    render() {
      const files = [...read].map((path) => (isTestPath(path) ? `${path} (test)` : path))
      const head = `TASK\n${prompt}\n\nFILES READ (${files.length})\n${files.join('\n')}\n\nLATEST RESULTS\n${recent.join('\n')}\n\nCALLS (${calls.length}, newest last)\n`
      // Keep the newest calls that fit.
      let budget = maxChars - head.length
      const kept: string[] = []
      for (let i = calls.length - 1; i >= 0 && budget > 0; i -= 1) {
        const line = `${i + 1}. ${calls[i]}\n`
        if (line.length > budget) break
        kept.unshift(line)
        budget -= line.length
      }
      return clip(head + kept.join(''), maxChars)
    },
  }
}
