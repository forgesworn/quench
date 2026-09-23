"""Ask Open-Jev the same fixed yes/no question Laya was asked, for every snapshot. Local only.

Open-Jev (https://github.com/Zefan-Cai/Open-Jev, MIT) is independent research
inspired by TypeSafe's Jev; it is not Jev. Run from an Open-Jev checkout at the
pinned commit, with its `[train]` dependencies, against a downloaded model package.

Usage: python answer.py <checkpoint-dir> <snapshots.jsonl> <answers.jsonl> [device]
Resumes: snapshots already in <answers.jsonl> are skipped.
"""
import json
import os
import sys
import time
from pathlib import Path

import torch
from jev.api import compile_request, format_response
from jev.metrics import softmax
from jev.model import DecisionModel

QUESTION = {
    "enough_evidence": {
        "type": "noul",
        "instructions": "Has the coding agent already gathered enough evidence from the repository to write its final answer, so that further tool calls are unnecessary?",
    }
}

checkpoint, snapshots, answers = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
device = sys.argv[4] if len(sys.argv) > 4 else ("mps" if torch.backends.mps.is_available() else "cpu")
temperature = json.loads((checkpoint / "temperature.json").read_text())["temperature"]
model = DecisionModel.load(checkpoint, device=device)
done = set()
if os.path.exists(answers):
    with open(answers) as prior:
        done = {json.loads(line)["key"] for line in prior if line.strip()}
started = time.time()
asked = 0
with open(snapshots) as src, open(answers, "a") as out, torch.inference_mode():
    for line in src:
        row = json.loads(line)
        if row["key"] in done:
            continue
        records = compile_request({"body": row["snapshot"]}, QUESTION)
        logits = model(records)
        probs = [softmax(r.float().cpu().tolist(), temperature=temperature) for r in logits]
        p = format_response(records, probs)["answers"]["enough_evidence"]["noul"]
        out.write(json.dumps({"key": row["key"], "p": float(p)}) + "\n")
        out.flush()
        asked += 1
        if asked % 100 == 0:
            print(asked, "answered", round(time.time() - started, 1), "s", file=sys.stderr)
print("done", asked, "asked", round(time.time() - started, 1), "s on", device, file=sys.stderr)
