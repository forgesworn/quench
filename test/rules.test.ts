import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { SessionEvent } from '../src/decider.ts'
import { isImplPath, isTestPath, normalisePath, pathsIn, promptTerms, ruleDecider, type RuleParams } from '../src/deciders/rules.ts'

test('extracts paths, tests and prompt identifiers', () => {
  assert.equal(normalisePath('/x/y/workspace/src/a.ts'), 'src/a.ts')
  assert.deepEqual(pathsIn('src/a.ts:12: hit\npackages/b/test/c.test.mjs:3: x'), ['src/a.ts', 'packages/b/test/c.test.mjs'])
  assert.ok(isTestPath('src/log-redact.test.ts') && isTestPath('test/scan.ts') && !isTestPath('src/a.ts'))
  assert.ok(isImplPath('server/forwarder.mjs') && !isImplPath('README.md') && !isImplPath('src/a.test.ts'))
  assert.deepEqual(promptTerms('Assess tightening shortId via `openSession`; write answer.json using answerSchema and repository_status.'), ['shortId', 'openSession'])
})

const decisions = (params: RuleParams, batches: SessionEvent[][]): string[] => {
  const decider = ruleDecider(params)
  return batches.map((batch) => {
    for (const event of batch) decider.observe(event)
    return decider.decide().decision
  })
}
const read = (id: string, path: string, text = 'x'): SessionEvent[] => [
  { kind: 'tool_use', id, name: 'Read', input: { file_path: path } },
  { kind: 'tool_result', id, text, isError: false },
]

test('stale rule waits for a test and an implementation read, then k points with no new file', () => {
  const batches = [
    [{ kind: 'prompt', text: 'task' } as SessionEvent, ...read('a', 'src/a.ts')],
    read('b', 'src/b.ts'), read('c', 'src/a.ts'), read('d', 'src/b.ts'),
    read('e', 'src/a.test.ts'), read('f', 'src/a.ts'), read('g', 'src/b.ts'),
  ]
  assert.deepEqual(decisions({ requireTestAndImpl: true, staleFor: 2 }, batches), ['continue', 'continue', 'continue', 'continue', 'continue', 'continue', 'stop'])
})

test('coverage and repeat rules fire on their signals only', () => {
  const coverage: SessionEvent[] = [
    { kind: 'tool_use', id: 'c', name: 'mcp__x__repository_coverage', input: {} },
    { kind: 'tool_result', id: 'c', text: 'coverage A  3 files: 0 missing, 0 named, 3 cited', isError: false },
  ]
  assert.deepEqual(decisions({ stopOnCleanCoverage: true }, [read('a', 'src/a.ts'), coverage]), ['continue', 'stop'])
  assert.deepEqual(decisions({ stopOnRepeat: true }, [read('a', 'src/a.ts'), read('b', 'src/b.ts'), read('c', 'src/a.ts')]), ['continue', 'continue', 'stop'])
})

test('read novelty ignores listed paths but counts a listed path once it is read', () => {
  const listing: SessionEvent[] = [
    { kind: 'tool_use', id: 'l', name: 'Bash', input: { command: 'grep -rn x src' } },
    { kind: 'tool_result', id: 'l', text: 'src/c.ts:1: x\nsrc/d.ts:2: x', isError: false },
  ]
  const batches = [read('a', 'src/a.ts'), read('b', 'src/a.test.ts'), listing, read('c', 'src/c.ts'), read('d', 'src/a.ts')]
  assert.deepEqual(decisions({ requireTestAndImpl: true, staleOn: 'read', staleFor: 1 }, batches), ['continue', 'continue', 'stop', 'continue', 'stop'])
  assert.deepEqual(decisions({ requireTestAndImpl: true, staleFor: 1 }, batches), ['continue', 'continue', 'continue', 'stop', 'stop'])
})
