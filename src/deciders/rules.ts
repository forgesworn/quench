// Deterministic stop rules over run-time signals only.
//
// The decider keeps incremental state from the events it observes: files the
// agent has read or seen listed, which of them are tests, how many decision
// points have passed since a new file appeared, which identifiers named in the
// task prompt have appeared in tool results, whether a coverage check reported
// nothing missing, and repeated calls. It never sees labels, required evidence
// or outcomes; test/leakage.test.ts enforces that this directory imports only
// the decider interface.
import type { Decider, SessionEvent } from '../decider.ts'
import { classifyCall } from '../session.ts'

export interface RuleParams {
  /** Stop only after this many consecutive decision points added no new file. */
  staleFor?: number
  /** What counts as a new file: any path read or listed (default), or only paths the agent chose to read. */
  staleOn?: 'seen' | 'read'
  /** Require at least one test file and one implementation file read. */
  requireTestAndImpl?: boolean
  /** Require every identifier named in the prompt to have appeared in a tool result. */
  requirePromptTerms?: boolean
  /** Stop when a coverage check reports nothing missing (arms that have one). */
  stopOnCleanCoverage?: boolean
  /** Stop when the agent repeats an identical read call it has already made. */
  stopOnRepeat?: boolean
  /** Never stop before this many decision points. */
  minPoints?: number
}

// Anchored on the extension, then walked back to the path's start: scanning
// every word position with one regex costs about 0.5 ms per 20 KB result.
const extensionPattern = /\.(?:tsx?|mts|cts|mjs|cjs|jsx?|json|md|rs|py|go)(?![\w])/g
const isPathChar = (code: number): boolean =>
  (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95 || code === 64 || code === 46 || code === 47 || code === 45
const testPath = /(^|\/)(test|tests|__tests__)\/|\.(test|spec)\.[a-z]+$/
const codePath = /\.(ts|tsx|mts|cts|mjs|cjs|js|jsx|rs|py|go)$/
// Identifiers in prose: camelCase, PascalCase with an inner capital, snake_case, or backticked.
const identifierPattern = /`([A-Za-z_][\w.]*)`|\b([a-z]+[A-Z]\w*|[A-Z][a-z]+[A-Z]\w*|[a-z]+_[a-z_]+)\b/g
// Harness boilerplate that names identifiers which say nothing about the task.
const boilerplate = /^(answerSchema|answer\.json|repository_\w+|expectedGeneration|pathPrefix|maxTurns)$/

/** Repository-relative form of a path: drops anything up to a workspace root. */
export function normalisePath(path: string): string {
  const at = path.lastIndexOf('/workspace/')
  return (at >= 0 ? path.slice(at + '/workspace/'.length) : path).replace(/^\.\//, '')
}

export function pathsIn(text: string): string[] {
  const paths: string[] = []
  for (const match of text.matchAll(extensionPattern)) {
    let start = match.index
    while (start > 0 && isPathChar(text.charCodeAt(start - 1))) start -= 1
    if (start < match.index) paths.push(normalisePath(text.slice(start, match.index + match[0].length)))
  }
  return paths
}

export function promptTerms(prompt: string): string[] {
  const terms = new Set<string>()
  for (const match of prompt.matchAll(identifierPattern)) {
    const term = match[1] ?? match[2]
    if (term && !boilerplate.test(term)) terms.add(term)
  }
  return [...terms]
}

export const isTestPath = (path: string): boolean => testPath.test(path)
export const isImplPath = (path: string): boolean => codePath.test(path) && !testPath.test(path)

export function ruleDecider(params: RuleParams): Decider {
  const files = new Set<string>()
  const readFiles = new Set<string>()
  let testRead = false
  let implRead = false
  let terms: string[] = []
  const termsSeen = new Set<string>()
  const calls = new Set<string>()
  const pendingRead = new Set<string>()
  let repeated = false
  let cleanCoverage = false
  let points = 0
  let pointsSinceNewFile = 0
  let newFileThisPoint = false

  const see = (path: string, read: boolean): void => {
    const known = params.staleOn === 'read' ? readFiles : files
    if (!known.has(path) && (read || params.staleOn !== 'read')) newFileThisPoint = true
    files.add(path)
    if (read) readFiles.add(path)
    if (read && isTestPath(path)) testRead = true
    if (read && isImplPath(path)) implRead = true
  }

  const observe = (event: SessionEvent): void => {
    if (event.kind === 'prompt') {
      terms = promptTerms(event.text)
    } else if (event.kind === 'tool_use') {
      if (classifyCall(event.name, event.input) !== 'read') return
      const key = `${event.name}:${JSON.stringify(event.input)}`
      if (calls.has(key)) repeated = true
      calls.add(key)
      pendingRead.add(event.id)
      for (const path of pathsIn(JSON.stringify(event.input))) see(path, true)
    } else if (event.kind === 'tool_result') {
      const wasRead = pendingRead.delete(event.id)
      if (event.isError) return
      if (/coverage/.test(event.text) && /\b0 missing\b/.test(event.text)) cleanCoverage = true
      if (wasRead) for (const path of pathsIn(event.text.slice(0, 20_000))) see(path, false)
      for (const term of terms) if (!termsSeen.has(term) && event.text.includes(term)) termsSeen.add(term)
    }
  }

  const decide = (): { decision: 'stop' | 'continue'; reason: string } => {
    points += 1
    pointsSinceNewFile = newFileThisPoint ? 0 : pointsSinceNewFile + 1
    newFileThisPoint = false
    const repeatNow = repeated
    repeated = false
    const cont = (reason: string) => ({ decision: 'continue' as const, reason })
    if (points < (params.minPoints ?? 1)) return cont('too early')
    if (params.requireTestAndImpl && !(testRead && implRead)) return cont('no test and implementation read yet')
    if (params.requirePromptTerms && termsSeen.size < terms.length) return cont('prompt identifiers not all seen')
    if (params.stopOnCleanCoverage && cleanCoverage) return { decision: 'stop', reason: 'coverage reports nothing missing' }
    if (params.stopOnRepeat && repeatNow) return { decision: 'stop', reason: 'repeated an earlier read' }
    if (params.staleFor !== undefined && pointsSinceNewFile >= params.staleFor) return { decision: 'stop', reason: `no new file for ${pointsSinceNewFile} points` }
    return cont('still gathering')
  }

  return { observe, decide }
}
