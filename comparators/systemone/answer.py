"""Ask any System One compatible server (POST /v1/systemone) the same fixed yes/no question
Laya and Open-Jev were asked, for every snapshot. Standard library only; the server runs locally.

Used for Kev (github.com/jaredpalmer/kev, Apache-2.0), which serves this API. It would also fit
Jev's own API if that became available; it is not Jev.

Usage: python answer.py <base-url> <model> <snapshots.jsonl> <answers.jsonl>
Resumes: snapshots already in <answers.jsonl> are skipped.
"""
import json
import os
import sys
import time
import urllib.request

INSTRUCTIONS = "Has the coding agent already gathered enough evidence from the repository to write its final answer, so that further tool calls are unnecessary?"

base, model, snapshots, answers = sys.argv[1:5]
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
        body = json.dumps({"model": model, "state": {"body": row["snapshot"]},
                           "questions": {"enough_evidence": {"type": "noul", "instructions": INSTRUCTIONS}}}).encode()
        request = urllib.request.Request(f"{base}/v1/systemone", data=body, headers={"content-type": "application/json"})
        with urllib.request.urlopen(request, timeout=300) as response:
            p = json.loads(response.read())["answers"]["enough_evidence"]["noul"]
        out.write(json.dumps({"key": row["key"], "p": float(p)}) + "\n")
        out.flush()
        asked += 1
        if asked % 100 == 0:
            print(asked, "answered", round(time.time() - started, 1), "s", file=sys.stderr)
print("done", asked, "asked", round(time.time() - started, 1), "s", file=sys.stderr)
