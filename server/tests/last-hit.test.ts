import {test} from "node:test";
import assert from "node:assert/strict";
import {Store} from "../src/store.js";
import {lastHitReview} from "../src/last-hit.js";
import {AlertLoop,defaultAlertConfig} from "../src/alert-loop.js";
import {Reviews} from "../src/reviews.js";
import {hit} from "./fixtures.js";

test("new review visuals keep an earlier delivered text separate from today's selective policy",async()=>{
  const s=new Store(":memory:"),id=s.saveImpact(hit).impact_id;
  const loop=new AlertLoop(s,new Reviews(s),undefined,defaultAlertConfig,()=>{});
  try{
    s.db.prepare("INSERT INTO alert_jobs(impact_id,state,created_at,updated_at) VALUES (?,'delivered','old','old')").run(id);
    const before=lastHitReview(s,id);
    assert.equal(before.legacy_policy,true);assert.match(before.title,/delivered \(earlier rules\)/);
    s.db.prepare("UPDATE alert_jobs SET state='observed',policy=? WHERE impact_id=?").run(JSON.stringify({eligible:false,reason:"below_policy"}),id);
    const now=lastHitReview(s,id);
    assert.equal(now.legacy_policy,false);assert.match(now.title,/no automatic text/);
    assert.equal(now.rules.singleG,40);
    s.db.prepare("UPDATE alert_jobs SET state='needs_attention',detail='delivery outcome unresolved' WHERE impact_id=?").run(id);
    assert.match(lastHitReview(s,id).title,/needs attention/);
    s.db.prepare("UPDATE alert_jobs SET state='suppressed',detail='24-hour agent review budget reached' WHERE impact_id=?").run(id);
    assert.doesNotMatch(lastHitReview(s,id).title,/cooldown/);
    s.db.prepare("UPDATE alert_jobs SET state='skipped',policy=NULL WHERE impact_id=?").run(id);
    assert.equal(lastHitReview(s,id).legacy_policy,false);
    assert.match(lastHitReview(s,id).title,/skipped/);
  }finally{await loop.stop();s.close();}
});
