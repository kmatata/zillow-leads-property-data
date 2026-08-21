import assert from "node:assert/strict";
import { test } from "node:test";

import { ACTOR_ID, buildUpstreamArgs } from "./index.js";

test("buildUpstreamArgs pins the wrapper to exactly our actor", () => {
  assert.deepEqual(buildUpstreamArgs(), ["--tools", ACTOR_ID]);
});

test("buildUpstreamArgs forwards a custom tool list", () => {
  const tools = ["a/b", "c/d"];
  assert.deepEqual(buildUpstreamArgs({ tools }), ["--tools", "a/b,c/d"]);
});

test("ACTOR_ID matches the live actor slug", () => {
  assert.equal(ACTOR_ID, "germane_binoculars/zillow-leads-property-data");
});
