import assert from "node:assert/strict";
import { test } from "node:test";

import { ACTOR_ID, buildUpstreamArgs, extractTokenArg } from "./index.js";

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

test("extractTokenArg pulls --apify-token in both forms", () => {
  const space = extractTokenArg(["--apify-token", "abc", "--debug"]);
  assert.equal(space.token, "abc");
  assert.deepEqual(space.rest, ["--debug"]);
  const eq = extractTokenArg(["--debug", "--apify-token=xyz"]);
  assert.equal(eq.token, "xyz");
  assert.deepEqual(eq.rest, ["--debug"]);
});

test("extractTokenArg passes through when no token flag exists", () => {
  assert.deepEqual(extractTokenArg(["node", "index.js"]), { token: undefined, rest: ["node", "index.js"] });
});
