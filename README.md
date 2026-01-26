# tfnsw-tool

CLI/tooling for **Transport for NSW (TfNSW) Open Data – Trip Planner (TP)** APIs.

This repo is designed to support conversational queries like:

- “next train to Wynyard”
- “next 3 trains from my nearest station to St Peters”
- “plan a trip from X to Y”

It uses the same Trip Planner backend used by transportnsw.info.

---

## What it can do (today)

The current CLI (Python) supports:

- **Stop Finder** (`/stop_finder`) — resolve a name (e.g. “Wynyard Station”) to a stop id
- **Departure Monitor** (`/departure_mon`) — upcoming departures from a stop
- **Trip planning** (`/trip`) — plan a journey from origin → destination
- **Nearest station/stop from Home Assistant** (`person.*`) using HA coords + `/coord`

Output is currently **raw JSON** (we’ll add “pretty chat output” next).

---

## API docs / contract

This repo includes the official Swagger file:

- `tripplanner.yml`

Key details:

- Base host: `api.transport.nsw.gov.au`
- Base path: `/v1/tp`
- Auth header:

  ```
  Authorization: apikey <TOKEN>
  ```

---

## Auth / secrets

This tool reads the TfNSW API token from **1Password** at runtime.

Default expected secret:

- Vault: `Claude API Access`
- Item: `Transport for NSW Open Data API Token`
- Field: `token`

Override the secret reference if you store it elsewhere:

```bash
export TFNSW_API_KEY_REF='op://<vault>/<item-or-id>/<field>'
```

Required env var for 1Password service account auth (on this host):

```bash
export OP_SERVICE_ACCOUNT_TOKEN="$(cat /home/clawdbot/.op_service_account_token)"
```

---

## Home Assistant integration (optional)

If you pass a `person.*` entity (e.g. `person.troy`) as an origin, the tool will:

1. Fetch the entity state from Home Assistant
2. Use its lat/lon to find nearby stops via TfNSW `/coord`
3. Prefer results containing “Station” in the name (to bias towards train stations)

Defaults:

- `HA_BASE_URL`: `https://cp.mctk.co`
- `HA_TOKEN_FILE`: `/home/clawdbot/.ha_sy3_long_lived_token`

Override:

```bash
export HA_BASE_URL='https://your-ha'
export HA_TOKEN_FILE='/path/to/token'
```

---

## Usage

### Resolve a stop name

```bash
python3 scripts/tfnsw.py stop "Wynyard Station"
```

### Nearest stop/station to a person

```bash
python3 scripts/tfnsw.py nearest person.troy
```

### Departures from a stop

```bash
python3 scripts/tfnsw.py departures "St Peters" --n 5
```

### Trip plan

```bash
python3 scripts/tfnsw.py trip person.troy "Wynyard Station"
```

---

## Repo hygiene

- No secrets are committed.
- API key is pulled at runtime from 1Password.
- See `CONTRIBUTING.md` for development notes.

---

## License

MIT — see `LICENSE`.
