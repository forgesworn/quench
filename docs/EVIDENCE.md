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
