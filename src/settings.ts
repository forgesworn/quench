// Apply and undo report actions that are Claude Code settings. Every change is shown before it is written, backed
// up, and recorded with exactly what was written, so undo removes only that and the report can date the change.
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, sep } from 'node:path'

export const quenchHome = (): string => process.env.QUENCH_HOME ?? join(homedir(), '.quench')
/** Claude Code's own directory, which CLAUDE_CONFIG_DIR moves. */
export const claudeHome = (): string => process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')
export const claudeSettingsPath = (): string => process.env.QUENCH_CLAUDE_SETTINGS ?? join(claudeHome(), 'settings.json')

export interface Applied {
  at: string
  settings: string
  /** Exactly what Quench wrote: the setting's value, or the hook command. Undo removes only this. */
  wrote: unknown
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
export function readSettings(path: string): Json {
  if (!existsSync(path)) return {}
  let parsed: unknown
  // The parser's message quotes the file, which can hold API keys, so it is never passed on.
  try { parsed = JSON.parse(readFileSync(path, 'utf8')) } catch { throw new Error(`${path} is not valid JSON; nothing was changed`) }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error(`${path} is not a JSON object; nothing was changed`)
  return parsed as Json
}

const BACKUPS_KEPT = 3
/** Backs up the file beside itself, keeping the newest few, then replaces it atomically with the same mode. */
function writeSettings(path: string, settings: Json): string | null {
  const target = existsSync(path) ? realpathSync(path) : path
  mkdirSync(dirname(target), { recursive: true })
  const mode = existsSync(target) ? statSync(target).mode & 0o777 : 0o600
  let backup: string | null = null
  if (existsSync(target)) {
    backup = `${target}.quench-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`
    copyFileSync(target, backup)
    chmodSync(backup, mode)
    const prefix = `${basename(target)}.quench-backup-`
    const old = readdirSync(dirname(target)).filter((f) => f.startsWith(prefix)).sort().slice(0, -BACKUPS_KEPT)
    for (const f of old) rmSync(join(dirname(target), f), { force: true })
  }
  const temporary = `${target}.quench-${process.pid}`
  writeFileSync(temporary, `${JSON.stringify(settings, null, 2)}\n`, { mode })
  renameSync(temporary, target)
  return backup
}

export interface Change {
  action: string
  path: string
  describe: string
  /** Null when the change can be made, otherwise why nothing will be done. */
  skip: string | null
  backup?: string | null
  note?: string
}

export const ACTIONS = ['subagent-model', 'break-guard'] as const
const known = (action: string): void => { if (!(ACTIONS as readonly string[]).includes(action)) throw new Error(`unknown action ${action}; one of ${ACTIONS.join(', ')}`) }

const SUBAGENT_MODEL = 'sonnet'
const envOf = (s: Json): Json => {
  if (typeof s.env !== 'object' || s.env === null || Array.isArray(s.env)) s.env = {}
  return s.env as Json
}
type HookEntry = { hooks?: Array<{ command?: unknown }> }
const promptHooks = (s: Json): HookEntry[] => {
  const list = (s.hooks as Json | undefined)?.UserPromptSubmit
  return Array.isArray(list) ? (list as HookEntry[]) : []
}
const hasCommand = (s: Json, command: string): boolean => promptHooks(s).some((e) => (e.hooks ?? []).some((h) => h.command === command))
/** Removes the hook objects running `command`, and an entry only if nothing else is left in it. */
function removeCommand(s: Json, command: string): void {
  const hooks = s.hooks as Json
  const list: HookEntry[] = []
  for (const e of promptHooks(s)) {
    if (!(e.hooks ?? []).some((h) => h.command === command)) { list.push(e); continue }
    const rest = (e.hooks ?? []).filter((h) => h.command !== command)
    if (rest.length) list.push({ ...e, hooks: rest })
  }
  if (list.length) hooks.UserPromptSubmit = list
  else delete hooks.UserPromptSubmit
  if (!Object.keys(hooks).length) delete s.hooks
}

/** Whether the Quench plugin is enabled in these settings, and whether its break guard is switched on. */
export function pluginState(settings: Json): { enabled: boolean; guard: boolean } {
  const enabled = Object.entries((settings.enabledPlugins as Json | undefined) ?? {}).some(([id, on]) => id.startsWith('quench@') && on === true)
  const configs = (settings.pluginConfigs as Record<string, { options?: Json }> | undefined) ?? {}
  const guard = Object.entries(configs).some(([id, c]) => id.startsWith('quench@') && c?.options?.break_guard === true)
  return { enabled, guard: enabled && guard }
}

/** The command a settings hook runs to reach this Quench: the running Node and CLI, so no global install is needed. */
export const guardCommand = (cli: string): string => `"${process.execPath}" "${cli}" guard`
const insidePlugin = (cli: string): boolean => Boolean(process.env.CLAUDE_PLUGIN_ROOT) || cli.includes(`${sep}plugins${sep}cache${sep}`)
const PLUGIN_GUARD = 'the Quench plugin runs the break guard itself; turn it on with break_guard under the plugin in /config'

export function apply(action: string, write: boolean, cli: string): Change {
  known(action)
  const path = claudeSettingsPath()
  const settings = readSettings(path)
  const state = readState()
  if (action === 'subagent-model') {
    const describe = `set env.CLAUDE_CODE_SUBAGENT_MODEL to "${SUBAGENT_MODEL}": general-purpose subagents with no model of their own run on Sonnet; Claude can still ask for a stronger one, and Explore, Plan and agents with their own model are unchanged`
    const current = (settings.env as Json | undefined)?.CLAUDE_CODE_SUBAGENT_MODEL
    if (current === SUBAGENT_MODEL) return { action, path, describe, skip: 'already in place' }
    if (current !== undefined) return { action, path, describe, skip: `CLAUDE_CODE_SUBAGENT_MODEL is already set to ${JSON.stringify(current)}; change it yourself if you want Sonnet` }
    const note = 'Claude Code sessions started from now on use it. Project or managed settings that set the same variable take precedence.'
    if (!write) return { action, path, describe, skip: null, note }
    envOf(settings).CLAUDE_CODE_SUBAGENT_MODEL = SUBAGENT_MODEL
    const backup = writeSettings(path, settings)
    state.applied[action] = { at: new Date().toISOString(), settings: path, wrote: SUBAGENT_MODEL }
    writeState(state)
    return { action, path, describe, skip: null, backup, note }
  }
  const command = guardCommand(cli)
  const describe = `add a UserPromptSubmit hook running ${command}: after a break of over an hour, the first prompt to a large session is held once with what sending it will cost`
  // A plugin copy of the CLI moves on every update, and two guards would each undo the other's mark.
  if (insidePlugin(cli) || pluginState(settings).enabled) return { action, path, describe, skip: PLUGIN_GUARD }
  if (hasCommand(settings, command)) return { action, path, describe, skip: 'already in place' }
  const existing = (settings.hooks as Json | undefined)?.UserPromptSubmit
  if (existing !== undefined && !Array.isArray(existing)) return { action, path, describe, skip: 'hooks.UserPromptSubmit in the settings file is not a list; nothing was changed' }
  const note = 'The hook runs this Node and this copy of Quench by path: if you move either, run apply again. Claude Code picks up hook changes straight away.'
  if (!write) return { action, path, describe, skip: null, note }
  const earlier = state.applied[action]?.wrote
  if (typeof earlier === 'string' && hasCommand(settings, earlier)) removeCommand(settings, earlier)
  if (typeof settings.hooks !== 'object' || settings.hooks === null || Array.isArray(settings.hooks)) settings.hooks = {}
  ;(settings.hooks as Json).UserPromptSubmit = [...promptHooks(settings), { hooks: [{ type: 'command', command, timeout: 10 }] }]
  const backup = writeSettings(path, settings)
  state.applied[action] = { at: new Date().toISOString(), settings: path, wrote: command }
  writeState(state)
  return { action, path, describe, skip: null, backup, note }
}

export function undo(action: string, write: boolean): Change {
  known(action)
  const state = readState()
  const record = state.applied[action]
  const path = record?.settings ?? claudeSettingsPath()
  const describe = action === 'subagent-model'
    ? `put env.CLAUDE_CODE_SUBAGENT_MODEL back to ${record?.previous === undefined ? 'unset' : JSON.stringify(record.previous)}`
    : 'remove the break-guard hook Quench added'
  if (!record) return { action, path, describe, skip: 'Quench has no record of applying this, so it changes nothing' }
  const settings = readSettings(path)
  if (action === 'subagent-model') {
    const current = (settings.env as Json | undefined)?.CLAUDE_CODE_SUBAGENT_MODEL
    if (current !== record.wrote) return { action, path, describe, skip: `CLAUDE_CODE_SUBAGENT_MODEL has changed since Quench set it (now ${current === undefined ? 'unset' : JSON.stringify(current)}); left as it is` }
    if (!write) return { action, path, describe, skip: null }
    const env = envOf(settings)
    if (record.previous === undefined) delete env.CLAUDE_CODE_SUBAGENT_MODEL
    else env.CLAUDE_CODE_SUBAGENT_MODEL = record.previous
    if (!Object.keys(env).length) delete settings.env
  } else {
    if (typeof record.wrote !== 'string' || !hasCommand(settings, record.wrote)) return { action, path, describe, skip: 'the hook Quench added is no longer there' }
    if (!write) return { action, path, describe, skip: null }
    removeCommand(settings, record.wrote)
  }
  const backup = writeSettings(path, settings)
  delete state.applied[action]
  writeState(state)
  return { action, path, describe, skip: null, backup }
}
