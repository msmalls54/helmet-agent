import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import type { AddressInfo } from "node:net";
import { Store } from "../src/store.js";
import { addReceiver } from "../src/receiver.js";

import { hit } from "./fixtures.js";
const beat = { type: "heartbeat", helmet_id: "test-helmet", boot_id: "test-boot", player: "#44",
  uptime_ms: 200, rssi: -35, calibrated: true, queued_hits: 0, dropped_hits: 0 };

test("loopback Resources previews accept their duplicated bundle while telemetry stays small", async()=>{
  const store=new Store(":memory:"),app=new Hono();
  addReceiver(app,store,()=>{});
  const path="/inspector/api/mcp-apps/widget/store";
  app.post(path,async c=>c.json({bytes:(await c.req.text()).length}));
  const server=serve({fetch:app.fetch,hostname:"127.0.0.1",port:0});
  if(!server.listening)await new Promise<void>(resolve=>server.once("listening",resolve));
  const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const large=JSON.stringify({html:"x".repeat(2_600_000)});
    const preview=await fetch(base+path,{method:"POST",headers:{Origin:"http://localhost:3000"},body:large});
    assert.equal(preview.status,200);assert.equal((await preview.json()).bytes,large.length);
    const blocked=await fetch(base+path,{method:"POST",headers:{Origin:"https://evil.example"},body:"{}"});
    assert.equal(blocked.status,403);
    const impact=await fetch(base+"/impact",{method:"POST",body:JSON.stringify({...hit,padding:"x".repeat(5000)})});
    assert.equal(impact.status,413);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));store.close();}
});

test("receiver persists real-shaped telemetry, deduplicates retries, distinguishes boots and rejects malformed input", async () => {
  const folder = mkdtempSync(join(tmpdir(), "helmet-test-"));
  const path = join(folder, "test.sqlite");
  let store = new Store(path);
  try {
    const app = new Hono();
    let logged = 0;
    addReceiver(app, store, () => { logged++; });
    const post = (endpoint: string, body: unknown) => app.request(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const first = await post("/impact", hit);
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { ok: true, impact_id: 1, duplicate: false });
    assert.equal((await (await post("/impact", { ...hit })).json()).duplicate, true);
    assert.equal(logged, 1);
    assert.equal((await post("/impact", { ...hit, peak_g: 43 })).status, 409);
    assert.equal((await post("/impact", { ...hit, boot_id: "new-boot" })).status, 200);
    assert.equal((await post("/heartbeat", beat)).status, 200);
    assert.equal(store.lastHeartbeats()[0].calibrated, true);
    for (const bad of [{ ...hit, peak_g: -1 }, { ...hit, peak_g: null }, { ...hit, id: 1.5 }, { ...hit, type: "heartbeat" }]) {
      assert.equal((await post("/impact", bad)).status, 400);
    }
    assert.equal((await app.request("/impact", { method: "POST", body: "{broken" })).status, 400);
    assert.equal((await post("/impact", { ...hit, padding: "x".repeat(5000) })).status, 413);
    assert.equal((await app.request("/mcp", { method: "POST", headers: { Host: "localhost", "X-Forwarded-For": "127.0.0.1" } })).status, 403);
    store.close();
    store = new Store(path);
    assert.equal(store.getImpact(1)?.peak_g, 42);
    assert.equal(store.lastHeartbeats()[0].helmet_id, "test-helmet");
  } finally { store.close(); rmSync(folder, { recursive: true, force: true }); }
});
