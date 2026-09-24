import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { decide, lastTurn } from '../src/guard.ts'
import { apply, claudeSettingsPath, readState, undo } from '../src/settings.ts'

const sandbox = (): { dir: string; settings: string } => {
  const dir = mkdtempSync(join(tmpdir(), 'quench-product-'))
  process.env.QUENCH_HOME = join(dir, 'home')
  process.env.QUENCH_CLAUDE_SETTINGS = join(dir, 'settings.json')
  delete process.env.CLAUDE_PLUGIN_ROOT
  return { dir, settings: join(dir, 'settings.json') }
}
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'))

test('apply shows the change first, writes it atomically with a backup, and undo puts it back', () => {
  const { dir, settings } = sandbox()
  writeFileSync(settings, JSON.stringify({ model: 'opus', env: { KEEP: '1' } }))
  chmodSync(settings, 0o600)
  assert.equal(apply('subagent-model', false, '/cli').skip, null)
  assert.equal(read(settings).env.CLAUDE_CODE_SUBAGENT_MODEL, undefined)
  assert.ok(apply('subagent-model', true, '/cli').backup)
  assert.deepEqual(read(settings), { model: 'opus', env: { KEEP: '1', CLAUDE_CODE_SUBAGENT_MODEL: 'sonnet' } })
  assert.equal(statSync(settings).mode & 0o777, 0o600)
  assert.equal(readState().applied['subagent-model']?.wrote, 'sonnet')
  assert.equal(apply('subagent-model', true, '/cli').skip, 'already in place')
  undo('subagent-model', true)
  assert.deepEqual(read(settings), { model: 'opus', env: { KEEP: '1' } })
  assert.equal(readState().applied['subagent-model'], undefined)
  // Backups are kept, but only the newest few.
  for (let i = 0; i < 4; i += 1) { apply('subagent-model', true, '/cli'); undo('subagent-model', true) }
  const backups = readdirSync(dir).filter((f) => f.startsWith('settings.json.quench-backup-'))
  assert.ok(backups.length >= 1 && backups.length <= 3, String(backups.length))
  assert.ok(backups.every((f) => (statSync(join(dir, f)).mode & 0o777) === 0o600))
})

test('undo changes only what Quench recorded writing', () => {
  const { settings } = sandbox()
  // The owner's own value: apply leaves it, and undo without a record leaves it too.
  writeFileSync(settings, JSON.stringify({ env: { CLAUDE_CODE_SUBAGENT_MODEL: 'haiku' } }))
  assert.match(apply('subagent-model', true, '/cli').skip ?? '', /already set/)
  assert.match(undo('subagent-model', true).skip ?? '', /no record/)
  assert.equal(read(settings).env.CLAUDE_CODE_SUBAGENT_MODEL, 'haiku')
  // Changed by the owner after apply: undo leaves the new value.
  writeFileSync(settings, '{}')
  apply('subagent-model', true, '/cli')
  writeFileSync(settings, JSON.stringify({ env: { CLAUDE_CODE_SUBAGENT_MODEL: 'opus' } }))
  assert.match(undo('subagent-model', true).skip ?? '', /changed since/)
  assert.equal(read(settings).env.CLAUDE_CODE_SUBAGENT_MODEL, 'opus')
})

test('a settings file that is not valid JSON is refused without quoting it', () => {
  const { settings } = sandbox()
  const secret = '{"env":{"ANTHROPIC_API_KEY":"sk-ant-zq-secret",}}'
  writeFileSync(settings, secret)
  assert.throws(() => apply('subagent-model', true, '/cli'), (e: Error) => /not valid JSON/.test(e.message) && !e.message.includes('sk-ant'))
  const run = spawnSync(process.execPath, ['src/cli.ts', 'apply', 'subagent-model', '--yes'], { encoding: 'utf8', env: { ...process.env } })
  assert.equal(run.status, 1)
  assert.ok(!`${run.stdout}${run.stderr}`.includes('sk-ant'), 'output quotes the settings file')
  assert.equal(readFileSync(settings, 'utf8'), secret)
})

