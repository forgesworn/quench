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

Status: **in progress** (met for the eight completed runs; the Context 0.4.0
screen `20260923-screen-pro-040` was still recording and is added when it
completes). Commit `f69f08f`, `node src/cli-data.ts`, run twice: manifest and
labels byte-identical.

- Manifest sha256 `bf58b944b56f5838f2c47c77d450db7776c989ec96575e08e549697b5f61ea73`,
  labels sha256 `a122bfd8b83b496224c009b0878da5d10dc670705b6b7ea65ded6b3ee5d3e0e3`.
- Acceptance: `d5-20260921/acceptance` from the Context experiments; its
  required evidence is identical in the rubric v2 and v3 copies.
- 158 sessions: 117 labelled, 41 unlabelled (code-change tasks, no declared
  evidence: v1 6, v2 6, S5 6, v3 2, Flash 3, Pro r1 to r3 6 each), and 9
  excluded (`invalid-runs/` under v1: aborted pilots with no permission
  bypass, unused tools or an unresolvable Graphify CLI).
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

Per task (all runs, by arm): diagnosis-context 6 (6), 6 (6), 7 (7);
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
