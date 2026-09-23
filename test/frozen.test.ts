import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sha256 } from '../src/data.ts'

// docs/HELDOUT.md freezes the held-out primary's decision code. Any change to
// these files breaks the freeze: put new rules or variants in new files.
const root = join(import.meta.dirname, '..')

test('the held-out decider code matches the hashes locked in docs/HELDOUT.md', () => {
  const protocol = readFileSync(join(root, 'docs', 'HELDOUT.md'), 'utf8')
  const locked = [...protocol.matchAll(/^\| `([^`]+)` \| `([0-9a-f]{64})` \|$/gm)]
  assert.equal(locked.length, 4)
  for (const [, path, hash] of locked) assert.equal(sha256(readFileSync(join(root, path ?? ''))), hash, path)
})
