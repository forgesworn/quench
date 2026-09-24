# Quench development

Quench reports where a coding agent's spend goes and applies the setting
changes the evidence supports. The stop-decider research is its record
(`docs/RESEARCH.md`). Label every figure by how it is known (measured,
counted, or modelled from prices) and claim nothing a benchmark has not
measured.

- Strict TypeScript on Node from `.nvmrc`, run directly with type stripping;
  `npm run check` (typecheck and tests) is the gate.
- Decisions must meet the latency budgets in `GOALS.md`; no model on the hot path.
- Stay independent of Context: read its signals from transcripts, never import it.
- Deterministic code first. A model decider is added only when a rule falls
  short on the offline benchmark (`docs/BENCHMARK.md`).
- Jev and Laya are benchmark comparators only; never adopt or embed them.
  Confirm cost with the owner before any hosted run.
- Recorded sessions and evidence stay outside this repository; commit only
  code, tests, fixtures you wrote and non-sensitive summaries.
- Report premature stops alongside savings, per arm and per task.
