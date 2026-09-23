# Quench development

Quench decides when a coding agent has gathered enough evidence to stop. It is
private and experimental; claim nothing that the benchmark has not measured.

- Node from `.nvmrc`; `npm run check` is the gate.
- Deterministic code first. A model decider is added only when a rule falls
  short on the offline benchmark (`docs/BENCHMARK.md`).
- Jev and Laya are benchmark comparators only; never adopt or embed them.
  Confirm cost with the owner before any hosted run.
- Recorded sessions and evidence stay outside this repository; commit only
  code, tests, fixtures you wrote and non-sensitive summaries.
- Report premature stops alongside savings, per arm and per task.
