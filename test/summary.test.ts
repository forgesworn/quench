import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sessionSummary } from '../src/deciders/summary.ts'

test('summary is bounded, keeps the task, the files read and the newest calls', () => {
  const summary = sessionSummary({ maxChars: 900, recentResults: 2, excerptChars: 60 })
  summary.observe({ kind: 'prompt', text: 'Explain openSession. Cite implementation and tests.' })
  for (let i = 0; i < 40; i += 1) {
    summary.observe({ kind: 'tool_use', id: `c${i}`, name: 'Read', input: { file_path: i % 2 ? `src/f${i}.ts` : `test/f${i}.test.ts` } })
    summary.observe({ kind: 'tool_result', id: `c${i}`, text: `result ${i} `.repeat(30), isError: false })
  }
  const text = summary.render()
  assert.ok(text.length <= 900)
  assert.match(text, /Explain openSession/)
  assert.match(text, /test\/f0\.test\.ts \(test\)/)
  assert.match(text, /result 39/)
  assert.doesNotMatch(text, /result 37 /)
})
