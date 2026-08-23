# zillow-leads-property-data MCP server

A Model Context Protocol server exposing one tool:
[germane_binoculars/zillow-leads-property-data](https://apify.com/germane_binoculars/zillow-leads-property-data),
the Apify actor that returns Zillow listings enriched with listing-agent
contact details (name, phone, license, brokerage), event-level price
history, 20-plus years of tax history, foreclosure and FSBO flags, schools
and the full resoFacts set.

It is a thin wrapper around Apify's official
[@apify/actors-mcp-server](https://github.com/apify/actors-mcp-server),
pinned to this single actor so your agent sees exactly one focused tool
instead of every actor on your account. All protocol handling stays in
Apify's maintained implementation.

## Setup

```bash
npm install
APIFY_TOKEN=your-token node index.js
```

`APIFY_TOKEN` is an Apify API token from
[console.apify.com/settings/integrations](https://console.apify.com/settings/integrations).
The token's account is billed per event by the actor: about $0.03 for a
25-row instant sample, about $1.20 per 1,000 enriched rows.

## Client configuration

Claude Desktop or any desktop MCP client (`claude_desktop_config.json`),
from a clone of this directory:

```json
{
  "mcpServers": {
    "zillow-leads": {
      "command": "node",
      "args": ["/absolute/path/to/apify/mcp-wrapper/index.js"],
      "env": { "APIFY_TOKEN": "your-token" }
    }
  }
}
```

Cursor / generic streamable-HTTP alternative (Apify's hosted server,
filtered to this actor):

```json
{
  "mcpServers": {
    "zillow-leads": {
      "url": "https://mcp.apify.com/?tools=germane_binoculars/zillow-leads-property-data"
    }
  }
}
```

## Tool input in 30 seconds

There are exactly two workflows, and picking the right one avoids every
timeout error you will ever see here.

**1. Smoke test / instant sample — catalog mode.** Returns cached rows in
seconds and usually completes inside a single call:

```json
{ "mode": "catalog", "minListings": 25 }
```

**2. Real order — custom_search (or recent_activity).** These dispatch a
live-collection order to the browser-extension collector, paced to respect
Zillow's anti-bot layer: **minutes minimum, hours for full metros**. No
single tool call can hold the connection that long — and none needs to.
Omit `waitSecs` and this server makes the call fire-and-forget for you
(it returns the `runId` within seconds):

```json
{ "mode": "custom_search", "metro": "Phoenix", "depth": "enriched",
  "minListings": 1000, "minEnriched": 500 }
```

then poll until terminal, and fetch rows:

1. `get-actor-run { "runId": "...", "waitSecs": 30 }` → repeat while status is RUNNING
2. `get-dataset-items { "datasetId": "...", "limit": 50 }`
3. `get-key-value-store-record { "keyValueStoreId": "...", "recordKey": "ORDER_SUMMARY" }` for what actually applied

For a real order, pick a metro or bounding box; the full input schema is
documented on the
[actor page](https://apify.com/germane_binoculars/zillow-leads-property-data).

## Timeouts and lost runs

- **Why a client times out on non-catalog calls:** one blocking call can
  legitimately take up to `waitSecs` (≤45s) plus startup overhead. MCP
  Inspector's default request budget is 60s (`-32001 Request timed out`);
  hosted chat clients are often stricter. A catalog sample lands well under
  that; a live order never will, because the data genuinely does not exist
  yet. That is why the wrapper forces fire-and-forget for non-catalog modes.
- **Never blind-retry a timed-out call** — the original run keeps running
  and billing. Recover it instead: the run keeps going in Apify even after
  the client gives up.
- **Lost the runId?** Every companion workflow tool takes an ID, so the
  server also exposes no-ID discovery tools: `get-actor-run-list`
  (`{ "desc": true }`, newest first — each entry carries
  `defaultDatasetId`/`defaultKeyValueStoreId`), plus `get-dataset-list`,
  `get-key-value-store-list`, `get-key-value-store-keys`, and
  `get-actor-run-log` to watch collection progress.

## Testing in Glama vs locally

Glama's directory build/checks and its hosted workspace both construct
this server from the repo; secrets configured there arrive as
`--apify-token ${APIFY_TOKEN}` arguments (env var also works). Glama's own
chat interface bills *your* card for model tokens — that is Glama's
billing, unrelated to this server or the actor's pay-per-event charges,
which bill the Apify account owning `APIFY_TOKEN`. Everything can be
validated without it: the
[MCP Inspector](https://github.com/modelcontextprotocol/inspector)
(`npx @modelcontextprotocol/inspector node index.js`) exercises the same
protocol against your local token — raise its Request Timeout to 120000ms
once, and nothing here will ever look like a timeout again.

## Tests

```bash
npm test
```
