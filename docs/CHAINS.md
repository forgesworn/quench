# Long-session protocol (Q8)

Locked 24 September 2026 by the commit that filled in the pack and runner
hashes below, before the first pilot session. After that only logged
harness fixes may change, and never the pass rules.

## Question

In a long agent session doing dependent work, does compacting the context
at task boundaries lower what the session costs without losing accepted
work? And does it beat simply compacting at a fixed, smaller window?

## Why this and not the stop hint

Q6 found that a stop hint saves almost nothing (`docs/EVIDENCE.md`, Q6
verdict). The owner's own sessions show where cost is. It sits in long
sessions that resend very large contexts, and cache reads are 68% of the
priced cost. A per-request simulation on those sessions puts the upper bound
for earlier compaction at about 29% (window 400K) to 45% (200K), if the agent
behaves the same afterwards. After natural compactions, context growth rose
1.31× over the next 30 requests, which suggests the cost of reading again is
small. The quality cost is unmeasured, and this protocol measures it.

## Design

- **Tasks:** two chains, one each on commander.js (`ba6d13d`) and markdown-it
  (`3c51991`), six dependent steps each. They were written, checked and
  locked by a fresh session that was not told which policies are compared.
  - Later steps refer to earlier results without restating them.
  - Each step has a deterministic checker, proved against reference
    outcomes and wrong variants, including one "forgotten dependency"
    variant per step.
  - Steps, commander: 1 orientation (`.choices()`), 2 diagnosis of a
    seeded fault, 3 repair with regression tests, 4 impact (suggesting the
    closest choice), 5 the change from step 4, 6 report. markdown-it: 1
    orientation (GFM tables), 2 diagnosis of a seeded fault, 3 repair with
    a fixture and cell maps, 4 impact (a `tableAlign` option), 5 the change
    from step 4, 6 report.
  - Proofs: 12 of 12 references and 6 of 6 independence proofs accepted, 37
    of 37 wrong variants rejected, each forgotten-dependency variant for
    the intended reason. `verify.mjs` passes on this machine.
  - Pack: `~/.cache/quench-heldout/chains-20260923/` (private), protocol
    `quench-heldout-chains-20260923-v1`. Hashes: `SHA256SUMS` sha256
    `aa4f033e91259d08f7650a193f96247e2adf37f04ea267e99b3bca6dfaf6510e`,
    `protocol-chains.json` sha256
    `2dd1b1d6d867ac867470640aeeb0c5665b61ee9d492ded0820c7eec86f0cad83`.
- **Executor:** DeepSeek V4 Pro (`deepseek-v4-pro:cloud`) through the local
  Anthropic-compatible route, with every Claude Code flag, setting and
  disallowed tool from the Q5 held-out protocol, and the plain-arm retrieval
  appendix. There are no MCP servers and no Quench hook. Claude Code
  2.1.281, recorded per invocation.
- **Session:** one Claude Code session per chain run. Step 1 starts it with
  `--session-id`; steps 2–6 continue it with `--resume`. Each step's prompt
  is the locked step prompt after the line "Step n of 6 in this session."
  Each step's checker runs as soon as the step finishes.
- **Context window:** every arm sets `CLAUDE_CODE_MAX_CONTEXT_TOKENS=1000000`.
  Both DeepSeek models report a context length of 1,048,576, and Claude Code
  gives Sonnet 5 and Opus 5 a 1M window. Without it, Claude Code assumes
  200K for a model it does not know and compacts to stay within it, which
  would make carry compact as well.
- **Policies (arms):**
  - **carry:** `DISABLE_AUTO_COMPACT=1`. The session carries everything.
  - **threshold:** `CLAUDE_CODE_AUTO_COMPACT_WINDOW=100000`, the smallest
    value this client accepts. Claude Code compacts on its own as the
    context approaches it.
  - **boundary:** `DISABLE_AUTO_COMPACT=1`, and the harness runs `/compact`
    in the same session after steps 1 to 5. That invocation alone omits
    `--disable-slash-commands`, which otherwise blocks `/compact`.
- **Runner:** `runner/chain.mjs` (sha256
  `289223639419edd4c608866c1e7527c53aa3f5e9019d050ae446c20e8f6ae220`) and
  `runner/chains-all.mjs` (sha256
  `d8293e07acc59f92028647ed96756ee0c499ba0f9108470d23aa531fcdead911`),
  private, beside the Q5 runner.
- **Repetitions and order:** three repetitions of each chain and policy, so
  18 chain runs and 108 steps. Within each repetition and chain the three
  policies run back to back. Which policy goes first rotates by repetition
  and chain.
- **Failures:** a run that fails to complete (a provider or client error, or
  a failed compaction) is moved aside, logged and rerun once. A step that
  completes and fails its checker is kept.

## Measures

