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

## Home Assistant Integration

Person entity lookups (e.g. `person.troy`) resolve location via Home Assistant.

| Variable | Description | Default |
|----------|-------------|---------|
| `HA_BASE_URL` | Home Assistant URL | `https://cp.mctk.co` |
| `HA_TOKEN` | Long-lived access token | — |
| `HA_TOKEN_FILE` | Path to token file | `/home/moltbot/.ha_sy3_long_lived_token` |

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
