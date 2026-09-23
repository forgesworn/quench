import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { statePaths } from '../src/hook.ts'
import { call, result } from './stream.ts'

const hook = join(import.meta.dirname, '..', 'bin', 'quench-hook.mjs')

// Implementation and test read, then the same two files again and again: stale-5 stops at point 7.
const reads = ['src/a.ts', 'src/a.test.ts', 'src/a.ts', 'src/a.test.ts', 'src/a.ts', 'src/a.test.ts', 'src/a.ts', 'src/a.test.ts']

function run(mode: 'on' | 'off', deep = false): { outputs: string[]; log: string } {
  let state = mkdtempSync(join(tmpdir(), 'qht-'))
  // Evidence folders are deep: the socket must not live under the state directory.
  if (deep) { state = join(state, 'evidence-folder-with-a-long-name', 'orientation-task-with-long-id', 'plain', 'quench'); mkdirSync(state, { recursive: true }) }
  const transcript = join(state, 'transcript.jsonl')
  const sessionId = `test-${mode}-${deep}`
  writeFileSync(transcript, `${JSON.stringify({ type: 'user', message: { role: 'user', content: 'Explain a' } })}\n`)
  const outputs = reads.map((path, i) => {
    appendFileSync(transcript, `${JSON.stringify(call(`c${i}`, 'Read', { file_path: path }))}\n${JSON.stringify(result(`c${i}`, `1\t${path}`))}\n`)
    const child = spawnSync(process.execPath, [hook], {
      input: JSON.stringify({ session_id: sessionId, transcript_path: transcript, hook_event_name: 'PostToolUse' }),
      encoding: 'utf8',
      env: { ...process.env, QUENCH_STATE_DIR: state, QUENCH_IDLE_MS: '2000', QUENCH_HINT: mode },
    })
    assert.equal(child.status, 0)
    return child.stdout.trim()
  })
  return { outputs, log: readFileSync(statePaths(sessionId, state).log, 'utf8') }
}

test('the hook delivers one stop hint at the replay stop point, through its background process', () => {
  const { outputs, log } = run('on')
  assert.deepEqual(outputs.map((out) => out !== ''), [false, false, false, false, false, false, true, false])
  const reply = JSON.parse(outputs[6] ?? '') as { hookSpecificOutput: { hookEventName: string; additionalContext: string } }
  assert.equal(reply.hookSpecificOutput.hookEventName, 'PostToolUse')
  assert.match(reply.hookSpecificOutput.additionalContext, /^Quench: no new file for 5 points\./)
  assert.match(log, /"hint":"delivered","stopAt":7,"at":7/)
  // Later calls went through the background process, which logged every point.
  assert.match(log, /"point":8,"decision":"stop"/)
})

test('with the hint off, the hook logs the stop it withheld and prints nothing', () => {
  const { outputs, log } = run('off')
  assert.ok(outputs.every((out) => out === ''))
  assert.match(log, /"hint":"withheld","stopAt":7,"at":7/)
})

test('a long state directory still gets a working background process', () => {
  const { outputs, log } = run('on', true)
  assert.deepEqual(outputs.map((out) => out !== ''), [false, false, false, false, false, false, true, false])
  assert.match(log, /"started":"stale-5"/)
  assert.match(log, /"point":8,"decision":"stop"/)
})
