import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildManifest, loadSessions } from '../src/data.ts'
import { call, result, stream } from './stream.ts'

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'quench-data-'))
  mkdirSync(join(root, 'acceptance'))
  writeFileSync(join(root, 'acceptance', 'orient.json'), JSON.stringify({ requiredEvidence: [{ token: 'alpha' }] }))
  writeFileSync(join(root, 'acceptance', 'change.json'), JSON.stringify({ checker: 'npm test' }))
  const cell = (path: string, task: string, arm: string): void => {
    mkdirSync(join(root, 'run', path), { recursive: true })
    writeFileSync(join(root, 'run', path, 'receipt.json'), JSON.stringify({ task, arm, accepted: true, executor: { model: 'm' } }))
    writeFileSync(join(root, 'run', path, 'executor.stream.jsonl'), stream([call('a'), result('a', 'alpha')]))
  }
  cell('orient/plain', 'orient', 'plain')
  cell('change/plain', 'change', 'plain')
  cell('invalid/orient/plain', 'orient', 'plain')
  return root
}

test('lists labelled, unlabelled and excluded cells deterministically', () => {
  const root = fixture()
  const config = { acceptance: join(root, 'acceptance'), out: join(root, 'out'), runs: [{ label: 'r', dir: join(root, 'run'), exclude: ['invalid'] }] }
  const manifest = buildManifest(config)
  assert.deepEqual(manifest.sessions.map((s) => [s.cell, s.labelled, s.unlabelledReason ?? null]), [
    ['change/plain', false, 'no declared required evidence'],
    ['orient/plain', true, null],
  ])
  assert.deepEqual(manifest.excluded.map((e) => e.cell), ['invalid/orient/plain'])
  assert.equal(JSON.stringify(buildManifest(config)), JSON.stringify(manifest))
  assert.equal(loadSessions(config, manifest).length, 1)
})

test('refuses a session whose stream changed after the manifest was built', () => {
  const root = fixture()
  const config = { acceptance: join(root, 'acceptance'), out: join(root, 'out'), runs: [{ label: 'r', dir: join(root, 'run') }] }
  const manifest = buildManifest(config)
  writeFileSync(join(root, 'run', 'orient', 'plain', 'executor.stream.jsonl'), 'changed')
  assert.throws(() => loadSessions(config, manifest), /stream changed/)
})
