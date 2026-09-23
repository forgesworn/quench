import { test } from 'node:test'
import assert from 'node:assert/strict'
import { modelMessages, parseAnswer } from '../src/deciders/model.ts'

test('parses only well-formed typed answers', () => {
  assert.deepEqual(parseAnswer('{"decision":"stop","missing":[]}'), { decision: 'stop', missing: [] })
  assert.deepEqual(parseAnswer('{"decision":"continue","missing":["tests",3]}'), { decision: 'continue', missing: ['tests'] })
  assert.equal(parseAnswer('{"decision":"maybe","missing":[]}'), null)
  assert.equal(parseAnswer('not json'), null)
})

test('the request carries the summary and nothing else from the session', () => {
  const messages = modelMessages('TASK\nexplain x')
  assert.equal(messages.length, 2)
  assert.match(messages[1]?.content ?? '', /^TASK\nexplain x/)
})
