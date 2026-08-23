import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  ACTOR_ID,
  buildActorToolDefinition,
  buildUpstreamArgs,
  COMPANION_TOOL_DEFINITIONS,
  DISCOVERY_TOOL_SELECTORS,
  extractTokenArg,
  mergeRowsIntoResult,
  normalizeActorToolArguments,
  routeLocally,
  shouldAutoFollow,
} from "./index.js";

const schema = JSON.parse(readFileSync(new URL("./input-schema.json", import.meta.url), "utf8"));
const tool = buildActorToolDefinition(schema);

test("buildUpstreamArgs pins the wrapper to our actor plus the discovery selectors", () => {
  assert.deepEqual(buildUpstreamArgs(), [
    "--tools",
    [ACTOR_ID, ...DISCOVERY_TOOL_SELECTORS].join(","),
  ]);
});

test("discovery selectors are internal tool names upstream routes, not actor ids", () => {
  for (const selector of DISCOVERY_TOOL_SELECTORS) {
    assert.ok(!selector.includes("/"), `${selector} must not parse as an actor id`);
    assert.match(selector, /^get-/);
  }
});

test("buildUpstreamArgs forwards a custom tool list", () => {
  assert.deepEqual(buildUpstreamArgs({ tools: ["a/b", "c/d"] }), ["--tools", "a/b,c/d"]);
});

test("ACTOR_ID matches the live actor slug", () => {
  assert.equal(ACTOR_ID, "germane_binoculars/zillow-leads-property-data");
});

test("extractTokenArg pulls --apify-token in both forms", () => {
  assert.deepEqual(extractTokenArg(["--apify-token", "abc", "--debug"]), {
    token: "abc",
    rest: ["--debug"],
  });
  assert.deepEqual(extractTokenArg(["--apify-token=xyz"]), { token: "xyz", rest: [] });
});

test("tool definition matches upstream naming and carries the full input schema", () => {
  assert.equal(tool.name, "germane_binoculars--zillow-leads-property-data");
  const props = Object.keys(tool.inputSchema.properties);
  for (const key of ["mode", "metro", "bounds", "depth", "source", "minListings", "minEnriched", "dedupZpids", "dedupMlsIds", "timeoutSecs"]) {
    assert.ok(props.includes(key), `missing ${key}`);
  }
  assert.ok(props.includes("waitSecs"), "waitSecs must mirror the upstream-added block cap");
  assert.match(tool.description, /zillow-leads-property-data/);
});

test("routeLocally answers initialize with our server info", () => {
  const res = routeLocally({ jsonrpc: "2.0", id: 7, method: "initialize", params: { protocolVersion: "2025-06-18" } }, tool);
  assert.equal(res.id, 7);
  assert.equal(res.result.serverInfo.name, "zillow-leads-property-data");
  assert.equal(res.result.protocolVersion, "2025-06-18");
});

test("routeLocally serves the actor tool plus all nine companions", () => {
  const res = routeLocally({ jsonrpc: "2.0", id: 2, method: "tools/list" }, tool);
  assert.equal(res.result.tools[0], tool);
  assert.deepEqual(
    res.result.tools.slice(1).map((tool) => tool.name),
    [
      "get-actor-run",
      "get-dataset-items",
      "get-key-value-store-record",
      "abort-actor-run",
      ...DISCOVERY_TOOL_SELECTORS,
    ]
  );
  for (const companion of COMPANION_TOOL_DEFINITIONS) {
    assert.ok(companion.description.length > 20, `${companion.name} needs a real description`);
    assert.ok(Array.isArray(companion.inputSchema.required), `${companion.name} must declare required`);
  }
  const required = Object.fromEntries(COMPANION_TOOL_DEFINITIONS.map((c) => [c.name, c.inputSchema.required]));
  for (const name of ["get-actor-run-list", "get-dataset-list", "get-key-value-store-list"]) {
    assert.deepEqual(required[name], [], `${name} is the no-ID discovery path and must require nothing`);
  }
  assert.deepEqual(required["get-actor-run"], ["runId"]);
  assert.deepEqual(required["abort-actor-run"], ["runId"]);
  assert.deepEqual(required["get-actor-run-log"], ["runId"]);
  assert.deepEqual(required["get-key-value-store-keys"], ["keyValueStoreId"]);
});

test("normalizeActorToolArguments makes non-catalog orders fire-and-forget by default", () => {
  assert.deepEqual(
    normalizeActorToolArguments({ mode: "custom_search", metro: "Phoenix", minListings: 100 }),
    { mode: "custom_search", metro: "Phoenix", minListings: 100, waitSecs: 0 }
  );
  assert.deepEqual(
    normalizeActorToolArguments({ mode: "recent_activity", source: "agent" }),
    { mode: "recent_activity", source: "agent", waitSecs: 0 }
  );
  assert.deepEqual(
    normalizeActorToolArguments({ mode: "catalog", minListings: 25 }),
    { mode: "catalog", minListings: 25 },
    "catalog smoke tests keep upstream's blocking default"
  );
  assert.deepEqual(normalizeActorToolArguments(undefined), {}, "no mode means catalog-shaped; untouched");
  assert.deepEqual(
    normalizeActorToolArguments({ mode: "custom_search", waitSecs: 45 }),
    { mode: "custom_search", waitSecs: 45 },
    "explicit waitSecs always wins"
  );
});

test("routeLocally returns null to forward real work upstream", () => {
  const call = { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: tool.name } };
  assert.equal(routeLocally(call, tool), null);
});

test("notifications produce no response frame", () => {
  assert.equal(
    routeLocally({ jsonrpc: "2.0", method: "notifications/initialized" }, tool),
    undefined
  );
});

const RUN_STATUS = JSON.stringify({
  status: "SUCCEEDED",
  runId: "r1",
  storages: { datasets: { default: { id: "ds1", itemCount: 10 } } },
});

test("shouldAutoFollow: true for small succeeded runs", () => {
  assert.equal(shouldAutoFollow(RUN_STATUS), true);
});

test("shouldAutoFollow: false for large, failed, or malformed results", () => {
  const big = RUN_STATUS.replace('"itemCount":10', '"itemCount":1000');
  assert.equal(shouldAutoFollow(big), false);
  assert.equal(shouldAutoFollow(JSON.stringify({ status: "RUNNING" })), false);
  assert.equal(shouldAutoFollow("not json at all"), false);
  const zero = RUN_STATUS.replace('"itemCount":10', '"itemCount":0');
  assert.equal(shouldAutoFollow(zero), false, "zero rows has nothing to fetch");
});

test("mergeRowsIntoResult appends rows to the original metadata text", () => {
  const merged = mergeRowsIntoResult(RUN_STATUS, [{ zpid: 7466127 }, { zpid: 31236 }]);
  assert.ok(merged.startsWith(RUN_STATUS));
  assert.ok(merged.includes("--- DATASET ROWS (2) ---"));
  assert.ok(merged.includes("7466127"));
});
