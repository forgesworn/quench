#!/usr/bin/env node
// Score Q10 lanes on the Q5 held-out tasks against the Pro reference (docs/LANES.md). Aggregates only.
// Usage: quench-lanes --reference <pro evidence dir> --lane <model>=<evidence dir> [--lane ...]
import { byClass, dollars, loadLane, qualifies, RATES } from './lanes.ts'

const args = process.argv.slice(2)
const refAt = args.indexOf('--reference')
if (refAt < 0 || !args[refAt + 1]) throw new Error('usage: quench-lanes --reference <dir> --lane <model>=<dir> [...]')
const reference = byClass(loadLane(args[refAt + 1] as string))
const lanes = args.flatMap((a, i) => (a === '--lane' && args[i + 1] ? [args[i + 1] as string] : [])).map((spec) => {
  const at = spec.indexOf('=')
  return { model: spec.slice(0, at), dir: spec.slice(at + 1) }
})
const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0
const out = (line = ''): void => { process.stdout.write(`${line}\n`) }

out('lane\tclass\taccepted\treference\tqualifies\tturn limits\tmedian s\tdollars\tper accepted')
for (const lane of lanes) {
  const classes = byClass(loadLane(lane.dir))
  const rate = RATES[lane.model]
  for (const [category, c] of [...classes].sort()) {
    const ref = reference.get(category)
    const q = qualifies(c, ref)
    const cost = rate ? dollars(c.tokens, rate) : null
    out([
      lane.model, category, `${c.accepted}/${c.sessions}`, ref ? `${ref.accepted}/${ref.sessions}` : '-',
      q === null ? 'incomplete' : q ? 'yes' : 'no', String(c.turnLimits), String(Math.round(median(c.seconds))),
      cost === null ? 'no rate' : `$${cost.toFixed(3)}`, cost === null || !c.accepted ? '-' : `$${(cost / c.accepted).toFixed(3)}`,
    ].join('\t'))
  }
}