- **Priced cost (primary).** Tokens are weighted by the multipliers Claude
  Code incurs on Claude models, in base-input units:
  - fresh input (a cache miss, which Claude Code writes to its one-hour
    cache) × 2;
  - cache read × 0.1;
  - output × 5.

  Tokens come from each invocation's `modelUsage`, which also counts the
  compaction calls that `usage` omits. The DeepSeek route bills differently.
  The multipliers model what the same token flow would cost on a Claude
  model.
- **Accepted steps:** checker passes, per chain run.
- **Also reported:**
  - raw tokens by kind;
  - cost and acceptance per step, and per dependency distance;
  - compactions, with the tokens before and after each;
  - the context profile (largest context per step);
  - turns, tool calls and wall time.

## Pass rules

Over all 36 steps per policy:

1. **Boundary against carry:** priced cost at least 25% lower, with accepted
   steps no fewer than carry's minus 2.
2. **Boundary against threshold:** priced cost at least 10% lower, with
   accepted steps no fewer than threshold's minus 2.

The tolerance of 2 steps (about 5%) is declared now because single sessions
vary. In Q6, three sessions that never received the hint failed while their
controls passed.

Reading the result:

- Rule 1 met: compacting at boundaries is worth it on dependent work.
- Rules 1 and 2 met: a boundary-aware trigger (a Quench decider) is worth
  building over the window setting.
- Rule 1 met and rule 2 not: the recommendation is the window setting, and
  no Quench decider is built for it.
- Rule 1 not met: compaction timing is not the lever on this evidence.

## Known limits

- Chains of six steps reach at most about 150–200K tokens under carry, below
  the 400K+ contexts where most of the owner's cost sits. Savings here
  understate the real regime; the context profile is reported so this can
  be judged.
- Two chains on two repositories are a small sample; per-chain results are
  reported separately.
- Earlier answer files and code edits stay in the workspace, so after a
  compaction the agent can read its earlier results again, as it could in
  a real session. The test is whether it does so correctly and at what
  cost, not whether it can recall them unaided.
- The pack's author lists further weaknesses in its private README: strict
  answer formats, one reading of each requirement in the probes, step-5
  prompts that restate the behaviour step 4 analysed, and a markdown-it
  fault that breaks existing fixtures and may be noticed in step 1.
- DeepSeek, not Claude. A Claude confirmation needs its own estimate and the
  owner's approval to spend.

## Pilot (before the counted run)

One repetition of both chains and all three policies on DeepSeek V4.1 Flash
(`deepseek-v4.1-flash:cloud`), to shake out the harness. It is secondary
evidence only. Harness faults found in the pilot are fixed and logged
before the counted run; the pass rules do not change.

## Harness fixes after the lock

1. **Cumulative `modelUsage` (pilot, 24 September 2026).** On a resumed
   session, Claude Code reports `modelUsage` as the session's running
   total, not the invocation's own tokens: consecutive values differ by
   exactly each invocation's `usage`. The runner records it as it stands,
   and its progress log prints the running totals. The scorer
   (`src/chains.ts`, `perInvocation`) now takes each invocation's tokens
   as the difference from the invocation before it, compaction calls
   included, which keeps the measure as defined above. Without the fix,
   step 1 of a chain would count six times over. The runner is unchanged.
2. **The compaction call missed the cache (pilot, 24 September 2026).**
   Steps ran with `--disable-slash-commands` (a Q5 flag) and the `/compact`
   call could not, and the flag changes the prompt prefix. So the
   compaction request, which Claude Code builds from the conversation's own
   system prompt, tools and history to read them from the cache, missed
   it. In a small test the compaction call wrote 9,769 tokens uncached with
   the mismatch and 1,408 without it. In the pilot, the five compaction
   calls per boundary run cost about 0.5M units, nearly all of boundary's
   excess over carry. The runner now leaves the flag out of every
   invocation, in every arm (`runner/chain.mjs` sha256
   `b27a10c517c44c0978da1e26562aed80f4dbfbc954e8fa83d017a8c3fcae04ef`; the
   locked file is kept beside it). The first Pro attempt, started with the
   flag, was stopped during its first chain run and moved aside unscored.
   A Flash check on commander (boundary and carry, one run each) confirmed
   the fix: the five compaction calls wrote 7K tokens uncached and read
   237K, costing 0.18M units against 0.49M before.

## Estimate (for the owner, before any run)

From the Q5 Pro plain sessions (0.73M raw input, about 25 requests and 32K
final context each):

| Run | Steps | Raw input | Output | Sequential time |
| --- | ---: | ---: | ---: | ---: |
| Flash pilot, 1 repetition | 36 | about 60M | about 0.5M | about 2 h |
| Pro counted run, 3 repetitions | 108 | about 190M | about 1.6M | about 6.5 h |

Most raw input is cache reads under carry. The owner approved DeepSeek spend
for this programme.
