// Read-only rehearsal: no telemetry inserts, phone sends, credential output or model API calls.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { inspectHelmetHealth } from "../src/demo-health.js";
import type { exposureLoad } from "../src/practice.js";

type Report = ReturnType<typeof exposureLoad>;
const checks: { name: string; ok: boolean; detail: string }[] = [];
let heartbeat: ReturnType<typeof inspectHelmetHealth>["heartbeat"] = null;
let automaticAlerts: { mode?: string; armed?: boolean; model?: string; blocked_reason?: string;
  review_readiness?: {single_cooldown_seconds_remaining:number;cluster_cooldown_seconds_remaining:number;review_jobs_remaining_24h:number} } | undefined;
const expectedTools = ["exposure_load", "flag_for_review", "get_impacts", "show_last_hit", "show_practice_week"];
async function check(name: string, action: () => Promise<string>, failure: string) {
  try {
    const detail = await action();
    checks.push({ name, ok: true, detail }); console.log("PASS  " + name + ": " + detail);
  } catch {
    // SDK/network errors can include the full private URL. Never print them.
    checks.push({ name, ok: false, detail: failure }); console.log("CHECK " + name + ": " + failure);
  }
}
await check("Helmet connection", async () => {
  const response = await fetch("http://127.0.0.1:3000/health", { signal: AbortSignal.timeout(5000) });
  assert(response.ok);
  const health = await response.json();
  automaticAlerts = health.automatic_alerts;
  const result = inspectHelmetHealth(health);
  heartbeat = result.heartbeat;
  if (!result.ok) {
    // These are our own fixed messages, never remote exception text.
    console.log(result.problems.join("\n"));
    throw new Error("helmet_check_failed");
  }
  return `${heartbeat!.player}, heartbeat ${heartbeat!.age_seconds}s old, calibrated, normal detection, queue 0, drops 0`;
}, "Start Helmet, check board power/private Wi-Fi, and wait for a fresh normal-mode heartbeat.");
await check("Automatic trainer reviews", async () => {
  assert(automaticAlerts?.mode === "live" && automaticAlerts.armed && automaticAlerts.model && !automaticAlerts.blocked_reason);
  const ready=automaticAlerts.review_readiness;
  assert(ready && ready.review_jobs_remaining_24h>0);
  const wait = (s:number) => s===0 ? "ready" : `${Math.floor(s/60)}m ${s%60}s left; wait before this demo`;
  return `Live worker armed. Single-hit alert: ${wait(ready.single_cooldown_seconds_remaining)}. Cluster alert: ${wait(ready.cluster_cooldown_seconds_remaining)}. ${ready.review_jobs_remaining_24h} reviews available in the rolling 24h budget.`;
}, "Check automatic-review mode, model key and remaining review budget in local health; do not erase saved review receipts.");

let publicUrl: URL | undefined;
await check("Saved public connection", async () => {
  const config = JSON.parse(readFileSync(new URL("../.mcp-use/state/helmet-connection.json", import.meta.url), "utf8"));
  const url = new URL(config.mcp_url);
  assert(url.protocol === "https:" && url.pathname === "/mcp" && url.searchParams.has("access_token"));
  publicUrl = url;
  return "Private HTTPS connection is saved; key remains hidden.";
}, "Start Helmet with its tunnel. Read server/CONNECT_AGENTS.md if the saved connection is missing.");

