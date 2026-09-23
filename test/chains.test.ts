import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { loadReceipts, perInvocation, priced, rule, stepTokens, summarise, type ChainReceipt, type ChainStep } from '../src/chains.ts'

const call = (fresh: number, cacheRead: number, output: number, compactions = 0) => ({
  tokens: { fresh, cacheRead, cacheWrite: 0, output },
  compactions: Array.from({ length: compactions }, () => ({ trigger: 'manual', pre_tokens: 100, post_tokens: 10 })),
  requestContexts: [fresh + cacheRead],
  numTurns: 1,
  seconds: 1,
})

test('priced cost weights misses 2x, cache reads 0.1x and output 5x', () => {
  assert.equal(priced({ fresh: 10, cacheWrite: 5, cacheRead: 100, output: 2 }), 2 * 15 + 10 + 10)
})

test('a step counts the compaction the harness ran after it', () => {
  const step: ChainStep = { n: 1, call: call(10, 100, 1), compactAfter: call(5, 50, 3, 1) }
  assert.deepEqual(stepTokens(step), { fresh: 15, cacheRead: 150, cacheWrite: 0, output: 4 })
})

test('cumulative session totals become each invocation\'s own tokens, compactions included', () => {
  const receipt: ChainReceipt = { chain: 'c', arm: 'boundary', rep: 1, steps: [
    { n: 1, call: call(10, 100, 1), compactAfter: call(12, 150, 3, 1) },
    { n: 2, call: call(20, 400, 5) },
    { n: 3, call: call(4, 50, 1) },
  ] }
  const own = perInvocation(receipt).steps
  assert.deepEqual(stepTokens(own[0] as ChainStep), { fresh: 12, cacheRead: 150, cacheWrite: 0, output: 3 })
  assert.deepEqual(own[1]?.call.tokens, { fresh: 8, cacheRead: 250, cacheWrite: 0, output: 2 })
  // A total that falls was reset, so it is taken as it stands.
  assert.deepEqual(own[2]?.call.tokens, { fresh: 4, cacheRead: 50, cacheWrite: 0, output: 1 })
})

test('summaries, pass rules and receipt loading', () => {
  // Session totals, as the runner records them: each step adds `fresh`.
  const receipt = (arm: string, fresh: number, passed: boolean[]): ChainReceipt => ({
    chain: 'c', arm, rep: 1, steps: passed.map((p, i) => ({ n: i + 1, call: call(fresh * (i + 1), 0, 0), checker: { passed: p } })),
  })
  const dir = mkdtempSync(join(tmpdir(), 'quench-chains-'))
  const receipts = [receipt('carry', 100, [true, true, true]), receipt('boundary', 70, [true, true, false])]
  for (const r of receipts) {
    mkdirSync(join(dir, 'rep1', r.chain, r.arm), { recursive: true })
    writeFileSync(join(dir, 'rep1', r.chain, r.arm, 'receipt.json'), JSON.stringify(r))
  }
  // A failed run moved aside is never counted.
  mkdirSync(join(dir, 'rep1', 'c', 'carry.failed-1'), { recursive: true })
  writeFileSync(join(dir, 'rep1', 'c', 'carry.failed-1', 'receipt.json'), JSON.stringify(receipt('carry', 1, [false])))
  const loaded = loadReceipts(dir)
  assert.equal(loaded.length, 2)
  const byArm = summarise(loaded, (r) => r.arm)
  assert.equal(byArm.get('carry')?.accepted, 3)
  const result = rule('b vs c', byArm.get('boundary'), byArm.get('carry'), 0.25)
  assert.ok(result)
  assert.equal(Math.round(result.costChange * 100), -30)
  assert.equal(result.acceptedDelta, -1)
  assert.equal(result.met, true)
  assert.equal(rule('b vs c', byArm.get('boundary'), byArm.get('carry'), 0.35)?.met, false)
})
