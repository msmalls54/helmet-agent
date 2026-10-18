import { test } from "node:test";
import assert from "node:assert/strict";
import { exposureLoad, analyzePractice, compareDrillPeers } from "../src/practice.js";
import { simulatedPracticeWeek } from "../src/practice-data.js";
import { Store } from "../src/store.js";
import { hit } from "./fixtures.js";

test("football investigation finds the own-drill rate spike, not simply the largest single event", () => {
  const store = new Store(":memory:");
  try {
    const report = exposureLoad(store, { data_source: "simulated_week" });
    assert.equal(report.count, 143);
    const focus = report.review_candidates[0];
    assert.equal(focus.player, "#72"); assert.equal(focus.day, "Thu"); assert.equal(focus.drill, "inside_run");
    assert.equal(focus.count, 8); assert.equal(focus.observed_minutes, 20);
    assert.equal(focus.prior_count, 7); assert.equal(focus.prior_observed_minutes, 60);
    assert.equal(focus.rate_ratio, 3.43);
    assert.equal(report.events.reduce((a, b) => a.peak_g > b.peak_g ? a : b).player, "#21");
    assert.equal((store.db.prepare("SELECT count(*) n FROM impacts").get() as {n:number}).n, 0);
    assert.ok(report.events.every(h => h.simulated && h.impact_id === null && h.reviewable_impact_id === null && h.event_id.startsWith("sim-")));
    assert.match(report.summary, /^Sample practice:/);
    assert.ok(report.magnitude_outliers.every(h => h.baseline_n >= 20));
    const friday = report.players.find(p => p.player === "#72")!.days.find(d => d.date === "2026-10-16");
    assert.equal(friday?.count, 16, "Friday-night game belongs to Friday in the football calendar, even after midnight UTC");
  } finally { store.close(); }
});

test("same-drill peers use their own observation minutes and never disappear under a player filter", () => {
  const store=new Store(":memory:");
  try {
    const report=exposureLoad(store,{data_source:"simulated_week",player:"#72"});
    const p=report.peer_review_candidates.find(p=>p.day==="Thu" && p.drill==="inside_run")!;
    assert.equal(p.count,8);assert.equal(p.peer_count,2);assert.equal(p.ratio_to_highest_peer,2.67);
    assert.deepEqual(p.peers.map(p=>[p.player,p.count,p.observed_minutes]).sort(),[["#21",2,20],["#44",3,20]]);
    assert.equal(report.team_context?.largest_single_event?.player,"#21");
    assert.equal(report.team_context?.largest_single_event?.peak_g,76);
    assert.equal(report.periods.find(period=>period.id===p.period_id)?.max_g,24);
    assert(report.events.filter(h=>h.period_id===p.period_id).every(h=>h.peak_g<40),"frequency example must not depend on a 40 g single-reading trigger");
    assert.deepEqual(exposureLoad(store,{}).peer_comparisons,[]);
    const f=simulatedPracticeWeek();
    const short=f.periods.map(p=>p.player==="#44" && p.day==="Thu" && p.drill==="inside_run" ? {...p,observed_minutes:5}:p);
    assert.equal(compareDrillPeers(f.hits,short,f.players).find(p=>p.player==="#72" && p.day==="Thu" && p.drill==="inside_run")?.notable,false);
    assert.equal(compareDrillPeers(f.hits,f.periods.filter(p=>p.player!=="#21"),f.players).some(p=>p.notable),false);
  } finally {store.close();}
});
test("live is the default and cannot acquire fictional context, personal risk scores or simulated database rows", () => {
  const store = new Store(":memory:");
  try {
    store.saveImpact(hit);
    const now = Date.now();
    const before = exposureLoad(store, {}, now);
    assert.equal(before.simulated, false); assert.equal(before.count, 1);
    assert.equal(before.review_candidates.length, 0); assert.equal(before.magnitude_outliers.length, 0);
    assert.equal(before.periods.length, 0); assert.equal(before.events[0].drill, null);
    assert.equal(before.players[0].medical_history, null, "Missing live history must not become zero prior concussions");
    assert.equal(before.events[0].reviewable_impact_id, 1);
    assert.match(before.baseline_status, /insufficient/);
    exposureLoad(store, { data_source: "simulated_week" });
    assert.deepEqual(exposureLoad(store, {}, now), before);
    assert.equal(exposureLoad(store, { player: "' OR 1=1 --" }).count, 0);
    assert.equal(exposureLoad(store, { drill: "inside_run" }).count, 0);
    assert.throws(() => exposureLoad(store, { data_source: "simulated_week", since_minutes: -1 }));
  } finally { store.close(); }
});
test("quality exclusions, comparable history and observation denominators control signals", () => {
  const fixture = simulatedPracticeWeek();
  const allBad = fixture.hits.map(h => ({ ...h, quality_ok: false }));
  assert.equal(analyzePractice(allBad, fixture.periods).review_candidates.length, 0);
  assert.equal(analyzePractice(allBad, fixture.periods).magnitude_outliers.length, 0);
  const noProfiles = fixture.hits.map(h => ({ ...h, capture_profile: null }));
  assert.equal(analyzePractice(noProfiles, fixture.periods).magnitude_outliers.length, 0);
  const longer = fixture.periods.map(p => p.player === "#72" && p.day === "Thu" && p.drill === "inside_run" ? { ...p, observed_minutes: 80 } : p);
  assert.equal(analyzePractice(fixture.hits, longer).review_candidates.length, 0);
  // No future events can establish an early event's baseline.
  const { magnitude_outliers } = analyzePractice(fixture.hits, fixture.periods);
  for (const event of magnitude_outliers) {
    const point = fixture.hits.find(h => h.event_id === event.event_id)!;
    const earlier = fixture.hits.filter(h => h.player === point.player && h.observed_at < point.observed_at);
    assert.equal(event.baseline_n, earlier.length);
  }
});
test("full practice includes observed zero-hit periods and fictional medical history does not change telemetry signals", () => {
  const fixture = simulatedPracticeWeek();
  const practice = fixture.periods.filter(p => p.player === "#72" && p.day === "Thu");
  assert.deepEqual(practice.map(p => p.drill), ["stretch", "position_warmup", "walkthrough", "inside_run", "unit", "team", "scout"]);
  assert.equal(practice.reduce((n,p) => n + p.observed_minutes,0), 110);
  assert.match(practice[4].drill_label, /Offense-specific/);
  assert.match(practice[6].drill_label, /Scout offense vs starting defense/);
  const first = analyzePractice(fixture.hits, fixture.periods, fixture.players);
  assert(first.periods.filter(p => ["stretch","position_warmup","walkthrough"].includes(p.drill)).every(p => p.count === 0 && p.observed_minutes > 0 && p.coverage === "complete_synthetic_observation"));
  assert.equal(first.players.find(p => p.player === "#72")?.medical_history?.reported_prior_concussions, 4);
  assert.equal(first.players.find(p => p.player === "#44")?.medical_history?.reported_prior_concussions, 0);
  assert.equal(first.players.find(p => p.player === "#21")?.medical_history?.reported_prior_concussions, 5);
  const changed = analyzePractice(fixture.hits, fixture.periods, fixture.players.map(p => ({ ...p, reported_prior_concussions: 0, reported_concussion_years: [] })));
  assert.deepEqual(changed.review_candidates, first.review_candidates);
  assert.deepEqual(changed.magnitude_outliers, first.magnitude_outliers);
});
