// Normalised events and decision points from a recorded agent session.
//
// A session is a stream of JSON events (Claude Code stream-json): assistant
// messages carrying tool_use blocks and user messages carrying tool_result
// blocks. A decision point follows each batch of tool results: the agent could
// stop there or call another tool. Everything here exists at run time; labels
// and required evidence live elsewhere.

export type SessionEvent =
  | { kind: 'prompt'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'tool_use'; id: string; name: string; input: unknown }
  | { kind: 'tool_result'; id: string; text: string; isError: boolean }

/**
 * What a tool call does, from its name and input alone:
 * - write: changes a file (the answer or source);
 * - check: runs tests or validates a draft (compiler, test runner, coverage,
 *   fixed-string searches that confirm a citation token);
 * - read: everything else, i.e. gathering evidence.
 */
export type CallClass = 'read' | 'write' | 'check'

export interface PointCall {
  id: string
  name: string
  class: CallClass
  resultBytes: number
  isError: boolean
}

export interface SessionPoint {
  /** 1-based position of this decision point in the session. */
  index: number
  /** Events up to and including this point: replay observes events[0..eventEnd) then decides. */
  eventEnd: number
  /** Cumulative counts up to and including this point. */
  toolCalls: number
  resultBytes: number
  errors: number
  /** Tool calls whose results close at this point. */
  calls: PointCall[]
}

export interface ParsedSession {
  events: SessionEvent[]
  points: SessionPoint[]
}

interface ContentPart {
  type?: string
  id?: string
  name?: string
  input?: unknown
  tool_use_id?: string
  text?: string
  content?: string | ContentPart[]
  is_error?: boolean
}

export const textOf = (content: string | ContentPart[] | undefined): string => typeof content === 'string'
  ? content
  : (content ?? []).map((part) => (part.type === 'text' ? part.text ?? '' : '')).join('\n')

const writeTools = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
const testCommand = /\b(npm (run )?(test|check|typecheck|build)|npm t\b|node --test|npx (tsc|vitest|jest|mocha)|tsc\b|vitest|jest|pytest|cargo (test|check|build)|go (test|vet|build)|make (test|check))/
const answerWrite = /(>|\btee\b|\bcp\b|\bmv\b)[^|&;]*\banswer\.json\b/
// Fixed-string searches check that a citation token is copied exactly; they gather nothing new.
const citationCheck = /\b(grep|rg)\b[^|;&]*\s(-[a-zA-Z]*F[a-zA-Z]*|--fixed-strings)\b/

export function classifyCall(name: string, input: unknown): CallClass {
  if (writeTools.has(name)) return 'write'
  if (/coverage/i.test(name)) return 'check'
  if (name === 'Bash') {
    const command = typeof input === 'object' && input !== null && 'command' in input ? String((input as { command: unknown }).command) : ''
    if (answerWrite.test(command)) return 'write'
    if (testCommand.test(command) || citationCheck.test(command) || /\banswer\.json\b/.test(command)) return 'check'
  }
  return 'read'
}

/** Normalises one stream-json line; returns no events for lines that carry none. */
export function eventsOfLine(line: string): SessionEvent[] {
  if (!line.trim()) return []
  let event: { type?: string; message?: { content?: unknown } }
  try { event = JSON.parse(line) } catch { return [] }
  const content = event.message?.content
  if (!Array.isArray(content)) return []
  const out: SessionEvent[] = []
  for (const part of content as ContentPart[]) {
    if (event.type === 'assistant') {
      if (part.type === 'tool_use') out.push({ kind: 'tool_use', id: part.id ?? '', name: part.name ?? '', input: part.input ?? null })
      else if (part.type === 'text' && part.text) out.push({ kind: 'text', text: part.text })
    } else if (event.type === 'user' && part.type === 'tool_result') {
      out.push({ kind: 'tool_result', id: part.tool_use_id ?? '', text: textOf(part.content), isError: part.is_error === true })
    }
  }
  return out
}

export function parseSession(streamText: string, prompt?: string): ParsedSession {
  const events: SessionEvent[] = prompt === undefined ? [] : [{ kind: 'prompt', text: prompt }]
  const points: SessionPoint[] = []
  const pendingUse = new Map<string, { name: string; class: CallClass }>()
  let batch: PointCall[] = []
  let toolCalls = 0
  let resultBytes = 0
  let errors = 0
  const close = (): void => {
    if (batch.length === 0) return
    points.push({ index: points.length + 1, eventEnd: events.length, toolCalls, resultBytes, errors, calls: batch })
    batch = []
  }
  for (const line of streamText.split('\n')) {
    for (const event of eventsOfLine(line)) {
      if (event.kind === 'tool_use' || event.kind === 'text') close()
      if (event.kind === 'tool_use') {
        toolCalls += 1
        pendingUse.set(event.id, { name: event.name, class: classifyCall(event.name, event.input) })
      } else if (event.kind === 'tool_result') {
        const use = pendingUse.get(event.id)
        const bytes = Buffer.byteLength(event.text)
        resultBytes += bytes
        if (event.isError) errors += 1
        batch.push({ id: event.id, name: use?.name ?? '', class: use?.class ?? 'read', resultBytes: bytes, isError: event.isError })
      }
      events.push(event)
    }
  }
  close()
  return { events, points }
}
