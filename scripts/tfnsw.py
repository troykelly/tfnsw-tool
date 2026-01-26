#!/usr/bin/env python3

"""TfNSW Open Data (Trip Planner) minimal CLI.

Goal: answer questions like "next train to St Peters" using TfNSW Open Data TP APIs.

Auth:
  API key is loaded at runtime from 1Password and sent as:
    Authorization: apikey <TOKEN>

Docs (Swagger): tripplanner.yml in this repo.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone


def op_read(secret_ref: str) -> str:
    """Read a secret via 1Password CLI without printing it."""
    # Expect OP_SERVICE_ACCOUNT_TOKEN already set in environment by caller.
    out = subprocess.check_output(["op", "read", secret_ref], stderr=subprocess.STDOUT)
    return out.decode("utf-8").strip()


def http_get(url: str, headers: dict[str, str]) -> dict:
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = resp.read().decode("utf-8")
        return json.loads(data)


def tfnsw_headers(api_key: str) -> dict[str, str]:
    # Per swagger securityDefinitions: Authorization: apikey [TOKEN]
    return {
        "Authorization": f"apikey {api_key}",
        "Accept": "application/json",
        "User-Agent": "tfnsw-tool/0.0 (clawdbot)",
    }


def tp_get(api_key: str, endpoint: str, params: dict[str, str]) -> dict:
    base = "https://api.transport.nsw.gov.au/v1/tp"
    qs = urllib.parse.urlencode(params)
    url = f"{base}{endpoint}?{qs}"
    return http_get(url, tfnsw_headers(api_key))


def best_location_from_stop_finder(resp: dict) -> dict | None:
    # Stop Finder response includes `locations` list (see swagger).
    locs = resp.get("locations") or []
    if not isinstance(locs, list) or not locs:
        return None

    # Prefer isBest=true, else highest matchQuality.
    best = None
    for l in locs:
        if isinstance(l, dict) and l.get("isBest") is True:
            return l
        if not isinstance(l, dict):
            continue
        mq = l.get("matchQuality")
        try:
            mq_f = float(mq) if mq is not None else -1.0
        except Exception:
            mq_f = -1.0
        if best is None or mq_f > best[0]:
            best = (mq_f, l)
    return best[1] if best else None


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(prog="tfnsw", add_help=True)
    sub = p.add_subparsers(dest="cmd", required=True)

    sf = sub.add_parser("stop", help="Resolve a stop/station/place name to a TfNSW location")
    sf.add_argument("query", help="e.g. 'St Peters' or 'Circular Quay'")

    dep = sub.add_parser("departures", help="Departure monitor for a stop/station")
    dep.add_argument("stop_query", help="Stop name or ID (e.g. 'St Peters' or '10111010')")
    dep.add_argument("--n", type=int, default=5, help="How many services")

    trip = sub.add_parser("trip", help="Plan a trip between two locations")
    trip.add_argument("from_query", help="Origin stop/station/place name or ID")
    trip.add_argument("to_query", help="Destination stop/station/place name or ID")

    args = p.parse_args(argv)

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

    now = datetime.now(timezone.utc)
    itdDate = now.strftime("%Y%m%d")
    itdTime = now.strftime("%H%M")

    def resolve_location(q: str) -> dict | None:
        # If it's numeric-ish, try it directly as stop id.
        if q.isdigit():
            return {"id": q, "name": q, "type": "stop"}
        resp = tp_get(
            api_key,
            "/stop_finder",
            {
                "outputFormat": "rapidJSON",
                "type_sf": "any",
                "name_sf": q,
                "coordOutputFormat": "EPSG:4326",
                "TfNSWSF": "true",
            },
        )
        return best_location_from_stop_finder(resp)

    if args.cmd == "stop":
        loc = resolve_location(args.query)
        print(json.dumps(loc or {"error": "no_match"}, indent=2))
        return 0 if loc else 3

    if args.cmd == "departures":
        loc = resolve_location(args.stop_query)
        if not loc or not loc.get("id"):
            print(json.dumps({"error": "no_match", "query": args.stop_query}, indent=2))
            return 3

        dm = tp_get(
            api_key,
            "/departure_mon",
            {
                "outputFormat": "rapidJSON",
                "coordOutputFormat": "EPSG:4326",
                "type_dm": "stop",
                "name_dm": str(loc["id"]),
                "itdDate": itdDate,
                "itdTime": itdTime,
                "departureMonitorMacro": "true",
                "TfNSWDM": "true",
            },
        )
        # Return raw for now; we'll add formatting once we see real payloads.
        print(json.dumps(dm, indent=2)[:200000])
        return 0

    if args.cmd == "trip":
        o = resolve_location(args.from_query)
        d = resolve_location(args.to_query)
        if not o or not o.get("id"):
            print(json.dumps({"error": "no_match_origin", "query": args.from_query}, indent=2))
            return 3
        if not d or not d.get("id"):
            print(json.dumps({"error": "no_match_destination", "query": args.to_query}, indent=2))
            return 3

        tr = tp_get(
            api_key,
            "/trip",
            {
                "outputFormat": "rapidJSON",
                "coordOutputFormat": "EPSG:4326",
                "depArrMacro": "dep",
                "type_origin": "any",
                "name_origin": str(o["id"]),
                "type_destination": "any",
                "name_destination": str(d["id"]),
                "itdDate": itdDate,
                "itdTime": itdTime,
            },
        )
        print(json.dumps(tr, indent=2)[:200000])
        return 0

    print(json.dumps({"error": "unknown_cmd"}, indent=2))
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
