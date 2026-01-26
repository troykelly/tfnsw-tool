# Contributing

Thanks for helping improve this tool.

## What this repo is

A small CLI + library code for querying **Transport for NSW Open Data – Trip Planner (TP)** APIs.

The goal is to make it easy to answer conversational questions like:

- “next train to Wynyard”
- “next 3 trains from my nearest station to St Peters”

## Local development

### Requirements

- Python 3.10+ (works with newer versions)
- 1Password CLI (`op`) authenticated via service account (recommended)

### Secrets

This tool never stores API keys in the repo.

It reads the TfNSW token from 1Password at runtime. By default it expects:

- Vault: `Claude API Access`
- Item: `Transport for NSW Open Data API Token`
- Field: `token`

Override the secret reference with:

```bash
export TFNSW_API_KEY_REF='op://<vault>/<item-or-id>/<field>'
```

### Home Assistant integration (optional)

To resolve a `person.*` entity to a nearest station, the tool uses Home Assistant state:

- Default HA base URL: `https://cp.mctk.co`
- Default token file: `/home/clawdbot/.ha_sy3_long_lived_token`

Override with:

```bash
export HA_BASE_URL='https://your-ha'
export HA_TOKEN_FILE='/path/to/token'
```

## Code style

Keep it simple:

- Prefer small pure functions
- Avoid adding heavy dependencies unless needed
- Never log secrets

## PRs

- Small PRs are best
- Include a quick example command/output in the PR description
