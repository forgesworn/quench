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
