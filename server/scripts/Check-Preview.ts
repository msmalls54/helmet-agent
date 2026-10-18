// Regression check for the real inline widget preview, without sending a text.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const base = "http://localhost:3000";
const client = new Client({ name: "helmet-preview-check", version: "1.0.0" });
try {
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
  const resourceUri=(await client.listResources()).resources.find(r=>r.name==="helmet")?.uri;
  assert(resourceUri);
  const resource = await client.readResource({ uri:resourceUri });
  const result = await client.callTool({ name: "show_last_hit", arguments: {} });
  const checks = [];
  for (const protocol of ["resources", "mcp-apps"]) {
    const body = JSON.stringify({ serverId: "helmet-preview-check", uri:resourceUri,
      toolId: `helmet-preview-${protocol}`, toolName: "show_last_hit", toolInput: {},
      toolOutput: result.structuredContent, resourceData: resource,
      theme: "light", protocol: protocol === "mcp-apps" ? "mcp-apps" : "chatgpt-app", cspMode: "strict",
      mimeType: resource.contents[0].mimeType });
    assert(Buffer.byteLength(body) > 4096 && Buffer.byteLength(body) < 2 * 1024 * 1024);
    const response = await fetch(`${base}/inspector/api/${protocol}/widget/store`, {
      method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body,
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(response.status, 200); await response.text();
    checks.push({ protocol, request_bytes: Buffer.byteLength(body), status: response.status });
  }
  const tooLarge = await fetch(`${base}/heartbeat`, { method: "POST", body: "x".repeat(4097), signal: AbortSignal.timeout(3000) });
  assert.equal(tooLarge.status, 413); await tooLarge.text();
  const foreign = await fetch(`${base}/inspector/api/resources/widget/store`, {
    method: "POST", headers: { Origin: "https://evil.example" }, body: "{}", signal: AbortSignal.timeout(3000),
  });
  assert.equal(foreign.status, 403); await foreign.text();
  const receipt = { checked_at_utc: new Date().toISOString(), preview_stores: checks,
    firmware_oversized_status: tooLarge.status, foreign_origin_status: foreign.status, messages_sent: 0 };
  writeFileSync("../evidence/widget-preview-check.json", JSON.stringify(receipt, null, 2) + "\n");
  console.log(JSON.stringify(receipt));
} finally { await client.close(); }
