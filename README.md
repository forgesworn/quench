# Quench

Decide when a coding agent has gathered enough evidence to stop.

In smithing, quenching is the moment you judge the work is done and stop
heating. Quench answers the same question for an agent at each decision point:
**stop, or call another tool?** Agent cost follows turns, because every turn
resends the conversation, so a correct early stop is the cheapest saving
available.

Private and experimental. Nothing here is a released product or a measured
saving yet. On the recorded development set, the best safe rule saves executor
input only on sessions that run long; the held-out test
([protocol](docs/HELDOUT.md)) has not run.

## Why

Recorded sessions from the [Context](https://github.com/forgesworn/context)
retrieval experiments (117 sessions with declared required evidence, three
tool arms, Sonnet and DeepSeek executors) show that in every arm roughly half
of a session's decision points come **after** all required evidence had
already appeared in tool results (median share: plain 0.57, Graphify 0.40,
Context 0.47). That is an upper bound on what stopping could save; some later
steps are necessary (writing the answer, running tests).

## Plan

1. **Labels** (done): `quench-labels` turns recorded sessions into per-point
   labels, "stop was already correct here" or "not yet", with no model.
2. **Deterministic decider**: a rule over signals available at run time (for
   example, every explored symbol has its definition and a test fetched).
3. **Typed model decider**: a small model returning a structured choice, only
   if the rule falls short.
4. **Baselines**: Jev and Laya run on the same snapshots as benchmark
   comparators only; they are not adopted or embedded.
5. **Online check**: an executor run with the decider switched on, on held-out
   tasks, only if the offline benchmark shows savings without premature stops.

See [the goals](GOALS.md) and [the benchmark design](docs/BENCHMARK.md).

## Use

```sh
npm run check
node src/cli-data.ts                          # Q0: rebuild results/manifest.json and labels.json
node src/cli-score.ts --decider oracle        # Q1: score a decider (oracle, always-continue, ...)
node src/cli-score.ts --decider always-continue --cold 30
node src/cli-live-check.ts                    # the live path decides exactly as replay
node src/cli-hook-sim.ts --limit 12           # drive the real hook over recorded sessions
```

### Hook (for the Q6 online check)

`bin/quench-hook.mjs` is a Claude Code `PostToolUse` hook running the frozen
held-out decider. The first call in a session decides in process and starts a
small background process that keeps the decider in memory, reads only the new
bytes of the transcript on each later call, and exits after 30 idle minutes.
When the decider says stop, the hook adds one hint to the agent's context,
once per session. `QUENCH_HINT=off` logs the hint it would have given and
prints nothing (the control arm). Decisions and hints are logged to
`$QUENCH_STATE_DIR` (default: the system temporary directory).

```json
{ "hooks": { "PostToolUse": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node <quench>/bin/quench-hook.mjs" }] }] } }
```

`quench.local.json` (untracked) points at the private evidence:

```json
{
 "acceptance": "<dir of <task>.json with requiredEvidence>",
 "out": "results",
 "runs": [{ "label": "v1", "dir": "<evidence dir>", "exclude": ["invalid-runs"] }]
}
```

Evidence directories hold one cell per session: `receipt.json` (task, arm,
accepted), `executor.prompt.txt` and `executor.stream.jsonl`. Recorded evidence
stays private and outside this repository; `results/` is untracked.
