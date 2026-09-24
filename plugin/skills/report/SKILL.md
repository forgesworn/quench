---
name: report
description: Show where the user's Claude Code and Codex spend goes and apply Quench's ranked actions. Use when the user asks about their usage, cost, limits or spend, or runs /quench:report.
---

# Quench

1. Run `quench report` with the Bash tool. It reads the local transcripts and prints aggregates only.
2. Lead with the **Actions** section: for each, give the saving, the evidence label and the "Do it" command.
   Keep the report's own caveats (for example, "quality not measured").
3. Never apply a change on your own. When the user agrees to one, run `quench apply <action>` to show the change,
   then `quench apply <action> --yes` only after they confirm. Tell them `quench undo <action> --yes` reverses it.
4. If an action is already applied, the report's **Applied** section compares spend before and after; report
   what it shows, including when it shows no change.

The break guard runs as this plugin's hook. It is on by default and can be turned off under this plugin in
`/config`. Do not also run `quench apply break-guard`, which would add a second copy.
