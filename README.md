# zillow-leads-property-data

Code samples, a sample dataset, and a full workflow notebook for the
[Zillow Leads & Property Data](https://apify.com/germane_binoculars/zillow-leads-property-data)
Apify actor.

The actor pulls Zillow listings enriched with agent/broker contact info,
full price-history timelines, 20yr+ tax history, foreclosure/distress flags,
schools, and the resoFacts long tail (heating/cooling/construction). Pay-per-event
pricing, no subscription: **$0.70 per 1,000 bare rows, $1.20 per
1,000 enriched rows.**

- **Actor:** https://apify.com/germane_binoculars/zillow-leads-property-data
- **Architecture writeup:** [Predictable web scraping with web extensions](https://dev.to/kinuthia_matata_842726bc3/predictable-web-scraping-with-web-extensions-a-more-localized-apify-approach-12jn) — why this actor runs on a real browser session instead of a proxy farm, and what that buys you against Zillow's PerimeterX + AWS WAF.

## Try it in 30 seconds, no signup beyond an Apify account

The actor's `catalog` mode returns a cached, already-enriched snapshot
instantly, no bounding box, no wait:

```json
{ "mode": "catalog", "metro": "Chicago" }
```

Run it from the [Apify Console](https://apify.com/germane_binoculars/zillow-leads-property-data)
or via `apify-client` (see `examples/` below).

## What's in this repo

| Path | What it is |
|---|---|
| `sample/sample_listings.csv` | 20 real enriched rows (Chicago/Houston/Phoenix) — flat, spreadsheet-ready |
| `sample/sample_listings.jsonl` | Same rows, one JSON object per line, with a nested `price_history` array per listing |
| `examples/python_quickstart.py` | Call the actor from Python via `apify-client`, wait for results, print a summary |
| `examples/node_quickstart.js` | Same, in Node, via `apify-client` |
| `mcp-server/` | One-tool MCP server for Claude Desktop, Cursor and any MCP client; see `mcp-server/README.md` |
| `notebook/zillow_leads_workflow.ipynb` | A realistic lead-gen workflow: run the actor, dedupe against a prior export, filter to rows with agent phone numbers, export a clean CSV |

## Field reference

Two depths, `listings` (bare) and `enriched` (the default):

- **`listings`**: address, price, beds/baths, status, lot/living area, listing-type flags — whatever Zillow's own search API returns, no detail-page fetch involved. See `sample_listings.csv` for the shape (a subset of the columns shown there — the sample above is enriched-depth, listings-depth rows omit everything past the bare fields).
- **`enriched`** (default): everything in `listings`, plus agent/broker contact (name, phone, email, brokerage, MLS attribution), full price-history and 20yr+ tax-history timelines, foreclosure/distress signals, assigned + nearby schools, HOA fees, and the resoFacts long tail (heating/cooling/parking/construction).

Full field list, pricing table, and every input mode (`catalog` / `custom_search` / `recent_activity`) are documented on the [actor's own README](https://apify.com/germane_binoculars/zillow-leads-property-data).

## Dedup across repeat orders

Every delivery writes a `DEDUP_UPDATE` record to the run's key-value store:
the union of the zpids and MLS IDs you already had plus everything just shipped.
Feed those two arrays back into your next order's `dedupZpids`/`dedupMlsIds`
fields and you're never charged for the same row twice. See
`notebook/zillow_leads_workflow.ipynb` for a worked example.

## Use it from an AI agent (MCP)

This actor is callable as a tool via Apify's hosted MCP server
(`https://mcp.apify.com`) or the local `@apify/actors-mcp-server`, no manual
input-form filling required — `catalog` mode (the default) is a good agent
smoke test since it returns cached rows in seconds with no polling loop
needed. See the actor's own README for the full agent-facing input schema
and the fire/poll/fetch pattern for a live-collection order.

## Questions / issues

This repo is documentation and samples only — it doesn't run the actor
itself. For a specific order that isn't behaving as expected, check that
run's key-value store `STATUS` record first (the actor writes a plain-English
reason there for any zero-row or partial result), then open an issue here or
reach out via the actor's Apify Store page.
