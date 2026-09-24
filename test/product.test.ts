import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { decide, lastTurn } from '../src/guard.ts'
import { apply, readState, undo } from '../src/settings.ts'

const sandbox = (): { dir: string; settings: string } => {
  const dir = mkdtempSync(join(tmpdir(), 'quench-product-'))
  process.env.QUENCH_HOME = join(dir, 'home')
  process.env.QUENCH_CLAUDE_SETTINGS = join(dir, 'settings.json')
  return { dir, settings: join(dir, 'settings.json') }
}
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'))

test('apply shows the change first, writes it with a backup, and undo puts it back', () => {
  const { dir, settings } = sandbox()
  writeFileSync(settings, JSON.stringify({ model: 'opus', env: { KEEP: '1' } }))
  assert.equal(apply('subagent-model', false, '/cli').skip, null)
  assert.equal(read(settings).env.CLAUDE_CODE_SUBAGENT_MODEL, undefined)
  apply('subagent-model', true, '/cli')
  assert.deepEqual(read(settings), { model: 'opus', env: { KEEP: '1', CLAUDE_CODE_SUBAGENT_MODEL: 'sonnet' } })
  assert.ok(readdirSync(dir).some((f) => f.startsWith('settings.json.quench-backup-')))
  assert.ok(readState().applied['subagent-model'])
  assert.equal(apply('subagent-model', true, '/cli').skip, 'already in place')
  undo('subagent-model', true)
  assert.deepEqual(read(settings), { model: 'opus', env: { KEEP: '1' } })
  assert.equal(readState().applied['subagent-model'], undefined)
})

test('apply leaves a value the owner chose, and refuses a settings file it cannot read', () => {
  const { settings } = sandbox()
  writeFileSync(settings, JSON.stringify({ env: { CLAUDE_CODE_SUBAGENT_MODEL: 'haiku' } }))
  assert.match(apply('subagent-model', true, '/cli').skip ?? '', /already set/)
  writeFileSync(settings, '{ not json')
  assert.throws(() => apply('subagent-model', true, '/cli'))
  assert.equal(readFileSync(settings, 'utf8'), '{ not json')
})

test('the break guard is added beside other prompt hooks and removed alone', () => {
  const { settings } = sandbox()
  const other = { hooks: [{ type: 'command', command: 'other-hook' }] }
  writeFileSync(settings, JSON.stringify({ hooks: { UserPromptSubmit: [other] } }))
  apply('break-guard', true, '/path/cli.js')
  const list = read(settings).hooks.UserPromptSubmit
  assert.equal(list.length, 2)
  assert.match(list[1].hooks[0].command, /cli\.js" guard$/)
  undo('break-guard', true)
  assert.deepEqual(read(settings).hooks.UserPromptSubmit, [other])
})

const turn = (minutesAgo: number, ctx: number, oneHour = true, model = 'claude-opus-5') => JSON.stringify({
  type: 'assistant', timestamp: new Date(Date.now() - minutesAgo * 60e3).toISOString(),
  message: { model, usage: { input_tokens: 1, cache_read_input_tokens: ctx - 1, cache_creation_input_tokens: 0, cache_creation: oneHour ? { ephemeral_1h_input_tokens: 10 } : { ephemeral_5m_input_tokens: 10 } } },
})

test('the guard holds a large prompt only after the cache has expired, and only once', () => {
  const now = Date.now()
  assert.equal(decide(lastTurn(turn(30, 300e3)), now, null).block, false)
  assert.equal(decide(lastTurn(turn(90, 50e3)), now, null).block, false)
  const held = decide(lastTurn(turn(90, 300e3)), now, null)
  assert.equal(held.block, true)
  assert.ok(Math.abs((held.usd ?? 0) - 300e3 * 2 * 5e-6) < 1e-9)
  assert.match(held.reason ?? '', /\/clear/)
  assert.equal(decide(lastTurn(turn(90, 300e3)), now, now - 60e3).block, false)
  // A five-minute cache expires sooner.
  assert.equal(decide(lastTurn(turn(10, 300e3, false)), now, null).block, true)
})

test('the guard hook blocks once from a transcript, then lets the prompt through, logging no content', () => {
  const { dir } = sandbox()
  const transcript = join(dir, 't.jsonl')
  writeFileSync(transcript, `${JSON.stringify({ type: 'user', message: { content: 'secret words' } })}\n${turn(120, 400e3)}\n`)
  const event = JSON.stringify({ session_id: 'abc-123', transcript_path: transcript, prompt: 'secret prompt' })
  const run = () => spawnSync(process.execPath, ['src/cli.ts', 'guard'], { input: event, encoding: 'utf8', env: { ...process.env } })
  const first = run()
  assert.equal(JSON.parse(first.stdout).decision, 'block')
  assert.equal(run().stdout, '')
  const log = readFileSync(join(dir, 'home', 'guard.log'), 'utf8')
  assert.ok(!log.includes('secret') && !log.includes('abc-123'))
  // Turned off in the plugin's /config, the guard never blocks.
  const off = spawnSync(process.execPath, ['src/cli.ts', 'guard'], { input: event.replace('abc-123', 'abc-456'), encoding: 'utf8', env: { ...process.env, CLAUDE_PLUGIN_OPTION_BREAK_GUARD: 'false' } })
  assert.equal(off.stdout, '')
  // Broken input never blocks.
  assert.equal(spawnSync(process.execPath, ['src/cli.ts', 'guard'], { input: 'nonsense', encoding: 'utf8' }).stdout, '')
  assert.ok(existsSync(join(dir, 'home')))
})

test('the plugin ships the current build of the CLI', () => {
  const out = mkdtempSync(join(tmpdir(), 'quench-plugin-'))
  const build = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.build.json', '--outDir', out], { encoding: 'utf8' })
  assert.equal(build.status, 0, build.stdout)
  for (const file of readdirSync(out)) assert.equal(readFileSync(join('plugin', 'dist', file), 'utf8'), readFileSync(join(out, file), 'utf8'), `plugin/dist/${file} is stale; run npm run build:plugin`)
})
