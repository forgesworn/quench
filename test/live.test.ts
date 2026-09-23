import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Decider, SessionEvent } from '../src/decider.ts'
import { ruleDecider } from '../src/deciders/rules.ts'
import { LiveSession } from '../src/live.ts'
import { parseSession } from '../src/session.ts'
import { call, result, say, stream } from './stream.ts'

/** The decision at every point, as replay would make it if it never stopped. */
export function replayDecisions(text: string, prompt: string, decider: Decider): Array<{ point: number; decision: string; reason: string }> {
  const parsed = parseSession(text, prompt)
  let cursor = 0
  return parsed.points.map((point) => {
    for (; cursor < point.eventEnd; cursor += 1) decider.observe(parsed.events[cursor] as SessionEvent)
    return { point: point.index, ...decider.decide() }
  })
}

const read = (id: string, path: string) => [call(id, 'Read', { file_path: path }), result(id, `1\tcontent of ${path}`)]
const text = stream([
  ...read('a', 'src/a.ts'), ...read('b', 'src/a.test.ts'),
  call('c', 'Read', { file_path: 'src/c.ts' }), call('d', 'Bash', { command: 'ls src' }), result('c', 'c'), result('d', 'src/a.ts\nsrc/c.ts'),
  { type: 'assistant', isSidechain: true, message: { content: [{ type: 'tool_use', id: 's', name: 'Read', input: { file_path: 'src/secret.ts' } }] } },
  say('thinking aloud'),
  ...read('e', 'src/a.ts'), ...read('f', 'src/c.ts'), ...read('g', 'src/a.ts'), ...read('h', 'src/c.ts'), ...read('i', 'src/a.ts'),
  call('w', 'Write', { file_path: 'answer.json' }), result('w', 'ok'),
])
const prompt = 'Explain src/a.ts'
const promptLine = JSON.stringify({ type: 'user', message: { role: 'user', content: prompt } })

test('live decisions match replay at every point, however the transcript arrives', () => {
  // The sidechain line is invisible to replay's parser too, so both see the same events.
  const expected = replayDecisions(text.split('\n').filter((line) => !line.includes('isSidechain')).join('\n'), prompt, ruleDecider({ requireTestAndImpl: true, staleFor: 3 }))
  assert.ok(expected.some((d) => d.decision === 'stop'))
  const full = `${promptLine}\n${text}\n`
  for (const size of [1, 7, 64, full.length]) {
    const live = new LiveSession(ruleDecider({ requireTestAndImpl: true, staleFor: 3 }))
    const got = []
    for (let at = 0; at < full.length; at += size) got.push(...live.feed(full.slice(at, at + size)))
    assert.deepEqual(got, expected, `chunk size ${size}`)
  }
})

test('a point waits until every parallel call has its result', () => {
  const live = new LiveSession(ruleDecider({ staleFor: 0 }))
  const lines = stream([call('a'), call('b'), result('a', 'one')]) + '\n'
  assert.deepEqual(live.feed(`${promptLine}\n${lines}`), [])
  assert.deepEqual(live.feed(`${JSON.stringify(result('b', 'two'))}\n`).map((d) => d.point), [1])
  // The next action closes the point; it is not decided twice.
  assert.deepEqual(live.feed(`${JSON.stringify(call('c'))}\n`), [])
})
