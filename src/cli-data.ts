#!/usr/bin/env node
// Rebuild the frozen data set: manifest.json and labels.json under the configured output directory.
// Usage: quench-data [--config quench.local.json]
// Output is deterministic: a second run over unchanged evidence is byte-identical.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildManifest, ignoreTokens, loadConfig, loadSessions, sha256 } from './data.ts'
import { labelSession } from './labels.ts'

const args = process.argv.slice(2)
const flag = args.indexOf('--config')
const config = loadConfig(flag >= 0 ? args[flag + 1] : undefined)
const manifest = buildManifest(config)
const labels = loadSessions(config, manifest).map(({ meta, stream, required }) => {
  const { points, ...rest } = labelSession(stream, required, { ignoreTokens })
  return {
    run: meta.run,
    cell: meta.cell,
    task: meta.task,
    arm: meta.arm,
    accepted: meta.accepted,
    ...rest,
    sufficiency: points.map((point) => (point.sufficient ? '1' : '0')).join(''),
  }
})
const manifestText = `${JSON.stringify(manifest, null, 1)}\n`
const labelsText = `${JSON.stringify(labels, null, 1)}\n`
mkdirSync(config.out, { recursive: true })
writeFileSync(join(config.out, 'manifest.json'), manifestText)
writeFileSync(join(config.out, 'labels.json'), labelsText)

const counts = new Map<string, { sessions: number; labelled: number; reachedSufficiency: number }>()
for (const session of manifest.sessions) {
  const key = `${session.run}\t${session.arm}\t${session.task}`
  const count = counts.get(key) ?? { sessions: 0, labelled: 0, reachedSufficiency: 0 }
  count.sessions += 1
  if (session.labelled) count.labelled += 1
  counts.set(key, count)
}
for (const label of labels) {
  const count = counts.get(`${label.run}\t${label.arm}\t${label.task}`)
  if (count && label.firstSufficient !== null) count.reachedSufficiency += 1
}
process.stdout.write('run\tarm\ttask\tsessions\tlabelled\treached sufficiency\n')
for (const [key, count] of [...counts].sort(([a], [b]) => a.localeCompare(b))) {
  process.stdout.write(`${key}\t${count.sessions}\t${count.labelled}\t${count.reachedSufficiency}\n`)
}
process.stdout.write(`sessions ${manifest.sessions.length}, labelled ${labels.length}, excluded ${manifest.excluded.length}\n`)
process.stdout.write(`manifest sha256 ${sha256(manifestText)}\nlabels sha256 ${sha256(labelsText)}\n`)
