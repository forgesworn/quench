# Quench

Decide when a coding agent has gathered enough evidence to stop.

In smithing, quenching is the moment you judge the work is done and stop
heating. Quench answers the same question for an agent at each decision point:
**stop, or call another tool?** Agent cost follows turns, because every turn
resends the conversation, so a correct early stop is the cheapest saving
available.

Private and experimental. Nothing here is a released product or a measured
saving yet.

## Why

Recorded sessions from the [Context](https://github.com/forgesworn/context)
retrieval experiments (126 sessions with declared required evidence, three
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

See [the benchmark design](docs/BENCHMARK.md).

## Use

```sh
npm test
node src/cli-labels.mjs --acceptance <dir of task acceptance JSON> <label>=<evidence dir> [...]
```

Evidence directories hold one cell per session: `receipt.json` (task, arm,
accepted) and `executor.stream.jsonl`. Recorded evidence stays private and
outside this repository.
