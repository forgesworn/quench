# Offline stop benchmark

## Question

At each decision point of a recorded session, should the agent stop?

## Data

Recorded Context experiment sessions (Claude Code stream-json) with task
acceptance files that declare required evidence tokens. A decision point
follows each batch of tool results. Tokens a tool prints in its own metadata
(`local-source-unsigned`) are excluded.

## Labels

A point is **sufficient** when every required token has appeared in some tool
result up to and including it. Labels are model-free and only as good as the
declared evidence: a token can appear in a listing the agent never read
closely, and a task may need evidence the declaration omits.

## Scoring a decider

Replay each session and ask the decider at every point. Its first "stop" ends
the session there.

- **Premature stop**: stopping at a point that is not sufficient. This is the
  failure that matters; report the rate per session.
- **Saved**: decision points, tool calls and result bytes after the stop point,
  against the recorded session.
- **Late**: points between the first sufficient point and the decider's stop.

A decider is useful only if it saves points with a premature-stop rate near
zero. Report per arm and per task, with sessions from different runs side by
side, never pooled for comparison between arms.

## Deciders

1. Always continue (the recorded behaviour) and an oracle (stop at the first
   sufficient point) bound the range.
2. Deterministic rules over run-time signals only.
3. A small typed model given the task prompt and a bounded summary of the
   transcript so far.
4. Jev and Laya on identical inputs, as comparators only. Check local
   availability and any hosted cost before running them; hosted runs need the
   owner's approval.

## Caveats

The recorded tasks were used to tune Context, so offline results need
confirming on held-out tasks in repositories outside this ecosystem before any
claim.
