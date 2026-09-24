# Quench goals

Updated 23 September 2026. Quench set out to decide, at each decision point
of a coding agent's session, whether to **stop** gathering evidence or
**continue**. Q5 and Q6 showed that a stop saves little: agents already stop
gathering near the right point, and they ignore a stop hint. The cost of a
coding agent sits in long sessions that resend very large contexts. From Q7
on, Quench measures that cost from local transcripts and decides when a
session should compact. The stop decider and its harness stay as the record
of what was tried.

This is a private, experimental project. No goal below is met until its
evidence is recorded in `docs/EVIDENCE.md` against a named commit. Claim only
what the benchmark measured.

## Starting point

- `quench-labels` marks every decision point of a recorded session as
  sufficient (all declared required evidence already appeared in tool
  results) or not. It uses no model.
- Recorded Context sessions give the headroom: 117 sessions from the Context
  experiments, with declared required evidence. In every arm, roughly half of
  each session's decision points come after sufficiency (median share: plain
  0.57, Graphify 0.40, Context 0.47). This is an upper bound: writing the answer
  and running tests still have to happen after a correct stop.
- The recorded tasks were used to tune Context. Offline results on them need
  confirming on held-out tasks (Q5) before any claim.

## Rules for every goal

- Deterministic code first. Add a model only where a rule measurably falls
  short on the same benchmark.
- A decider sees only what exists at run time: the task prompt, the transcript
  so far and tool outputs. It must never read the declared required evidence,
  the reviewer rubric or the outcome. Test for this leakage explicitly.
- Fix each decision rule and threshold in a committed file **before** scoring
  it, and record every scored variant, including the ones that failed.
- Report per arm and per task, with runs side by side, never pooled across
  arms. Report premature stops next to savings, never savings alone.
- Jev and Laya are benchmark comparators only. They are never adopted,
  embedded or depended on.
- No hosted model or executor spend without the owner's approval of a stated
  estimate. Log failed attempts; never retry a provider refusal or work round
  a spending hold.
- Recorded sessions stay outside the repository. Point at them with an
  untracked `quench.local.json` (see Q0). Commit code, tests, fixtures you
  wrote and non-sensitive summaries only.

## Speed and language

Decisions must be ultra fast. Each agent turn is a model call of seconds, so
the decider must never be noticeable next to it:

- **In process:** p99 under 1 ms per decision, p50 under 0.1 ms, measured by
  the Q1 harness on the recorded sessions.
- **Cold start:** under 30 ms from process start to first decision, for a
  per-turn hook.
- **Incremental:** the decider keeps state and processes only new events, so
  a decision costs the same at turn 5 and turn 80. It never re-parses the
  whole transcript.
- **No model on the hot path:** a deterministic rule decides every turn. A
  model (Q3) may only run off the critical path at rare, ambiguous points and
  never blocks a turn.

Quench is strict TypeScript on Node 24, like most of the ForgeSworn ecosystem,
running `.ts` directly with Node's type stripping (`erasableSyntaxOnly`).
Move the decision core to Rust only if measurement misses these budgets; the
replay harness and labels stay in TypeScript either way.

## Relationship to Context

Quench and Context stay independent: neither imports the other. Quench reads
agent transcripts, whatever tools produced them (plain shell, Graphify,
Context), so it can help any agent and be compared across tool arms. Context
remains a deterministic, no-network navigation server; a decider does not
belong inside it. When Context is present, Quench may use its signals as they
appear in tool results (explore, packet and coverage output), parsed from the
transcript rather than through a code dependency. Context's experiments may
use Quench labels as a development tool; its packages do not depend on
Quench.

## Model and effort assignments

| Work | Assignment |
| --- | --- |
| Data, labels, replay, scoring, rules | Deterministic code; DeepSeek Flash with thinking off for routine implementation against a written contract |
| Typed model decider (Q3) | DeepSeek Flash, thinking off, structured output; DeepSeek Pro only if Flash is measured inadequate |
| Protocol locks, leakage review and acceptance of results | A frontier reviewer at high effort, in a separate session from the one that built the decider |

## Goals

### Q0: A frozen, reproducible data set

