#include <assert.h>
#include <stdio.h>
#include "PulseCapture.h"

static void quiet(PulseCapture& c, uint32_t& us, int n=20) {
  for (int i=0;i<n;++i,us+=1250) c.feed({0,0,0},us);
}
static PulseCapture pulse(float g, int width=36) {
  PulseCapture c; uint32_t us=1000; quiet(c,us); c.arm(us);
  for (int i=0;i<width;++i,us+=1250) c.feed({i==0 ? g*1.5f:g,0,0},us);
  quiet(c,us,20); return c;
}
int main() {
  auto longPulse=pulse(10); auto m=longPulse.metrics();
  assert(longPulse.complete());
  assert(m.peakG==15 && m.peakIndex==16); // Onset peak survives a >20 ms pulse.
  assert(m.spanMs==45 && m.aboveMs==45);
  assert(m.peak5msG>10 && m.peak5msG<15 && m.areaGms>400);
  auto low=pulse(4), medium=pulse(8), high=pulse(12);
  assert(low.metrics().peakG<medium.metrics().peakG && medium.metrics().peakG<high.metrics().peakG);
  auto clipped=longPulse; clipped.clipped=true; assert(!clipped.complete());
  auto overflow=longPulse; overflow.fifoOverrun=true; assert(!overflow.complete());
  auto failedRead=longPulse; failedRead.i2cGap=true; assert(!failedRead.complete());
  PulseCapture sustained; uint32_t us=1000; quiet(sustained,us); sustained.arm(us);
  for(int i=0;i<180;++i,us+=1250) sustained.feed({4,0,0},us);
  assert(sustained.phase==PulseCapture::Done && sustained.maxedOut && !sustained.complete());
  PulseCapture missing; missing.arm(1); quiet(missing,us,100); missing.expire();
  assert(missing.timedOut && !missing.detected && !missing.complete());
  PulseCapture unsettled; unsettled.arm(1);
  for(int i=0;i<30;++i) unsettled.feed({4,0,0},1000+i*1250);
  assert(!unsettled.detected); // No invented onset if already moving.
  quiet(unsettled,us); unsettled.feed({8,0,0},us); quiet(unsettled,us,40);
  assert(unsettled.complete());
  auto gap=pulse(10); gap.phase=PulseCapture::Waiting; gap.gap(true);
  assert(gap.preCount==0 && gap.fifoOverrun);
  Vec3 edge[8]={{10,0,0},{10,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0},{0,0,0}};
  auto partial=pulseMetrics(edge,8,1250); assert(partial.leftCensored && !partial.rightCensored);
  edge[7]={10,0,0}; partial=pulseMetrics(edge,8,1250); assert(partial.rightCensored);
  // Rollover does not affect count-based capture durations.
  PulseCapture rollover; us=0xffffd000; quiet(rollover,us); rollover.arm(us);
  rollover.feed({6,0,0},us); quiet(rollover,us,40); assert(rollover.complete());
  puts("pulse_capture_test: all capture, censoring, gap and ordering checks passed");
}
