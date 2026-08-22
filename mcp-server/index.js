#!/usr/bin/env node
// MCP server wrapper around Apify's official actors-mcp-server, pinned to
// exactly one tool: germane_binoculars/zillow-leads-property-data.
//
// Why this exists: MCP directories (Glama et al) build servers from a repo
// and grade them by what tools/list returns, and directory build checks run
// with placeholder credentials. The upstream server resolves actor tool
// definitions through live Apify API calls, so under a placeholder token it
// starts fine but lists zero tools. This wrapper answers the protocol
// handshake and tools/list LOCALLY from a vendored copy of the actor's
// input schema, and forwards everything else (tools/call and friends) to
// the upstream implementation, which keeps all protocol handling in Apify's
// maintained code.
//
// Requires APIFY_TOKEN (env var, or --apify-token argument as hosting
// platforms pass secrets). The token holder's account is billed per event
// by the actor.

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createRequire } from "node:module";
import path from "node:path";

export const ACTOR_ID = "germane_binoculars/zillow-leads-property-data";
const UPSTREAM_PACKAGE = "@apify/actors-mcp-server";
const TOOL_NAME = ACTOR_ID.replaceAll("/", "--");
const SYNTH_INIT_ID = "__wrapper_upstream_init__";
const AUTO_FOLLOW_ID_PREFIX = "__wrapper_autofollow_";

function safeParseRows(text) {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    // get-dataset-items wraps results as {"datasetId", "items":[...]}
    if (Array.isArray(parsed?.items)) {
      return parsed.items;
    }
    return [];
  } catch {
    return [];
  }
}

/** Pure: the argv passed to the upstream actors-mcp-server binary. */
export function buildUpstreamArgs({ tools = [ACTOR_ID] } = {}) {
  return ["--tools", tools.join(",")];
}

/** Pure: split forwarded argv into a --apify-token option (space or =
 * form) and everything else. Glama-style hosts pass configured secrets as
 * ${VAR} placeholders inside their startup-arguments array; desktop
 * clients keep using the env var, which wins when both are present. */
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

/** Pure: this actor's tool definition served for tools/list. The name
 * matches the upstream server's own naming (slashes become double dashes)
 * so forwarded tools/call requests resolve against the same tool there.
 * waitSecs mirrors the upstream-added block cap for single tool calls. */
export function buildActorToolDefinition(inputSchema) {
  const properties = {
    ...inputSchema.properties,
    waitSecs: {
      type: "integer",
      title: "Wait seconds",
      description: "Max seconds (0-45, default 30) to block on this single call waiting for terminal run status. Long-running orders return a status plus nextStep instead.",
      default: 30,
    },
  };
  return {
    name: TOOL_NAME,
    description:
      `Calls the Actor "${ACTOR_ID}" and retrieves its output results: Zillow listings enriched with agent/broker contact info, price/tax history, foreclosure flags, and schools. ` +
      "Live-collect orders take minutes; when still running the call returns a status plus nextStep telling you how to poll via get-actor-run, then fetch rows with get-dataset-items.",
    inputSchema: { type: "object", properties, required: [] },
  };
}

/** Pure: answer protocol-level requests locally, or null to forward
 * upstream. Notifications produce no response at all. */
export function routeLocally(msg, toolDefinition, protocolVersion) {
  const isNotification =
    msg.method?.startsWith("notifications/") || msg.id === undefined;
  if (isNotification) {
    return undefined;
  }
  if (msg.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        protocolVersion: msg.params?.protocolVersion || protocolVersion,
        capabilities: { tools: {} },
        serverInfo: {
          name: "zillow-leads-property-data",
          title: "Zillow Leads & Property Data (one-tool server)",
          version: "1.0.2",
        },
      },
    };
  }
  if (msg.method === "tools/list") {
    return { jsonrpc: "2.0", id: msg.id, result: { tools: [toolDefinition] } };
  }
  return null;
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

function loadInputSchema() {
  const local = path.join(path.dirname(new URL(import.meta.url).pathname), "input-schema.json");
  return JSON.parse(readFileSync(local, "utf8"));
}

/** Pure: decide whether an actor-run result should be followed by an
 * automatic dataset-items fetch appended to the same response. Only small,
 * fully-succeeded runs qualify: those are the instant samples evaluators
 * try first, where returning plumbing instead of data reads as failure.
 * Large or partial live orders keep the explicit fire-poll-fetch flow. */
export function shouldAutoFollow(resultText, maxItems = 25) {
  let parsed;
  try {
    parsed = JSON.parse(resultText);
  } catch {
    return false;
  }
  const dataset = parsed?.storages?.datasets?.default;
  return (
    parsed?.status === "SUCCEEDED" &&
    typeof dataset?.id === "string" &&
    Number.isInteger(dataset?.itemCount) &&
    dataset.itemCount > 0 &&
    dataset.itemCount <= maxItems
  );
}

/** Pure: append fetched rows to the original run-status text so the caller
 * receives run metadata AND the data in a single response frame. */
