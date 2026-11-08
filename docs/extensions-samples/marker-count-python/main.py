"""Worldlens extension sample: one JSON line in, one JSON line out."""
import collections
import json
import sys


def main() -> None:
    try:
        request = json.loads(sys.stdin.read())
    except ValueError:
        print(json.dumps({"ok": False, "message": "The request was not JSON."}))
        return
    markers = (request.get("input") or {}).get("markers") or []
    by_set = collections.Counter(m.get("set", "") for m in markers)
    by_type = collections.Counter(m.get("type", "") for m in markers)
    lines = [f"{len(markers)} markers", ""]
    lines += [f"set  {name or '(none)'}: {count}" for name, count in sorted(by_set.items())]
    lines += [f"type {name or '(none)'}: {count}" for name, count in sorted(by_type.items())]
    print(json.dumps({"ok": True, "message": f"Counted {len(markers)} markers.", "output": {"kind": "text", "name": "marker-count.txt", "text": "\n".join(lines) + "\n"}}))


main()
