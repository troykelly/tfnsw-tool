---
name: tfnsw
description: Query TfNSW public transport — find stops, departures, plan trips
---

# TfNSW Transport Tool

Query Transport for NSW public transport data.

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
| `HA_BASE_URL` | Home Assistant URL | `https://cp.mctk.co` |
| `HA_TOKEN` | HA long-lived access token | — |
| `HA_TOKEN_FILE` | Path to file containing HA token | `/home/moltbot/.ha_sy3_long_lived_token` |

## Notes

- Person entity lookups (e.g. `person.troy`) require Home Assistant access
- API key is retrieved from 1Password if `TFNSW_API_KEY` is not set (requires `OP_SERVICE_ACCOUNT_TOKEN`)
- Supports stop names, stop IDs, coordinates (`lon:lat:EPSG:4326`), and HA person entities as location inputs
