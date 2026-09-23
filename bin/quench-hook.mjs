#!/usr/bin/env node
// Per-turn hook entry: enable the compile cache before loading TypeScript, as
// quench-cold does, to keep the per-turn start well under the budget.
import { enableCompileCache } from 'node:module'

enableCompileCache()
const { main } = await import('../src/hook-client.ts')
await main()
