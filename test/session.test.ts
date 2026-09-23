import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyCall, parseSession } from '../src/session.ts'
import { call, result, stream } from './stream.ts'

test('classifies writes, checks and reads from the call alone', () => {
  assert.equal(classifyCall('Write', { file_path: 'answer.json' }), 'write')
  assert.equal(classifyCall('Edit', {}), 'write')
  assert.equal(classifyCall('Bash', { command: 'cat > answer.json <<EOF' }), 'write')
  assert.equal(classifyCall('Bash', { command: 'npm test 2>&1 | tail' }), 'check')
  assert.equal(classifyCall('Bash', { command: 'jq . answer.json' }), 'check')
  assert.equal(classifyCall('mcp__z1p-repository__repository_coverage', {}), 'check')
  assert.equal(classifyCall('Bash', { command: 'grep -rn openSession src' }), 'read')
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