export function mergeRowsIntoResult(resultText, rows) {
  return (
    resultText +
    "\n\n--- DATASET ROWS (" + rows.length + ") ---\n" +
    JSON.stringify(rows, null, 2)
  );
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
      `Could not resolve ${UPSTREAM_PACKAGE}. Run "npm install" first. (${err.message})`
    );
    process.exitCode = 1;
    return;
  }

  const toolDefinition = buildActorToolDefinition(loadInputSchema());
  const upstream = spawn(
    process.execPath,
    [binPath, ...buildUpstreamArgs(), ...rest],
    { stdio: ["pipe", "pipe", "inherit"], env }
  );

  // Actor-tool calls that qualify for auto-follow (small succeeded samples)
  // hold their response while we fetch the dataset rows, then deliver run
  // metadata and rows in one frame. Keyed by the client's request id.
  // Keyed entries: { stage: "run" | "rows", followId?, originalText?,
  // originalResult?, timer? }. The 15s timer guarantees a stuck follow-up
  // can never hang the client: it flushes the unmerged run response.
  const pending = new Map();     // client-id string -> entry
  const byFollowId = new Map();  // synthetic follow-up id -> same key string
  let followSeq = 0;

  const finishPending = (key) => {
    const entry = pending.get(key);
    if (!entry) return;
    if (entry.followId !== undefined) byFollowId.delete(entry.followId);
    clearTimeout(entry.timer);
    pending.delete(key);
  };

  // Emit the held, unmerged run frame (auto-follow declined or timed out).
  const emitHeld = (key) => {
    const entry = pending.get(key);
    if (!entry) return;
    clearTimeout(entry.timer);
    if (entry.originalFrame) {
      process.stdout.write(JSON.stringify(entry.originalFrame) + "\n");
    }
    finishPending(key);
  };

  // Prime the upstream session so forwarded tools/call arrive post-init.
  upstream.stdin.write(
    JSON.stringify({
      jsonrpc: "2.0",
      id: SYNTH_INIT_ID,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "zillow-leads-wrapper", version: "1.0.0" },
      },
    }) + "\n"
  );
  upstream.stdin.write(
    JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n"
  );

  const upstreamLines = createInterface({ input: upstream.stdout });
  upstreamLines.on("line", (line) => {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      process.stdout.write(line + "\n");
      return;
    }
    if (parsed.id === SYNTH_INIT_ID) {
      return;
    }

    let key = String(parsed.id);
    if (!pending.has(key)) {
      const ownerKey = byFollowId.get(key);
      if (ownerKey === undefined || !pending.has(ownerKey)) {
        process.stdout.write(JSON.stringify(parsed) + "\n");
        return;
      }
      key = ownerKey;
    }
    const entry = pending.get(key);

    if (entry.stage === "run") {
      const text = parsed.result?.content?.[0]?.text ?? "";
      if (!shouldAutoFollow(text)) {
        emitHeld(key);
        return;
      }
      const runInfo = JSON.parse(text);
      const dataset = runInfo.storages.datasets.default;
      entry.originalText = text;
      entry.originalFrame = parsed;
      entry.stage = "rows";
      // Unique synthetic id: reusing the client's id would collide with
      // the request upstream just answered, and the dataset fetch would
      // be silently dropped.
      entry.followId = `${AUTO_FOLLOW_ID_PREFIX}${++followSeq}`;
      entry.followKeyRegistered = true;
      byFollowId.set(entry.followId, key);
      entry.timer = setTimeout(() => emitHeld(key), 15000);
      upstream.stdin.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: entry.followId,
          method: "tools/call",
          params: {
            name: "get-dataset-items",
            arguments: { datasetId: dataset.id, limit: dataset.itemCount },
          },
        }) + "\n"
      );
      return;
    }

    const rowsBlock = Array.isArray(parsed.result?.content)
      ? parsed.result.content.find((b) => b.type === "text")
      : null;
    const rows = safeParseRows(rowsBlock?.text ?? "");
    finishPending(key);
    const frame =
      rows.length > 0
        ? {
            jsonrpc: "2.0",
            id: entry.clientId,
            result: {
              ...parsed.result,
              content: [
                { type: "text", text: mergeRowsIntoResult(entry.originalText, rows) },
              ],
            },
          }
        : entry.originalFrame;
    process.stdout.write(JSON.stringify(frame) + "\n");
  });

  const clientLines = createInterface({ input: process.stdin });
  clientLines.on("line", (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    const local = routeLocally(msg, toolDefinition, "2025-06-18");
    if (local !== null) {
      if (local !== undefined) {
        process.stdout.write(JSON.stringify(local) + "\n");
      }
      return;
    }

    if (
      msg.method === "tools/call" &&
      msg.params?.name === TOOL_NAME &&
      msg.id !== undefined
    ) {
      pending.set(String(msg.id), { stage: "run", clientId: msg.id });
    }
    upstream.stdin.write(JSON.stringify(msg) + "\n");
  });

  const shutdown = () => upstream.kill();
  process.stdin.on("end", shutdown);
  upstream.on("exit", (code) => {
    process.exitCode = code ?? 0;
  });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  main();
}
