# Lane protocol (Q10)

Locked 24 September 2026, by the commit that adds this line, before the
first counted session. After the lock only logged harness fixes may change,
and never the pass rules. The probe below ran before the lock and is not
counted.

## Question

On locked tasks with deterministic checkers, how often does each cheaper
model deliver an accepted result, at what cost and wall time, next to
DeepSeek V4 Pro? The answer is evidence for Oathrun's model-selection table
(Oathrun `docs/MODEL-ROUTING-GOALS.md`, "Model-selection rule" and G3b),
for these task classes only.

## Design

- **Tasks, unchanged from their locks:**
  - the Q5 held-out pack, protocol `d5dcc7dd…` (`protocol.json` sha256
    `d5dcc7dd0ff28f79ac26d457a4b9eb7aede91bfc051729d63315eea99bc8c0d5`,
    `SHA256SUMS` sha256
    `6d81a4d47bbc0d529d041d126678e7adc73de9ec28bb0b1ff0b01b827d958578`):
    orientation, diagnosis, impact and code change, each on commander.js
    and markdown-it, plain arm only;
  - the Q8 chains ([CHAINS.md](CHAINS.md)), carry policy only: six
    dependent steps on each repository in one resumed session.
- **Harness, unchanged:**
  - Q5 tasks: `runner/run.mjs` (sha256
    `984342510493b75e00808b74d17c2bf449908648e5e169ff42c63b5da3fc73ee`)
    driven by `runner/lanes.mjs` (sha256
    `604c7ba88517197fdec6696349aa7364c823bb9ac2c501529709bd5cbfe1fcfc`),
    which runs each repetition's tasks in the pack's order with `--arms
    plain --skip-review`, skips a cell already recorded, and stops a lane
    on a provider limit rather than retrying it. Acceptance is the
    deterministic checker (and the scope check for code), with no model
    reviewer;
  - chains: `runner/chain.mjs` (sha256
    `b27a10c517c44c0978da1e26562aed80f4dbfbc954e8fa83d017a8c3fcae04ef`),
    carry arm;
  - every Claude Code flag, setting and disallowed tool from the Q5
    protocol. Only `--executor-model` (or the chain config's `model`)
    changes. Effort stays at the Q5 setting (medium) for every lane.
    Claude Code 2.1.281; the Pro reference was recorded on 2.1.280.
- **Route:** Claude Code on the local Ollama daemon's Anthropic-compatible
  endpoint, as in Q5 and Q8. Hosted models run on Ollama's cloud; the local
  model runs on the M4 through the host tunnel.
- **Lanes:**
  - `qwen3.8:latest` on the M4 (27.8B, nvfp4, loaded with its full 262K
    context; no token charge). The M4 also serves a live agent, so one
    session at a time. Its Q5 sessions run first, then its chains; the
    owner may pause it, and it resumes where it stopped;
  - `glm-5.3-flash:cloud`, once the owner approves its estimate;
  - `deepseek-v4.1-flash:cloud`, three fresh repetitions under the
    programme's DeepSeek approval (the Q5 and Q8 Flash pilots stay
    secondary and are not pooled);
  - the reference, `deepseek-v4-pro:cloud`, is not rerun: its Q5 plain arm
    (24 of 24 accepted) and Q8 carry runs (30 of 36 steps) are the
    comparison;
  - a frontier baseline (Sonnet 5 or Opus 5) only with the owner's approval
    of the estimate below.
- **Repetitions and order:** three repetitions. Q5 tasks in the pack's task
  order; the chains alternate between repositories. Lanes may run at the
  same time only when they use different hosts.
- **Failures:** as Q5: a session that fails to complete for a provider or
  client error is moved aside, logged and rerun once. A session that
  completes and fails its checker is kept. A session stopped by the turn
  limit counts as rejected and is reported.

## Measures

- **Accepted results (primary)**, per lane and task class: each Q5 class
  over its 6 sessions (2 repositories × 3 repetitions); the chains over
  their 36 steps, and per step.
- **Cost per accepted result**, including failed sessions, at each lane's
  published rate on the day of the run (peak rate where there are two):
  input, cached input and output tokens from each invocation's usage. The
  local lane has no token charge; its M4 wall time is reported instead.
- **Also reported:** raw tokens by kind, wall time per session, turns, tool
  errors, turn-limit stops, and the context profile of the chains.

## Pass rules

Per lane:

1. **A Q5 task class** is qualified when the lane is accepted in at least
   as many of its 6 sessions as Pro, less one.
2. **Dependent work** is qualified when the lane accepts at least 28 of the
   36 chain steps: Pro's 30, less 2 (the Q8 tolerance).

A lane that qualifies for no class is reported as such. Qualification here
is evidence for these task classes on this harness, not an Oathrun lane
review.

## Estimate (for the owner, before any counted run)

From the Q5 Pro plain sessions (about 0.73M raw input each, mostly cache
reads) and the Q8 carry runs (about 5–16M raw each), at the rates read on 24
September 2026 (per million tokens: GLM 5.3 Flash $0.15 input, $0.03 cached,
$0.50 output; DeepSeek V4.1 Flash peak $0.30, $0.006, $1.20):

| Lane | Sessions | Estimate |
| --- | ---: | ---: |
| Qwen 3.8 (M4) | 24 Q5 + 6 chain runs | no token charge; about 15 hours of M4 time for the Q5 sessions and as much again for the chains |
| GLM 5.3 Flash | 24 Q5 + 6 chain runs | about $2–4 |
| DeepSeek V4.1 Flash | 24 Q5 + 6 chain runs | about $2.50 |
| Sonnet 5 baseline (not approved) | 24 Q5 + 6 chain runs | about $50 at list price |

## Probe (before the lock, not counted)

`qwen3.8:latest`, `orientation-commander`, plain arm, 24 September 2026:
the checker accepted the answer. 46 turns, 45 tool calls; 66K input tokens
processed fresh and 1.82M read from the daemon's cache; 37.8K output; 2,213
seconds. On the same task Pro took 125–359 seconds with 12–14K output (3 of
3 accepted), and the Flash pilot 141 seconds (rejected). Qwen's time is its
output (thinking included) at about 21 tokens a second; a 50K-token prompt
alone is read at about 185 tokens a second, so the cache holding across a
session matters.
