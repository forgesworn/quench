import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyCall, parseSession } from '../src/session.ts'
import { call, result, say, stream, usage } from './stream.ts'

test('classifies writes, checks and reads from the call alone', () => {
  assert.equal(classifyCall('Write', { file_path: 'answer.json' }), 'write')
  assert.equal(classifyCall('Edit', {}), 'write')
  assert.equal(classifyCall('Bash', { command: 'cat > answer.json <<EOF' }), 'write')
  assert.equal(classifyCall('Bash', { command: 'npm test 2>&1 | tail' }), 'check')
  assert.equal(classifyCall('Bash', { command: 'jq . answer.json' }), 'check')
  assert.equal(classifyCall('mcp__z1p-repository__repository_coverage', {}), 'check')
  assert.equal(classifyCall('Bash', { command: 'grep -qF "term: token," src/a.ts && echo ok' }), 'check')
  assert.equal(classifyCall('Bash', { command: 'rg --fixed-strings "x" src' }), 'check')
  assert.equal(classifyCall('Bash', { command: 'grep -rn openSession src' }), 'read')
  assert.equal(classifyCall('Bash', { command: 'grep -rnE "Foo|Bar" src' }), 'read')
  assert.equal(classifyCall('Read', { file_path: 'src/a.ts' }), 'read')
})

test('groups parallel results into one decision point and records where replay must pause', () => {
  const parsed = parseSession(stream([
    call('a'), call('b', 'Bash', { command: 'ls' }), result('a', 'one'), result('b', 'two'),
    call('c', 'Write'), result('c', 'written'),
  ]), 'the task')
  assert.equal(parsed.events[0]?.kind, 'prompt')
  assert.equal(parsed.points.length, 2)
  assert.deepEqual(parsed.points.map((point) => point.calls.map((c) => c.class)), [['read', 'read'], ['write']])
  assert.equal(parsed.points[0]?.eventEnd, 5)
  assert.equal(parsed.points[1]?.toolCalls, 3)
})

test('counts each message\'s input tokens once, after the point its results closed', () => {
  const thinking = (id: string, tokens: number) => usage({ type: 'assistant', message: { content: [{ type: 'thinking', thinking: 'hm' }] } }, id, tokens)
  const parsed = parseSession(stream([
    thinking('m1', 50), usage(call('a'), 'm1', 50), result('a', 'one'),
    // m2 streams its thinking before its call: the point has passed although it closes only at the call.
    thinking('m2', 90), usage(call('b'), 'm2', 90), usage(call('c'), 'm2', 90), result('b', 'two'), result('c', 'three'),
    usage(say('done'), 'm3', 140),
    call('untracked'),
  ]))
  assert.equal(parsed.points.length, 2)
  assert.deepEqual(parsed.inputTokensAfter, [50, 90, 140])
})
