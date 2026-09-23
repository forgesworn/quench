# Handoff: Q5 held-out tasks

For a session that has not built or tuned the Quench decider. Read this
brief and `GOALS.md` (Q5 section) only. Do not read `src/`, `test/`,
`results/`, `docs/EVIDENCE.md` or `docs/HELDOUT.md`: the tasks must not be
shaped by the decider's rules or scores.

## Goal

Write at least eight new tasks on at least two repositories outside the
ForgeSworn ecosystem, lock and hash them, and prove each checker. Record no
sessions: recording needs the owner's approval of the estimate below.

## Starting point

- Quench commit: the one that adds this file (see `git log -- docs/HANDOFF-Q5.md`).
- Task format: follow the D5 protocol in the Context repository
  (`docs/experiments/d5-20260921/`): a task file with the prompt, selection
  policy and answer schema, an acceptance file with `requiredEvidence`
  (`path` plus a verbatim `token`), a deterministic checker, and a reference
  solution that proves the checker before the lock. The recording harness is
  `docs/experiments/graphify-20260922/run.mjs`, driven by a protocol directory;
  `docs/experiments/screen-pro-040-20260923/` shows a minimal protocol.
- Put the new protocol directory in private storage outside the Quench
  repository. Commit only its hashes to Quench.

## Tasks

- Two or more repositories outside ForgeSworn, with permissive licences,
  pinned to a revision and prepared from `git archive`. Choose repositories
  of realistic size where answering needs several files.
- On each repository: one orientation, one diagnosis (with a seeded fault),
  one impact and one code-change task.
- Every task declares its required evidence, the code-change tasks included:
  the lines a correct answer must have read. Declare what the task needs,
  not what a particular agent would read.
- Deterministic checkers wherever possible; the code-change checkers run
  focused tests.

## Model and effort

Task design, the lock and the review of each checker: a frontier model at
high effort. Routine harness work against this brief: DeepSeek Flash with
thinking off.

## Acceptance checks

The receiver returns:

1. The protocol directory's file list with SHA-256 of every task,
   acceptance file and checker, and a lock verifier that checks them.
2. For each task, the reference solution passing its checker and a trivial
   wrong answer failing it, with the output.
3. The repositories, revisions and `git archive` digests.
4. Any setup the Context and Graphify arms need on these repositories, and
   whether Graphify is feasible.
5. No executor session run.

## Recording estimate (for the owner, before any run)

From the 72 DeepSeek V4 Pro sessions of the development set: mean executor
input 0.61M tokens per session (median 0.31M; the long tail matters), mean
output 25K, mean 214 s (longest 45 minutes). The structured tasks are
accepted by deterministic checkers, so no reviewer model is needed.

| Plan | Sessions | Executor input | Output | Sequential time |
| --- | ---: | ---: | ---: | ---: |
| 8 tasks, plain and Context, 3 repetitions | 48 | about 29M | about 1.2M | about 2.9 h |
| 8 tasks, plain, Graphify and Context, 3 repetitions | 72 | about 44M | about 1.8M | about 4.3 h |

The local route's actual charge depends on the owner's plan. Claude Code's
own cost field for these sessions reports a basis of "unknown" (it showed a
nominal $154 for the 72 development sessions), so it is not a price. The
Context and Graphify index builds are local and free.
