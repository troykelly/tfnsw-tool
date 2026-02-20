---
name: tfnsw
description: "Query Transport for NSW (TfNSW) public transport data for Sydney and NSW, Australia. Use when: (1) checking next train, bus, ferry, or light rail departures, (2) planning trips between stations or locations, (3) finding nearby stops/stations, (4) checking public transport schedules in Sydney/NSW, (5) commute planning. Supports stop lookup, departure boards, trip planning, and Home Assistant person entity location resolution."
---

# TfNSW Transport Tool

Query Transport for NSW public transport data.

## Install

```bash
pnpm install -g @troykelly/tfnsw
```

### Authentication

The CLI needs a TfNSW Open Data API key. Set one of:

- `TFNSW_API_KEY` — API key directly
- `TFNSW_API_KEY_REF` — 1Password secret reference (default: `op://Claude API Access/Transport for NSW Open Data API Token/token`)
  - Requires `OP_SERVICE_ACCOUNT_TOKEN` to be set for 1Password auth

### Optional: Custom API Base URL

- `TFNSW_API_BASE` — Override the TfNSW API endpoint (default: `https://api.transport.nsw.gov.au/v1/tp`)

## Commands

```bash
# Find a stop/station
tfnsw stop "St Peters"

# Find nearest stop to a Home Assistant person
tfnsw nearest person.troy

# Show next departures
tfnsw departures "Central Station"
tfnsw departures "St Peters" -n 10

# Plan a trip
tfnsw trip "St Peters" "Circular Quay"
tfnsw trip person.troy "Town Hall"
```

## Options

- `--json` — output raw JSON instead of formatted text
- `-n N` — number of departures to show (default: 5)

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TFNSW_API_KEY` | TfNSW API key (direct) | — |
| `TFNSW_API_KEY_REF` | 1Password secret reference | `op://Claude API Access/Transport for NSW Open Data API Token/token` |
| `TFNSW_API_BASE` | TfNSW API base URL | `https://api.transport.nsw.gov.au/v1/tp` |

### Home Assistant Integration

Person entity lookups (e.g. `person.troy`) require Home Assistant access. **All HA variables must be set explicitly — there are no defaults.**

| Variable | Description | Required |
|----------|-------------|----------|
| `HA_BASE_URL` | Home Assistant URL (e.g. `https://your-ha-instance.local`) | Yes, for person entity lookups |
| `HA_TOKEN` | HA long-lived access token | One of `HA_TOKEN` or `HA_TOKEN_FILE` required |
| `HA_TOKEN_FILE` | Path to file containing HA token | One of `HA_TOKEN` or `HA_TOKEN_FILE` required |

If neither `HA_BASE_URL` nor authentication is configured and a `person.*` entity is used, the CLI will return a clear error explaining which environment variables to set.

## Notes

- Person entity lookups (e.g. `person.troy`) require Home Assistant access
- API key is retrieved from 1Password if `TFNSW_API_KEY` is not set (requires `OP_SERVICE_ACCOUNT_TOKEN`)
- Supports stop names, stop IDs, coordinates (`lon:lat:EPSG:4326`), and HA person entities as location inputs
