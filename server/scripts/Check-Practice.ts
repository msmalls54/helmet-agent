// Read-only MCP calls and local widget previews; never calls flag_for_review.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { exposureLoad } from "../src/practice.js";
type Report = ReturnType<typeof exposureLoad>;
const config = JSON.parse(readFileSync(".mcp-use/state/helmet-connection.json", "utf8"));
const checks = [];
for (const url of ["http://localhost:3000/mcp", config.mcp_url as string]) {
  const client = new Client({ name: "helmet-practice-readonly-check", version: "1.0.0" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(url)));
    const tools = await client.listTools();
    assert(tools.tools.some(t => t.name === "exposure_load") && tools.tools.some(t => t.name === "show_practice_week"));
    const live = await client.callTool({ name: "exposure_load", arguments: {} });
    const current = live.structuredContent as Report;
    assert(!live.isError && !current.simulated);
    assert(current.events.every(h => !h.simulated));
    assert.equal(current.peer_comparisons.length, 0);
    assert.equal(current.team_context, null);
    const result = await client.callTool({ name: "exposure_load", arguments: { data_source: "simulated_week", player: "#72", drill: "inside_run" } });
    const report = result.structuredContent as Report;
    assert(!result.isError && report.simulated && report.review_candidates[0].rate_ratio === 3.43);
    assert.equal(report.players[0].medical_history?.reported_prior_concussions, 4);
    assert(report.events.every(h => h.simulated && h.reviewable_impact_id === null));
    const focus = report.review_candidates[0];
    const peer = report.peer_review_candidates.find(p => p.period_id === focus.period_id);
    assert.equal(peer?.ratio_to_highest_peer, 2.67);
    assert.deepEqual(peer?.peers.map(p => [p.player,p.count,p.observed_minutes]), [["#44",3,20],["#21",2,20]]);
    assert.equal(report.periods.find(p => p.id === focus.period_id)?.max_g, 24);
    assert(report.events.filter(h => h.period_id === focus.period_id).every(h => h.peak_g < 40));
    const display = await client.callTool({ name: "show_practice_week", arguments: { player: "#72" } });
    assert(!display.isError && (display.structuredContent as { report: Report }).report.simulated);
    const displayBytes = Buffer.byteLength(JSON.stringify(display.structuredContent));
    assert(displayBytes < 30000 && !('events' in (display.structuredContent as {report:object}).report));
    const resourceUri=(await client.listResources()).resources.find(r=>r.name==="practice")?.uri;
    assert(resourceUri);
    const resource = await client.readResource({ uri:resourceUri });
    const html = resource.contents.find(c => "text" in c)?.text;
    assert(typeof html === "string" && !/<script\b[^>]*\bsrc=/i.test(html));
    if (url.startsWith("http://localhost")) {
      const previews = [];
      for (const theme of ["light", "dark"]) {
        const response = await fetch("http://localhost:3000/inspector/api/mcp-apps/widget/store", {
          method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
          body: JSON.stringify({ serverId: "helmet-practice-readonly-check", uri:resourceUri,
            toolId: "practice-preview-" + theme, toolName: "show_practice_week", toolInput: { player: "#72" },
            toolOutput: display.structuredContent, resourceData: resource, theme, protocol: "mcp-apps", cspMode: "strict", mimeType: resource.contents[0].mimeType }),
          signal: AbortSignal.timeout(10000),
        });
        assert.equal(response.status, 200);
        previews.push({ theme, response: await response.json() });
      }
      writeFileSync("../.cache/practice-preview-stores.json", JSON.stringify(previews, null, 2));
    }
    checks.push({ endpoint: new URL(url).origin, tools: tools.tools.map(t => t.name), live_count: current.count,
      simulated_focus: focus, same_period_peer_comparison: peer, pattern_period_max_g: 24,
      live_peer_comparisons_available: false, widget_result_bytes:displayBytes,
      widget_resource_uri:resourceUri, inline_widget_bytes: Buffer.byteLength(html), messages_sent: 0 });
  } finally { await client.close(); }
}
const receipt = { checked_at_utc: new Date().toISOString(), checks, messages_sent: 0 };
writeFileSync("../evidence/practice-mcp-check.json", JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify(receipt, null, 2));