Build a manifest of the recorded sessions Quench uses: run label, task, arm,
executor model, accepted, and a SHA-256 of each stream and receipt.
`quench.local.json` (untracked, added to `.gitignore`) maps run labels to local
evidence directories and the task acceptance directory. Include the Context
0.4.0 screen (`20260923-screen-pro-040`) once it completes.

**Done when:** one command rebuilds the manifest and the labels with
byte-identical output on a second run; `docs/EVIDENCE.md` records the counts
per run, arm and task, and the manifest digest. Sessions without declared
evidence (code-change tasks) are listed as unlabelled, not dropped silently.

### Q1: A scoring harness with bounds

Replay each labelled session point by point through an incremental decider
interface: `observe(event)` for each new stream event, then
`decide() -> { decision: 'stop' | 'continue', reason }` at each decision point.
The first `stop` ends the session. Score:

- **premature-stop rate**: sessions stopped at a point that was not
  sufficient;
- **saved**: decision points, tool calls and result bytes after the stop,
  minus the finishing steps a stop still requires (the answer write and any
  test run the recorded session made after its last evidence read);
- **late**: points between the first sufficient point and the stop.

Implement two reference deciders: *always continue* (the recorded behaviour)
and *oracle* (stop at the first sufficient point; it reads labels and exists
only as a bound).

The harness also times every `decide()` call and reports p50 and p99, and a
separate cold-start measurement.

**Done when:** tests cover replay, finishing-step accounting and both bounds;
the harness reports oracle savings and a 0% premature-stop rate, and always
continue reports 0 saved, per arm and task; decision latency is reported.

### Q2: A deterministic decider

Write rules over run-time signals only, for example:

- every identifier named in the task prompt has had its declaration and at
  least one test file returned;
- the last *k* tool results added no new file;
- a coverage check (where the arm has one) reports nothing missing.

Lock the acceptance thresholds before scoring:

- premature-stop rate at most 5% of sessions in every arm;
- median saved decision points at least 20% of the recorded session;
- decision latency within the budgets in "Speed and language".

**Done when:** a leakage test proves the decider cannot see labels, required
evidence or outcomes; every rule variant scored is listed in
`docs/EVIDENCE.md` with its metrics; the best variant either meets the
thresholds or the failure is recorded with the cause.

### Q3: A typed model decider (only if Q2 falls short)

Give a small model the task prompt and a bounded summary of the transcript
so far (tool names, files touched, excerpts capped by size). It returns
`{ decision, missing: string[] }` against a schema. Count the decider's own
tokens as cost, and score it on the same harness and thresholds as Q2.

**Done when:** it beats the best Q2 rule on saved points at no worse a
premature-stop rate, net of its own tokens, or the attempt is recorded as not
useful. Estimate the cost for the owner before running it on all sessions.

### Q4: Jev and Laya as comparators

Establish how each can be run (local or hosted) and at what cost; put the
estimate to the owner before any paid run. Build thin adapters behind the Q1
interface, isolated in `comparators/` with no import from Quench's decider
code, and run them on identical snapshots.

**Done when:** each comparator is scored on the same sessions and metrics as
Quench, or the reason it could not be (unavailable, licence, cost declined) is
recorded. Nothing from either is embedded in Quench.

### Q5: Held-out tasks

Write at least six new tasks on at least two repositories outside the
ForgeSworn ecosystem: orientation, diagnosis, impact and code change, each
with declared required evidence and a deterministic checker where possible.
A session that does not build or tune the decider writes and hashes them.
Recording sessions for them needs executor runs; estimate the cost and get
approval first (DeepSeek V4 Pro through the local route is the default
executor).

**Done when:** the tasks are locked and hashed, sessions are recorded, and
the Q2 or Q3 decider is scored on them without any change after it has seen
them. The decider, measures and pass rule are locked in
[docs/HELDOUT.md](docs/HELDOUT.md); the brief for the task-writing session is
[docs/HANDOFF-Q5.md](docs/HANDOFF-Q5.md).

### Q6: The online check

Put the decider into a live session: a stop hint delivered through a Claude
Code hook or a small MCP tool. Run a locked protocol on the held-out tasks
with the hint on and off, the same executor and repeated runs, and measure
executor input, turns and acceptance.

