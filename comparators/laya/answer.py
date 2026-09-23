"""Ask Laya one fixed yes/no question for every snapshot. Local, no network after the model download.

Usage: python answer.py <snapshots.jsonl> <answers.jsonl>
"""
import json
import sys
import time

from laya import Router

QUESTION = {
    "enough_evidence": {
        "type": "noul",
        "instructions": "Has the coding agent already gathered enough evidence from the repository to write its final answer, so that further tool calls are unnecessary?",
    }
}

router = Router(model="english", preload=True)
started = time.time()
with open(sys.argv[1]) as src, open(sys.argv[2], "w") as out:
    for n, line in enumerate(src, 1):
        row = json.loads(line)
        result = router.predict({"body": row["snapshot"]}, QUESTION)
        out.write(json.dumps({"key": row["key"], "p": float(result["answers"]["enough_evidence"]["noul"])}) + "\n")
        if n % 200 == 0:
            print(n, "answered", round(time.time() - started, 1), "s", file=sys.stderr)
print("done", round(time.time() - started, 1), "s", file=sys.stderr)
