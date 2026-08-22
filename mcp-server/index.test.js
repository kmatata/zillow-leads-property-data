import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  ACTOR_ID,
  buildActorToolDefinition,
  buildUpstreamArgs,
  extractTokenArg,
  routeLocally,
} from "./index.js";

const schema = JSON.parse(readFileSync(new URL("./input-schema.json", import.meta.url), "utf8"));
const tool = buildActorToolDefinition(schema);

test("buildUpstreamArgs pins the wrapper to exactly our actor", () => {
  assert.deepEqual(buildUpstreamArgs(), ["--tools", ACTOR_ID]);
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

test("routeLocally serves tools/list from the static definition", () => {
  const res = routeLocally({ jsonrpc: "2.0", id: 2, method: "tools/list" }, tool);
  assert.deepEqual(res.result.tools, [tool]);
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
