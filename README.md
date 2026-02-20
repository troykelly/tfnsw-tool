# tfnsw

TypeScript CLI for querying Transport for NSW (TfNSW) Open Data APIs.

Find stops, check departures, plan trips — from the command line.

## Install

```bash
pnpm install -g @troykelly/tfnsw
```

## Usage

```bash
# Find a stop
tfnsw stop "St Peters"

# Nearest stop to a Home Assistant person entity
tfnsw nearest person.troy

# Departures
tfnsw departures "Central Station"
tfnsw departures "St Peters" -n 10

# Trip planning
tfnsw trip "St Peters" "Circular Quay"
tfnsw trip person.troy "Town Hall"

# Raw JSON output
tfnsw departures "Central" --json
```

## Authentication

Set `TFNSW_API_KEY` environment variable, or configure 1Password CLI with `OP_SERVICE_ACCOUNT_TOKEN`.
The tool reads the API key from 1Password vault "Claude API Access", item "Transport for NSW Open Data API Token".

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TFNSW_API_KEY` | TfNSW API key (direct) | — |
| `TFNSW_API_KEY_REF` | 1Password secret reference | `op://Claude API Access/Transport for NSW Open Data API Token/token` |
| `TFNSW_API_BASE` | TfNSW API base URL override | `https://api.transport.nsw.gov.au/v1/tp` |

## Home Assistant Integration

Person entity lookups (e.g. `person.troy`) resolve location via Home Assistant.

**All Home Assistant variables must be set explicitly — there are no defaults.**

| Variable | Description | Required |
|----------|-------------|----------|
| `HA_BASE_URL` | Home Assistant URL (e.g. `https://your-ha-instance.local`) | Yes, for person entity lookups |
| `HA_TOKEN` | Long-lived access token | One of `HA_TOKEN` or `HA_TOKEN_FILE` |
| `HA_TOKEN_FILE` | Path to file containing token | One of `HA_TOKEN` or `HA_TOKEN_FILE` |

If HA is not configured and a `person.*` entity is used, the CLI will return a clear error explaining which variables to set.

## Development

```bash
git clone https://github.com/troykelly/tfnsw-tool.git
cd tfnsw-tool
pnpm install
pnpm build
node dist/cli.js --help
```

## License

MIT
