#!/usr/bin/env node
// Per-turn entry point: enable Node's compile cache before loading any
// TypeScript, so type stripping is paid once rather than on every hook call.
import { enableCompileCache } from 'node:module'

enableCompileCache()
await import('../src/cli-cold.ts')
