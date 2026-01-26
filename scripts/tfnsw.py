#!/usr/bin/env python3

"""TfNSW Open Data (Trip Planner) minimal CLI.

Goal: answer questions like "next train to St Peters" using TfNSW Open Data TP APIs.

Auth:
  TFNSW_API_KEY is loaded at runtime from 1Password.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.parse
import urllib.request


def op_read(secret_ref: str) -> str:
    """Read a secret via 1Password CLI without printing it."""
    # Expect OP_SERVICE_ACCOUNT_TOKEN already set in environment by caller.
    out = subprocess.check_output(["op", "read", secret_ref], stderr=subprocess.STDOUT)
    return out.decode("utf-8").strip()


def http_get(url: str, headers: dict[str, str]) -> dict:
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = resp.read().decode("utf-8")
        return json.loads(data)


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(prog="tfnsw", add_help=True)
    sub = p.add_subparsers(dest="cmd", required=True)

    nxt = sub.add_parser("next", help="Next departures (scaffold)")
    nxt.add_argument("--from", dest="from_stop", default="Circular Quay", help="Origin stop/station name")
    nxt.add_argument("--to", dest="to_stop", default="St Peters", help="Destination stop/station name")
    nxt.add_argument("--n", dest="n", type=int, default=3, help="How many services")

    args = p.parse_args(argv)

    # NOTE: This is a scaffold. We still need:
    # - concrete TfNSW TP endpoint URLs + required params
    # - stop finder -> stop id
    # - departure monitor / trip planner parsing

    # Placeholder: just prove we can load the API key.
    api_key_ref = os.environ.get(
        "TFNSW_API_KEY_REF",
        "op://Claude API Access/Transport for NSW Open Data API Token/token",
    )

    try:
        api_key = op_read(api_key_ref)
    except Exception as e:
        print(
            "Missing/invalid TfNSW API key in 1Password.\n"
            "Expected: vault=Claude API Access, item=Transport for NSW Open Data API Token, field=token\n"
            f"Tried reference: {api_key_ref}\n\n"
            f"Details: {e}",
            file=sys.stderr,
        )
        return 2

    # Do not print the key. Just show it exists.
    print(
        json.dumps(
            {
                "status": "ok",
                "note": "scaffold only (API calls not wired yet)",
                "from": args.from_stop,
                "to": args.to_stop,
                "n": args.n,
                "api_key_loaded": True,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
