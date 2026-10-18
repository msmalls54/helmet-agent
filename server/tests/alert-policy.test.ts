import { test } from "node:test";
import assert from "node:assert/strict";
import { assessAlert, readAlertPolicy } from "../src/alert-policy.js";
import { compactImpact } from "../src/impacts.js";
import { Store } from "../src/store.js";
import { hit } from "./fixtures.js";

test("small isolated readings are recorded without qualifying; configured large readings qualify", () => {
  const store = new Store(":memory:");
  try {
    const small = compactImpact(store.getImpact(store.saveImpact({ ...hit, peak_g: 14 }).impact_id)!);
    assert.equal(assessAlert(small, [small]).eligible, false);
    const large = compactImpact(store.getImpact(store.saveImpact({ ...hit, id: 2, peak_g: 40 }).impact_id)!);
    assert.equal(assessAlert(large, [small, large]).reason, "large_reading");
    assert.equal((store.db.prepare("SELECT count(*) n FROM impacts").get() as {n:number}).n, 2);
  } finally { store.close(); }
});

test("cluster uses same-boot device intervals and rejects backlog, other players, bad captures and future rows", () => {
  const store = new Store(":memory:");
  try {
    const add = (id: number, ms: number, extra = {}) => compactImpact(store.getImpact(store.saveImpact({ ...hit, id, ms, peak_g: 14, ...extra }).impact_id)!);
    const old = add(1, 1000), one = add(2, 100000), two = add(3, 130000), current = add(4, 160000);
    const late = add(5, 161000), other = add(6, 140000, { player: "#21" });
    const bad = add(7, 150000, { accel_clipped: true });
    const boot = add(8, 155000, { boot_id: "another-boot" });
    const p = assessAlert(current, [old,one,two,current,late,other,bad,boot,current]);
    assert.equal(p.reason, "recent_cluster"); assert.equal(p.recent_usable_count, 3);
    assert.deepEqual(p.evidence_ids, [current.impact_id,two.impact_id,one.impact_id]);
    assert.equal(assessAlert(current,[old,current]).eligible, false, "two uploads together do not make old device time recent");
    assert.match(p.peer_comparison, /unavailable/);
  } finally { store.close(); }
});

test("device interval handles millis rollover without mixing boots", () => {
  const store = new Store(":memory:");
  try {
    const rows=[4294937296,4294962296,20000].map((ms,i) => compactImpact(store.getImpact(store.saveImpact({...hit,id:i+1,ms,peak_g:14}).impact_id)!));
    assert.equal(assessAlert(rows[2],rows).reason,"recent_cluster");
  } finally { store.close(); }
});

test("demo settings reject invalid values instead of silently disabling suppression", () => {
  assert.equal(readAlertPolicy({ HELMET_ALERT_SINGLE_G:"55" }).singleG,55);
  for (const value of ["NaN","0","-1","1001"]) assert.throws(() => readAlertPolicy({HELMET_ALERT_SINGLE_G:value}));
  assert.throws(() => readAlertPolicy({HELMET_ALERT_CLUSTER_COUNT:"2.5"}));
});
