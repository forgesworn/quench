# Long-session protocol (Q8)

Draft, 23 September 2026. It is locked by the commit that fills in the pack
and runner hashes below, before the first pilot session. After that only
logged harness fixes may change, and never the pass rules.

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
  - Pack: `~/.cache/quench-heldout/chains-20260923/` (private). Hashes:
    `SHA256SUMS` sha256 `TBD`, `protocol-chains.json` sha256 `TBD`.
- **Executor:** DeepSeek V4 Pro (`deepseek-v4-pro:cloud`) through the local
  Anthropic-compatible route, with every Claude Code flag, setting and
  disallowed tool from the Q5 held-out protocol, and the plain-arm retrieval
  appendix. There are no MCP servers and no Quench hook. Claude Code
  2.1.281, recorded per invocation.
- **Session:** one Claude Code session per chain run. Step 1 starts it with
  `--session-id`; steps 2–6 continue it with `--resume`. Each step's prompt
  is the locked step prompt after the line "Step n of 6 in this session."
  Each step's checker runs as soon as the step finishes.
- **Policies (arms):**
  - **carry:** `DISABLE_AUTO_COMPACT=1`. The session carries everything.
  - **threshold:** `CLAUDE_CODE_AUTO_COMPACT_WINDOW=100000`, the smallest
    value this client accepts. Claude Code compacts on its own as the
    context approaches it.
  - **boundary:** `DISABLE_AUTO_COMPACT=1`, and the harness runs `/compact`
    in the same session after steps 1 to 5. That invocation alone omits
    `--disable-slash-commands`, which otherwise blocks `/compact`.
- **Runner:** `runner/chain.mjs` (sha256 `TBD`) and `runner/chains-all.mjs`
  (sha256 `TBD`), private, beside the Q5 runner.
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
- DeepSeek, not Claude. A Claude confirmation needs its own estimate and the
  owner's approval to spend.

## Pilot (before the counted run)

One repetition of both chains and all three policies on DeepSeek V4.1 Flash
(`deepseek-v4.1-flash:cloud`), to shake out the harness. It is secondary
evidence only. Harness faults found in the pilot are fixed and logged
before the counted run; the pass rules do not change.

## Estimate (for the owner, before any run)

From the Q5 Pro plain sessions (0.73M raw input, about 25 requests and 32K
final context each):

| Run | Steps | Raw input | Output | Sequential time |
| --- | ---: | ---: | ---: | ---: |
| Flash pilot, 1 repetition | 36 | about 60M | about 0.5M | about 2 h |
| Pro counted run, 3 repetitions | 108 | about 190M | about 1.6M | about 6.5 h |

Most raw input is cache reads under carry. The owner approved DeepSeek spend
for this programme.
