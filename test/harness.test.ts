import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { DeciderFactory, SessionEvent } from '../src/decider.ts'
import { alwaysContinue } from '../src/deciders/always-continue.ts'
import { finishingPoints, lastReadPoint, replay, savedAfter, summarise, type ReplaySession } from '../src/harness.ts'
import { labelParsed } from '../src/labels.ts'
import { oracleFor } from '../src/oracle.ts'
import { parseSession } from '../src/session.ts'
import { call, result, say, stream } from './stream.ts'

// Points: 1 read alpha, 2 read beta (sufficient), 3 read, 4 write draft, 5 read, 6 write answer, 7 run tests.
const text = stream([
  call('a'), result('a', 'alpha'),
  call('b'), result('b', 'beta'),
  call('c'), result('c', 'x'.repeat(10)),
  call('d', 'Write'), result('d', 'draft'),
  call('e'), result('e', 'y'.repeat(20)),
  call('f', 'Write'), result('f', 'ok'),
  call('g', 'Bash', { command: 'npm test' }), result('g', 'pass'),
  say('done'),
])
const parsed = parseSession(text, 'task')
const labels = labelParsed(parsed, [{ token: 'alpha' }, { token: 'beta' }])
const session: ReplaySession = { run: 'r', cell: 'c', task: 't', arm: 'plain', parsed, labels }

const stopAt = (index: number): DeciderFactory => () => {
  let point = 0
  return { observe() {}, decide: () => (++point === index ? { decision: 'stop', reason: 'test' } : { decision: 'continue', reason: 'test' }) }
}

test('finishing steps are the writes and checks after the last evidence read', () => {
  assert.equal(lastReadPoint(parsed), 5)
  assert.deepEqual(finishingPoints(parsed).map((point) => point.index), [6, 7])
  assert.deepEqual(savedAfter(parsed, 2), { decisionPoints: 3, toolCalls: 3, resultBytes: 10 + 5 + 20 })
  assert.deepEqual(savedAfter(parsed, 6), { decisionPoints: 0, toolCalls: 0, resultBytes: 0 })
  assert.deepEqual(savedAfter(parsed, null), { decisionPoints: 0, toolCalls: 0, resultBytes: 0 })
})

test('the oracle stops at the first sufficient point: no premature stop, no lateness', () => {
  const { score } = replay(session, oracleFor(labels))
  assert.equal(score.stopAt, 2)
  assert.equal(score.premature, false)
  assert.equal(score.late, 0)
  assert.equal(score.saved.decisionPoints, 3)
  assert.equal(score.savedShare, 3 / 7)
})

test('always continue saves nothing and is late by the whole tail', () => {
  const { score, decisionNs } = replay(session, alwaysContinue)
  assert.equal(score.stopAt, null)
  assert.equal(score.premature, false)
  assert.deepEqual(score.saved, { decisionPoints: 0, toolCalls: 0, resultBytes: 0 })
  assert.equal(score.late, 5)
  assert.equal(decisionNs.length, 7)
})

test('a stop before sufficiency is premature and ends the replay there', () => {
  const { score, decisionNs } = replay(session, stopAt(1))
  assert.equal(score.premature, true)
  assert.equal(score.late, null)
  assert.equal(decisionNs.length, 1)
  assert.equal(summarise([score, replay(session, oracleFor(labels)).score]).prematureRate, 0.5)
})

test('replay feeds each event exactly once, in order, before each decision', () => {
  const seen: SessionEvent[] = []
  const counts: number[] = []
  replay(session, () => ({ observe: (event) => { seen.push(event) }, decide: () => { counts.push(seen.length); return { decision: 'continue', reason: '' } } }))
  assert.deepEqual(seen, parsed.events.slice(0, parsed.points.at(-1)?.eventEnd))
  assert.deepEqual(counts, parsed.points.map((point) => point.eventEnd))
})
