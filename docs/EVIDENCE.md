# Quench evidence

Record each goal's evidence here against a named commit: goal, status
(`planned`, `in progress`, `met`, `not met`), commit, command, result,
limitations. Unrecorded work is unverified.

## Starting headroom, 23 September 2026

Commit `fc2cb63`, `quench-labels` over 126 recorded Context experiment
sessions with declared required evidence (v1, v2, S5, v3 coverage, Flash
smoke and repeated DeepSeek Pro runs; evidence private; 9 of the 126 were
invalid pilot cells, see the Q0 correction). Median share of a
session's decision points after all required evidence had appeared: plain
0.57 (33 of 40 sessions reached sufficiency), Graphify 0.40 (36 of 40),
Context 0.47 (37 of 46). Upper bound only: finishing steps are not yet
subtracted (Q1), and runs are pooled here only for this model-free headroom
figure.

## Q0: frozen data set, 23 September 2026

Status: **met**. `node src/cli-data.ts`, run three times over the eleven runs
below: manifest and labels byte-identical each time.

- Manifest sha256 `007d120c3b0a6ad56be6ca37ad91c075860808147a056070dbd4d2ec191d2788`,
  labels sha256 `66384806b0ee7bb8abf21a2a8ee5638c1ac67f40577aa0d35c4622a1d5789ded`.
- Acceptance: `d5-20260921/acceptance` from the Context experiments; its
  required evidence is identical in the rubric v2 and v3 copies.
- 182 sessions: 135 labelled, 47 unlabelled (code-change tasks, no declared
  evidence: v1 6, v2 6, S5 6, v3 2, Flash 3, Pro r1 to r3 6 each, Context
  0.4.0 screen r1 to r3 2 each), and 9 excluded (`invalid-runs/` under v1:
  aborted pilots with no permission bypass, unused tools or an unresolvable
  Graphify CLI).
- The first freeze (commit `f69f08f`, manifest `bf58b944…`, labels
  `a122bfd8…`) held the eight runs without the Context 0.4.0 screen: 158
  sessions, 117 labelled. Q1 to Q4 below were scored against it; see the
  re-score note at the end.
- **Correction:** the starting-headroom entry counted 126 sessions because its
  directory walk picked up those 9 invalid pilot cells. The true labelled count
  is 117.

Labelled sessions per run and arm, with the number that reached sufficiency:

| Run | plain | graphify | context |
| --- | ---: | ---: | ---: |
| v1 | 6 (5) | 6 (5) | 6 (4) |
| v2 | 6 (3) | 6 (6) | 6 (5) |
| S5 | 6 (6) | 6 (6) | 6 (5) |
| v3 coverage | | | 6 (6) |
| Flash smoke | 1 (1) | 1 (1) | 1 (1) |
| Pro r1 | 6 (6) | 6 (5) | 6 (5) |
| Pro r2 | 6 (6) | 6 (6) | 6 (5) |
| Pro r3 | 6 (6) | 6 (6) | 6 (5) |
| Context 0.4.0 screen r1 | | | 6 (4) |
| Context 0.4.0 screen r2 | | | 6 (6) |
| Context 0.4.0 screen r3 | | | 6 (5) |

Per task (the first freeze, by arm): diagnosis-context 6 (6), 6 (6), 7 (7);
diagnosis-kithmoot 6 (4), 6 (6), 7 (3); impact-context 6 (6), 6 (5), 7 (6);
impact-kithmoot 6 (6), 6 (6), 7 (7); orientation-context 7 (6), 7 (6), 8 (7);
orientation-kithmoot 6 (5), 6 (6), 7 (6).

## Q1: scoring harness with bounds, 23 September 2026

Status: **met**. Commit `f69f08f`, `node src/cli-score.ts --decider oracle`
and `--decider always-continue --cold 30`, manifest as in Q0. Tests cover
replay order, finishing-step accounting, both bounds and premature stops.

Finishing steps are the recorded points after the session's last evidence
read (writes, test runs, draft checks such as `repository_coverage`); a stop
still pays them, so savings are counted only between the stop and the last
read.

| Arm | Sessions | Sufficient | Oracle premature | Oracle median saved share | Saved points | Saved calls | Saved KiB | Always-continue median late |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| plain | 37 | 33 | 0 | 38.9% | 306 | 335 | 888 | 8 |
| graphify | 37 | 35 | 0 | 25.0% | 208 | 231 | 517 | 4 |
| context | 43 | 36 | 0 | 25.0% | 305 | 342 | 1009 | 8 |

Always continue saves 0 in every arm, run and task. Oracle median saved share
per task (plain, graphify, context): diagnosis-context 66.7, 59.3, 61.1%;
diagnosis-kithmoot 6.5, 27.5, 0.0%; impact-context 28.4, 15.3, 20.0%;
impact-kithmoot 42.2, 10.0, 58.3%; orientation-context 36.4, 20.0, 16.0%;
orientation-kithmoot 40.3, 26.1, 8.3%. Per-run figures are in
`results/score-oracle.json`.

Latency, always continue over 2,073 decisions: p50 0.1 µs, p99 0.9 µs (this
measures harness overhead; each decider reports its own). Cold start through
`bin/quench-cold.mjs` with Node's compile cache, 30 runs: median 17.4 ms from
time origin to first decision, max 29.7 ms, 26.5 ms wall from spawn to exit.
Without the compile cache, type stripping alone put it at 41 ms.

Limitations: the oracle bound is net of finishing steps but still counts a
stop's single answer write as free where the recorded session wrote drafts
earlier. A Bash call that re-greps citation tokens after the answer is written
counts as a read, which slightly raises savings. With 3 to 8 sessions per task
and arm, per-task figures are not measured differences.

## Q1 amendment: citation checks are finishing steps, 23 September 2026

Commit `d37138d`. A fixed-string `grep -F`/`rg -F` that confirms a citation
token gathers nothing new, so it now counts as a check, not a read. Counting it
as a read had overstated savings. Oracle median saved share, corrected: plain
33.3%, graphify 20.0%, context 23.8% (was 38.9, 25.0, 25.0%); saved points
300, 196, 303; still 0 premature. The same commit anchors path extraction on
file extensions, bringing rule p99 from about 1.4 ms to under 0.3 ms.

## Q2: deterministic decider, 23 September 2026

Status: **not met**. No variant meets the locked thresholds. The best variant,
`coverage-or-stale-5`, meets the premature-stop and latency thresholds in
every arm but saves 0% of points at the median in every arm.

Thresholds (committed in `src/deciders/variants.ts` at `7cd1437` before any
scoring): premature stops at most 5% of sessions per arm; median saved share
at least 20% per arm; p50 under 0.1 ms and p99 under 1 ms per decision; cold
start under 30 ms. Batch 1 was locked at `7cd1437` and batch 2 at `03a83ce`,
each before it was scored. The figures below are from `8cfaf9a` (harness as
amended at `d37138d`, plus a lost-evidence column), manifest `bf58b944`,
`node src/cli-score.ts --decider <variant> --cold 30`. All variants require a
test file and an implementation file to have been read, except
`coverage-clean`.

