# zillow-leads-property-data MCP server

A Model Context Protocol server exposing one tool:
[germane_binoculars/zillow-leads-property-data](https://apify.com/germane_binoculars/zillow-leads-property-data),
the Apify actor that returns Zillow listings enriched with listing-agent
contact details (name, phone, license, brokerage), event-level price
history, 20-plus years of tax history, foreclosure and FSBO flags, schools,
and the full resoFacts set.

It is a thin wrapper around Apify's official
[@apify/actors-mcp-server](https://github.com/apify/actors-mcp-server),
pinned to this single actor so your agent sees exactly one focused tool
instead of every actor on your account. All protocol handling stays in
Apify's maintained implementation.

## Setup

```bash
git clone https://github.com/kmatata/zillow-leads-property-data.git
cd zillow-leads-property-data/mcp-server
npm install
APIFY_TOKEN=your-token node index.js
```

`APIFY_TOKEN` is an Apify API token from
[console.apify.com/settings/integrations](https://console.apify.com/settings/integrations).
The token's account is billed per event by the actor: about $0.03 for a
25-row instant sample, about $1.20 per 1,000 enriched rows.

## Client configuration

Claude Desktop or any desktop MCP client (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "zillow-leads": {
      "command": "node",
      "args": ["/absolute/path/to/zillow-leads-property-data/mcp-server/index.js"],
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

## What a call looks like

An AI agent calling the actor through this server, one tool call, enriched
leads summarized back (phone numbers redacted here):

![An AI agent calling zillow-leads-property-data via MCP](https://raw.githubusercontent.com/kmatata/zillow-leads-property-data/main/assets/mcp-agent-catalog-sample.png)

## Tool input in 30 seconds

The fastest first call is catalog mode, which returns cached rows in
seconds with no live collection:

```json
{ "mode": "catalog", "minListings": 25 }
```

For a real order, pick a metro or bounding box:

```json
{
  "mode": "custom_search",
  "metro": "Phoenix",
  "depth": "enriched",
  "minListings": 1000,
  "minEnriched": 500
}
```

Live-collect orders take minutes to hours because enrichment is paced to
respect Zillow's anti-bot layer; the full input schema is documented on the
[actor page](https://apify.com/germane_binoculars/zillow-leads-property-data).

## Tests

```bash
npm test
```
