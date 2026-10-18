// Optional ONE labeled real Inkbox message from an isolated temporary database.
// No rows are inserted into server/data/helmet.sqlite, no physical hit is claimed.
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Hono } from "hono";
import { Store } from "../src/store.js";
import { Reviews } from "../src/reviews.js";
import { AlertLoop, defaultAlertConfig } from "../src/alert-loop.js";
import { xaiAlertAgent } from "../src/alert-agent.js";
import { inkboxMessenger, type Messenger } from "../src/inkbox.js";
import { addReceiver } from "../src/receiver.js";

const sendTest = process.argv.includes("--send-test");
const cluster = process.argv.includes("--cluster");
const folder = mkdtempSync(resolve("../.cache/automatic-test-")), store = new Store(resolve(folder, "test.sqlite"));
let loop: AlertLoop | undefined;
let sends = 0, investigationCalls = 0, actualText: string | null = null;
const receipt: Record<string, unknown> = { checked_at_utc: new Date().toISOString(),
  input_source: "invented software fixture in an isolated temporary database", physical_hit_test: false,
  production_database_written: false, real_inkbox_send_requested: sendTest, passed: false };
try {
  const key = process.env.HELMET_AGENT_API_KEY;
  assert(key, "Load the encrypted model key first.");
  const real = sendTest ? inkboxMessenger() : undefined;
  const messenger: Messenger = { conversationId: real?.conversationId ?? "fake-test-conversation",
    async send(text, id) {
      sends++; actualText = "AUTOMATIC LOOP TEST — SIMULATED DATA\n" + text;
      return real ? real.send(actualText, id) : { message_id: "fake-test", conversation_id: "fake-test-conversation", status: "delivered", service: "fake", recipient_delivery_status: "delivered", delivered_at: new Date().toISOString() };
    }, async read(id) { assert(real); return real.read(id); } };
  const agent = xaiAlertAgent(key, process.env.HELMET_AGENT_MODEL);
  const wrapped = { model: agent.model, async investigate(...args: Parameters<typeof agent.investigate>) { investigationCalls++; return agent.investigate(...args); } };
  const config = { ...defaultAlertConfig, mode: "live" as const, helmetId: "automatic-loop-test", player: "#TEST" };
  const hit = { type: "impact" as const, id: 1, ms: cluster?40000:1000, helmet_id: config.helmetId,
    boot_id: "isolated-software-test", player: config.player, peak_g: cluster?14:42, peak_rot_rads: 5,
    peak_rot_dps: 286.5, location: "right" as const, location_validated: false,
    ax: 42, ay: 0, az: 0, fifo_samples: 32, gyro_window_complete: true,
    accel_clipped: false, gyro_clipped: false, calibration_capture: false };
  store.saveImpact({...hit,ms:(hit.ms-20*60000)>>>0}, new Date(Date.now() - 20 * 60000).toISOString()); // Prior fixture history, never replayed.
  const reviews = new Reviews(store, () => messenger);
  loop = new AlertLoop(store, reviews, wrapped, config, console.log, Date.now,
    "AUTOMATIC LOOP TEST: invented empty-helmet input; no player was hit.");
  const app = new Hono(); addReceiver(app, store, () => {}, undefined, loop);
  store.saveHeartbeat({ type: "heartbeat", helmet_id: config.helmetId, player: config.player, boot_id: hit.boot_id,
    uptime_ms: hit.ms, rssi: -30, calibrated: true, queued_hits: 0, dropped_hits: 0,
    diagnostic_mode: "normal", impact_detection_paused: false });
  const request = (id=cluster?4:2,ms=hit.ms) => app.request("/impact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...hit, id,ms }) });
  loop.start();
  if(cluster){assert.equal((await request(2,1000)).status,200);assert.equal((await request(3,20000)).status,200);}
  const ack = await request(); assert.equal(ack.status, 200);
  const ackBody = await ack.json(); assert.equal(ackBody.duplicate, false);
  const deadline = Date.now() + 65000;
  let job: { state: string; analysis: string; result: string; note: string } | undefined;
  while (Date.now() < deadline) {
    job = store.db.prepare("SELECT * FROM alert_jobs WHERE impact_id=?").get(ackBody.impact_id) as typeof job;
    if (job && ["delivered", "needs_attention", "skipped"].includes(job.state)) break;
    await delay(100);
  }
  assert(job?.state === "delivered", "Automatic review did not reach delivered state.");
  const analysis = JSON.parse(job.analysis);
  assert.equal(analysis.history.count, cluster?4:2); assert.equal(analysis.decision.reason, cluster?"recent_cluster":"large_reading");
  if(cluster){assert.equal(analysis.history.policy.recent_usable_count,3);assert.equal((store.db.prepare("SELECT count(*) n FROM alert_jobs WHERE state='observed'").get() as {n:number}).n,2);}
  assert.deepEqual(analysis.trace.map((t: {tool:string}) => t.tool), ["get_impacts", "flag_for_review"]);
  assert.equal(investigationCalls, 1); assert.equal(sends, 1);
  assert.equal((await (await request()).json()).duplicate, true);
  await loop.stop();
  const restarted = new AlertLoop(store, reviews, wrapped, config, () => {});
  await restarted.tick(); await restarted.stop();
  assert.equal(sends, 1); assert.equal(investigationCalls, 1);
  Object.assign(receipt, { passed: true, mode: sendTest ? "real xAI + real Inkbox" : "real xAI + fake messenger",
    model: agent.model, tool_sequence: analysis.trace, model_usage: analysis.usage,
    history_count: analysis.history.count, review_basis: analysis.decision.reason,
    provider_receipt: JSON.parse(job.result), text: actualText,
    message_send_attempts: sends, model_investigations: investigationCalls,
    duplicate_ingest_and_worker_restart_no_resend: true, live_impact_count_unchanged_by_test: true });
  console.log("Automatic HTTP hit -> real agent history lookup -> review -> " + (sendTest ? "Inkbox provider delivered." : "fake delivery verified."));
} catch {
  receipt.problem = "Automatic test did not complete. Inspect isolated test.sqlite job/review status; no new send key should be invented.";
  receipt.message_send_attempts = sends; process.exitCode = 1;
  console.error(receipt.problem);
} finally {
  await loop?.stop(); store.close();
  const file=sendTest?"automatic-alert-loop-test.json":cluster?"selective-cluster-model-test.json":"selective-alert-model-test.json";
  writeFileSync(resolve("../evidence/"+file), JSON.stringify(receipt, null, 2) + "\n");
}
