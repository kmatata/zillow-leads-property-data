#!/usr/bin/env node
// Thin MCP server wrapper around Apify's official actors-mcp-server,
// pinned to exactly one tool: germane_binoculars/zillow-leads-property-data.
//
// Why this exists: MCP directories (the official registry, Glama, Smithery)
// list servers, not actors. This package gives them a real, installable
// server entry point while delegating all protocol work to Apify's
// maintained implementation, so there is nothing here to drift out of date.
//
// Requires APIFY_TOKEN in the environment (an Apify API token; get one at
// https://console.apify.com/settings/integrations). The token holder's
// account is billed for actor runs, pay-per-event.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

export const ACTOR_ID = "germane_binoculars/zillow-leads-property-data";
const UPSTREAM_PACKAGE = "@apify/actors-mcp-server";

/** Pure: the argv passed to the upstream actors-mcp-server binary. */
export function buildUpstreamArgs({ tools = [ACTOR_ID] } = {}) {
  return ["--tools", tools.join(",")];
}

/** Resolve the upstream package's stdio entry through our own dependency
 * tree. Its exports map hides package.json, so resolve the exported main
 * (.../dist/index.js) and sit next to it (.../dist/stdio.js). */
function resolveUpstreamBin() {
  const require = createRequire(import.meta.url);
  const entry = require.resolve(UPSTREAM_PACKAGE);
  const stdioEntry = path.join(path.dirname(entry), "stdio.js");
  if (!existsSync(stdioEntry)) {
    throw new Error(`${UPSTREAM_PACKAGE} has no dist/stdio.js next to ${entry}`);
  }
  return stdioEntry;
}

/** Pure: split forwarded argv into a --apify-token option (space or =
 * form) and everything else. Glama hosting passes configured secrets as
 * ${VAR} placeholders inside its startup-arguments array, so the token
 * can arrive as a CLI argument there; desktop clients keep using the env
 * var, which still takes precedence when both are present. */
export function extractTokenArg(argv) {
  const rest = [];
  let token;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--apify-token") {
      token = argv[i + 1];
      i += 1;
    } else if (typeof argv[i] === "string" && argv[i].startsWith("--apify-token=")) {
      token = argv[i].slice("--apify-token=".length);
    } else {
      rest.push(argv[i]);
    }
  }
  return { token, rest };
}

export function main({ argv = process.argv.slice(2), env = process.env } = {}) {
  const { token, rest } = extractTokenArg(argv);
  if (token && !env.APIFY_TOKEN) {
    env.APIFY_TOKEN = token;
  }

  if (!env.APIFY_TOKEN) {
    console.error(
      "APIFY_TOKEN is required (set it in the environment or pass --apify-token): " +
      "https://console.apify.com/settings/integrations"
    );
    process.exitCode = 1;
    return;
  }

  let binPath;
  try {
    binPath = resolveUpstreamBin();
  } catch (err) {
    console.error(
      `Could not resolve ${UPSTREAM_PACKAGE}. Run "npm install" in this directory first. (${err.message})`
    );
    process.exitCode = 1;
    return;
  }

  const child = spawn(process.execPath, [binPath, ...buildUpstreamArgs(), ...rest], {
    stdio: "inherit",
    env,
  });
  child.on("exit", (code) => {
    process.exitCode = code ?? 0;
  });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  main();
}
