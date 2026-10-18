import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/store.js";
import { getImpacts } from "../src/impacts.js";
import { hit } from "./fixtures.js";

test("history defaults, date/player/magnitude filters, exact total/max and capture flags", () => {
  const store = new Store(":memory:");
  try {
    const now = Date.parse("2026-10-17T20:00:00Z");
    assert.equal(getImpacts(store, {}, now).count, 0);
    store.saveImpact(hit, "2026-10-17T19:59:00Z");
    store.saveImpact({ ...hit, id: 2, peak_g: 20 }, "2026-10-17T19:58:00Z");
    store.saveImpact({ ...hit, id: 3, player: "#88", peak_g: 80 }, "2026-10-17T19:57:00Z");
    store.saveImpact({ ...hit, id: 4, peak_g: 100 }, "2026-10-17T18:00:00Z");
    const result = getImpacts(store, { player: "#44" }, now);
    assert.equal(result.summary, "2 hits in last 60 min for #44, max 42 g on #44, estimated right side.");
    assert.equal(result.hits[0].quality.fifo_samples, 32);
    assert.equal(result.hits[0].location_validated, false);
    assert.equal(getImpacts(store, { min_g: 40 }, now).count, 2);
    assert.equal(getImpacts(store, { player: "' OR 1=1 --" }, now).count, 0);
    assert.throws(() => getImpacts(store, { since_minutes: -1 }, now));
    for (let i = 5; i < 210; i++) store.saveImpact({ ...hit, id: i }, "2026-10-17T19:59:30Z");
    const capped = getImpacts(store, {}, now);
    assert.equal(capped.count, 208);
    assert.equal(capped.hits.length, 200);
    assert.equal(capped.truncated, true);
    assert.match(capped.summary, /max 80 g on #88/);
  } finally { store.close(); }
});

test("history preserves incomplete-window evidence without inventing confidence for old hits", () => {
  const store = new Store(":memory:");
  try {
    store.saveImpact(hit);
    assert.equal(getImpacts(store, {}).hits[0].location_confidence, null);
    store.saveImpact({ ...hit, id: 2, peak_g: 44, location: "unknown", location_confidence: 0,
      location_confidence_basis: "initial_pulse_signal_consistency_not_probability",
      accel_window_left_censored: true, initial_pulse_samples: 0 });
    const latest = getImpacts(store, {}).hits[0];
    assert.equal(latest.location, "unknown");
    assert.equal(latest.location_validated, false);
    assert.equal(latest.location_confidence, 0);
    assert.equal(latest.quality.accel_window_left_censored, true);
    assert.equal(getImpacts(store, {}).summary, "2 hits in last 60 min, max 44 g on #44.");
  } finally { store.close(); }
});
