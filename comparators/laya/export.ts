#!/usr/bin/env node
// Write every decision point's snapshot, deduplicated by hash, as JSONL for Laya.
// Usage: node comparators/laya/export.ts <out.jsonl> [config.json]
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadConfig, loadSessions, type Manifest } from '../../src/data.ts'
import { parseSession } from '../../src/session.ts'
import { snapshotKey, snapshotter } from '../snapshot.ts'

const out = process.argv[2]
if (!out) throw new Error('usage: export.ts <out.jsonl>')
const config = loadConfig(process.argv[3])
const manifest = JSON.parse(readFileSync(join(config.out, 'manifest.json'), 'utf8')) as Manifest
const seen = new Map<string, string>()
for (const loaded of loadSessions(config, manifest)) {
  const parsed = parseSession(loaded.stream, loaded.prompt)
  const snap = snapshotter()
  let cursor = 0
  for (const point of parsed.points) {
    for (; cursor < point.eventEnd; cursor += 1) {
      const event = parsed.events[cursor]
      if (event) snap.observe(event)
    }
    const text = snap.snapshot()
    seen.set(snapshotKey(text), text)
  }
}
writeFileSync(out, [...seen].map(([key, snapshot]) => JSON.stringify({ key, snapshot })).join('\n') + '\n')
process.stdout.write(`${seen.size} snapshots, ${[...seen.values()].reduce((n, s) => n + s.length, 0)} chars\n`)
