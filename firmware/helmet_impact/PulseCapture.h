#pragma once
#include "ImpactMath.h"

// Descriptions of a sampled acceleration waveform, never force/injury scores.
struct PulseMetrics {
  float peakG=0, peak5msG=0, spanMs=0, aboveMs=0, areaGms=0;
  uint16_t peakIndex=0, first=0, last=0;
  bool detected=false, leftCensored=false, rightCensored=false;
};
inline PulseMetrics pulseMetrics(const Vec3* values, uint16_t count,
                                 uint32_t periodUs, float threshold=2.0f,
                                 uint16_t quietMargin=2) {
  PulseMetrics out;
  uint16_t first=count, last=0, above=0;
  uint16_t smooth=(5000+periodUs-1)/periodUs;
  float rolling=0;
  for (uint16_t i=0; i<count; ++i) {
    float value=magnitude(values[i]);
    if (value>out.peakG) { out.peakG=value; out.peakIndex=i; }
    rolling+=value;
    if (i>=smooth) rolling-=magnitude(values[i-smooth]);
    if (i+1>=smooth) out.peak5msG=fmaxf(out.peak5msG,rolling/smooth);
    if (value>=threshold) { if (first==count) first=i; last=i; ++above; }
  }
  if (first==count) return out;
  out.detected=true; out.first=first; out.last=last;
  out.leftCensored=first<quietMargin;
  out.rightCensored=(uint32_t)last+quietMargin>=count;
  out.spanMs=(last-first+1)*periodUs/1000.0f;
  out.aboveMs=above*periodUs/1000.0f;
  // Integral of acceleration MAGNITUDE, in g*ms. Not force impulse or energy.
  // Include adjacent below-threshold samples to bracket the sampled pulse.
  uint16_t begin=first ? first-1 : first, end=last+1<count ? last+1 : last;
  for (uint16_t i=begin+1; i<=end; ++i)
    out.areaGms+=(magnitude(values[i-1])+magnitude(values[i]))*0.5f*periodUs/1000.0f;
  return out;
}

// Bench-only MCU buffer fed by the ADXL375 STREAM FIFO at 800 Hz / 400 kHz I2C.
// Continuous draining avoids the old end-of-shock 20 ms capture restriction.
// Its primary comparison remains raw peak_g; smoothing is a separate metric.
struct PulseCapture {
  static constexpr uint32_t PERIOD_US=1250;
  static constexpr uint16_t PRE=16, QUIET=16, MAX_POST=160, CAPACITY=PRE+MAX_POST;
  static constexpr float THRESHOLD=2.0f;
  enum Phase { Idle, Waiting, Capturing, Done } phase=Idle;
  Vec3 values[CAPACITY]={}, preValues[PRE]={};
  uint32_t stamps[CAPACITY]={}, preStamps[PRE]={};
  bool preClipped[PRE]={};
  uint16_t count=0, preCount=0, preNext=0, quietBefore=0, tailQuiet=0;
  uint32_t armedUs=0, onsetUs=0;
  float observedPeakG=0;
  bool detected=false, clipped=false, fifoOverrun=false, i2cGap=false;
  bool timedOut=false, maxedOut=false;

  bool busy() const { return phase==Waiting || phase==Capturing; }
  void arm(uint32_t now) {
    phase=Waiting; count=tailQuiet=0; armedUs=now; onsetUs=0;
    observedPeakG=0; detected=clipped=fifoOverrun=i2cGap=timedOut=maxedOut=false;
  }
  void gap(bool overflow) {
    if (busy()) { fifoOverrun|=overflow; i2cGap|=!overflow; }
    preCount=preNext=quietBefore=0;
  }
  void cancel() { phase=Idle; }
  void expire() {
    if (!busy()) return;
    timedOut=true; maxedOut=phase==Capturing; phase=Done;
  }
  void feed(Vec3 value, uint32_t stamp, bool saturated=false) {
    float g=magnitude(value);
    if (busy()) observedPeakG=fmaxf(observedPeakG,g);
    if (phase==Waiting && g>=THRESHOLD && preCount==PRE && quietBefore>=PRE) {
      detected=true; onsetUs=stamp; phase=Capturing;
      for (uint16_t i=0; i<PRE; ++i) {
        uint16_t p=(preNext+i)%PRE;
        values[count]=preValues[p]; stamps[count++]=preStamps[p];
        clipped|=preClipped[p];
      }
    }
    if (phase==Capturing) {
      if (count<CAPACITY) {
        values[count]=value; stamps[count++]=stamp; clipped|=saturated;
        tailQuiet=g<THRESHOLD ? tailQuiet+1 : 0;
      }
      if (tailQuiet>=QUIET && count>=PRE+32) phase=Done;
      else if (count>=CAPACITY) { maxedOut=true; phase=Done; }
    }
    preValues[preNext]=value; preStamps[preNext]=stamp; preClipped[preNext]=saturated;
    preNext=(preNext+1)%PRE; if (preCount<PRE) ++preCount;
    quietBefore=g<THRESHOLD ? (uint16_t)(quietBefore<PRE ? quietBefore+1 : PRE) : 0;
  }
  PulseMetrics metrics() const { return pulseMetrics(values,count,PERIOD_US,THRESHOLD,QUIET); }
  bool complete() const {
    auto m=metrics();
    return phase==Done && detected && !clipped && !fifoOverrun && !i2cGap &&
      !maxedOut && !timedOut && !m.leftCensored && !m.rightCensored;
  }
};
