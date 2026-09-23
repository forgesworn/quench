# Online protocol (Q6)

Locked 23 September 2026, before any held-out task was written. It runs only
if Q5 is met under `docs/HELDOUT.md`, and only after the owner approves the
estimate below. Nothing here changes once a held-out session has been seen.

## Question

Does a live stop hint from the frozen held-out decider lower what an agent
spends, without losing accepted answers?

## Design

- **Tasks and executor:** the Q5 held-out tasks and executor (DeepSeek V4 Pro
  through the local route), with the recording harness and settings used for
  Q5.
- **Hook:** `bin/quench-hook.mjs` as a `PostToolUse` hook in both conditions,
  so the conditions differ only in whether the hint reaches the agent:
  - **on:** `QUENCH_HINT=on`, one hint per session when the decider says stop;
  - **off:** `QUENCH_HINT=off`, the hint is logged and withheld.
  The hook code's commit and file hashes are recorded before the first
  session.
- **Arms:** the arms Q5 recorded (plain and Context at minimum).
- **Repetitions and order:** three repetitions per task, arm and condition.
  Conditions alternate within each task, and the first condition alternates
  between repetitions.
- **Failures:** a session that fails to run is logged and rerun once. A
  session that runs and gives a wrong answer is kept.

## Pass rule

Per arm:

1. **Cost:** total executor input (fresh plus cached prefix, as in the Q1
   harness) with the hint on is at least 20% lower than with it off.
2. **Quality:** accepted sessions with the hint on are no fewer than with it
   off.

Q6 is met when every arm passes both.

Total input is the measure because, on the development set, the decider acts
almost only on long sessions (`docs/EVIDENCE.md`, Q1 amendment 2). A median
over sessions would not see that, whatever happened.

Also reported: per-task medians and spread; turns, tool calls and wall time;
the hint's delivery lag (logged `at` minus `stopAt`); and how many decision
points each agent took after the hint before its last read.

## Estimate (for the owner, before any run)

From the Pro development sessions (mean 0.61M input, 25K output and 214 s
per session):

| Plan | New sessions | Executor input | Output | Sequential time |
| --- | ---: | ---: | ---: | ---: |
| 8 tasks, 2 arms, on and off, 3 repetitions | 96 | about 58M | about 2.4M | about 5.7 h |
| As above, reusing Q5's hook-off recordings as the off condition | 48 | about 29M | about 1.2M | about 2.9 h |

The second plan is cheaper but weaker, because its conditions are not
interleaved in time. It is valid only if Q5 records with the hook installed
in off mode. That setting costs nothing extra and also checks, on held-out
sessions, that the live decisions match replay.

The structured tasks have deterministic checkers, so no reviewer model is
needed. The local route's actual charge depends on the owner's plan.

## Prerequisite

The recording harness has to install the hook in the executor's Claude Code
settings and set `QUENCH_HINT` and `QUENCH_STATE_DIR` per session, keeping
each session's hook log with its receipt. That change belongs to the harness
owner's repository and is not made from here.
