# Quench

See where your Claude Code and Codex spend goes, and what you could change.

Quench reads the transcripts Claude Code and Codex keep on your machine,
prices every request, and ranks the changes that could lower the cost. Each
figure says how far it is known to hold. Quench can make a suggested
change after showing it to you, and undo it.

Not yet published. Built and tested on one developer's transcripts; savings
are modelled from list prices, not measured by a controlled test.

## Example

The numbers are illustrative.

```text
Claude Code: 190 sessions, 360 subagent transcripts, 70,000 requests
  $4,200 at API list prices. On a subscription this is not your bill; it shows where the tokens went, priced alike.

  Actions
  1. Run general-purpose subagents on Sonnet 5 unless the task needs a stronger model (CLAUDE_CODE_SUBAGENT_MODEL=sonnet).
     General-purpose subagents on dearer models cost $800 (19%). The same tokens on Sonnet 5 would cost up to $480 (11%) less;
     Claude can still pick a stronger model for a task, and the quality of the switch is not measured.
     Do it: quench apply subagent-model
     Evidence: price arithmetic; quality not measured.
  2. After a break of more than an hour, start new work in a fresh session (/clear) instead of carrying on.
     90 times you came back to a session of 300K+ whose prompt cache had expired, so its whole context (median 450K) was written again.
     A fresh session writes only its 45K base prompt: up to $170 (4%) if every one of those was new work. Keep the session when you are continuing the same task.
     Do it: quench apply break-guard (holds the first prompt after such a break once, with its cost)
     Evidence: breaks counted on your transcripts; the saving assumes each began new work.

  Where the cost goes
    By kind: cache reads 64%, cache writes and fresh input 23%, output 14%; subagents 27%.
    By context size at the request:
      400K+       31% of requests   51% of session cost
```

## Install

As a Claude Code plugin:

```sh
/plugin marketplace add forgesworn/quench
/plugin install quench@quench
/quench:report
```

From a clone, on Node 24:

```sh
node src/cli.ts                               # the report
node src/cli.ts report --agent claude --days 7 --json
node src/cli.ts apply subagent-model          # shows the change; add --yes to make it
node src/cli.ts undo subagent-model --yes     # removes what apply wrote, and nothing else
node src/cli.ts apply break-guard --yes       # the break guard as a settings hook (not with the plugin)
```

Requirements:

- Claude Code 2.1.251 or later, where `CLAUDE_CODE_SUBAGENT_MODEL` is a
  default that an explicit model choice overrides; in earlier versions it
  overrode every subagent. The plugin's `/config` rows need 2.1.269.
  Tested with 2.1.281.
- Node 22 or later for the plugin; Node 24 to run from source.
- Codex rollout files under `~/.codex/sessions` (tested with Codex CLI
  0.155).
- Tested on macOS and Linux, not Windows.

## What the report shows

- **Actions**, each with a figure and a label saying how it is known:
  - general-purpose subagents on Sonnet 5 (price arithmetic; the setting
    does not reach Explore, Plan, forks or agents with their own model, and
    the quality of the switch is not measured);
  - a fresh session after a break (the breaks are counted; the saving
    assumes each began new work);
  - the share of cost that is thinking (measured; what lowering effort does
    to the number of tool calls is not).
- **Where the cost goes**: cache reads, writes and output; subagents;
  models; session length; the context size of each request; the
  compactions your sessions made.
- **Since applied**: whether an applied change took effect, and what the
  break guard did. It is a check, not a measured saving: the workload
  changes too.

Compaction gets no advice. In Quench's one test (DeepSeek V4 Pro, two task
chains, contexts up to about 110K), compacting at task boundaries cost 16%
more overall and accepted fewer steps, but the chains disagreed: 49% dearer
on one, 12% cheaper with two more steps accepted on the other. A fixed
100K window cost 3.6% more and accepted fewer steps. Nothing above 200K was
tested ([protocol](docs/CHAINS.md), [verdict](docs/EVIDENCE.md)).

## Changing settings

`quench apply <action>` shows the change and the file it edits; `--yes`
makes it. Each change:

- backs up the settings file beside itself (the newest three backups are
  kept) and replaces it atomically;
- is recorded in `~/.quench/state.json` with exactly what was written;
- is reversed by `quench undo <action> --yes`, which removes only that and
  leaves anything you have changed since.

It edits your user settings (`~/.claude/settings.json`, or the one under
`CLAUDE_CONFIG_DIR`). Project and managed settings take precedence over it.

## The break guard (optional, off by default)

After more than an hour away, a session's prompt cache has expired and the
next prompt writes the whole context again. The guard holds the first
prompt to a session of 300K tokens or more, once, and says what sending it
will cost:

> Quench: this session's prompt cache expired (last reply 3 hours ago), so
> this prompt will write its 455K-token context again (about $4.55 at list
> price). New task? Run /clear first, then send it. Same task? Send it again
> (copy it from above) and it goes through.

- Claude Code removes a held prompt from the input box. Its text is shown
  above the message, so you can copy it.
- In the plugin, turn on `break_guard` in `/config`; `guard_min_context`
  sets the threshold. Without the plugin, run `quench apply break-guard`.
- It holds once per break, only for Claude models using the prompt cache,
  and never in `claude -p` or SDK runs. `QUENCH_GUARD=off` turns it off
  anywhere.
- It adds tens of milliseconds to a prompt. If anything goes wrong, it lets
  the prompt through.

## Privacy

- **Read:** transcripts under `~/.claude/projects` (or `CLAUDE_CONFIG_DIR`)
  and `~/.codex/sessions`, the agent type from a subagent's `.meta.json`,
  and your Claude Code user settings.
- **Printed:** aggregates only. No transcript content, project names or
  paths, and a model name only if it is a Claude or OpenAI one. A test
  checks this against a fixture.
- **Written:**
  - `~/.quench/state.json`, the changes you applied;
  - `~/.quench/guard.log`, a time, context size, idle time and estimated
    cost per hold (no prompts, paths or session ids);
  - `~/.quench/guard/<session>.json`, one per held session, removed after
    seven days;
  - settings backups beside the settings file.
- The CLI makes no network calls. Through the plugin, the report's output
  becomes part of your Claude conversation, like any command's output.

## Uninstall

1. `quench undo subagent-model --yes` and `quench undo break-guard --yes`,
   for anything you applied.
2. `/plugin uninstall quench@quench`, if you use the plugin.
3. Remove `~/.quench`, and the `settings.json.quench-backup-*` files beside
   your settings.

## Limits

- Claude Code is priced at Anthropic's API list prices per model (read 24
  September 2026). Codex is reported in relative units (cached input 0.1×,
  output 8×), since no price is known for its models.
- A saving assumes the same tokens. A model switch or a fresh session may
  change how much work the agent does.
- Requests older than the window are left out by their timestamps.
- ccusage, `/cost` and `/usage` count tokens and cost. Quench ranks what to
  change, and can change it.

## Background

Quench began as a research programme on when a coding agent should stop
gathering evidence. A stop saved little and agents ignored a hint to stop;
the method and results are in [docs/RESEARCH.md](docs/RESEARCH.md), with
every run recorded in [docs/EVIDENCE.md](docs/EVIDENCE.md).

## Licence

MIT
