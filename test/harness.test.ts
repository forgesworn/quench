import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { DeciderFactory, SessionEvent } from '../src/decider.ts'
import { alwaysContinue } from '../src/deciders/always-continue.ts'
import { finishingCost, finishingPoints, lastReadPoint, replay, savedAfter, summarise, type ReplaySession } from '../src/harness.ts'
import { labelParsed } from '../src/labels.ts'
import { oracleFor } from '../src/oracle.ts'
import { parseSession } from '../src/session.ts'
import { call, result, say, stream, usage } from './stream.ts'

// Points: 1 read alpha, 2 read beta (sufficient), 3 read, 4 write draft, 5 read, 6 write answer, 7 run tests.
// Each message's recorded input grows by 100 tokens: 100 before point 1 up to 800 for the final text.
const text = stream([
  usage(call('a'), 'm1', 100), result('a', 'alpha'),
  usage(call('b'), 'm2', 200), result('b', 'beta'),
  usage(call('c'), 'm3', 300), result('c', 'x'.repeat(10)),
  usage(call('d', 'Write'), 'm4', 400), result('d', 'draft'),
  usage(call('e'), 'm5', 500), result('e', 'y'.repeat(20)),
  usage(call('f', 'Write'), 'm6', 600), result('f', 'ok'),
  usage(call('g', 'Bash', { command: 'npm test' }), 'm7', 700), result('g', 'pass'),
  usage(say('done'), 'm8', 800),
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
  // A stop at 2 removes the messages sent after points 2, 3 and 4, which led to points 3 to 5.
  assert.deepEqual(savedAfter(parsed, 2), { decisionPoints: 3, toolCalls: 3, resultBytes: 10 + 5 + 20, inputTokens: 300 + 400 + 500 })
  assert.deepEqual(savedAfter(parsed, 6), { decisionPoints: 0, toolCalls: 0, resultBytes: 0, inputTokens: 0 })
  assert.deepEqual(savedAfter(parsed, null), { decisionPoints: 0, toolCalls: 0, resultBytes: 0, inputTokens: 0 })
  assert.deepEqual(finishingCost(parsed), { decisionPoints: 2, toolCalls: 2, resultBytes: 2 + 4, inputTokens: 600 + 700 + 800 })
})

test('the oracle stops at the first sufficient point: no premature stop, no lateness', () => {
  const { score } = replay(session, oracleFor(labels))
  assert.equal(score.stopAt, 2)
  assert.equal(score.premature, false)
  assert.equal(score.late, 0)
  assert.equal(score.saved.decisionPoints, 3)
  assert.equal(score.savedShare, 3 / 7)
  assert.equal(score.inputTokens, 3600)
  assert.equal(score.savedInputShare, 1200 / 3600)
})

test('group input share weighs long sessions by their tokens; the median treats sessions alike', () => {
  const stopped = replay(session, oracleFor(labels)).score
  const none = replay(session, alwaysContinue).score
  const long = { ...stopped, inputTokens: 36_000, saved: { ...stopped.saved, inputTokens: 12_000 } }
  const summary = summarise([long, none, none])
  assert.equal(summary.inputTokens, 36_000 + 3600 + 3600)
  assert.equal(summary.savedInputShare, 12_000 / 43_200)
  assert.equal(summary.medianSavedInputShare, 0)
})

test('always continue saves nothing and is late by the whole tail', () => {
  const { score, decisionNs } = replay(session, alwaysContinue)
  assert.equal(score.stopAt, null)
  assert.equal(score.premature, false)
  assert.equal(score.lostEvidence, false)
  assert.deepEqual(score.saved, { decisionPoints: 0, toolCalls: 0, resultBytes: 0, inputTokens: 0 })
  assert.equal(score.late, 5)
  assert.equal(decisionNs.length, 7)
})

test('a stop before sufficiency is premature and ends the replay there', () => {
  const { score, decisionNs } = replay(session, stopAt(1))
  assert.equal(score.premature, true)
  assert.equal(score.lostEvidence, true)
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
