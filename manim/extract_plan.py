"""
Pull the validated lesson plan out of a NEMO SSE stream.

    curl -sN -X POST http://localhost:5173/api/lesson \\
      -H 'Content-Type: application/json' \\
      -d '{"question":"Explain binary search.","provider":{"provider":"mock"}}' \\
      | python manim/extract_plan.py > plan.json

Reads `data:` lines, keeps the `lesson.plan` event, and writes its plan to
stdout. Exits non-zero with the reported reason if the lesson failed, so a
pipeline never silently produces an empty file.
"""

from __future__ import annotations

import json
import sys


def main() -> int:
    plan = None
    failure = None

    for line in sys.stdin:
        line = line.strip()
        if not line.startswith("data: "):
            continue
        try:
            event = json.loads(line[6:])
        except json.JSONDecodeError:
            continue
        if event.get("type") == "lesson.plan":
            plan = event.get("plan")
        elif event.get("type") == "lesson.failed":
            failure = f"{event.get('code')}: {event.get('message')}"

    if failure:
        print(f"lesson failed — {failure}", file=sys.stderr)
        return 1
    if plan is None:
        print("no lesson.plan event found in the stream", file=sys.stderr)
        return 1

    json.dump(plan, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
