#!/usr/bin/env node
// Score a decider on the frozen data set built by quench-data.
// Usage: quench-score --decider <name|oracle|comparator> [--config quench.local.json] [--cold <runs>]
// Prints per-arm, per-run and per-task tables and decision latency; writes
// <out>/score-<name>.json with every session's score.
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ignoreTokens, loadConfig, loadSessions, sha256, type Manifest } from './data.ts'
import type { DeciderFactory } from './decider.ts'
import { comparators } from '../comparators/index.ts'
import { deciders } from './deciders/index.ts'
import { groupBy, median, percentile, replay, type GroupSummary, type SessionScore } from './harness.ts'
import { labelParsed } from './labels.ts'
import { oracleFor } from './oracle.ts'
import { parseSession } from './session.ts'

const args = process.argv.slice(2)
const option = (name: string): string | undefined => {
  const at = args.indexOf(name)
  return at >= 0 ? args[at + 1] : undefined
}
const name = option('--decider') ?? ''
const config = loadConfig(option('--config'))
const available: Record<string, DeciderFactory> = { ...deciders, ...comparators(config.out) }
if (name !== 'oracle' && !available[name]) throw new Error(`--decider must be oracle or one of: ${Object.keys(available).join(', ')}`)
const manifestText = readFileSync(join(config.out, 'manifest.json'), 'utf8')
const manifest = JSON.parse(manifestText) as Manifest

const scores: SessionScore[] = []
const allNs: number[] = []
const nsByArm = new Map<string, number[]>()
for (const loaded of loadSessions(config, manifest)) {
  const parsed = parseSession(loaded.stream, loaded.prompt)
  const labels = labelParsed(parsed, loaded.required, { ignoreTokens })
  const factory: DeciderFactory = name === 'oracle' ? oracleFor(labels) : available[name] as DeciderFactory
  const { score, decisionNs } = replay({ run: loaded.meta.run, cell: loaded.meta.cell, task: loaded.meta.task, arm: loaded.meta.arm, parsed, labels }, factory)
  scores.push(score)
  allNs.push(...decisionNs)
  nsByArm.set(score.arm, [...(nsByArm.get(score.arm) ?? []), ...decisionNs])
}

const pct = (value: number): string => `${(value * 100).toFixed(1)}%`
const row = (label: string, s: GroupSummary): string =>
  `${label}\t${s.sessions}\t${s.reachedSufficiency}\t${s.stopped}\t${s.premature} (${pct(s.prematureRate)})\t${s.lostEvidence}\t${pct(s.medianSavedShare)}\t${s.saved.decisionPoints}\t${s.saved.toolCalls}\t${(s.saved.resultBytes / 1024).toFixed(0)}\t${s.medianLate ?? '-'}\n`
const header = 'sessions\tsufficient\tstopped\tpremature\tlost evidence\tmedian saved share\tsaved points\tsaved calls\tsaved KiB\tmedian late\n'
const out = process.stdout
out.write(`decider ${name}; manifest sha256 ${sha256(manifestText)}; ${scores.length} labelled sessions\n\n`)
out.write(`arm\t${header}`)
for (const [key, s] of groupBy(scores, (score) => score.arm)) out.write(row(key, s))
out.write(`\nrun/arm\t${header}`)
for (const [key, s] of groupBy(scores, (score) => `${score.run}/${score.arm}`)) out.write(row(key, s))
out.write(`\narm/task\t${header}`)
for (const [key, s] of groupBy(scores, (score) => `${score.arm}/${score.task}`)) out.write(row(key, s))

const us = (ns: number | null): string => (ns === null ? '-' : (ns / 1000).toFixed(1))
out.write(`\ndecision latency (µs, observe new events + decide)\tdecisions\tp50\tp99\tmax\n`)
out.write(`all\t${allNs.length}\t${us(percentile(allNs, 50))}\t${us(percentile(allNs, 99))}\t${us(Math.max(...allNs))}\n`)
for (const [arm, ns] of [...nsByArm].sort(([a], [b]) => a.localeCompare(b))) out.write(`${arm}\t${ns.length}\t${us(percentile(ns, 50))}\t${us(percentile(ns, 99))}\t${us(Math.max(...ns))}\n`)

const coldRuns = Number(option('--cold') ?? 0)
let cold: { runs: number; medianOriginMs: number | null; maxOriginMs: number; medianWallMs: number | null } | null = null
if (coldRuns > 0 && deciders[name]) {
  const origin: number[] = []
  const wall: number[] = []
  for (let i = 0; i < coldRuns; i += 1) {
    const start = process.hrtime.bigint()
    const child = spawnSync(process.execPath, [join(import.meta.dirname, '..', 'bin', 'quench-cold.mjs'), name], { encoding: 'utf8' })
    wall.push(Number(process.hrtime.bigint() - start) / 1e6)
    if (child.status !== 0) throw new Error(`cold start probe failed: ${child.stderr}`)
    origin.push(Number(child.stdout.trim()))
  }
  cold = { runs: coldRuns, medianOriginMs: median(origin), maxOriginMs: Math.max(...origin), medianWallMs: median(wall) }
  out.write(`\ncold start over ${coldRuns} runs: median ${cold.medianOriginMs?.toFixed(1)} ms from time origin to first decision (max ${cold.maxOriginMs.toFixed(1)}), ${cold.medianWallMs?.toFixed(1)} ms wall from spawn to exit\n`)
}

writeFileSync(join(config.out, `score-${name}.json`), `${JSON.stringify({
  decider: name,
  manifestSha256: sha256(manifestText),
  latencyNs: { decisions: allNs.length, p50: percentile(allNs, 50), p99: percentile(allNs, 99) },
  cold,
  scores,
}, null, 1)}\n`)
