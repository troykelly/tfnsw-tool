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
import re
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


def ha_get_state(base_url: str, token: str, entity_id: str) -> dict:
    url = f"{base_url}/api/states/{urllib.parse.quote(entity_id)}"
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))


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


def best_location_from_stop_finder(resp: dict, prefer_types: set[str] | None = None) -> dict | None:
    # Stop Finder response includes `locations` list (see swagger).
    locs = resp.get("locations") or []
    if not isinstance(locs, list) or not locs:
        return None

    # Some responses (notably coord lookups) can return an address/poi with nearby stops
    # nested under `assignedStops`. Flatten those into candidates.
    expanded: list[dict] = []
    for l in locs:
        if isinstance(l, dict):
            expanded.append(l)
            assigned = l.get("assignedStops")
            if isinstance(assigned, list):
                for a in assigned:
                    if isinstance(a, dict):
                        expanded.append(a)
    locs = expanded

    if prefer_types:
        locs_pref = [l for l in locs if isinstance(l, dict) and l.get("type") in prefer_types]
        if locs_pref:
            locs = locs_pref

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

    near = sub.add_parser("nearest", help="Find nearest stop/station to a Home Assistant person.* entity")
    near.add_argument("person_entity", help="e.g. person.troy")

    dep = sub.add_parser("departures", help="Departure monitor for a stop/station")
    dep.add_argument("stop_query", help="Stop name, ID, or HA person entity (e.g. 'St Peters' / '10111010' / 'person.troy')")
    dep.add_argument("--n", type=int, default=5, help="How many services")

    trip = sub.add_parser("trip", help="Plan a trip between two locations")
    trip.add_argument("from_query", help="Origin: stop name/ID or HA person entity (e.g. person.troy)")
    trip.add_argument("to_query", help="Destination stop name/ID")

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

    COORD_RE = re.compile(r"^-?\d+(?:\.\d+)?:-?\d+(?:\.\d+)?:EPSG:4326$")

    def resolve_location(q: str) -> dict | None:
        q = q.strip()

        # Home Assistant person entity -> nearest stop
        if q.startswith("person."):
            base_url = os.environ.get("HA_BASE_URL", "https://cp.mctk.co")
            token_file = os.environ.get("HA_TOKEN_FILE", "/home/clawdbot/.ha_sy3_long_lived_token")
            try:
                ha_token = open(token_file, "r", encoding="utf-8").read().strip()
                st = ha_get_state(base_url, ha_token, q)
                lat = st.get("attributes", {}).get("latitude")
                lon = st.get("attributes", {}).get("longitude")
                if lat is None or lon is None:
                    return None
            except Exception:
                return None

            # TfNSW expects LONGITUDE first, then LATITUDE.
            coord_q = f"{lon}:{lat}:EPSG:4326"
            # Use the Coord Request API to get nearby stops/stations.
            resp = tp_get(
                api_key,
                "/coord",
                {
                    "outputFormat": "rapidJSON",
                    "coord": coord_q,
                    "coordOutputFormat": "EPSG:4326",
                    "inclFilter": "1",
                    "type_1": "BUS_POINT",
                    "radius_1": "1200",
                    "PoisOnMapMacro": "true",
                },
            )
            # Coord response also uses `locations`. Prefer train stations when possible.
            locs = resp.get("locations")
            if isinstance(locs, list):
                station_locs = [
                    l
                    for l in locs
                    if isinstance(l, dict)
                    and isinstance(l.get("name"), str)
                    and ("station" in l.get("name").lower())
                ]
                if station_locs:
                    resp_station = dict(resp)
                    resp_station["locations"] = station_locs
                    best_station = best_location_from_stop_finder(resp_station, prefer_types={"stop", "platform"})
                    if best_station:
                        return best_station

            return best_location_from_stop_finder(resp, prefer_types={"stop", "platform"})

        # If it's numeric-ish, try it directly as stop id.
        if q.isdigit():
            return {"id": q, "name": q, "type": "stop"}

        # If it's a raw coord request in TfNSW format
        if COORD_RE.match(q):
            resp = tp_get(
                api_key,
                "/stop_finder",
                {
                    "outputFormat": "rapidJSON",
                    "type_sf": "coord",
                    "name_sf": q,
                    "coordOutputFormat": "EPSG:4326",
                    "TfNSWSF": "true",
                },
            )
            return best_location_from_stop_finder(resp, prefer_types={"stop", "platform"})

        # Normal name search
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

    if args.cmd == "nearest":
        loc = resolve_location(args.person_entity)
        print(json.dumps(loc or {"error": "no_match", "person": args.person_entity}, indent=2))
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
        print(json.dumps(dm, indent=2))
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
        print(json.dumps(tr, indent=2))
        return 0

    print(json.dumps({"error": "unknown_cmd"}, indent=2))
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
