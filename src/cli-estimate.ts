#!/usr/bin/env node
// Estimate a model decider's input on the frozen data set without calling any
// model: build the bounded summary at every decision point where the test and
// implementation gate holds, and count characters (about 4 per token).
// Usage: quench-estimate [--max-chars 12000] [--config quench.local.json]
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadConfig, loadSessions, type Manifest } from './data.ts'
import { ruleDecider } from './deciders/rules.ts'
import { sessionSummary } from './deciders/summary.ts'
import { parseSession } from './session.ts'

const args = process.argv.slice(2)
const option = (name: string): string | undefined => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const maxChars = Number(option('--max-chars') ?? 12000)
const config = loadConfig(option('--config'))
const manifest = JSON.parse(readFileSync(join(config.out, 'manifest.json'), 'utf8')) as Manifest
let points = 0
let gated = 0
let chars = 0
let largest = 0
for (const loaded of loadSessions(config, manifest)) {
  const parsed = parseSession(loaded.stream, loaded.prompt)
  const summary = sessionSummary({ maxChars })
  // The gate: a test file and an implementation file read (never stops by itself).
  const gate = ruleDecider({ requireTestAndImpl: true, staleFor: 0 })
  let cursor = 0
  for (const point of parsed.points) {
    for (; cursor < point.eventEnd; cursor += 1) {
      const event = parsed.events[cursor]
      if (!event) continue
      summary.observe(event)
      gate.observe(event)
    }
    points += 1
    if (gate.decide().decision !== 'stop') continue
    gated += 1
    const size = summary.render().length
    chars += size
    largest = Math.max(largest, size)
  }
}
const tokens = Math.ceil(chars / 4)
process.stdout.write(`decision points ${points}; gated points (upper bound on model calls) ${gated}\n`)
process.stdout.write(`summary max ${maxChars} chars: total ${chars} chars, about ${tokens} input tokens (mean ${Math.round(chars / Math.max(1, gated) / 4)} per call, largest ${Math.ceil(largest / 4)})\n`)
