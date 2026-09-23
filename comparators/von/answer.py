"""Ask Von (github.com/xanomanox/von, Apache-2.0) the same fixed yes/no question Laya and
Open-Jev were asked, through von.judge, for every snapshot. Local only.

Usage: python answer.py <snapshots.jsonl> <answers.jsonl>
Resumes: snapshots already in <answers.jsonl> are skipped.
"""
import json
import os
import sys
import time

import von

INSTRUCTIONS = "Has the coding agent already gathered enough evidence from the repository to write its final answer, so that further tool calls are unnecessary?"

snapshots, answers = sys.argv[1:3]
done = set()
if os.path.exists(answers):
    with open(answers) as prior:
        done = {json.loads(line)["key"] for line in prior if line.strip()}
started, asked = time.time(), 0
with open(snapshots) as src, open(answers, "a") as out:
    for line in src:
        row = json.loads(line)
        if row["key"] in done:
            continue
        p = von.judge(state=row["snapshot"], instructions=INSTRUCTIONS)
        out.write(json.dumps({"key": row["key"], "p": float(p)}) + "\n")
        out.flush()
        asked += 1
        if asked % 100 == 0:
            print(asked, "answered", round(time.time() - started, 1), "s", file=sys.stderr)
print("done", asked, "asked", round(time.time() - started, 1), "s", file=sys.stderr)
