# Quench

See where your coding agent's spend goes, and when a session should
compact.

In smithing, quenching is the moment you judge the work is done and stop
heating. Quench began as a stop decider for coding agents: at each decision
point, stop gathering evidence or call another tool? Measured on held-out
tasks and live sessions, a stop saves little. Agents already stop gathering
near the right point, and they ignore a hint to stop
([evidence](docs/EVIDENCE.md), Q5 and Q6). The cost is elsewhere: in long
sessions that resend very large contexts. Quench now measures that cost.
It also tested compacting at task boundaries (Q8): in sessions up to about
110K of context, that cost 16% more and lost accepted steps, so no
compaction policy is recommended. Sessions above 200K were not tested.

Private and experimental. No saving is claimed until the benchmark has
measured it.

## Use

As a Claude Code plugin (the break guard is on by default and can be turned
off under the plugin in `/config`):

```sh
/plugin marketplace add forgesworn/quench
/plugin install quench@quench
/quench:report
```

Or from the command line, in a clone (Node 24):

```sh
node src/cli.ts                               # the report: ranked actions from your transcripts
node src/cli.ts report --agent claude --days 7 --json
node src/cli.ts apply subagent-model          # shows the change; add --yes to make it
node src/cli.ts apply break-guard --yes       # the break guard as a hook in ~/.claude/settings.json
node src/cli.ts undo subagent-model --yes     # puts it back (every change is backed up first)
```

After a change, the report's **Applied** section compares spend since the
change with spend before it, so a saving is measured rather than assumed.

### The report

It reads the transcripts Claude Code (`~/.claude/projects`) and Codex
(`~/.codex/sessions`) keep on your machine, and prints:

- **Actions**, ranked by what they would save, each sized from your own
  transcripts and labelled by how far it is known to hold (measured on
  your transcripts, tested by Quench, or price arithmetic only). For
  example: run subagents on Sonnet 5 unless the task needs more; start new
  work in a fresh session after a break longer than the prompt cache
  lasts; do not lower effort or shrink the compaction window to save money.
- **the break guard**: after a break longer than the prompt cache lasts,
  the first prompt to a session of 100K tokens or more is held once, with
  what sending it will cost. Run `/clear` for new work, or send it again to
  carry on;
- where the cost went: cache reads, writes and output, subagents, models,
  session length and the context size each request sent;
- the compactions your sessions already made, and what compacting at a
  smaller window would have cost, modelled request by request.

What it does not do:

- It prints aggregates only: no transcript content, project names or paths,
  and nothing leaves the machine. A test checks this.
- Claude Code is priced at Anthropic's API list prices per model (read 24
  September 2026). A subscription pays a flat fee, but its limits follow
  the same token costs. Codex is reported in base-input units with assumed
  multipliers (cached input 0.1×, output 8×), since no price is known for
  its models.
- A suggested saving assumes the same tokens: switching a subagent's model
  or starting fresh may change how much work the agent does, and the
  quality of a model switch is not measured.
- The compaction figures are an upper bound. They assume the agent works
  as well after compacting, and the model leaves out cache expiries (it is
  compared with the same model of the session as recorded). In Q8 the
  agent did not work as well after compacting, in sessions up to about
  110K ([protocol](docs/CHAINS.md), [verdict](docs/EVIDENCE.md)).
- Transcripts are chosen by file modification time.

## Research: the stop decider

### Why

Recorded sessions from the [Context](https://github.com/forgesworn/context)
retrieval experiments (117 sessions with declared required evidence, three
tool arms, Sonnet and DeepSeek executors) show that in every arm roughly half
of a session's decision points come **after** all required evidence had
already appeared in tool results (median share: plain 0.57, Graphify 0.40,
Context 0.47). That is an upper bound on what stopping could save; some later
steps are necessary (writing the answer, running tests).

### What it found

1. **Labels:** `quench-labels` marks each decision point as sufficient or
   not, with no model.
2. **Deterministic decider:** the frozen rule `stale-5` saved 41–47% of
   executor input on held-out tasks under replay, but it lost evidence in 2
   of 72 sessions (Q5, not met).
3. **Comparators:** Laya, Open-Jev, Kev and Von, run on the same snapshots,
   either rarely stop or lose evidence in a third or more of the sessions
   (Q4). Jev could not be run.
4. **Live check:** a stop hint cut input by 1.0% and the agent ignored it
   (Q6, not met). Most of what replay counted as saved was work the agent
   still had to do; on the Context arm, the pure gathering left after the
   stop was 0.3–2.6% of input.

See [the goals](GOALS.md) and [the benchmark design](docs/BENCHMARK.md).

### Research commands

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

## Licence

MIT
