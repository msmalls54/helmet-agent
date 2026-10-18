import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HelmetPicture } from "../resources/helmet/widget.js";
import { helmetMap } from "../src/helmet-map.js";
import { Store } from "../src/store.js";
import { hit } from "./fixtures.js";

test("undirected readings shade all zones; directed readings add only to their zone in the same helmet/player window", () => {
  const s=new Store(":memory:"),now=Date.parse("2026-10-18T04:00:00Z"),at="2026-10-18T03:59:00Z";
  try {
    s.saveImpact({...hit,location:"unknown",peak_g:40},at);
    const first=helmetMap(s,"#44","test-helmet",now);
    assert.equal(first.count,1);assert.equal(first.undirected_count,1);
    assert.deepEqual(Object.values(first.zone_weights),[1,1,1,1,1]);
    s.saveImpact({...hit,id:2,location:"right",peak_g:80},at);
    const second=helmetMap(s,"#44","test-helmet",now);
    assert.equal(second.count,2);assert.equal(second.directed_count,1);
    assert.deepEqual(second.zone_weights,{front:1,back:1,left:1,right:3,top:1});
    s.saveImpact({...hit,id:3,location:"unknown",peak_g:80},at);
    s.saveImpact({...hit,id:4,gyro_window_complete:false},at);
    s.saveImpact({...hit,id:5,calibration_capture:true},at);
    s.saveImpact({...hit,id:6,player:"#88"},at);
    s.saveImpact({...hit,id:7,helmet_id:"other-helmet"},at);
    s.saveImpact({...hit,id:8},"2026-10-18T02:00:00Z");
    s.saveImpact({...hit,id:9},"2026-10-18T05:00:00Z");
    s.saveImpact({...hit,id:10,simulated:true},at);
    s.saveImpact({...hit,id:11,synthetic:true},at);
    s.saveImpact({...hit,id:12,data_source:"simulated_week"},at);
    const third=helmetMap(s,"#44","test-helmet",now);
    assert.equal(third.count,3);assert.equal(third.excluded_count,5);
    assert.deepEqual(third.zone_weights,{front:3,back:3,left:3,right:5,top:3});
    for(const theme of ["light","dark"] as const){
      const picture=renderToStaticMarkup(createElement(HelmetPicture,{hit:{impact_id:1,player:"#44",peak_g:40,location:"unknown",location_validated:false,received_at:at,quality:{fifo_samples:32,gyro_window_complete:true,accel_clipped:false,gyro_clipped:false}},map:third,theme}));
      assert.match(picture,/Undirected hits shade the whole helmet/);
      assert.match(picture,/3 hits · last 60 min/);
      assert.doesNotMatch(picture,/Front assumed|Sensor direction: FRONT/);
    }
    assert.equal(s.getImpact(1)?.location,"unknown");
  }finally{s.close();}
});
