// Apply and undo report actions that are Claude Code settings. Every change is shown before it is written, backed
// up, and recorded with its date so the report can compare spend before and after.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const quenchHome = (): string => process.env.QUENCH_HOME ?? join(homedir(), '.quench')
export const claudeSettingsPath = (): string => process.env.QUENCH_CLAUDE_SETTINGS ?? join(homedir(), '.claude', 'settings.json')

export interface Applied {
  at: string
  settings: string
  /** The value the setting had before, so undo can restore it. */
  previous?: unknown
}
export interface State { applied: Record<string, Applied> }

export function readState(): State {
  try { return JSON.parse(readFileSync(join(quenchHome(), 'state.json'), 'utf8')) as State } catch { return { applied: {} } }
}
function writeState(state: State): void {
  mkdirSync(quenchHome(), { recursive: true })
  writeFileSync(join(quenchHome(), 'state.json'), `${JSON.stringify(state, null, 2)}\n`)
}

type Json = Record<string, unknown>
function readSettings(path: string): Json {
  if (!existsSync(path)) return {}
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error(`${path} is not a JSON object; nothing was changed`)
  return parsed as Json
}
function writeSettings(path: string, settings: Json): string | null {
  let backup: string | null = null
  if (existsSync(path)) {
    backup = `${path}.quench-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`
    copyFileSync(path, backup)
  }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`)
  return backup
}

export interface Change {
  action: string
  path: string
  describe: string
  /** Null when there is nothing to do, with the reason. */
  skip: string | null
}

interface SettingAction {
  describe: string
  read(settings: Json): unknown
  set(settings: Json, value: unknown): void
  value(guardCommand: string): unknown
  applied(current: unknown, wanted: unknown): boolean
}

const env = (s: Json): Json => {
  if (typeof s.env !== 'object' || s.env === null) s.env = {}
  return s.env as Json
}
// A Quench guard entry: its command runs a Quench CLI with the guard subcommand.
const isGuard = (entry: unknown): boolean => ((entry as { hooks?: Array<{ command?: unknown }> })?.hooks ?? [])
  .some((h) => typeof h.command === 'string' && /(quench|cli\.[jt]s)"? guard$/.test(h.command))

export const SETTING_ACTIONS: Record<string, SettingAction> = {
  'subagent-model': {
    describe: 'set env.CLAUDE_CODE_SUBAGENT_MODEL to "sonnet": subagents with no model of their own run on Sonnet 5; Claude can still ask for a stronger one, and Explore and Plan are unchanged',
    read: (s) => (s.env as Json | undefined)?.CLAUDE_CODE_SUBAGENT_MODEL,
    set: (s, v) => { const e = env(s); if (v === undefined) delete e.CLAUDE_CODE_SUBAGENT_MODEL; else e.CLAUDE_CODE_SUBAGENT_MODEL = v; if (!Object.keys(e).length) delete s.env },
    value: () => 'sonnet',
    applied: (current, wanted) => current === wanted,
  },
  'break-guard': {
    describe: 'add a UserPromptSubmit hook, "quench guard": after a break longer than the prompt cache lasts, the first prompt to a large session is held once with what sending it will cost',
    read: (s) => ((s.hooks as Json | undefined)?.UserPromptSubmit as unknown[] | undefined)?.find(isGuard),
    set: (s, v) => {
      if (typeof s.hooks !== 'object' || s.hooks === null) s.hooks = {}
      const hooks = s.hooks as Json
      const list = ((hooks.UserPromptSubmit as unknown[] | undefined) ?? []).filter((entry) => !isGuard(entry))
      if (v !== undefined) list.push(v)
      if (list.length) hooks.UserPromptSubmit = list
      else delete hooks.UserPromptSubmit
      if (!Object.keys(hooks).length) delete s.hooks
    },
    value: (command) => ({ hooks: [{ type: 'command', command, timeout: 10 }] }),
    applied: (current) => current !== undefined,
  },
}

/** The command a hook runs to reach this Quench: the running Node and CLI, so it works without a global install. */
export const guardCommand = (cli: string): string => `"${process.execPath}" "${cli}" guard`

export function apply(action: string, write: boolean, cli: string): Change {
  const spec = SETTING_ACTIONS[action]
  if (!spec) throw new Error(`unknown action ${action}; one of ${Object.keys(SETTING_ACTIONS).join(', ')}`)
  const path = claudeSettingsPath()
  const settings = readSettings(path)
  const current = spec.read(settings)
  const wanted = spec.value(guardCommand(cli))
  if (spec.applied(current, wanted)) return { action, path, describe: spec.describe, skip: 'already in place' }
  if (current !== undefined && action === 'subagent-model') return { action, path, describe: spec.describe, skip: `CLAUDE_CODE_SUBAGENT_MODEL is already set to ${JSON.stringify(current)}; change it yourself if you want Sonnet` }
  if (write) {
    spec.set(settings, wanted)
    writeSettings(path, settings)
    const state = readState()
    state.applied[action] = { at: new Date().toISOString(), settings: path, ...(current !== undefined ? { previous: current } : {}) }
    writeState(state)
  }
  return { action, path, describe: spec.describe, skip: null }
}

export function undo(action: string, write: boolean): Change {
  const spec = SETTING_ACTIONS[action]
  if (!spec) throw new Error(`unknown action ${action}; one of ${Object.keys(SETTING_ACTIONS).join(', ')}`)
  const state = readState()
  const record = state.applied[action]
  const path = record?.settings ?? claudeSettingsPath()
  const settings = readSettings(path)
  if (spec.read(settings) === undefined) return { action, path, describe: spec.describe, skip: 'not in place' }
  if (write) {
    spec.set(settings, record?.previous)
    writeSettings(path, settings)
    delete state.applied[action]
    writeState(state)
  }
  return { action, path, describe: spec.describe, skip: null }
}