for (const [name, endpoint] of [["Local MCP", new URL("http://localhost:3000/mcp")], ["Public MCP", publicUrl]] as const) {
  await check(name, async () => {
    assert(endpoint);
    const client = new Client({ name: "helmet-demo-preflight", version: "1.0.0" });
    try {
      await client.connect(new StreamableHTTPClientTransport(endpoint), { timeout: 10000 });
      const inventory = await client.listTools({}, { timeout: 10000 });
      assert.deepEqual(inventory.tools.map(t => t.name).sort(), expectedTools);
      assert(inventory.tools.every(t => t.description?.includes("Relative helmet-impact telemetry, not a diagnosis; a human trainer decides.")));
      const call = (tool: string, args: Record<string, unknown>) => client.callTool({ name: tool, arguments: args }, undefined, { timeout: 10000 });
      const history = await call("get_impacts", { since_minutes: 10080 }); assert(!history.isError);
      const live = await call("exposure_load", {});
      const liveReport = live.structuredContent as Report;
      assert(!live.isError && liveReport.data_source === "live" && liveReport.simulated === false);
      assert(liveReport.events.every(h => !h.simulated));
      const result = await call("exposure_load", { data_source: "simulated_week", player: "#72", drill: "inside_run" });
      const simulation = result.structuredContent as Report, focus = simulation.review_candidates[0];
      assert(!result.isError && simulation.simulated && focus.player === "#72" && focus.day === "Thu");
      assert(focus.count === 8 && focus.observed_minutes === 20 && focus.prior_count === 7 && focus.prior_observed_minutes === 60 && focus.rate_ratio === 3.43);
      assert(simulation.events.every(h => h.simulated && h.reviewable_impact_id === null));
      for (const tool of ["show_last_hit", "show_practice_week"]) {
        const result = await call(tool, tool === "show_practice_week" ? { player: "#72" } : {});
        assert(!result.isError);
      }
      for (const resourceName of ["helmet", "practice"]) {
        const resources=await client.listResources({}, {timeout:10000});
        const uri=resources.resources.find(r=>r.name===resourceName)?.uri;
        assert(uri && /^ui:\/\/widget\//.test(uri));
        const resource = await client.readResource({ uri }, { timeout: 10000 });
        const html = resource.contents.find(c => "text" in c)?.text;
        assert(typeof html === "string" && html.includes("<") && !/<script\b[^>]*\bsrc=/i.test(html));
      }
      return "5 tools, live history, both inline widgets, fictional OL pattern 8/20 min vs 7/60 min (3.43x).";
    } finally { await client.close(); }
  }, "MCP/tool/widget rehearsal failed. Check the running build and tunnel; client rendering still needs a separate browser rehearsal.");
}
await check("Public receiver isolation", async () => {
  assert(publicUrl);
  for (const path of ["/impact", "/heartbeat", "/health", "/inspector"]) {
    const url = new URL(path, publicUrl.origin); url.search = publicUrl.search;
    const response = await fetch(url, { method: "POST", body: "{}", signal: AbortSignal.timeout(10000) });
    await response.text(); assert.equal(response.status, 404);
  }
  const noKey = await fetch(new URL("/mcp", publicUrl.origin), { method: "POST", body: "{}", signal: AbortSignal.timeout(10000) });
  await noKey.text(); assert.equal(noKey.status, 401);
  const foreign = await fetch(publicUrl, { method: "POST", headers: { Origin: "https://evil.example" }, body: "{}", signal: AbortSignal.timeout(10000) });
  await foreign.text(); assert.equal(foreign.status, 403);
  return "Receiver/health/inspector blocked; MCP key and origin checks enforced.";
}, "Public boundary check failed. Do not use this tunnel until its route/key/origin checks pass.");

const ok = checks.every(c => c.ok);
const receipt = { checked_at_utc: new Date().toISOString(), software_preflight_passed: ok,
  checks, heartbeat, automatic_alerts: automaticAlerts, messages_sent: 0, telemetry_rows_inserted: 0,
  scope: "Read-only connection/tool/widget-resource rehearsal. Does not qualify physical mounting, new impacts, actual client rendering or phone delivery.",
  not_verified_by_this_check: ["normal impact after latest firmware", "mounting and controlled drop qualification", "actual-client rendering", "phone delivery or autonomous alert loop"] };
writeFileSync(fileURLToPath(new URL("../../evidence/demo-preflight.json", import.meta.url)), JSON.stringify(receipt, null, 2) + "\n");
console.log(ok ? "\nSoftware checks passed. Follow docs/DEMO.md for the physical and agent/phone rehearsal." : "\nResolve the CHECK items above, then run Check Helmet again.");
console.log("No texts sent. No test hits added. Receipt: evidence/demo-preflight.json");
process.exitCode = ok ? 0 : 1;
