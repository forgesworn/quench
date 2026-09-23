#!/usr/bin/env node
// Score Q8 chain runs (docs/CHAINS.md).
// Usage: quench-chains --evidence <dir>
import { loadReceipts, priced, rule, stepTokens, summarise, type ArmSummary } from './chains.ts'

const args = process.argv.slice(2)
const at = args.indexOf('--evidence')
if (at < 0 || !args[at + 1]) throw new Error('usage: quench-chains --evidence <dir>')
const receipts = loadReceipts(args[at + 1] as string)
const M = (n: number): string => (n / 1e6).toFixed(2)
const row = (label: string, s: ArmSummary): string =>
  `${label}\t${s.runs}\t${s.accepted}/${s.steps}\t${M(s.priced)}\t${M(s.raw)}\t${M(s.tokens.fresh)}\t${M(s.tokens.cacheRead)}\t${M(s.tokens.output)}\t${s.compactions}\t${Math.round(s.seconds)}`
const header = 'group\truns\taccepted\tpriced Munits\traw Mtok\tfresh\tcache read\toutput\tcompactions\tseconds\n'

const byArm = summarise(receipts, (r) => r.arm)
process.stdout.write(`receipts ${receipts.length}\n\nBy policy\n${header}`)
for (const [arm, s] of [...byArm].sort()) process.stdout.write(`${row(arm, s)}\n`)
process.stdout.write(`\nBy chain and policy\n${header}`)
for (const [key, s] of [...summarise(receipts, (r) => `${r.chain} ${r.arm}`)].sort()) process.stdout.write(`${row(key, s)}\n`)

// Per step: mean priced cost, acceptance and largest context, by policy.
process.stdout.write('\nBy step (chain, step, policy: accepted/runs, mean priced Munits, mean largest context K)\n')
const steps = new Map<string, { accepted: number; runs: number; priced: number; ctx: number }>()
for (const r of receipts) for (const step of r.steps) {
  const key = `${r.chain}\tstep ${step.n}\t${r.arm}`
  const s = steps.get(key) ?? { accepted: 0, runs: 0, priced: 0, ctx: 0 }
  s.runs += 1
  s.accepted += step.checker?.passed ? 1 : 0
  s.priced += priced(stepTokens(step))
  s.ctx += Math.max(0, ...step.call.requestContexts)
  steps.set(key, s)
}
for (const [key, s] of [...steps].sort()) process.stdout.write(`${key}\t${s.accepted}/${s.runs}\t${M(s.priced / s.runs)}\t${Math.round(s.ctx / s.runs / 1e3)}\n`)

process.stdout.write('\nPass rules (docs/CHAINS.md)\n')
for (const result of [
  rule('1. boundary vs carry (>= 25% lower, accepted >= carry - 2)', byArm.get('boundary'), byArm.get('carry'), 0.25),
  rule('2. boundary vs threshold (>= 10% lower, accepted >= threshold - 2)', byArm.get('boundary'), byArm.get('threshold'), 0.1),
  rule('also: threshold vs carry (reported, no rule)', byArm.get('threshold'), byArm.get('carry'), 0),
]) {
  if (!result) continue
  process.stdout.write(`${result.rule}: cost ${(100 * result.costChange).toFixed(1)}%, accepted ${result.acceptedDelta >= 0 ? '+' : ''}${result.acceptedDelta}: ${result.met ? 'met' : 'not met'}\n`)
}
