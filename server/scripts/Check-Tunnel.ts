// Exercises the real public HTTPS boundary, without sending an iMessage.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const config = JSON.parse(readFileSync(resolve(".mcp-use/state/helmet-connection.json"), "utf8"));
const privateUrl = new URL(config.mcp_url);
const isManufact = config.provider.includes("Manufact");
const isNgrok = config.provider.startsWith("ngrok");
const negative: { path: string; status: number }[] = [];
for (const path of ["/impact", "/heartbeat", "/inspector", "/sse", "/mcp-use/widgets/helmet", "/mcp-use/widgets/practice", "/mcp/../impact", ...(!isManufact ? ["/health"] : [])]) {
  const url = new URL(path, privateUrl.origin);
  url.search = privateUrl.search;
  const response = await fetch(url, { method: "POST", body: "{}", signal: AbortSignal.timeout(10000) });
  await response.text();
  assert.equal(response.status, 404, path);
  negative.push({ path, status: response.status });
}
const blockedBrowserGets: { path: string; status: number }[] = [];
let browserWarning: { status: number; provider_error_code: string | null; application_data_exposed: boolean } | null = null;
if (isNgrok) {
  // Free ngrok injects its own warning for browser-style HTML GETs before the
  // application runs. Check the actual gateway separately, then record that
  // edge behavior instead of claiming every browser request returns our 404.
  for (const path of ["/", "/impact", "/heartbeat", "/health", "/inspector"]) {
    const result = await fetch(new URL(path, privateUrl.origin), { headers: {
      Accept: "text/html", "User-Agent": "Mozilla/5.0", "ngrok-skip-browser-warning": "1",
    }, signal: AbortSignal.timeout(10000) });
    assert.equal(result.status, 404, `browser GET ${path}`); await result.text();
    blockedBrowserGets.push({ path, status: result.status });
  }
  const warning = await fetch(new URL("/impact", privateUrl.origin), {
    headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(10000),
  });
  const warningText = await warning.text();
  assert(!warningText.includes('"heartbeats"') && !warningText.includes('"peak_g"'));
  browserWarning = { status: warning.status, provider_error_code: warning.headers.get("ngrok-error-code"), application_data_exposed: false };
}
// Manufact owns /health at its edge. It must never reveal the laptop's health,
// heartbeat history or tools; its generic relay health response is independent.
let edgeStatus: Record<string, unknown> | null = null;
if (isManufact) {
  const edgeHealth = await fetch(new URL("/health", privateUrl.origin), { signal: AbortSignal.timeout(10000) });
  edgeStatus = await edgeHealth.json() as Record<string, unknown>;
  assert.equal(edgeStatus.transport, "websocket-binary");
  assert(!("heartbeats" in edgeStatus) && !("service" in edgeStatus));
}
const missingKey = await fetch(new URL("/mcp", privateUrl.origin), { method: "POST", body: "{}", signal: AbortSignal.timeout(10000) });
assert.equal(missingKey.status, 401); await missingKey.text();
const foreign = await fetch(privateUrl, { method: "POST", headers: { Origin: "https://evil.example" }, body: "{}", signal: AbortSignal.timeout(10000) });
assert.equal(foreign.status, 403); await foreign.text();
const client = new Client({ name: "helmet-public-https-check", version: "1.0.0" });
try {
  await client.connect(new StreamableHTTPClientTransport(privateUrl));
  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map(t => t.name).sort(), ["exposure_load", "flag_for_review", "get_impacts", "show_last_hit", "show_practice_week"]);
  const history = await client.callTool({ name: "get_impacts", arguments: { since_minutes: 10 } });
  assert(!history.isError);
  // Cloud clients previously timed out, and the optional SSE GET also hung.
  // Stateless MCP must finish its GET and remain usable under concurrent calls.
  const stream = await fetch(privateUrl, { headers: { Accept: "text/event-stream" }, signal: AbortSignal.timeout(10000) });
  assert.equal(stream.status, 405); await stream.text();
  const concurrent = await Promise.all(Array.from({ length: 3 }, () =>
    client.callTool({ name: "get_impacts", arguments: { since_minutes: 10 } })));
  assert(concurrent.every(result => !result.isError));
  const widget = await client.callTool({ name: "show_last_hit", arguments: {} });
  assert(!widget.isError);
  const resourceUri=(await client.listResources()).resources.find(r=>r.name==="helmet")?.uri;
  assert(resourceUri);
  const resource = await client.readResource({ uri:resourceUri });
  const html = resource.contents.find(c => "text" in c)?.text;
  assert.equal(typeof html, "string");
  assert(!/<script\b[^>]*\bsrc=["'][^"']+["'][^>]*>/i.test(html as string), "Widget must not require a public asset route");
  assert(!/<link\b[^>]*rel=["']stylesheet["'][^>]*>/i.test(html as string), "Widget CSS must be inline");
  const receipt = { checked_at_utc: new Date().toISOString(), provider: config.provider,
    public_origin: privateUrl.origin, mcp_path: "/mcp", private_access_key_required: true,
    blocked_paths: negative, no_key_status: missingKey.status, foreign_origin_status: foreign.status,
    browser_gets_blocked_at_gateway: blockedBrowserGets, provider_browser_warning: browserWarning,
    provider_owned_health: edgeStatus,
    tools: tools.tools.map(t => t.name), history: history.structuredContent,
    widget: widget.structuredContent, widget_resource_bytes: Buffer.byteLength(html as string),
    widget_assets_inline: true, stateless_stream_status: stream.status,
    concurrent_history_calls: concurrent.length, messages_sent_by_check: 0 };
  writeFileSync(resolve("../evidence/gate-public-https.json"), JSON.stringify(receipt, null, 2) + "\n");
  console.log(JSON.stringify({ public_origin: privateUrl.origin, tools: receipt.tools, private_endpoints_blocked: true, widget_inline: true, messages_sent: 0 }));
} finally { await client.close(); }
