import { test } from "node:test";
import assert from "node:assert/strict";
import { inspectHelmetHealth } from "../src/demo-health.js";

const now = Date.parse("2026-10-17T22:00:00Z");
const beat = { type: "heartbeat", helmet_id: "helmet-1", player: "#44", boot_id: "test",
  received_at: new Date(now - 10000).toISOString(), uptime_ms: 20000, rssi: -40,
  calibrated: true, diagnostic_mode: "normal", impact_detection_paused: false, queued_hits: 0, dropped_hits: 0 };
const health = (change = {}) => ({ ok: true, service: "helmet-agent", heartbeats: [{ ...beat, ...change }] });
test("demo check requires a fresh heartbeat from the intended helmet, not just HTTP 200", () => {
  assert.equal(inspectHelmetHealth(health(), now).ok, true);
  assert.equal(inspectHelmetHealth(health({ received_at: new Date(now - 31000).toISOString() }), now).ok, false);
  assert.equal(inspectHelmetHealth(health({ received_at: new Date(now + 6000).toISOString() }), now).ok, false);
  assert.equal(inspectHelmetHealth(health({ helmet_id: "different-helmet" }), now).ok, false);
  assert.equal(inspectHelmetHealth({ ok: true, service: "other" }, now).ok, false);
});
test("demo check catches paused detection, missing calibration, queued and dropped events", () => {
  for (const change of [{ calibrated: false }, { diagnostic_mode: "raw_pulse_probe" },
    { diagnostic_mode: undefined }, { impact_detection_paused: true },
    { queued_hits: 1 }, { dropped_hits: 1 }]) {
    const result = inspectHelmetHealth(health(change), now);
    assert.equal(result.ok, false, JSON.stringify(change));
    assert(result.problems.length > 0);
  }
});
