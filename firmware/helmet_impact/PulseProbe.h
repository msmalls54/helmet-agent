#pragma once
#include "ImpactMath.h"

struct ProbePoint { uint32_t us; Vec3 raw; };
// Explicit diagnostic mode: latest-register sampling on the 100 kHz bus.
// Its achieved rate is measured; it does not claim all 1600 Hz FIFO samples.
struct PulseProbe {
  static constexpr uint16_t CAPACITY=192;
  ProbePoint trace[CAPACITY];
  uint16_t next=0, count=0, pulseSamples=0;
  bool active=false, hardwareSeen=false, traceTruncated=false, clipped=false;
  bool axisHigh[3]={false,false,false};
  uint32_t axisStart[3]={}, firstUs=0, lastAboveUs=0, previousUs=0;
  uint32_t maxGapUs=0, longestAxisUs=0;
  float peakG=0, rawAxisPeakG=0;
  void resetPulse() {
    active=false; hardwareSeen=false; traceTruncated=false; clipped=false;
    pulseSamples=0; peakG=rawAxisPeakG=0; maxGapUs=longestAxisUs=0;
    for (uint8_t i=0;i<3;++i) axisHigh[i]=false;
  }
  bool sample(Vec3 raw, Vec3 dynamic, uint32_t us, float hardwareThreshold) {
    trace[next]={us,raw}; next=(next+1)%CAPACITY;
    if (count<CAPACITY) ++count;
    float g=magnitude(dynamic);
    if (!active && g>=5.0f) {
      resetPulse(); active=true; firstUs=lastAboveUs=us; previousUs=us;
    }
    if (!active) return false;
    uint32_t gap=us-previousUs; if (gap>maxGapUs) maxGapUs=gap;
    previousUs=us;
    if (++pulseSamples>CAPACITY) traceTruncated=true;
    if (g>=5.0f) lastAboveUs=us;
    peakG=fmaxf(peakG,g);
    float axes[3]={fabsf(raw.x),fabsf(raw.y),fabsf(raw.z)};
    for (uint8_t i=0;i<3;++i) {
      rawAxisPeakG=fmaxf(rawAxisPeakG,axes[i]);
      if (axes[i]>=hardwareThreshold) {
        if (!axisHigh[i]) { axisStart[i]=us; axisHigh[i]=true; }
        uint32_t span=us-axisStart[i]; if (span>longestAxisUs) longestAxisUs=span;
      } else {
        // End is bracketed by this below-threshold sample; maxGap reports resolution.
        if (axisHigh[i]) {
          uint32_t span=us-axisStart[i]; if (span>longestAxisUs) longestAxisUs=span;
        }
        axisHigh[i]=false;
      }
    }
    return (uint32_t)(us-lastAboveUs)>=8000 || (uint32_t)(us-firstUs)>=250000;
  }
};
