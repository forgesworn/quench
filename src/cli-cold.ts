#!/usr/bin/env node
// Cold-start probe: load a decider, observe a short session and make the first
// decision, then print milliseconds since the process's time origin.
// Usage: node bin/quench-cold.mjs <decider>
import { deciders } from './deciders/index.ts'

const name = process.argv.at(-1) ?? ''
const factory = deciders[name]
if (!factory) throw new Error(`unknown decider ${name}`)
const decider = factory()
decider.observe({ kind: 'prompt', text: 'Explain how `openSession` is used. Cite the implementation and tests.' })
decider.observe({ kind: 'tool_use', id: 'a', name: 'Read', input: { file_path: 'src/session.ts' } })
decider.observe({ kind: 'tool_result', id: 'a', text: 'export function openSession() {}', isError: false })
decider.decide()
process.stdout.write(`${performance.now()}\n`)