test('the break guard is added beside other hooks, and undo removes only its own hook', () => {
  const { settings } = sandbox()
  const foreign = { hooks: [{ type: 'command', command: 'node /opt/x/cli.js guard' }] }
  writeFileSync(settings, JSON.stringify({ hooks: { UserPromptSubmit: [foreign] } }))
  // Another tool's hook that looks like a guard is not Quench's.
  assert.equal(apply('break-guard', true, '/path/cli.js').skip, null)
  const list = read(settings).hooks.UserPromptSubmit
  assert.equal(list.length, 2)
  assert.match(list[1].hooks[0].command, /cli\.js" guard$/)
  // A hook the owner put in the same entry stays when the guard goes.
  list[1].hooks.push({ type: 'command', command: 'my-logger' })
  writeFileSync(settings, JSON.stringify({ hooks: { UserPromptSubmit: list } }))
  undo('break-guard', true)
  assert.deepEqual(read(settings).hooks.UserPromptSubmit, [foreign, { hooks: [{ type: 'command', command: 'my-logger' }] }])
})

test('apply break-guard refuses when the plugin runs the guard, or from the plugin cache', () => {
  const { settings } = sandbox()
  writeFileSync(settings, JSON.stringify({ enabledPlugins: { 'quench@quench': true } }))
  assert.match(apply('break-guard', true, '/path/cli.js').skip ?? '', /plugin/)
  writeFileSync(settings, '{}')
  assert.match(apply('break-guard', true, join('/home/u/.claude/plugins/cache/quench/0.1.0/dist', 'cli.js')).skip ?? '', /plugin/)
  process.env.CLAUDE_PLUGIN_ROOT = '/somewhere'
  assert.match(apply('break-guard', true, '/path/cli.js').skip ?? '', /plugin/)
  delete process.env.CLAUDE_PLUGIN_ROOT
  assert.deepEqual(read(settings), {})
})

test('CLAUDE_CONFIG_DIR moves the settings file Quench edits', () => {
  const saved = process.env.QUENCH_CLAUDE_SETTINGS
  delete process.env.QUENCH_CLAUDE_SETTINGS
  process.env.CLAUDE_CONFIG_DIR = '/elsewhere/claude'
  assert.equal(claudeSettingsPath(), join('/elsewhere/claude', 'settings.json'))
  delete process.env.CLAUDE_CONFIG_DIR
  process.env.QUENCH_CLAUDE_SETTINGS = saved
})

const turn = (minutesAgo: number, ctx: number, { oneHour = true, model = 'claude-opus-5', cached = true } = {}) => JSON.stringify({
  type: 'assistant', timestamp: new Date(Date.now() - minutesAgo * 60e3).toISOString(),
  message: { model, usage: cached
    ? { input_tokens: 1, cache_read_input_tokens: ctx - 11, cache_creation_input_tokens: 10, cache_creation: oneHour ? { ephemeral_1h_input_tokens: 10 } : { ephemeral_5m_input_tokens: 10 } }
    : { input_tokens: ctx } },
})

test('the guard holds a large cached Claude session after an hour idle, once per break', () => {
  const now = Date.now()
  assert.equal(decide(lastTurn(turn(30, 400e3)), now, null).block, false)
  assert.equal(decide(lastTurn(turn(90, 100e3)), now, null).block, false)
  const last = lastTurn(turn(90, 400e3))
  const held = decide(last, now, null)
  assert.equal(held.block, true)
  assert.ok(Math.abs((held.usd ?? 0) - 400e3 * 2 * 5e-6) < 1e-9)
  assert.match(held.reason ?? '', /\/clear/)
  // The prompt after the hold goes through, even if no reply was logged in between.
  const mark = { at: last!.at, heldAt: now }
  assert.deepEqual(decide(last, now + 60 * 60e3, mark), { block: false, resend: true })
  assert.equal(decide(last, now, { ...mark, resent: true }).resend, false)
  // A five-minute cache has expired after ten minutes, but a short pause is not a break.
  assert.equal(decide(lastTurn(turn(10, 400e3, { oneHour: false })), now, null).block, false)
  // No hold for a model routed elsewhere, or a session that never used the cache.
  assert.equal(decide(lastTurn(turn(90, 400e3, { model: 'deepseek-v4-pro:cloud' })), now, null).block, false)
  assert.equal(decide(lastTurn(turn(90, 400e3, { cached: false })), now, null).block, false)
  // After a compaction the context is small again.
  assert.equal(lastTurn(`${turn(90, 400e3)}\n${JSON.stringify({ type: 'system', subtype: 'compact_boundary', compactMetadata: { postTokens: 20e3 } })}`), null)
})

const guardRun = (event: string, env: NodeJS.ProcessEnv = {}, args: string[] = []) =>
  spawnSync(process.execPath, ['src/cli.ts', 'guard', ...args], { input: event, encoding: 'utf8', env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'cli', ...env } })

