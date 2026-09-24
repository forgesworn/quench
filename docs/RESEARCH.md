# Quench research

In smithing, quenching is the moment you judge the work is done and stop
heating. Quench began as a stop decider for coding agents: at each decision
point, stop gathering evidence or call another tool? This file summarises
what that programme found. Every run, with its protocol and its faults, is
in [EVIDENCE.md](EVIDENCE.md); the goals are in [GOALS.md](../GOALS.md).

## Why

126 recorded sessions from the [Context](https://github.com/forgesworn/context)
retrieval experiments (three tool arms, Sonnet and DeepSeek executors,
declared required evidence per task) put a median of about half of each
session's decision points **after** all the required evidence had appeared
(plain 0.57, Graphify 0.40, Context 0.47). Nine of the 126 were later found
to be invalid pilot cells and the data set was corrected to 117; these
medians were not recomputed. They are an upper bound: some later steps are
the task's own work (writing the answer, running tests).

## What it found

1. **Labels.** `quench-labels` marks each decision point as sufficient or
   not, with no model.
2. **A deterministic rule.** The frozen rule `stale-5` counted 41–47% of
   executor input after its stop on held-out tasks under replay, and lost
   evidence in 2 of 72 sessions (Q5, not met). Most of that span was work
   the agent still had to do. Measured as pure gathering, from the stop to
   the agent's next edit or check, it was 0.3–13.9% depending on the data
   set and arm, and the first-sufficient ceiling was 7–19%.
3. **Published judges.** Laya, Open-Jev, Kev and Von saw the same
   truncated snapshots (the task prompt and the newest calls, within 1,900
   characters). Each one that stopped often enough to save anything lost
   evidence in a third or more of the held-out sessions over all three
   arms, and none separated sufficient from insufficient points much better
   than chance (the best AUC, Kev 9B, 0.605). On the Context arm alone, Kev
   9B stopped with more pure gathering left to cut than `stale-5` (4.0%
   against 0.3%) and lost nothing. Jev could not be run (Q4).
4. **A live hint.** In 48 headless sessions on one executor (DeepSeek V4
   Pro, Context arm), half with the hint withheld, the hint fired in 11 and
   the agent ignored it; input fell 1.0% (Q6, not met).
5. **Where the cost was.** In one developer's Claude Code transcripts, most
   cost sat in long sessions resending very large contexts, and 64–68% was
   cache reads (Q8 motivation). That turned the programme towards the
   report.
6. **Compaction timing.** On two dependent six-step chains (DeepSeek V4
   Pro, three repetitions, contexts up to about 110K), compacting at task
   boundaries cost 16.4% more than carrying the session and accepted 23
   steps against 30; a fixed 100K window cost 3.6% more and accepted 24.
   The chains disagreed (commander 49% dearer, markdown-it 12% cheaper with
   two more steps accepted). Summaries lost details that had to be exact
   (Q8, not met; [protocol](CHAINS.md)).

## What is worth reusing

- **Replay overstates.** Counting everything after a replayed stop gave
  41–47%; what an intervention could capture was 0.3–13.9%, and the live
  effect was 1.0%. Evaluate early-stop and pruning ideas on the pure
  gathering they remove, then live.
- **The method.** Rules and thresholds locked in commits before scoring;
  the scorer checks hashes of the frozen decider; held-out tasks written by
  a session that did not know the policies, with proofs that each checker
  rejects wrong answers, including a forgotten-dependency variant per
  step; faults logged, never silently rerun.
- **Claude Code headless behaviour**
  ([CHAINS.md](CHAINS.md#harness-fixes-after-the-lock)):
  - `modelUsage` is a running total over a resumed session;
  - `--disable-slash-commands` changes the prompt prefix, so a `/compact`
    run without it misses the cache;
  - a model Claude Code does not know is assumed to have a 200K window.
- **A fast hook.** An incremental decider behind a small background
  process. Fed transcripts in random chunks, the live path made the same
  31,902 decisions as replay; cold start was about 21 ms on a quiet
  machine.

The data, task packs and runners are private, the samples are small, and
the programme ran over two days. `stale-5` and the comparator verdicts are
not worth reusing as deciders.

## Research commands

These need the private evidence, named in an untracked `quench.local.json`.

```sh
npm run check
node src/cli-data.ts                          # Q0: rebuild results/manifest.json and labels.json
node src/cli-score.ts --decider oracle        # Q1: score a decider (oracle, always-continue, ...)
node src/cli-score.ts --decider always-continue --cold 30
node src/cli-live-check.ts                    # the live path decides exactly as replay
node src/cli-hook-sim.ts --limit 12           # drive the real hook over recorded sessions
```

```json
{
 "acceptance": "<dir of <task>.json with requiredEvidence>",
 "out": "results",
 "runs": [{ "label": "v1", "dir": "<evidence dir>", "exclude": ["invalid-runs"] }]
}
```

Evidence directories hold one cell per session: `receipt.json` (task, arm,
accepted), `executor.prompt.txt` and `executor.stream.jsonl`. Recorded
evidence stays private and outside this repository; `results/` is
untracked.

### The Q6 stop-hint hook (research record, not for use)

`bin/quench-hook.mjs` is a Claude Code `PostToolUse` hook running the frozen
held-out decider. The first call in a session decides in process and starts a
small background process that keeps the decider in memory, reads only the new
bytes of the transcript on each later call, and exits after 30 idle minutes.
When the decider says stop, the hook adds one hint to the agent's context,
once per session. `QUENCH_HINT=off` logs the hint it would have given and
prints nothing (the control arm). Decisions and hints are logged to
`$QUENCH_STATE_DIR` (default: the system temporary directory). It saved 1.0%
in Q6 and is kept only so that result can be reproduced.
