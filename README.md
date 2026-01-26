# tfnsw-tool

CLI/tooling for **TfNSW Open Data – Trip Planner (TP)** APIs.

## Goal

Answer questions like:

- next N trains from your nearest station to St Peters
- platform (when available), service line, and ETA
- optionally, full trip plan + alternatives

## Auth (required)

Create a 1Password item:

- Vault: `Claude API Access`
- Item: `Transport for NSW Open Data API Token`
- Field: `token`

This tool reads it at runtime.

## Run (current scaffold)

```bash
export OP_SERVICE_ACCOUNT_TOKEN="$(cat /home/clawdbot/.op_service_account_token)"
python3 scripts/tfnsw.py next --from "Circular Quay" --to "St Peters" --n 3
```

## Next work

- Wire up Stop Finder → stop id
- Departure Monitor for real-time departures
- Trip planner origin → destination