Each cell gives stopped / premature (lost evidence) / median saved share.
"Lost evidence" counts stops that missed tokens the recorded session found
later; the remaining premature stops fell in sessions that never reached
sufficiency.

| Variant | Rule | plain (37) | graphify (37) | context (43) |
| --- | --- | --- | --- | --- |
| `stale-3` | 3 points with no new file read or listed | 28 / 4 (1) / 0% | 22 / 2 (0) / 0% | 26 / 5 (1) / 0% |
| `stale-5` | 5 such points | 11 / 1 (0) / 0% | 9 / 1 (0) / 0% | 17 / 2 (0) / 0% |
| `terms-stale-2` | prompt identifiers seen, 2 stale points | 32 / 4 (1) / 0% | 29 / 2 (1) / 0% | 33 / 6 (1) / 7.7% |
| `coverage-clean` | coverage reports 0 missing (no test gate) | 0 / 0 / 0% | 0 / 0 / 0% | 7 / 0 (0) / 0% |
| `repeat` | an identical read repeated | 2 / 0 / 0% | 0 / 0 / 0% | 2 / 0 / 0% |
| `read-stale-2` | 2 points with no new file *read* | 37 / 7 (4) / 10.0% | 35 / 3 (1) / 0% | 36 / 5 (1) / 0% |
| `read-stale-3` | 3 such points | 32 / 5 (2) / 0% | 25 / 2 (0) / 0% | 28 / 4 (1) / 0% |
| `coverage-or-stale-5` | clean coverage or 5 stale points | 11 / 1 (0) / 0% | 9 / 1 (0) / 0% | 20 / 2 (0) / 0% |

Premature rates: `stale-5` and `coverage-or-stale-5` 2.7, 2.7, 4.7%; every
other stopping variant exceeds 5% in at least one arm. Before the Q1
amendment, batch 1 scored at `7cd1437` gave the same stops except small
differences in `stale-3` and `stale-5` from the old path extractor; its
premature counts were identical and every median saved share was also 0%.

Best variant, `coverage-or-stale-5`, in more detail:

- Saved points 77, 65, 83 (plain, graphify, context) against the oracle's
  300, 196, 303, about a quarter to a third of the bound. Mean saved share
  4.3, 4.0, 6.0% against the oracle's 35.0, 24.3, 31.5%. Where it stops, it
  saves 14.1% of the session on average.
- Per task, median saved share is non-zero only on diagnosis-context (plain
  3.4%, graphify 14.8%, context 20.5%). Per run, only v3 coverage context is
  non-zero at the median (7.9%, with 6 of 6 stopped, all through clean
  coverage or staleness). Its 4 premature stops are in v1 (context,
  graphify), v2 plain and Pro r1 context, spread across orientation tasks.
- Latency over 1,794 decisions: p50 9.9 µs, p99 171 µs. Cold start, 60 runs
  on a loaded machine (load average 12): median 21.4 ms from time origin to
  first decision, 32.6 ms wall from spawn to exit.
- Leakage: `test/leakage.test.ts` checks that `src/deciders/` imports only
  the decider interface and `session.ts` (no labels, data, harness, oracle or
  file system), and that decisions are identical whatever evidence is
  declared.

