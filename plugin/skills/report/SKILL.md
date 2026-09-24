---
name: report
description: Show where the user's Claude Code and Codex spend goes and what Quench's evidence says they could change. Use when the user asks about their usage, cost, limits or spend, or runs /quench:report.
---

# Quench

1. Run `quench report` with the Bash tool. It reads the local transcripts and prints aggregates only; on a long
   history it can take a minute.
2. Lead with the **Actions** section: for each, give the figure, the evidence label and the "Do it" line.
   Keep the report's own caveats: savings are modelled from list prices ("up to", "quality not measured"), and on
   a subscription the dollar figures are not the user's bill.
3. Never apply a change on your own. When the user agrees to `subagent-model`, run
   `quench apply subagent-model` to show the change, then `quench apply subagent-model --yes` only after they
   confirm. Tell them `quench undo subagent-model --yes` reverses it.
4. The break guard is this plugin's own hook and is off by default. If the user wants it, tell them to turn on
   break_guard under the Quench plugin in `/config`. Never run `quench apply break-guard` from the plugin.
5. If something was applied, the **Since applied** section shows whether it took effect. Report what it shows,
   including no change, and do not present it as a measured saving.
