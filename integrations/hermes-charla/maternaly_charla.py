#!/usr/bin/env python3
"""Call the protected Maternaly Charla Informativa reservation endpoint."""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request


def fail(message: str, code: int = 2) -> int:
    print(json.dumps({"ok": False, "error": message}, ensure_ascii=False))
    return code


def main() -> int:
    endpoint = os.environ.get("MATERNALY_HERMES_API_URL", "").strip()
    token = os.environ.get("MATERNALY_HERMES_API_TOKEN", "").strip()
    if not endpoint or not token:
        return fail("Maternaly integration is not configured.", 3)

    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, OSError) as exc:
        return fail(f"Invalid JSON input: {exc}")

    if not isinstance(payload, dict):
        return fail("Input must be a JSON object.")
    payload.setdefault("action", "reserve")
    payload.setdefault("source", "hermes")
    if payload.get("confirmed") is not True:
        return fail("The user must explicitly confirm the reservation before this tool is called.")

    request = urllib.request.Request(
        endpoint,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "Hermes-Maternaly-Charla/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read().decode("utf-8")
            status = response.status
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        status = exc.code
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        return fail(f"Maternaly endpoint unavailable: {exc}", 4)

    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        return fail(f"Maternaly returned a non-JSON response (HTTP {status}).", 4)

    if not isinstance(result, dict):
        return fail("Maternaly returned an invalid response.", 4)
    result["httpStatus"] = status
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result.get("ok") is True else 5


if __name__ == "__main__":
    raise SystemExit(main())
