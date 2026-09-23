// The frozen data set: which recorded sessions Quench uses, and their digests.
//
// `quench.local.json` (untracked) maps run labels to local evidence directories
// and names the task acceptance directory. Every cell under a run directory is
// listed in the manifest: labelled when its task declares required evidence,
// unlabelled otherwise, or excluded when it sits under an excluded path.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import type { RequiredEvidence } from './labels.ts'

export interface RunConfig {
  label: string
  dir: string
  /** Paths relative to dir whose cells are listed as excluded, e.g. aborted pilots. */
  exclude?: string[]
}

export interface LocalConfig {
  acceptance: string
  runs: RunConfig[]
  out: string
}

export interface ManifestSession {
  run: string
  cell: string
  task: string
  category: string | null
  arm: string
  executorModel: string | null
  accepted: boolean | null
  labelled: boolean
  unlabelledReason?: string
  streamSha256: string
  receiptSha256: string
  promptSha256: string | null
}

export interface Manifest {
  acceptance: Record<string, { sha256: string; requiredEvidence: number }>
  runs: string[]
  sessions: ManifestSession[]
  excluded: Array<{ run: string; cell: string; reason: string }>
}

/** Tokens Context's navigation tools print in their own metadata; their presence proves nothing. */
export const ignoreTokens = ['local-source-unsigned']

export const sha256 = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex')

export function loadConfig(path = 'quench.local.json'): LocalConfig {
  if (!existsSync(path)) throw new Error(`${path} not found; it maps run labels to local evidence directories (see GOALS.md Q0)`)
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<LocalConfig>
  if (typeof raw.acceptance !== 'string' || !Array.isArray(raw.runs)) throw new Error(`${path} needs "acceptance" and "runs"`)
  const labels = new Set<string>()
  for (const run of raw.runs) {
    if (labels.has(run.label)) throw new Error(`duplicate run label ${run.label}`)
    labels.add(run.label)
  }
  return { acceptance: raw.acceptance, runs: raw.runs, out: raw.out ?? 'results' }
}

export function findCells(dir: string, depth = 0): string[] {
  if (existsSync(join(dir, 'receipt.json')) && existsSync(join(dir, 'executor.stream.jsonl'))) return [dir]
  if (depth >= 4) return []
  return readdirSync(dir)
    .sort()
    .filter((name) => name !== 'workspace' && statSync(join(dir, name)).isDirectory())
    .flatMap((name) => findCells(join(dir, name), depth + 1))
}

interface Receipt {
  task: string
  category?: string
  arm: string
  accepted?: boolean | null
  executor?: { model?: string }
}

export function readAcceptance(dir: string, task: string): RequiredEvidence[] | null {
  const path = join(dir, `${task}.json`)
  if (!existsSync(path)) return null
  return (JSON.parse(readFileSync(path, 'utf8')) as { requiredEvidence?: RequiredEvidence[] }).requiredEvidence ?? []
}

const posix = (path: string): string => path.split(sep).join('/')

export function buildManifest(config: LocalConfig): Manifest {
  const acceptance: Manifest['acceptance'] = {}
  for (const name of readdirSync(config.acceptance).filter((n) => n.endsWith('.json')).sort()) {
    const text = readFileSync(join(config.acceptance, name), 'utf8')
    const required = (JSON.parse(text) as { requiredEvidence?: unknown[] }).requiredEvidence ?? []
    acceptance[name.replace(/\.json$/, '')] = { sha256: sha256(text), requiredEvidence: required.length }
  }
  const sessions: ManifestSession[] = []
  const excluded: Manifest['excluded'] = []
  for (const run of config.runs) {
    const excludes = (run.exclude ?? []).map((path) => resolve(run.dir, path))
    for (const cell of findCells(run.dir)) {
      const cellPath = posix(relative(run.dir, cell))
      const skip = excludes.find((path) => cell === path || cell.startsWith(path + sep))
      if (skip) {
        excluded.push({ run: run.label, cell: cellPath, reason: `under excluded path ${posix(relative(run.dir, skip))}` })
        continue
      }
      const receiptText = readFileSync(join(cell, 'receipt.json'))
      const receipt = JSON.parse(receiptText.toString('utf8')) as Receipt
      const promptPath = join(cell, 'executor.prompt.txt')
      const entry = acceptance[receipt.task]
      const labelled = entry !== undefined && entry.requiredEvidence > 0
      sessions.push({
        run: run.label,
        cell: cellPath,
        task: receipt.task,
        category: receipt.category ?? null,
        arm: receipt.arm,
        executorModel: receipt.executor?.model ?? null,
        accepted: typeof receipt.accepted === 'boolean' ? receipt.accepted : null,
        labelled,
        ...(labelled ? {} : { unlabelledReason: entry ? 'no declared required evidence' : 'no acceptance file' }),
        streamSha256: sha256(readFileSync(join(cell, 'executor.stream.jsonl'))),
        receiptSha256: sha256(receiptText),
        promptSha256: existsSync(promptPath) ? sha256(readFileSync(promptPath)) : null,
      })
    }
  }
  return { acceptance, runs: config.runs.map((run) => run.label), sessions, excluded }
}

export interface LoadedSession {
  meta: ManifestSession
  stream: string
  prompt: string | undefined
  required: RequiredEvidence[]
}

/** Reads every labelled session, refusing any whose files no longer match the manifest. */
export function loadSessions(config: LocalConfig, manifest: Manifest): LoadedSession[] {
  const dirs = new Map(config.runs.map((run) => [run.label, run.dir]))
  return manifest.sessions.filter((meta) => meta.labelled).map((meta) => {
    const dir = dirs.get(meta.run)
    if (!dir) throw new Error(`run ${meta.run} is in the manifest but not in the config`)
    const cell = join(dir, meta.cell)
    const bytes = readFileSync(join(cell, 'executor.stream.jsonl'))
    if (sha256(bytes) !== meta.streamSha256) throw new Error(`${meta.run}/${meta.cell}: stream changed since the manifest was built`)
    const promptPath = join(cell, 'executor.prompt.txt')
    const prompt = existsSync(promptPath) ? readFileSync(promptPath, 'utf8') : undefined
    return { meta, stream: bytes.toString('utf8'), prompt, required: readAcceptance(config.acceptance, meta.task) ?? [] }
  })
}
