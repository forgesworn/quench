// Scoring for Q8 (docs/CHAINS.md): chain-run receipts to priced cost, acceptance and the pass rules.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

export interface Tokens {
  fresh: number
  cacheRead: number
  cacheWrite: number
  output: number
}

interface Call {
  tokens: Tokens
  compactions: Array<{ trigger?: string; pre_tokens?: number; post_tokens?: number }>
  requestContexts: number[]
  numTurns: number | null
  seconds: number
}

export interface ChainStep {
  n: number
  call: Call
  checker?: { passed: boolean }
  compactAfter?: Call
}

export interface ChainReceipt {
  chain: string
  arm: string
  rep: number
  steps: ChainStep[]
}

/**
 * Base-input units at the multipliers Claude Code incurs on Claude models: a cache miss is written to the
 * one-hour cache (2x), a cache read is 0.1x and output is 5x. Fresh input on the DeepSeek route is a miss.
 */
export const priced = (t: Tokens): number => 2 * (t.fresh + t.cacheWrite) + 0.1 * t.cacheRead + 5 * t.output
export const raw = (t: Tokens): number => t.fresh + t.cacheWrite + t.cacheRead
const add = (a: Tokens, b: Tokens): Tokens => ({ fresh: a.fresh + b.fresh, cacheRead: a.cacheRead + b.cacheRead, cacheWrite: a.cacheWrite + b.cacheWrite, output: a.output + b.output })
const zero: Tokens = { fresh: 0, cacheRead: 0, cacheWrite: 0, output: 0 }

/** Every token a step cost, including the harness's compaction after it. */
export const stepTokens = (step: ChainStep): Tokens => (step.compactAfter ? add(step.call.tokens, step.compactAfter.tokens) : step.call.tokens)

export function loadReceipts(evidence: string): ChainReceipt[] {
  const out: ChainReceipt[] = []
  const walk = (dir: string, depth: number): void => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name)
      if (name === 'workspace' || name === 'calls' || /\.failed-\d+$/.test(name)) continue
      if (name === 'receipt.json') out.push(JSON.parse(readFileSync(path, 'utf8')) as ChainReceipt)
      else if (depth < 3 && statSync(path).isDirectory()) walk(path, depth + 1)
    }
  }
  if (existsSync(evidence)) walk(evidence, 0)
  return out
}

export interface ArmSummary {
  runs: number
  steps: number
  accepted: number
  tokens: Tokens
  priced: number
  raw: number
  compactions: number
  seconds: number
}

export function summarise(receipts: ChainReceipt[], key: (r: ChainReceipt) => string): Map<string, ArmSummary> {
  const out = new Map<string, ArmSummary>()
  for (const r of receipts) {
    const s = out.get(key(r)) ?? { runs: 0, steps: 0, accepted: 0, tokens: zero, priced: 0, raw: 0, compactions: 0, seconds: 0 }
    s.runs += 1
    for (const step of r.steps) {
      const t = stepTokens(step)
      s.steps += 1
      s.accepted += step.checker?.passed ? 1 : 0
      s.tokens = add(s.tokens, t)
      s.priced += priced(t)
      s.raw += raw(t)
      s.compactions += step.call.compactions.length + (step.compactAfter?.compactions.length ?? 0)
      s.seconds += step.call.seconds + (step.compactAfter?.seconds ?? 0)
    }
    out.set(key(r), s)
  }
  return out
}

export interface RuleResult {
  rule: string
  costChange: number
  acceptedDelta: number
  met: boolean
}

/** Pass rules from docs/CHAINS.md: priced cost at least `saving` lower, accepted steps no fewer than the reference's minus 2. */
export function rule(name: string, test: ArmSummary | undefined, reference: ArmSummary | undefined, saving: number): RuleResult | null {
  if (!test || !reference || reference.priced === 0) return null
  const costChange = test.priced / reference.priced - 1
  const acceptedDelta = test.accepted - reference.accepted
  return { rule: name, costChange, acceptedDelta, met: costChange <= -saving && acceptedDelta >= -2 }
}
