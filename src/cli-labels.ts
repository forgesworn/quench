#!/usr/bin/env node
// Label every recorded session under one or more evidence directories.
// Usage: quench-labels --acceptance <dir of <task>.json with requiredEvidence> <label>=<evidence dir> [...]
// Each cell is a directory holding receipt.json (task, arm, accepted) and executor.stream.jsonl.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { labelSession, type RequiredEvidence } from './labels.ts'

const args = process.argv.slice(2)
const flag = args.indexOf('--acceptance')
const acceptanceDir = flag >= 0 ? args[flag + 1] : undefined
if (!acceptanceDir) throw new Error('usage: quench-labels --acceptance <dir> <label>=<evidence dir> [...]')
const sources = args.filter((_, i) => i !== flag && i !== flag + 1)
// Context's navigation tools print this in their own metadata.
const ignoreTokens = ['local-source-unsigned']

function cells(dir: string, depth = 0): string[] {
  if (existsSync(join(dir, 'receipt.json')) && existsSync(join(dir, 'executor.stream.jsonl'))) return [dir]
  if (depth >= 4) return []
  return readdirSync(dir)
    .filter((name) => name !== 'workspace' && statSync(join(dir, name)).isDirectory())
    .flatMap((name) => cells(join(dir, name), depth + 1))
}

const out: object[] = []
for (const source of sources) {
  const [label, dir] = source.split('=')
  if (!label || !dir) throw new Error(`expected <label>=<evidence dir>, got ${source}`)
  for (const cell of cells(dir)) {
    const receipt = JSON.parse(readFileSync(join(cell, 'receipt.json'), 'utf8')) as { task: string; arm: string; accepted: boolean }
    const acceptancePath = join(acceptanceDir, `${receipt.task}.json`)
    if (!existsSync(acceptancePath)) continue
    const required = (JSON.parse(readFileSync(acceptancePath, 'utf8')) as { requiredEvidence?: RequiredEvidence[] }).requiredEvidence ?? []
    if (!required.length) continue
    const { points: _points, ...labels } = labelSession(readFileSync(join(cell, 'executor.stream.jsonl'), 'utf8'), required, { ignoreTokens })
    out.push({ run: label, task: receipt.task, arm: receipt.arm, accepted: receipt.accepted, ...labels })
  }
}
process.stdout.write(`${JSON.stringify(out, null, 1)}\n`)
