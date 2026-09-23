import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { deciders } from '../src/deciders/index.ts'
import { labelParsed } from '../src/labels.ts'
import { parseSession } from '../src/session.ts'
import { call, result, stream } from './stream.ts'

const root = join(import.meta.dirname, '..', 'src')
const importsOf = (file: string): string[] => [...readFileSync(file, 'utf8').matchAll(/\bfrom\s+'([^']+)'|\bimport\s*\(\s*'([^']+)'/g)].map((m) => m[1] ?? m[2] ?? '')

test('deciders import only the run-time interface: no labels, data, harness, oracle or file system', () => {
  const allowed = new Set(['../decider.ts', '../session.ts'])
  for (const name of readdirSync(join(root, 'deciders'))) {
    for (const spec of importsOf(join(root, 'deciders', name))) {
      assert.ok(allowed.has(spec) || /^\.\/[\w-]+\.ts$/.test(spec), `src/deciders/${name} imports ${spec}`)
    }
  }
  for (const spec of [...importsOf(join(root, 'session.ts')), ...importsOf(join(root, 'decider.ts'))]) {
    assert.ok(spec === './session.ts', `run-time interface imports ${spec}`)
  }
})

test('decisions do not change when required evidence, labels or acceptance change', () => {
  const text = stream([
    call('a', 'Read', { file_path: '/w/workspace/src/a.ts' }), result('a', 'export function alpha() {}'),
    call('b', 'Read', { file_path: '/w/workspace/src/a.test.ts' }), result('b', "test('alpha works')"),
    call('c', 'Bash', { command: 'grep -rn alpha src' }), result('c', 'src/a.ts:1:alpha'),
    call('d', 'Bash', { command: 'grep -rn alpha src' }), result('d', 'src/a.ts:1:alpha'),
    call('e', 'Read', { file_path: '/w/workspace/src/a.ts' }), result('e', 'export function alpha() {}'),
    call('f', 'Bash', { command: 'ls' }), result('f', 'src'),
  ])
  const parsed = parseSession(text, 'Explain `alpha`. Cite the implementation and tests.')
  const run = (factoryName: string): string[] => {
    const decider = deciders[factoryName]?.()
    assert.ok(decider)
    let cursor = 0
    return parsed.points.map((point) => {
      for (; cursor < point.eventEnd; cursor += 1) {
        const event = parsed.events[cursor]
        if (event) decider.observe(event)
      }
      return JSON.stringify(decider.decide())
    })
  }
  for (const name of Object.keys(deciders)) {
    const before = run(name)
    // Labels for two different declarations exist, but nothing reaches the decider.
    labelParsed(parsed, [{ token: 'alpha works' }])
    labelParsed(parsed, [{ token: 'never present' }])
    assert.deepEqual(run(name), before, name)
  }
})