**Done when:** a prospectively locked rule is met, for example at least 20%
lower median input with no fewer accepted tasks, or the result is recorded as
not met, with the per-task spread. The locked rule is in
[docs/ONLINE.md](docs/ONLINE.md).

### Q7: Ship what the evidence supports

Q6 did not pass, so the stop hint is not packaged. What is shipped instead:

1. **`quench report`**: reads the local transcripts of Claude Code and
   Codex and reports where the spend goes (cache reads, writes, output,
   subagents, session length, context size) and what compacting at each
   window would have saved, as an upper bound. It prints aggregates only:
   no content, no project names, no paths.
2. **A compaction policy**, after Q8: the window setting if Q8 rule 1 alone
   is met, or a boundary-aware trigger if rules 1 and 2 are met (Q9).
3. **A release** as an npm package and a Claude Code plugin, through the
   authorised process only and with the owner's go-ahead.

**Status (24 September 2026):** built and tested, not published. `quench`
reports ranked actions priced at list prices, applies and undoes the two
setting changes (`subagent-model`, `break-guard`) with a backup, measures
spend before and after a change, and ships as a Claude Code plugin
(validated, loaded in a live session). Publishing waits for the owner.

**Done when:** `quench report` is tested (parsers, pricing, simulation, and a
test that no transcript content or project name reaches the output), runs
on both agents' transcripts, reproduces the Q8 motivation figures, and its
README states what it measures and what it does not. A saving is claimed
only once Q8 measures the quality cost.

### Q8: When to compact a long session

Q6 showed that a stop hint captures almost nothing: agents already stop
gathering near the right point, and they ignore the hint. The cost is
elsewhere. On the owner's own Claude Code sessions (30 days, aggregate only),
80% of main-session cost sits in sessions of more than 300 requests, 78% in
requests sent with more than 200K tokens of context, and 68% is cache reads of
context sent again. Simulated on those sessions, compacting earlier would cut
cost by up to about 29% (at 400K) or 45% (at 200K) if the agent behaved the
same. That is an upper bound. Whether the agent then needs work done again
or loses quality is the question.

Measure it on dependent multi-step chains written by a fresh session, with
deterministic checkers per step. Compare three policies in one agent session
per chain: carry everything, compact at a fixed window, and compact at every
step boundary. Price cost with published cache and output multipliers, not
raw tokens.

**Status (24 September 2026): not met**, recorded in `docs/EVIDENCE.md`.
Up to about 110K of context, boundary compaction cost 16% more than
carrying the session and lost 7 of 36 accepted steps; the chains disagreed.
The 200K+ regime is untested.

**Done when:** the protocol in [docs/CHAINS.md](docs/CHAINS.md) is locked
before any counted run, the runs are recorded, and the result is written up
with per-chain and per-step spread. It must say whether a boundary-aware
trigger (a Quench decider) is worth building over the plain window setting.

### Q9: A boundary-aware compaction trigger (only if Q8 rules 1 and 2 are met)

Decide, from what exists at run time, when a session has reached a task
boundary and should compact. Deliver it where it can act:

- **Headless and SDK runs:** the harness compacts itself, as the Q8 runner
  does.
- **Interactive Claude Code:** no hook can start a compaction, but a
  `PreCompact` hook can block a proactive auto-compaction, and Claude Code
  then carries on uncompacted (hooks reference, read 24 September 2026).
  So the user sets a small auto-compact window and the Quench hook lets a
  compaction through only at a boundary. Candidate signals: the first
  request after a new user prompt, and a session resumed after its prompt
  cache expired, when the whole context is written again anyway.

**Done when:** the trigger is locked before scoring, beats the window
setting on fresh chains under a locked protocol, and meets the latency
budgets above.

## Order and handoff

Q0, Q1, Q2 in order, then Q3 only if needed. Q4 can start once Q1 exists. Q5
can be prepared alongside Q2 by a separate session. Q6 waits for Q5 and a
passing offline decider. Q7's report can ship before Q8 ends; its
compaction policy waits for Q8, and Q9 waits for Q8's rules 1 and 2. Each
handoff names the goal, starting commit, allowed files, model and effort,
and acceptance checks. The receiver returns the diff, checks and evidence
entry.
