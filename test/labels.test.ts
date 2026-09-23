import { test } from 'node:test'
import assert from 'node:assert/strict'
import { labelSession } from '../src/labels.ts'
import { call, result, say, stream } from './stream.ts'

test('labels the first point where every required token has appeared and the headroom after it', () => {
  const text = stream([
    call('a'), result('a', 'function alpha() {}'),
    call('b'), result('b', 'beta test title'),
    call('c'), result('c', 'nothing new', true),
    call('d'), result('d', 'more reading'),
    say('done'),
  ])
  const labels = labelSession(text, [{ token: 'function alpha' }, { token: 'beta test' }])
  assert.equal(labels.decisionPoints, 4)
  assert.deepEqual(labels.points.map((point) => point.sufficient), [false, true, true, true])
  assert.equal(labels.firstSufficient, 2)
  assert.deepEqual(labels.headroom, { decisionPoints: 2, toolCalls: 2, resultBytes: Buffer.byteLength('nothing new') + Buffer.byteLength('more reading') })
  assert.equal(labels.points[2]?.errors, 1)
})

test('reports missing tokens and no headroom when evidence is never complete', () => {
  const labels = labelSession(stream([call('a'), result('a', 'alpha only')]), [{ token: 'alpha' }, { token: 'gamma' }])
  assert.equal(labels.firstSufficient, null)
  assert.equal(labels.headroom, null)
  assert.deepEqual(labels.missing, ['gamma'])
})

test('ignores tokens a tool prints in its own metadata and tolerates malformed lines', () => {
  const text = `${stream([call('a'), result('a', 'trust local-source-unsigned; alpha')])}\nnot json\n`
  const labels = labelSession(text, [{ token: 'alpha' }, { token: 'local-source-unsigned' }], { ignoreTokens: ['local-source-unsigned'] })
  assert.equal(labels.required, 1)
  assert.equal(labels.firstSufficient, 1)
})