Cause: the threshold is close to the bound. Net of finishing steps, the
oracle's median saved share is 20.0% for graphify and 23.8% for context, so a
rule meets 20% only by stopping within about a point of sufficiency in more
than half of all sessions. Novelty signals (no new file, a repeated read, a
clean coverage report) fire late or not at all: median lateness (the stop,
or the session's end, minus the first sufficient point) is 4 to 6.5 points,
and the safe variants fire in under half of the sessions. Loosening them to fire sooner raises
premature stops above 5% before the median saving leaves zero
(`read-stale-2`: plain 18.9% premature for a 10% median). Sufficiency here
means the agent has seen particular lines of implementation and tests;
file-level novelty does not detect that. Per GOALS, Q3 (a typed model
decider) is the next step; it needs a cost estimate approved by the owner
before it runs.

Limitations: all tasks were used to tune Context, and each rule was designed
with knowledge of the batch 1 scores (batch 2 only). With 6 to 8 sessions per
task and arm, per-task figures are not measured differences. The literal
premature definition counts a stop in a session that never became sufficient
as premature even where the recorded agent itself gave up.

## Q3: typed model decider, 23 September 2026

Status: **not met; recorded as not useful**. The owner approved one pass on
23 September 2026. Results are under "Q3 result" below; the plan and estimate
follow as approved.

Commit `7806824` adds the bounded, run-time-only summary
(`src/deciders/summary.ts`: task prompt, files read with tests marked, the
three newest result excerpts, newest calls first to fit) and
`node src/cli-estimate.ts`, which counts the input without calling a model.
The planned decider asks only at points where a test file and an
implementation file have been read (1,224 of 2,073 points), returns
`{ decision, missing: string[] }` and stops at the first `stop`.

Estimate for one full scoring pass, upper bound (every gated point asked):

- 12,000-character summary: about 1.59M summary tokens, mean 1,300 and
  largest 3,000 per call. With about 250 tokens of instructions and schema
  per call, about 1.9M input tokens; output about 60 tokens per call, about
  75K tokens in total.
- 3,500-character summary: about 1.05M summary tokens, about 1.35M input in
  total.
- Executor: DeepSeek Flash with thinking off through the local Ollama route,
  which draws Ollama Cloud credit. The Context experiments never read that
  credit rate, so no cash figure is claimed; the owner reads consumption from
  the account. Each rule or threshold variant scored is a further pass of the
  same size, less where earlier stops cut sessions short.

## Q4: Jev and Laya as comparators, 23 September 2026

Status: **met**. Laya scored (not useful as a stopper); Jev not scored
because it is unavailable: the owner reports TypeSafe AI is not accepting new
accounts (23 September 2026).

How each runs (public pages, read 23 September 2026):

- **Laya**: Convai Innovations, Apache-2.0, `pip install laya` (0.3.7),
  weights on Hugging Face (`convaiinnovations/laya`, English checkpoint 421M
  parameters, 512-token input). Runs locally: no spend.
- **Jev**: TypeSafe AI's hosted "System One" API, early access through
  console.typesafe.ai; published price $0.042 per million input tokens,
  output free. Scoring it on the 2,070 distinct snapshots the Laya adapter
  sends (3.47M characters, about 0.87M tokens, plus the fixed question) comes
  to about 0.95M input tokens, roughly $0.04 per pass at the published price.
  It needs an early-access account, and new accounts are closed, so it was
  not run.

The adapters live in `comparators/` and import no Quench decider code
(`test/leakage.test.ts`). Each snapshot is the task prompt (700 characters)
and the newest calls with 120-character result excerpts, within 1,900
characters.

**Laya result**, commits `22617f8` (question and thresholds locked) and
`7c6d226` (checkpoint selected per call), model revision
`1c5edc17a7acd8701df6fc341c0d179f1c62c982`, answers sha256 `189d4e77`.
Fixed yes/no question: "Has the coding agent already gathered enough evidence
from the repository to write its final answer, so that further tool calls are
unnecessary?" Stop when p ≥ threshold. 2,070 snapshots took 814 s locally
(0.39 s each on a loaded machine), too slow for the per-turn budget, so this
is an offline comparison only.

| Variant | plain (37) | graphify (37) | context (43) |
| --- | --- | --- | --- |
| `laya-50` | 37 / 36 (36) / 80.0% | 37 / 37 (37) / 72.7% | 43 / 43 (43) / 82.6% |
| `laya-80` | 16 / 8 (7) / 0% | 14 / 7 (6) / 0% | 40 / 40 (40) / 76.9% |

(stopped / premature (lost evidence) / median saved share.) Laya is not a
useful stopper here. Its answers sit above 0.5 on 1,881 of 2,070 snapshots
(mean 0.65), so it stops at or near the first point, and the high context-arm
rate follows the arm's longer prompt rather than the evidence. Its savings
come almost entirely from premature stops, so they are not comparable with
the rules'. Limitations: a 1,900-character snapshot is near Laya's 512-token
input and code-heavy text may be truncated (not measured); one question with
a fixed threshold does not test Laya's other question types.

### Q3 result

Commits `057fae1` (decider locked) and `40392ea` (answer shape stated in the
prompt, answer key versioned), `node src/cli-model.ts` then
`node src/cli-score.ts --decider model-flash`, manifest `bf58b944`. Model
`deepseek-v4.1-flash:cloud` through the local Ollama 0.34.2 route, thinking
off, temperature 0.

Failed attempts, logged: (1) the first smoke session, 14 calls, 23,584 input
and 1,313 output tokens. The route did not enforce the JSON schema, so Flash
answered `{verdict, reason}` and 13 of 14 answers did not parse. Fixed by
stating the shape in the prompt; those answers are kept aside and never
reused. (2) The full pass stopped after 19 sessions on one HTTP 500
(`Internal Server Error`, not a refusal or spending hold). The failed call
recorded no answer, and one resume completed the pass without re-asking any
point.

Spend: 1,158 answers (all parsed), 1,886,906 input and 95,598 output tokens,
plus the failed attempt's 24,897; within the approved estimate for input,
about 27% over it for output. Model latency p50 0.91 s, p99 3.3 s per call:
off the hot path only, as GOALS requires.

| Arm | Sessions | Stopped | Premature (lost evidence) | Median saved share | Saved points | Saved calls | Saved KiB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| plain | 37 | 32 | 2 (0) | 0% | 5 | 5 | 2 |
| graphify | 37 | 32 | 2 (0) | 0% | 6 | 6 | 3 |
| context | 43 | 20 | 1 (0) | 0% | 3 | 3 | 0 |

Every run and task has a 0% median saved share. The 5 premature stops are all
in sessions that never reached sufficiency (v1 context and graphify, v2 plain
twice, Pro r1 graphify) and lost no evidence.

Net of its own tokens it is a loss. Estimated executor input avoided (each
skipped turn resends the prompt and every tool result so far; bytes / 4,
ignoring caching and assistant text): plain 255K, graphify 235K, context 57K
tokens, 547K in total, against the decider's 1.89M. The same estimate puts
the oracle's bound at 9.6M, 5.9M and 6.3M.

Why: the model says stop almost only once the agent has itself finished
reading. Of its 84 stops, 78 came at or after the session's last evidence
read, and all 84 came after a write or check (an answer draft, a coverage
check, a citation grep) had appeared in the summary. It is safe but does not anticipate sufficiency. It does not beat
the best Q2 rule (`coverage-or-stale-5`: 77, 65, 83 saved points at 2.7,
2.7, 4.7% premature) on saved points. Per GOALS, Q3 is recorded as not
useful. No further pass has been run or is proposed.

Limitations: one prompt and one summary size were tried; the summary shows
the answer write, which invites agreement with the agent's own stop. A
variant that hides the agent's writes and checks would be a new locked
variant with its own approved pass.

## Re-score on the full freeze, 23 September 2026

Adding the Context 0.4.0 screen (manifest `007d120c…`, 135 labelled sessions)
changes no conclusion. The added sessions are all in the context arm.

- Oracle: median saved share plain 33.3%, graphify 20.0%, context 23.3%
  (was 23.8%); 0 premature.
- `coverage-or-stale-5`: premature 1/1/3 of 37/37/61 (2.7%, 2.7%, 4.9%), 0
  lost evidence, median saved 0% in every arm, saved points 77/65/200.
  Decision p50 9.8 µs, p99 113 µs. Q2 stays not met.
- The Q3 model decider was not re-scored: the 18 new sessions would need a
  further hosted pass, which was not approved. Laya was not re-run either; its
  result on the first freeze already rules it out.

## Q1 amendment 2: savings weighted by executor input, 23 September 2026

Every turn resends the conversation, so late turns cost more than early ones.
Commits `60ec93b` and `024c13d` record each assistant message's input
tokens against the decision point it followed. That is fresh input plus the
cached prefix it wrote or read, because Sonnet runs record most of each turn
as cache reads. The harness now reports saved executor input per session, as
a total over each group, and its median. A stop saves the messages sent from
the stop point up to the last read; the finishing messages still count
against it. This measures work resent, not money: cached tokens are priced
lower. Every one of the 135 labelled sessions records usage.

This was added after the Q2 and Q3 results were known. It does not change
any verdict. It is the measure the held-out criterion uses (see
`docs/HELDOUT.md`), locked before any held-out session exists.

Full freeze (`007d120c`), saved executor input as a total over the arm, then
the median session:

| Decider | plain (28.1M) | graphify (21.7M) | context (49.1M) | premature |
| --- | --- | --- | --- | --- |
| always continue | 0% / 0% | 0% / 0% | 0% / 0% | 0 / 0 / 0 |
| oracle (bound) | 60.2% / 41.3% | 50.2% / 22.9% | 57.0% / 27.2% | 0 / 0 / 0 |
| `coverage-or-stale-5` | 21.5% / 0% | 20.9% / 0% | 30.3% / 0% | 1 / 1 / 3 |
| Q3 model (first freeze) | 1.9% / 0% | 3.2% / 0% | 0.0% / 0% | 2 / 2 / 1 |

**The rule's saving comes from one task.** diagnosis-context sessions run
long (17 to 74 decision points, against a median of 13 for all other
sessions) and hold 57% of all executor input. On that task the rule saves 36%
(plain), 38% (graphify) and 48% (context) of input; on every other task it
saves 0 to 13%. Leaving diagnosis-context out, the rule saves 3.9%, 0.3% and
3.5% of input by arm, where the oracle would save 31.8%, 20.0% and 23.6%. The
rule is a guard against runaway sessions, not a general stop rule.

Why ordinary sessions are hard: sufficiency marks the point where every
required line has appeared in some tool result, often inside a large file
read. The agent cannot tell that those are the lines the rubric wants, so it
keeps reading to understand what it has. Much of the oracle's headroom in
short sessions is out of reach for any decider that sees only run time.

## Q2 batch 3 and the held-out primary, 23 September 2026

Status of Q2 against its locked thresholds: still **not met** (median saved
share 0% for every safe variant).

Batch 3 (`730b453`, locked before scoring) tests the runaway hypothesis:
keep `coverage-or-stale-5` and stop after a shorter stale run once a session
is long. The same commit fixed the selection rule for the held-out primary:
among variants with premature stops at or under 5% and no lost-evidence stop
in every arm, take the highest minimum across arms of total saved executor
input; ties go to fewer parts.

All variants on the full freeze. Each cell gives premature (lost evidence),
then total saved executor input:

| Variant | plain (37) | graphify (37) | context (61) |
| --- | --- | --- | --- |
| `stale-3` | 4 (1) 37.1% | 2 (0) 32.2% | 7 (2) 41.6% |
| `stale-5` | 1 (0) 21.5% | 1 (0) 20.9% | 3 (0) 30.3% |
| `terms-stale-2` | 4 (1) 48.4% | 2 (1) 41.8% | 10 (2) 46.3% |
| `coverage-clean` | 0 0% | 0 0% | 0 0% |
| `repeat` | 0 15.3% | 0 0% | 0 6.9% |
| `read-stale-2` | 7 (4) 50.8% | 3 (1) 43.1% | 9 (2) 46.0% |
| `read-stale-3` | 5 (2) 39.7% | 2 (0) 35.2% | 6 (2) 42.5% |
| `coverage-or-stale-5` | 1 (0) 21.5% | 1 (0) 20.9% | 3 (0) 30.3% |
| `long15-stale-3` | 3 (0) 28.7% | 2 (0) 23.8% | 3 (0) 40.0% |
| `long15-stale-2` | 3 (0) 37.5% | 2 (0) 26.5% | 3 (0) 42.0% |
| `long20-stale-2` | 2 (0) 30.6% | 1 (0) 23.2% | 3 (0) 40.2% |
| `cap-30` | 1 (0) 24.8% | 1 (0) 20.9% | 3 (0) 32.1% |

The long-session variants save more but exceed 5% premature in at least one
arm (`long20-stale-2`: 2 of 37 plain, 5.4%). `stale-5`,
`coverage-or-stale-5` and `cap-30` tie at 20.9% for their weakest arm;
`stale-5` has the fewest parts, so it is the **held-out primary**. On
recorded data it makes the same stops as `coverage-or-stale-5` except in six
context sessions. There clean coverage fired at or after the last read, so
those stops saved nothing and lost nothing.

Latency for this entry was measured with the machine under heavy unrelated
load (load average 40 to 70): `stale-5` p50 12 to 13 µs, p99 254 to 468 µs,
cold start median 28 to 34 ms over 20 runs. The quiet-machine figures from Q2
(p99 171 µs, cold start about 21 ms) stand until a re-measurement at low load
is recorded.

## Q6 groundwork: the stop-hint hook, 23 September 2026

Status: groundwork only; Q6 itself waits for Q5. Commit `5feaca1`.

- `src/live.ts` feeds a growing Claude Code transcript to a decider and
  decides once per decision point. `node src/cli-live-check.ts`: on all 135
  labelled sessions, fed in random chunks of 1 to 4,096 characters, the live
  path made the same decision as replay at every point for all 13 registered
  deciders (31,902 decisions).
- `bin/quench-hook.mjs` is a `PostToolUse` hook. The first call in a session
  decides in process and starts a per-session background process. That
  process keeps the frozen `stale-5` decider in memory and reads only the
  bytes appended since the last call, so a decision costs the same at turn 5
  and turn 80.
- `node src/cli-hook-sim.ts` drove the real hook binary over all 135 sessions,
  appending the transcript line by line and calling the hook after each tool
  result (2,961 calls). The hint arrived at the replay stop point in 135 of
  135 sessions. Time from process start to decision: median 23.7 ms, p99
  56.0 ms, with the machine under heavy unrelated load (load average about
  45). A quiet-machine figure is pending.
- Tests: the hook delivers one hint at the stop point and logs it; with
  `QUENCH_HINT=off` it prints nothing and logs the withheld hint; the leakage
  test covers the live path.
- Protocol for the online check: `docs/ONLINE.md` (locked with its estimate).

## Q5: held-out tasks locked, 23 September 2026

Status: **in progress**. The tasks are written, locked and proved; no session
has been recorded. Recording waits for the owner's approval of the estimate
in `docs/HANDOFF-Q5.md` and for changes to the recording harness.

- Written by a separate agent session with no context from this one. It was
  given only `docs/HANDOFF-Q5.md`, the Q5 goal and the D5 task formats, and
  was barred from Quench's decider code, results and protocols. It ran no
  executor session and no model inference.
- Eight tasks, an orientation, diagnosis (seeded fault), impact and code
  change on each of two MIT repositories outside ForgeSworn:
  - `tj/commander.js` at `ba6d13ddb4243e5913367734f8c159089ffe7834`
    (`git archive` sha256 `e5a487dc…8c84`);
  - `markdown-it/markdown-it` at `3c51991c32aaa2b002a52c009334ebe5752c84b3`
    (`git archive` sha256 `c3119a85…3a5c`).
- Experiment `quench-heldout-20260923-v1`, locked 2026-09-23T10:44:58Z, in
  private storage. `protocol.json` sha256
  `d5dcc7dd0ff28f79ac26d457a4b9eb7aede91bfc051729d63315eea99bc8c0d5`;
  `SHA256SUMS` (81 files) sha256
  `6d81a4d47bbc0d529d041d126678e7adc73de9ec28bb0b1ff0b01b827d958578`.
- Every task has declared required evidence, the code changes included: 86
  tokens in all, 6 to 16 per task. Every task has a deterministic checker. 28
  proofs came out as expected: each reference answer or patch is accepted,
  and each trivial or plausible wrong one is rejected.
- Checked independently here: the lock verifier passes; both clones are
  clean and at their pinned revisions; all 86 tokens occur verbatim at their
  paths in the pinned source, with the seeded patch applied for the two
  diagnosis tasks.
- Graphify builds its graph locally for both repositories without a model,
  so the Graphify arm is feasible. The Context server's index build on these
  trees is untested.
- Recording needs harness changes, listed in the protocol's `harnessGaps`:
  - read the task pack from `taskPack.directory` rather than the D5 path;
  - accept structured answers by checker without a reviewer verdict;
  - add the two repository roots to `local.json`;
  - pass the Quench hook in off mode.

**Known risk, recorded before any session exists.** These tasks declare 6 to
16 required tokens each; the development tasks declared 3 to 5. Sufficiency
needs every declared token to have appeared, so fewer held-out sessions may
reach it. The locked safety rule counts any stop before sufficiency as
premature, including in sessions that never gather the rest. The lost-evidence
count separates a stop that cost evidence from one in a session that would
never have found it, and it will be reported next to the verdict. Neither
the protocol nor the tasks change because of this.

## Latency on a quiet machine, 23 September 2026

Measured on a second machine, an Apple M4 with 16 cores and 64 GB (load
average about 1.0 before and 1.8 after), with Node 24.14.0. The code was at
`86996cf`, and the recorded files were copied there for the run and then
deleted. Rebuilding the data set there gave the same manifest
(`007d120c…`) and labels (`66384806…`) digests, so the freeze reproduces on
a second machine.

| Decider | Decisions | p50 | p99 | max | Cold start (median of 60) |
| --- | ---: | ---: | ---: | ---: | ---: |
| `stale-5` (held-out primary) | 2,056 | 5.8 µs | 55.0 µs | 218 µs | 10.6 ms (max 37.3) |
| `coverage-or-stale-5` | 2,054 | 5.8 µs | 55.8 µs | 210 µs | 10.6 ms (max 12.1) |

Cold start runs from the time origin to the first decision; wall time from
spawn to exit was 18.2 ms. Scores matched the main machine exactly.

The hook, driven over all 135 sessions (2,961 calls), delivered the hint at
the replay stop point in 135 of 135. Time from process start to decision:
median 13.4 ms, p99 18.1 ms, max 39.3 ms (a first call, which decides in
process and starts the background process). Wall time per call: median
21.1 ms, p99 27.1 ms.

Every budget in GOALS is met with room to spare: p50 under 0.1 ms, p99 under
1 ms, and cold start under 30 ms.

## Q5 recording: declarations before the first counted session, 23 September 2026

The owner approved DeepSeek spend for recording and asked for Flash before
Pro.

- **The Flash pass is a pilot.** One repetition of the eight held-out tasks
  in the plain, Graphify and Context arms (24 sessions) on
  `deepseek-v4.1-flash:cloud`. It shakes out the harness and gives a
  secondary result. It does not count towards the Q5 verdict, which
  `docs/HELDOUT.md` fixes on DeepSeek V4 Pro.
- **The Pro pass is the verdict:** three repetitions, all three arms (72
  sessions). Graphify is included because its setup proved feasible.
- **The harness is a private copy** of Context's `graphify-20260922/run.mjs`
  (source commit `8d7954f`, sha256 `89e90216…`), kept with the held-out
  protocol. Its changes:
  - read the task pack from the protocol directory;
  - accept structured answers by checker alone, as the protocol states;
  - add an `--executor-model` override, recorded in each receipt;
  - install the Quench hook in off mode for the executor only.
- **Session persistence is on** when the hook is installed, because the hook
  reads the session transcript and `--no-session-persistence` means none is
  written. That changes what Claude Code saves to disk, not what the model
  sees, and each receipt records it.
- **Versions:** Claude Code 2.1.280, Graphify 0.9.65 (instruction hash as
  locked), Ollama on the local route. Context is at release 0.4.1 (Context
  commit `485a444`); the development screen used 0.4.0.
- **Two smoke sessions, not counted.** Both ran orientation-commander in the
  plain arm on Flash, and the checker accepted both. The first exposed the
  missing transcript; the second exposed the socket path limit (fixed at the
  commit above). In the second, the live hook withheld its stop at point 20
  of 31, and an offline replay of the recorded stream also stops at point 20.

## Q4 addendum: Open-Jev as a comparator, 23 September 2026

Open-Jev (github.com/Zefan-Cai/Open-Jev, MIT, commit `3308a15`) is independent
open research inspired by TypeSafe's Jev. It is not Jev, and Jev remains not
scored. The adapter was locked at `00266d1` before any answer existed: it
asks the question Laya was asked, on the same snapshots, at the same
thresholds (0.5 and 0.8).

- **Run:** locally on an Apple M4 (Apple GPU via PyTorch 2.14; transformers
  5.10.2, peft 0.19.1), so no hosted spend. The published 2B and 9B packages
  ran over pinned base weights: `Qwen/Qwen3.5-2B` at `15852e8c` and
  `Qwen/Qwen3.5-9B` at `c2022362`.
- **Snapshots:** all 2,451 distinct snapshots of the full freeze (Laya was
  run on the 2,070 of the first freeze). Time per snapshot: 2B about 0.47 s,
  9B about 2.1 s.

Full freeze, each cell giving stopped / premature (lost evidence) / total
saved executor input:

| Comparator | plain (37) | graphify (37) | context (61) |
| --- | --- | --- | --- |
| `open-jev-2b-50` | 1 / 0 / 0% | 0 / 0 / 0% | 0 / 0 / 0% |
| `open-jev-2b-80` | 0 / 0 / 0% | 0 / 0 / 0% | 0 / 0 / 0% |
| `open-jev-9b-50` | 29 / 10 (8) / 48.2% | 18 / 5 (4) / 23.2% | 37 / 16 (10) / 34.5% |
| `open-jev-9b-80` | 6 / 1 (1) / 3.5% | 0 / 0 / 0% | 1 / 1 (1) / 0.9% |

How well each probability separates sufficient from insufficient points (the
chance that a random sufficient point scores higher than a random
insufficient one; 0.5 is chance). This is a description, not a scored
variant:

| Comparator | Points | AUC | Mean p (sufficient / not) |
| --- | ---: | ---: | --- |
| Open-Jev 2B | 2,454 | 0.567 | 0.058 / 0.051 |
| Open-Jev 9B | 2,454 | 0.609 | 0.303 / 0.245 |
| Laya (first freeze) | 2,073 | 0.561 | 0.658 / 0.636 |

Neither size is useful as a stop decider here. The 2B almost never says
stop. The 9B at 0.5 saves input only by stopping too early and losing
evidence; at 0.8 it saves almost nothing and still loses evidence twice.
None of the three judges separates sufficient from insufficient points much
better than chance. A general judge that is not told which evidence the task
needs cannot see when it is complete. The frozen rule `stale-5` saves 21 to
30% of input with no lost evidence, doing better than every comparator, at
microseconds per decision rather than a model call.

## Q5 Flash pilot result (secondary), 23 September 2026

Secondary evidence only: `deepseek-v4.1-flash:cloud`, one repetition, 24
sessions. It does not count towards the Q5 verdict.

- **Recording:** 24 of 24 sessions ran. The checker passed 21; one Context
  code change failed its scope check, leaving 20 of 24 accepted. The three
  checker failures were all orientation-commander, each one field wrong.
- **Live hook against replay:** in 23 of 24 sessions the hook withheld its
  stop at exactly the replay stop point. In the other, replay stops at the
  final point (28) and the hook logged nothing there: the agent's last
  results and its final answer came with no later hook call to decide on.
  A stop at the last point saves nothing.
- **Labeller bug, found here and fixed at the next commit.** Three
  markdown-it tasks each declare one token at two paths. The labeller
  compared distinct tokens seen with the number of items, so those tasks
  could never be sufficient, and every stop in them counted as premature.
  No development task shares a token, so the development labels digest
  (`66384806`) and every earlier result are unchanged.
- **Reads-only view added.** The development set labelled no code-change
  tasks; the held-out set does, and code changes interleave edits with
  reading. The locked measure counts every point between the stop and the
  last read as saved, edits included. The reads-only view counts only
  points made of reads alone. It is reported next to the locked measure,
  which does not change.

Pilot data set: manifest `a4d66a69…`, labels `761d5651…` after the fix.
`stale-5`, the frozen primary. Each cell gives premature (lost evidence),
then saved executor input under the locked measure and under the reads-only
view:

| Arm (8 sessions) | stale-5 | oracle (bound) |
| --- | --- | --- |
| plain | 0 (0), 36.7%, 13.0% | 68.2%, 35.3% |
| graphify | 0 (0), 29.9%, 14.3% | 58.4%, 33.6% |
| context | 0 (0), 40.3%, 19.1% | 66.2%, 38.0% |

- **Breadth:** leaving out the task that saved most, the locked measure
  saves 17.2%, 21.8% and 24.2% by arm, and the reads-only view 8.3%, 10.5%
  and 11.4%.
- **Where the saving comes from:** the code-change tasks save most. Under
  the reads-only view that falls from 52–77% to 21–35% per session, because
  much of the "saved" tail was edits and test runs.
- **Latency:** p50 10 µs, p99 154 µs.

Development set under the reads-only view, for comparison: `stale-5` saves
18.6%, 14.0% and 24.5% (the locked measure: 21.5%, 20.9% and 30.3%).

What this shows, as a pilot: the frozen rule made no premature stop and lost
no evidence on held-out tasks, and it saved input under both measures.
Whether the saving clears 20% depends on how edits interleaved with reading
are counted. Any claim after the Pro verdict will give both figures.

## Q5 verdict: DeepSeek V4 Pro on the held-out tasks, 23 September 2026

Status: **not met.** Under the protocol locked in `docs/HELDOUT.md`, the
plain and Graphify arms fail the safety rule. The Context arm passes every
rule, and all three arms clear the saving rule under both measures.

- **Recording:** three repetitions of 8 tasks × 3 arms, 72 of 72 sessions,
  with the private runner and the Quench hook in off mode. Checkers passed
  66 of 72 and two code changes failed the scope check, so 64 were
  accepted: plain 24, Context 22, Graphify 18 of 24.
- **Data set:** manifest `5b38e25c…`, labels `71fa012c…`, reproducible on a
  second build. Sessions reaching sufficiency: plain 23, Context 21,
  Graphify 16 of 24. The frozen-code test passed before scoring.
- **Two harness faults, both logged in the run log:**
  - In repetition 3, the machine's Node 24.21.0 began to be killed by the
    OS at launch (exit 137, signature valid, cause not visible; it later
    cleared by itself). The preparer for one cell died, so the run stopped
    at 53 of 72. The remaining 19 cells ran on Node 24.19.0, for the
    harness, the Context server, the hook and the agent's PATH.
  - One cell started before PATH was corrected ran without dependencies
    installed. It was discarded before finishing and rerun.

The frozen primary, `stale-5`, per arm (24 sessions each):

| Rule | plain | Context | Graphify |
| --- | --- | --- | --- |
| Safety: at most 1 premature stop, none losing evidence | **fail**: 2 premature, 1 lost | **pass**: 0 | **fail**: 4 premature, 1 lost |
| Saving: total executor input at least 20% | pass: 46.7% | pass: 42.8% | pass: 40.6% |
| Reads-only view | 26.7% | 26.1% | 23.2% |
| Oracle bound (locked / reads only) | 58.9% / 35.6% | 65.2% / 43.5% | 47.9% / 26.0% |

- **Speed:** p50 7.1 µs and p99 101 µs per decision over 1,155 decisions,
  measured with load average about 6. The protocol asks for a measurement
  below 4; the quiet M4 measurement on the development set (p99 55 µs, cold
  start 10.6 ms) stands meanwhile. Speed is not what fails.
- **The six premature stops:** only two lost evidence, both on
  orientation-commander. In plain (repetition 2) the stop came at point 9;
  the session reached sufficiency at 29. In Graphify (repetition 1) the
  stop came at point 25 of 40, in a session that never reached sufficiency.
  The other four came in sessions that never gathered every declared line,
  and the stop lost nothing those sessions later found.
- **Breadth:** leaving out the task that saved most (code-change-commander
  in every arm), the locked measure saves 24.5%, 19.7% and 18.7% (plain,
  Graphify, Context), and the reads-only view 17.4%, 13.1% and 11.5%. Both
  are above the protocol's 10% floor, so the protocol would allow wording
  broader than "runaway sessions". Q5 is not met, so no claim is made.
- **Where it saves:** mostly the two code-change tasks (57–84% of input
  under the locked measure, 25–48% reads only). Diagnosis, impact and
  orientation tasks save little or nothing.
- **Live hook against replay:** in 69 of 72 sessions the hook withheld its
  stop at exactly the replay stop point. In the other three, replay stops at
  the session's final point, with no later hook call; a stop there saves
  nothing. No hook errors.
- **Secondary deciders:** `coverage-or-stale-5` scores identically.
  `long20-stale-2` saves more (43.6–50.2%) but stops prematurely more
  often (plain 3, 2 lost). `cap-30` fails as `stale-5` does.

What this shows. On tasks written independently of it, the frozen rule
saved 41 to 47% of executor input by arm, 23 to 27% even when edits and
checks between the stop and the last read count as work still needed. It
lost evidence in 2 of 72 sessions, both on one orientation task. The locked
safety rule allows none, so Q5 is not met. The Context arm met every rule.
Per GOALS, Q6 waits for a passing offline decider, so the online check does
not run on this result. Any new rule is a new decider: it needs fresh
held-out tasks, because it would be designed knowing these results.

## Q6 verdict: the live hint on the Context arm, 23 September 2026

Status: **not met.** Under Amendment 1 of `docs/ONLINE.md` the hint fails
both rules. The larger finding is about the measure: most of what replay
counted as saved was work the agent still had to do.

- **Recording:** 48 of 48 sessions (8 held-out tasks, Context arm,
  DeepSeek V4 Pro, three repetitions, hint on and off back to back), hook at
  commit `3577233`, hook file `02fd1d6c…`. No session failed to run and none
  was rerun. Data sets: on manifest `0e278544…`, labels `cef5a0a7…`; off
  manifest `8b5a1231…`, labels `004c2215…`.

| Rule | Hint on | Hint off | Result |
| --- | ---: | ---: | --- |
| Cost: total executor input (Q1 harness measure) | 15.53M | 15.68M | **fail**: 1.0% lower, 20% needed |
| Quality: accepted sessions | 21 | 24 | **fail** |

- **Also reported:** the receipts' own usage totals give 16.27M against
  16.59M (1.9% lower). Turns 790 against 814; executor time 3,907 s against
  4,200 s.
- **Per task (median input, on against off):** diagnosis-markdown-it
  0.32M against 0.59M; orientation-markdown-it 0.25M against 0.35M;
  orientation-commander 1.23M against 0.74M; the rest within 0.11M. The hint
  fired in only 11 hint-on sessions, so most of these gaps come from
  sessions that never received it and show run-to-run spread, not the hint.
- **The three rejected answers did not receive the hint.** They are
  orientation-commander in repetitions 1 and 2 (a wrong field, for example
  `outputHelp` for `_outputHelpIfRequested`) and orientation-markdown-it in
  repetition 3 (11 of 12 declared lines gathered). In none of the three did
  the decider stop, so the hook sent nothing and the session was treated
  exactly as in the off condition. The quality rule fails as locked; the
  cause is spread between runs, not the hint.
- **Delivery and compliance:** in all 11 sessions where the hint fired it
  reached the transcript as a `hook_additional_context` attachment at the
  decided point (lag 0). No later assistant text refers to it. After the
  hint, agents made 76 read calls and used 6.93M input; after the withheld
  hint in the off condition, 78 read calls and 6.98M. The agent ignored the
  hint.

### What a stop could have saved

`savedAfter` counts every message from the stop to the agent's last read.
In a code change the agent reads again while editing and testing, so that
span is mostly the task's own work. A stop hint asks the agent to stop
gathering and answer; what it can remove is the pure gathering between
the stop and the agent's next edit or check. Measured that way (stale-5
replayed, and the label oracle's first sufficient point as a ceiling):

| Data set, arm | Locked measure | Reads only | Pure gathering after stale-5 | Ceiling (first sufficient) |
| --- | ---: | ---: | ---: | ---: |
| Development, Context | 30.3% | 24.5% | 13.9% | 11.1% |
| Development, plain | 21.5% | 18.6% | 4.3% | 13.6% |
| Held-out Pro, Context | 42.8% | 26.1% | 0.3% | 13.8% |
| Held-out Pro, plain | 46.7% | 26.7% | 13.6% | 19.4% |
| Online, hint off | 36.9% | 19.3% | 2.6% | 19.2% |

In 8 of the 11 off sessions where stale-5 stopped, and in all 8 of the
held-out Pro Context sessions, the agent had already edited or run a check
before the stop point. `stale-5` stops when no new file has appeared for
five points, and on these tasks that is usually after the agent has moved
on to the answer. The rule recognises that gathering has ended, at about
the point where the agent already ends it.

What this shows. The replay savings reported for Q1, Q2 and Q5 are real
counts of input after the stop, but a stop hint cannot capture most of
them. On held-out tasks, what was left to capture after `stale-5` was
0.3–2.6% of input on the Context arm. The live test agrees: 1.0%. An
agent that stopped at the first sufficient point would leave 11–19% of
input to cut, but no decider here finds that point safely. The hint was
also ignored. Q7 (packaging) waits for Q6 to pass, so nothing is packaged.
A new attempt would need a decider aimed at the first sufficient point, a
mechanism the agent cannot ignore, the pure-gathering measure locked as
primary, and fresh held-out tasks.

## Q8 motivation: where Claude Code spend goes, 23 September 2026

`node src/cli-anatomy.ts` over the owner's local transcripts for the last 30
days. It prints aggregates only, and no content or project names leave the
machine. Cost is in base-input units at the multipliers Claude Code incurs:
one-hour cache write 2×, cache read 0.1× (0.05× on Opus 5.5, 0.025× on
Fable), output 5×.

- **Scope:** 785 transcripts (392 main sessions and 366 subagent
  transcripts), 79,167 requests. Subagents are 34% of cost.
- **Components:** cache reads 68%, cache writes and fresh input 20%, output
  13%.
- **Session length:** sessions of more than 300 requests (45 of 392) carry
  80% of main-session cost.
- **Context size:** requests sent with more than 200K tokens of context
  carry 78% of cost, and those above 400K carry 49%. Within the latter,
  cache reads are 76% of cost.
- **Natural compactions:** 94 with 30 requests either side. The median
  context fell from 415K to 55K, and context growth per request over the
  next 30 requests was 1.31× what it was before.
- **Earlier compaction, simulated** (the same behaviour assumed, so an upper
  bound; the model with no intervention sits 7% under the recorded cost and
  is the baseline): compacting at 600K saves 17%, at 400K 29%, at 200K 45%,
  and at 120K 51%.

On the Q5 and online DeepSeek sessions, the same multipliers split cost
roughly into thirds between cache writes, cache reads and output. There,
evicting old tool results or capping result size saved about nothing once
cache rebuilds were counted. Routing the gathering phase to Haiku saved
about 20% under Opus 5 and about 5% under Sonnet 5, with the same
behaviour assumed. The held-out tasks are short (a median of 22 requests),
which is the regime with least to save. Q8 tests compaction timing in
longer, dependent sessions.

## Q4 addendum 2: every comparator on the held-out tasks, 23 September 2026

Kev (4B and 9B, jaredpalmer/kev) and Von are Apache-2.0 open System One
models. Their adapters were locked at `357c4e3` before any answer existed:
Laya's snapshots, question and thresholds (0.5 and 0.8). All five judges ran
locally on the Apple M4 over the 1,692 held-out Pro snapshots
(sha256 `6d184b57…`), so there was no hosted spend. Jev remains unscored and
is dropped as a comparator.

Scored on the 72 held-out Pro sessions with the frozen harness, and with the
Q6 measure: the pure gathering between a stop and the agent's next edit or
check, counting only stops that were not premature. Each cell gives
premature stops (of which lost evidence) / pure gathering saved:

| Decider | plain (24) | Context (24) | Graphify (24) |
| --- | --- | --- | --- |
| `stale-5` (frozen rule) | 2 (1) / 8.0% | 0 (0) / 0.3% | 4 (1) / 1.4% |
| `laya-50` | 24 (24) / 0% | 24 (24) / 0% | 24 (24) / 0% |
| `laya-80` | 6 (6) / 3.5% | 24 (24) / 0% | 7 (2) / 1.2% |
| `open-jev-9b-50` | 13 (13) / 3.7% | 6 (4) / 6.5% | 17 (16) / 0.6% |
| `kev-4b-50` | 22 (22) / 0% | 2 (0) / 3.7% | 12 (10) / 0.1% |
| `kev-9b-50` | 15 (15) / 1.0% | 1 (0) / 4.0% | 15 (12) / 1.9% |
| Ceiling (first sufficient point) | 19.4% | 13.8% | 7.0% |

The other variants barely stop. `open-jev-2b-50` stops 8 times, all in
plain (3 premature, all losing evidence). `open-jev-2b-80`,
`open-jev-9b-80` and `kev-4b-80` stop 1, 3 and 7 times, all in plain.
`kev-9b-80`, `von-50` and `von-80` never stop, and Von's highest answer on
any snapshot is 0.374. Over all 72 sessions, stops that lost evidence:
`stale-5` 2, `kev-9b-50` 27, `kev-4b-50` 32, `open-jev-9b-50` 33, `laya-50`
72.

How well each probability separates sufficient from insufficient points
(0.5 is chance; descriptive only):

| Judge | Held-out Pro (1,692 points) | Flash pilot (642) | Development (2,454) |
| --- | --- | --- | --- |
| Laya | 0.501 | 0.546 | 0.561 (first freeze) |
| Open-Jev 2B | 0.501 | 0.513 | 0.567 |
| Open-Jev 9B | 0.493 | 0.491 | 0.609 |
| Kev 4B | 0.570 | 0.565 | 0.562 |
| Kev 9B | 0.605 | 0.646 | still running on the M4 |
| Von | 0.483 | 0.575 | 0.588 |

On the Flash pilot (24 sessions, secondary), `kev-9b-50` stops in 22
sessions, 7 of them prematurely and all 7 losing evidence, with 0.6–1.7%
pure gathering from its safe stops by arm. `stale-5` there loses nothing
and leaves 0.5–2.2%.

What this shows. No general judge is a safe stop decider on these tasks.
Each one that stops often enough to save anything loses evidence in a third
or more of the held-out Pro sessions. On held-out tasks, none separates
sufficient from insufficient points much better than chance: the best, Kev
9B, reaches an AUC of 0.605 (0.646 on the Flash pilot). On the Context arm, Kev 9B at 0.5 leaves more pure gathering
to cut than `stale-5` (4.0% against 0.3%), with one premature stop that
lost nothing. On the other two arms it loses evidence in 27 of 48
sessions. Q4's reading holds for all five: a judge not told what evidence
the task needs cannot see when it has been gathered. The stop-decider line
of work ends here (Q6), so no comparator is taken further.

## Q7: `quench report`, 24 September 2026

`src/report.ts` and `src/cli-report.ts` replace the anatomy script. The
report streams Claude Code and Codex transcripts line by line, keeps token
counts and model names only, and prints aggregates. Tests cover both
parsers, the pricing, the simulation, and a fixture run that checks no
content, project name or path reaches the output, text or JSON.

- **Reproduction:** `node src/cli-report.ts --agent claude --summary 30000`
  gives the Q8 motivation figures again: components 68% / 20% / 13%,
  subagents 34%, 49% of cost above 400K, and modelled windows at 600K,
  400K and 200K of −17%, −29% and −45%. It now sees 394 sessions, as
  sessions went on after that entry.
- **Default summary size:** with 10 or more compactions in the
  transcripts, the context after a modelled compaction is the median after
  the owner's own (55K on Claude Code), not a fixed 30K. That gives −16%,
  −27% and −41% at 600K, 400K and 200K, and −38% at 100K, where a 55K
  restart leaves little to save.
- **Codex** (the same 30 days, 165 sessions, 35 subagent transcripts,
  131,996 requests; multipliers assumed from GPT-5 list prices): cache
  reads 68%, cache writes and fresh input 14%, output 18%; subagents 6%.
  Sessions of more than 1,000 requests carry 77% of cost. Codex already
  compacts on its own: 1,023 compactions, a median of 238K before and 25K
  after. So most of its cost sits at 100–200K (54%), and modelled windows
  of 200K, 150K and 100K give −12%, −25% and −31%.

These are upper bounds with the agent's behaviour held fixed. Q8 measures
what compacting costs in accepted work.

- **Idle rebuilds:** 166 requests (6% of main-session cost on Claude Code,
  median context 318K) sent at least 50K of context, mostly uncached, more
  than an hour after the previous request. The prompt cache had expired,
  so the session paid to write its whole context again. Compacting at that
  point costs about the same as the rebuild it replaces, and it shrinks
  every request after it.
- **Delivery in interactive Claude Code** (hooks reference, read 24
  September 2026): no hook can start a compaction. A `PreCompact` hook can
  block a proactive auto-compaction, after which the session continues
  uncompacted. A small auto-compact window with a hook that lets a
  compaction through only at a boundary is therefore a way to deliver a
  boundary trigger (GOALS Q9).

## Q8 Flash pilot (secondary), 24 September 2026

Secondary evidence only: `deepseek-v4.1-flash:cloud`, one repetition, both
chains under all three policies, protocol locked at `e99c152`. Six of six
runs completed and none was rerun. One harness fault was found and fixed
before scoring (`6f8644d`): `modelUsage` is a running total over a resumed
session, so the scorer now takes each invocation's own tokens.

| Policy | Accepted | Priced (M units) | Raw tokens | Cache misses | Cache reads | Output | Compactions |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| carry | 11/12 | 2.05 | 10.40M | 0.21M | 10.19M | 0.12M | 0 |
| threshold (100K) | 12/12 | 2.45 (+20%) | 9.77M | 0.29M | 9.48M | 0.18M | 4 |
| boundary | 11/12 | 2.89 (+41%) | 6.68M | 0.67M | 6.01M | 0.19M | 10 |

- **Per chain:** commander carry 1.18, threshold 1.36, boundary 1.55;
  markdown-it carry 0.86, threshold 1.09, boundary 1.34.
- **Context:** carry peaked at 111K (commander) and 79K (markdown-it).
  Boundary compactions went from 21–60K down to 6–16K. The 100K window
  compacted automatically at 68–72K, twice per chain.
- **Rejections:** markdown-it step 4 under carry and under boundary, the
  same missing file in both, so compaction did not cause it.

**Harness fault, found after this entry was written:** the boundary
arm's compaction calls missed the cache because of a flag that differed
between invocations (`docs/CHAINS.md`, harness fix 2). Those calls cost
about 0.49M units on each chain, nearly all of boundary's excess. Without
them, boundary's step calls cost 1.05 against carry's 1.18 on commander
and 0.86 against 0.86 on markdown-it. The paragraph below is kept as
written; its explanation of the excess is wrong. A Flash check with the
fix (commander, one run each) still found boundary dearer than carry, 1.54
against 1.22 (+26%): its compaction calls cost 0.18, and its step calls
1.36 against 1.22, with 121 requests against 94. Single runs vary widely,
so the counted run decides.

What this shows. At these context sizes, compacting cost more than it
saved. It cut raw tokens by a third but raised priced cost by 41%. After
each compaction the next requests miss the cache and write the context
again at 2×, and the summary is output at 5×. That outweighs 4.2M fewer
cache reads at 0.1×. A compaction pays only when enough later requests
each read a much smaller context. These chains peak near 110K, and each
step is 6–45 turns. Most of the owner's cost sits above 200K in sessions
of hundreds of requests, which these chains do not reach. The counted Pro
run goes ahead as locked. The modelled savings in `quench report` leave
out the tax of reading again after a compaction, and they need
calibrating against these runs before anyone relies on them.
