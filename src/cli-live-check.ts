#!/usr/bin/env node
// Checks that the live path (LiveSession fed in arbitrary chunks) makes the
// same decision as replay at every point of every labelled session, for every
// registered decider. Usage: node src/cli-live-check.ts [--config quench.local.json]
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadConfig, loadSessions, type Manifest } from './data.ts'
import { deciders } from './deciders/index.ts'
import { LiveSession } from './live.ts'
import { parseSession, type SessionEvent } from './session.ts'

const at = process.argv.indexOf('--config')
const config = loadConfig(at >= 0 ? process.argv[at + 1] : undefined)
const manifest = JSON.parse(readFileSync(join(config.out, 'manifest.json'), 'utf8')) as Manifest
let sessions = 0
let decisions = 0
let seed = 1
const nextSize = (): number => (seed = (seed * 48271) % 2147483647) % 4096 + 1
for (const loaded of loadSessions(config, manifest)) {
  sessions += 1
  const parsed = parseSession(loaded.stream, loaded.prompt)
  const full = `${loaded.prompt === undefined ? '' : `${JSON.stringify({ type: 'user', message: { role: 'user', content: loaded.prompt } })}\n`}${loaded.stream}\n`
  for (const [name, factory] of Object.entries(deciders)) {
    const replayDecider = factory()
    let cursor = 0
    const expected = parsed.points.map((point) => {
      for (; cursor < point.eventEnd; cursor += 1) replayDecider.observe(parsed.events[cursor] as SessionEvent)
      return { point: point.index, ...replayDecider.decide() }
    })
    const live = new LiveSession(factory())
    const got = []
    for (let offset = 0; offset < full.length;) {
      const size = nextSize()
      got.push(...live.feed(full.slice(offset, offset + size)))
      offset += size
    }
    decisions += expected.length
    if (JSON.stringify(got) !== JSON.stringify(expected)) {
      const i = got.findIndex((d, n) => JSON.stringify(d) !== JSON.stringify(expected[n]))
      throw new Error(`${loaded.meta.run}/${loaded.meta.cell} ${name}: live differs at decision ${i + 1}: ${JSON.stringify(got[i])} vs ${JSON.stringify(expected[i])} (${got.length} vs ${expected.length})`)
    }
  }
}
console.log(`live matches replay: ${sessions} sessions, ${Object.keys(deciders).length} deciders, ${decisions} decisions`)
