import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Hono } from "hono";
import { Store } from "../src/store.js";
import { Reviews } from "../src/reviews.js";
import { addReceiver } from "../src/receiver.js";
import { AlertLoop, defaultAlertConfig } from "../src/alert-loop.js";
import { captureNeedsReview, xaiAlertAgent, type AlertAgent, type AgentReview } from "../src/alert-agent.js";
import { hit } from "./fixtures.js";
import type { Delivery, Messenger } from "../src/inkbox.js";
import { compactImpact } from "../src/impacts.js";
import { assessAlert } from "../src/alert-policy.js";

const delivered: Delivery = { message_id: "fake-message", conversation_id: "test", status: "delivered", service: "imessage", recipient_delivery_status: "delivered", delivered_at: "2026-10-17T22:00:00Z" };
const config = { ...defaultAlertConfig, mode: "live" as const, helmetId: hit.helmet_id, player: hit.player };
function harness(store = new Store(":memory:")) {
  let time = Date.parse("2026-10-17T22:00:00Z"), modelCalls = 0, sends = 0;
  const texts: string[] = [];
  const messenger: Messenger = { conversationId: "test", async send(text) { sends++; texts.push(text); return delivered; }, async read() { return delivered; } };
  const agent: AlertAgent = { model: "fake-test", async investigate(current, readHistory) {
    modelCalls++; const history = readHistory();
    const result: AgentReview = { decision: { impact_id: current.impact_id,
      reason: captureNeedsReview(current) ? "capture_quality" : history.policy.reason === "recent_cluster" ? "recent_cluster" : "large_reading",
      evidence_ids: history.policy.evidence_ids, observation: "Factual demo observation, not a medical conclusion." },
      history, trace: [{ tool: "get_impacts", args: {}, result_count: history.count }], usage: { input_tokens: 1, output_tokens: 1 } };
    return result;
  } };
  const reviews = new Reviews(store, () => messenger, 0);
  const loop = new AlertLoop(store, reviews, agent, config, () => {}, () => time);
  function beat(change = {}) { store.saveHeartbeat({ type: "heartbeat", helmet_id: hit.helmet_id, boot_id: hit.boot_id, player: hit.player,
    uptime_ms: 1000 + time-Date.parse("2026-10-17T22:00:00Z"), rssi: -30, calibrated: true, queued_hits: 0, dropped_hits: 0,
    diagnostic_mode: "normal", impact_detection_paused: false, ...change }, new Date(time).toISOString()); }
  function impact(id = 1, change = {}) { return store.saveImpact({ ...hit, id, ms: 1000 + time-Date.parse("2026-10-17T22:00:00Z"), ...change }, new Date(time).toISOString()).impact_id; }
  return { store, loop, agent, reviews, beat, impact, texts, now: () => time, advance: (ms: number) => { time += ms; },
    calls: () => ({ modelCalls, sends }) };
}
test("HTTP impact automatically reads history then sends; receiver ACK does not wait for the model", async () => {
  const h = harness(); const app = new Hono();
  addReceiver(app, h.store, () => {}, undefined, h.loop);
  try {
    h.beat(); h.loop.start();
    const response = await app.request("/impact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...hit, ms: 1000 }) });
    assert.equal(response.status, 200); assert.deepEqual(h.calls(), { modelCalls: 0, sends: 0 });
    for (let n = 0; n < 20 && h.calls().sends === 0; n++) await delay(50);
    assert.deepEqual(h.calls(), { modelCalls: 1, sends: 1 });
    assert.match(h.texts[0], /Check #44/); assert.match(h.texts[0], /1 recorded hit/);
    assert.equal((h.store.db.prepare("SELECT state FROM alert_jobs").get() as {state:string}).state, "delivered");
    await app.request("/impact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...hit, ms: 1000 }) });
    await h.loop.tick(); assert.equal(h.calls().sends, 1);
  } finally { await h.loop.stop(); h.store.close(); }
});
test("activation skips backlog; calibration, synthetic, wrong player and stale device events cannot text", async () => {
  const store = new Store(":memory:"); store.saveImpact(hit);
  const h = harness(store);
  try {
    h.beat(); await h.loop.tick(); assert.equal(h.calls().modelCalls, 0);
    h.impact(2, { calibration_capture: true }); h.impact(3, { simulated: true });
    h.impact(4, { player: "other" }); h.impact(5, { ms: 4294800000 });
    await h.loop.tick(); assert.deepEqual(h.calls(), { modelCalls: 0, sends: 0 });
    assert.equal((store.db.prepare("SELECT count(*) n FROM alert_jobs WHERE state='skipped'").get() as {n:number}).n, 4);
  } finally { await h.loop.stop(); store.close(); }
});

test("two small hits stay silent, the third prompts history review, and a fourth cannot spam another cluster text", async () => {
  const h=harness();
  try {
    h.beat(); h.impact(1,{peak_g:14}); await h.loop.tick();
    h.advance(30000); h.beat(); h.impact(2,{peak_g:18}); await h.loop.tick();
    assert.deepEqual(h.calls(),{modelCalls:0,sends:0});
    assert.equal((h.store.db.prepare("SELECT count(*) n FROM alert_jobs WHERE state='observed'").get() as {n:number}).n,2);
    h.advance(30000); h.beat(); h.impact(3,{peak_g:16}); await h.loop.tick();
    assert.deepEqual(h.calls(),{modelCalls:1,sends:1});
    assert.match(h.texts[0],/3 helmet hits/); assert.match(h.texts[0],/90 seconds/);
    assert.doesNotMatch(h.texts[0],/device boot|configured|onset-censored/);
    assert.deepEqual(h.loop.status().review_readiness,{single_cooldown_seconds_remaining:30,cluster_cooldown_seconds_remaining:300,review_jobs_remaining_24h:19});
    h.advance(31000); h.beat(); h.impact(4,{peak_g:15}); await h.loop.tick();
    assert.deepEqual(h.calls(),{modelCalls:1,sends:1});
    assert.equal(h.loop.status().review_readiness.cluster_cooldown_seconds_remaining,269);
    assert.equal((h.store.db.prepare("SELECT count(*) n FROM impacts").get() as {n:number}).n,4);
  } finally { await h.loop.stop();h.store.close(); }
});
test("fresh same-boot normal heartbeat is required and pending work expires", async () => {
  const h = harness();
  try {
    h.beat({ impact_detection_paused: true }); h.impact(); await h.loop.tick();
    assert.equal(h.calls().sends, 0);
    h.advance(61000); await h.loop.tick(); assert.equal(h.calls().modelCalls, 0);
    assert.equal((h.store.db.prepare("SELECT state FROM alert_jobs").get() as {state:string}).state, "skipped");
  } finally { await h.loop.stop(); h.store.close(); }
});
test("history is scoped to the current event and excludes calibration/synthetic/other-player records", async () => {
  const store = new Store(":memory:");
  const earlier = "2026-10-17T21:59:59Z";
  store.saveImpact({ ...hit, id: 1 }, earlier);
  store.saveImpact({ ...hit, id: 2, calibration_capture: true }, earlier);
  store.saveImpact({ ...hit, id: 3, simulated: true }, earlier);
  store.saveImpact({ ...hit, id: 4, player: "other" }, earlier);
  const h = harness(store); // Activation starts after these fixture records.
  try {
    h.beat();
    const current = h.impact(5); h.impact(6); // Later event must not enter the earlier decision.
    await h.loop.tick();
    const job = h.store.db.prepare("SELECT analysis FROM alert_jobs WHERE impact_id=?").get(current) as {analysis:string};
    const report = JSON.parse(job.analysis);
    assert.equal(report.history.count, 2);
    assert.deepEqual(report.history.hits.map((i:{impact_id:number}) => i.impact_id), [current, 1]);
  } finally { await h.loop.stop(); h.store.close(); }
});
test("a paused detector after model analysis prevents a new automatic send", async () => {
  const h = harness();
  const changed: AlertAgent = { model: "fake", async investigate(current, read) {
    const result = await h.agent.investigate(current, read); h.beat({ impact_detection_paused: true }); return result;
  } };
  const loop = new AlertLoop(h.store, h.reviews, changed, config, () => {}, h.now);
  try { h.beat(); h.impact(); await loop.tick(); assert.equal(h.calls().sends, 0); }
  finally { await loop.stop(); await h.loop.stop(); h.store.close(); }
});
test("accepted send is reconciled with a read rather than resent", async () => {
  const h = harness(); let sends = 0, reads = 0;
  const messenger: Messenger = { conversationId: "test", async send() { sends++; return { ...delivered, status: "sent" }; },
    async read() { reads++; return delivered; } };
  const loop = new AlertLoop(h.store, new Reviews(h.store, () => messenger, 0), h.agent, config, () => {}, h.now);
  try {
    h.beat(); h.impact(); await loop.tick(); assert.equal(sends, 1);
    h.advance(6000); await loop.tick(); assert.equal(reads, 1); assert.equal(sends, 1);
    assert.equal((h.store.db.prepare("SELECT state FROM alert_jobs").get() as {state:string}).state, "delivered");
  } finally { await loop.stop(); await h.loop.stop(); h.store.close(); }
});
test("cooldown and 24-hour budget survive separate jobs; quality warning and dry run are explicit", async () => {
  const h = harness();
  try {
    h.beat(); h.impact(1, { accel_window_left_censored: true }); await h.loop.tick();
    assert.match(h.texts[0], /recording was partial or clipped/);
    h.impact(2); await h.loop.tick(); assert.equal(h.calls().sends, 1);
    const job = h.store.db.prepare("SELECT state FROM alert_jobs WHERE impact_id=2").get() as {state:string}; assert.equal(job.state, "suppressed");
    h.advance(31000); h.beat();
    const budgetLoop = new AlertLoop(h.store, h.reviews, h.agent, { ...config, cooldownMs: 0, maxPerDay: 1 }, () => {}, h.now);
    h.impact(3); await budgetLoop.tick(); assert.equal(h.calls().modelCalls, 1); await budgetLoop.stop();
    const dry = new AlertLoop(h.store, h.reviews, h.agent, { ...config, mode: "dry_run", cooldownMs: 0 }, () => {}, h.now);
    h.impact(4); await dry.tick(); assert.equal(h.calls().modelCalls, 2); assert.equal(h.calls().sends, 1); await dry.stop();
  } finally { await h.loop.stop(); h.store.close(); }
});
test("lost send response plus restart reuses decision, exact body/key and one logical message", async () => {
  const folder = mkdtempSync(join(tmpdir(), "helmet-alert-")), file = join(folder, "test.sqlite");
  let store = new Store(file), time = Date.parse("2026-10-17T22:00:00Z");
  const h = harness(store), attempts: { text:string; key:string }[] = [];
  const messenger: Messenger = { conversationId: "test", async send(text, key) {
    attempts.push({ text, key }); if (attempts.length === 1) throw new Error("lost acknowledgement"); return delivered;
  }, async read() { return delivered; } };
  let loop = new AlertLoop(store, new Reviews(store, () => messenger, 0), h.agent, config, () => {}, () => time);
  try {
    h.beat(); h.impact(); await loop.tick(); assert.equal(h.calls().modelCalls, 1);
    await loop.stop(); store.close(); time += 6000;
    store = new Store(file); loop = new AlertLoop(store, new Reviews(store, () => messenger, 0), h.agent, config, () => {}, () => time);
    await loop.tick(); assert.equal(h.calls().modelCalls, 1); assert.equal(attempts.length, 2);
    assert.deepEqual(attempts[0], attempts[1]);
    await loop.tick(); assert.equal(attempts.length, 2);
  } finally { await loop.stop(); store.close(); rmSync(folder, { recursive: true, force: true }); }
});
test("model cannot redirect another impact, bypass history or put invented prose in the phone text", async () => {
  const h = harness();
  const badAgent: AlertAgent = { model: "fake", async investigate(current, read) {
    const result = await h.agent.investigate(current, read); result.decision.impact_id = 999; return result;
  } };
  const loop = new AlertLoop(h.store, h.reviews, badAgent, config, () => {}, h.now);
  try {
    h.beat(); h.impact(); await loop.tick(); h.advance(4000); await loop.tick(); h.advance(4000); await loop.tick();
    assert.equal(h.calls().sends, 0);
    assert.equal((h.store.db.prepare("SELECT state FROM alert_jobs").get() as {state:string}).state, "needs_attention");
  } finally { await loop.stop(); await h.loop.stop(); h.store.close(); }
});
test("xAI adapter must call history before a validated review and rejects malformed/truncated output", async () => {
  const h = harness(); h.beat(); const id = h.impact(), current = compactImpact(h.store.getImpact(id)!);
  const history = { count: 1, returned_count: 1, truncated: false, since: "", through: "", time_basis: "test", hits: [current], policy: assessAlert(current, [current]) };
  const calls: unknown[] = []; let read = false;
  const request: typeof fetch = async (url, init) => {
    assert.equal(url, "https://api.x.ai/v1/responses"); const body = JSON.parse(String(init?.body)); calls.push(body);
    assert.equal(body.store, false); assert.equal(body.max_output_tokens, 650);
    const first = calls.length === 1;
    if (!first) { assert(read); assert(body.input.some((i: {type:string}) => i.type === "function_call_output")); }
    return Response.json({ id: "fake-response", status: "completed", output: [{ type: "function_call", name: first ? "get_impacts" : "flag_for_review",
      call_id: "call", arguments: JSON.stringify(first ? {} : { impact_id: id, reason: "large_reading", evidence_ids: [id], observation: "Configured demo reading rule met. ".repeat(30) }) }] });
  };
  try {
    const result = await xaiAlertAgent("test-key", undefined, request).investigate(current, () => { read = true; return history; });
    assert.equal(result.trace[0].tool, "get_impacts"); assert.equal(calls.length, 2);
    assert.equal(result.decision.observation.length,350,"audit verbosity is bounded locally without changing review facts");
    await assert.rejects(xaiAlertAgent("test-key", undefined, async () => Response.json({ id: "bad", status: "incomplete", output: [] })).investigate(current, () => history));
  } finally { await h.loop.stop(); h.store.close(); }
});