test('the guard hook holds once per break, logs counts only, and stands aside when off or scripted', () => {
  const { dir } = sandbox()
  const transcript = join(dir, 't.jsonl')
  writeFileSync(transcript, `${JSON.stringify({ type: 'user', message: { content: 'secret words' } })}\n${turn(120, 400e3)}\n`)
  const event = (id: string) => JSON.stringify({ session_id: id, transcript_path: transcript, prompt: 'secret prompt' })
  assert.equal(JSON.parse(guardRun(event('abc-123')).stdout).decision, 'block')
  assert.equal(guardRun(event('abc-123')).stdout, '')
  assert.equal(guardRun(event('abc-123')).stdout, '')
  const log = readFileSync(join(dir, 'home', 'guard.log'), 'utf8')
  assert.ok(!log.includes('secret') && !log.includes('abc-123'))
  assert.deepEqual(log.trim().split('\n').map((l) => JSON.parse(l).event), ['held', 'resent'])
  // In the plugin the guard is off until break_guard is turned on.
  assert.equal(guardRun(event('p-1'), {}, ['--plugin']).stdout, '')
  assert.equal(guardRun(event('p-2'), { CLAUDE_PLUGIN_OPTION_BREAK_GUARD: 'false' }, ['--plugin']).stdout, '')
  assert.equal(JSON.parse(guardRun(event('p-3'), { CLAUDE_PLUGIN_OPTION_BREAK_GUARD: 'true' }, ['--plugin']).stdout).decision, 'block')
  // claude -p and the SDK have no one to send the prompt again; QUENCH_GUARD=off turns it off anywhere.
  assert.equal(guardRun(event('s-1'), { CLAUDE_CODE_ENTRYPOINT: 'sdk-cli' }).stdout, '')
  assert.equal(guardRun(event('s-2'), { QUENCH_GUARD: 'off' }).stdout, '')
  // Broken input never blocks.
  assert.equal(guardRun('nonsense').stdout, '')
})

test('two copies of the guard hold a prompt once and then both let the next through', async () => {
  const { dir } = sandbox()
  const transcript = join(dir, 't.jsonl')
  writeFileSync(transcript, `${turn(120, 400e3)}\n`)
  const event = JSON.stringify({ session_id: 'twin', transcript_path: transcript })
  const race = () => Promise.all([0, 1].map(() => new Promise<string>((resolve) => {
    const child = spawn(process.execPath, ['src/cli.ts', 'guard'], { env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'cli' } })
    let stdout = ''
    child.stdout.on('data', (d) => { stdout += d })
    child.on('close', () => resolve(stdout))
    child.stdin.end(event)
  })))
  assert.ok((await race()).some((s) => s.includes('"block"')))
  for (let i = 0; i < 5; i += 1) assert.deepEqual(await race(), ['', ''])
})

test('the plugin ships the current build of the CLI', () => {
  const out = mkdtempSync(join(tmpdir(), 'quench-plugin-'))
  const build = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.build.json', '--outDir', out], { encoding: 'utf8' })
  assert.equal(build.status, 0, build.stdout)
  for (const file of readdirSync(out)) assert.equal(readFileSync(join('plugin', 'dist', file), 'utf8'), readFileSync(join(out, file), 'utf8'), `plugin/dist/${file} is stale; run npm run build:plugin`)
})
