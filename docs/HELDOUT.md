# Held-out protocol (Q5)

Locked 23 September 2026, before any held-out task was written. It fixes the
decider, the measures and the pass rule for the held-out sessions. Nothing
here changes once a held-out task, session or score has been seen; a change
means a new protocol with a new date, and results under both are reported.

## Why this exists

On the recorded development set, no rule meets the Q2 thresholds as written:
every safe rule saves 0% of decision points at the median. Weighted by
executor input, the safe rules save 21 to 30% per arm, almost all of it on
one task whose sessions run long (`docs/EVIDENCE.md`, Q1 amendment 2). The
recorded tasks also tuned Context. Only held-out tasks can show whether the
saving is real and whether it depends on runaway sessions.

## Decider

The primary decider is `stale-5`, chosen by the selection rule locked at
`730b453` before batch 3 was scored:

```ts
{ requireTestAndImpl: true, staleFor: 5 }
```

The decision code, as at commit `730b453`:

| File | SHA-256 |
| --- | --- |
| `src/decider.ts` | `c1b65bd96f2d9d40705d48ec0b5e534f66d7caf83f8b4e7f7e5b377509b839b8` |
| `src/session.ts` | `1a882ee4506a0ba925757e10fafe22a0c1eed2083dbac06062f0684bf70b8190` |
| `src/deciders/rules.ts` | `b0252510a33a0a5bd497fa417ac7ef861fd63e0a36e189cffa2f3a7765adc9a4` |
| `src/deciders/variants.ts` | `67e64c3907c5f599eeac1facd1fb706f7077d08840b1dd97335e78bd4d079c77` |

Scoring checks these hashes first. If a held-out session exposes a bug, the
result under the frozen code is the result; a fix is a new decider for a
later test.

Also reported, but not used for the verdict: `coverage-or-stale-5`,
`long20-stale-2` and `cap-30`.

## Sessions

- At least eight tasks: orientation, diagnosis, impact and code change on each
  of at least two repositories outside the ForgeSworn ecosystem. Every task,
  code change included, declares its required evidence (`path` and verbatim
  `token`), so every session can be labelled.
- Arms: plain and Context at minimum; Graphify if its setup is feasible on
  the chosen repositories. Three repetitions per task and arm.
- Executor: DeepSeek V4 Pro through the local route, with the recording
  harness and settings used for the Pro repetitions on the development set.
- Sessions that fail to run (provider error, harness fault) are logged and
  rerun once; sessions that run and give a wrong answer are kept.

## Measures

The Q1 harness with the input-token amendment (`024c13d` or later with the
same results on the development set), labels from `quench-labels` with each
held-out task's declared evidence, and the data set built by `quench-data`
with its own manifest digest.

## Pass rule

Per arm:

1. **Safety:** premature stops at most 5% of the arm's sessions, and no
   stop that lost evidence the recorded session found later. With 24 sessions
   per arm, that allows one premature stop.
2. **Saving:** total saved executor input at least 20% of the arm's total.
3. **Speed:** p50 under 0.1 ms and p99 under 1 ms per decision, and cold
   start under 30 ms, measured with the load average under 4 and the load
   recorded.

Q5 is met when every arm passes 1 to 3. Then:

- **Breadth decides the wording of any claim.** Recompute the saving without
  the task that saved the most. If that falls under 10% in any arm, any claim
  says "guards against runaway sessions" and nothing broader.
- **If safety passes and saving fails,** count the sessions with more than 30
  decision points. If there are none, the saving is recorded as untested on
  these tasks, not refuted.
- **Reporting:** per arm, per task and per run, with premature stops next to
  savings, both medians alongside the totals, and every secondary decider.
