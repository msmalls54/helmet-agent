#pragma once
#include <math.h>
#include <stdint.h>
#include <stdlib.h>

struct Vec3 {
  float x, y, z;
};
inline Vec3 subtract(Vec3 a, Vec3 b) { return {a.x-b.x, a.y-b.y, a.z-b.z}; }
inline float magnitude(Vec3 a) { return sqrtf(a.x*a.x + a.y*a.y + a.z*a.z); }

// Signed axes are +1/-1 for X, +2/-2 for Y, +3/-3 for Z.
// Zero means the direction was too diagonal to assign a reliable side.
inline int8_t dominantAxis(Vec3 a) {
  float v[3] = {a.x, a.y, a.z};
  int best = 0;
  for (int i = 1; i < 3; ++i) if (fabsf(v[i]) > fabsf(v[best])) best = i;
  float runnerUp = 0;
  for (int i = 0; i < 3; ++i) if (i != best) runnerUp = fmaxf(runnerUp, fabsf(v[i]));
  if (fabsf(v[best]) < 1.0f || fabsf(v[best]) < 1.35f * runnerUp) return 0;
  return v[best] > 0 ? best + 1 : -(best + 1);
}

inline Vec3 scale(Vec3 v, float s) { return {v.x*s,v.y*s,v.z*s}; }
inline Vec3 midpoint(Vec3 a, Vec3 b) { return {(a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2}; }
inline float dot(Vec3 a, Vec3 b) { return a.x*b.x+a.y*b.y+a.z*b.z; }

// In a right-handed frame, forward CROSS left points up.
inline int8_t topAxis(int8_t front, int8_t left) {
  if (!front || !left || abs(front) == abs(left)) return 0;
  Vec3 f = {0,0,0}, l = {0,0,0};
  float* fv[3] = {&f.x, &f.y, &f.z};
  float* lv[3] = {&l.x, &l.y, &l.z};
  *fv[abs(front)-1] = front > 0 ? 1 : -1;
  *lv[abs(left)-1] = left > 0 ? 1 : -1;
  return dominantAxis({f.y*l.z-f.z*l.y, f.z*l.x-f.x*l.z, f.x*l.y-f.y*l.x});
}
inline bool validMapping(const int8_t* map) {
  for (int i = 0; i < 5; ++i) if (!map[i] || abs(map[i]) > 3) return false;
  return map[0] == -map[1] && map[2] == -map[3] &&
         abs(map[0]) != abs(map[2]) && map[4] == topAxis(map[0], map[2]);
}
// Pose order: crown up, front down, back down, left down, right down.
// A resting accelerometer reports support acceleration UP, opposite gravity.
// Opposed poses cancel the sensor's offset; their difference is about 2 g.
inline bool gravityMapping(const Vec3* poses, int8_t* map) {
  Vec3 front = subtract(poses[2],poses[1]);
  Vec3 left = subtract(poses[4],poses[3]);
  Vec3 frontOffset = midpoint(poses[1],poses[2]);
  Vec3 leftOffset = midpoint(poses[3],poses[4]);
  if (magnitude(subtract(frontOffset,leftOffset)) > 0.35f) return false;
  float f = magnitude(front), l = magnitude(left);
  if (f < 1.5f || f > 2.5f || l < 1.5f || l > 2.5f) return false;
  if (fabsf(dot(front,left))/(f*l) > 0.35f) return false;
  Vec3 up = subtract(poses[0],midpoint(frontOffset,leftOffset));
  float u = magnitude(up);
  if (u < 0.7f || u > 1.3f) return false;
  if (fabsf(dot(up,front))/(u*f) > 0.35f ||
      fabsf(dot(up,left))/(u*l) > 0.35f) return false;
  map[0] = dominantAxis(front); map[1] = -map[0];
  map[2] = dominantAxis(left); map[3] = -map[2];
  map[4] = dominantAxis(scale(up,2));
  return validMapping(map);
}
inline const char* impactLocation(Vec3 acceleration, const int8_t* map, bool calibrated) {
  if (!calibrated) return "uncalibrated";
  int8_t incoming = -dominantAxis(acceleration);  // Contact is opposite acceleration.
  const char* names[] = {"front", "back", "left", "right", "top"};
  for (int i = 0; incoming && i < 5; ++i) if (map[i] == incoming) return names[i];
  return "unknown";  // Includes diagonal events and the uncalibrated bottom side.
}

struct InitialPulse {
  Vec3 acceleration = {0,0,0};
  // Preserve diagnostic evidence even when the side must stay unknown.
  Vec3 diagnosticMean = {0,0,0};
  float coherence = 0;
  const char* reason = "no_threshold_crossing";
  float consistency = 0;
  uint8_t samples = 0;
  bool leftCensored = false;
};
// A signal-consistency heuristic, NOT a calibrated probability of the side.
// Require quiet samples before onset; a late FIFO must not invent an onset.
// Integrate the first contiguous pulse for up to 10 ms (16 samples at 1600 Hz).
// The first 2.5 ms can be diagonal while the sustained motion has a clear axis.
// A below-threshold sample ends the pulse: never join a later rebound to it.
inline InitialPulse initialPulse(const Vec3* values, uint8_t count, float threshold = 5.0f) {
  InitialPulse result;
  uint8_t first = count;
  for (uint8_t i=0; i<count; ++i) if (magnitude(values[i]) >= threshold) { first=i; break; }
  if (first == count) return result;
  if (first < 2) { result.leftCensored=true; result.reason="onset_not_captured"; return result; }
  Vec3 sum = {0,0,0}; float total = 0;
  for (uint8_t i=first; i<count && i<first+16; ++i) {
    float g=magnitude(values[i]);
    if (g < threshold) break;
    sum.x+=values[i].x; sum.y+=values[i].y; sum.z+=values[i].z;
    total+=g; ++result.samples;
  }
  if (result.samples) result.diagnosticMean=scale(sum,1.0f/result.samples);
  if (result.samples < 2 || total <= 0) { result.reason="too_few_initial_samples"; return result; }
  float coherence=magnitude(sum)/total;
  result.coherence=coherence;
  if (coherence < 0.8f) { result.reason="opposed_initial_samples"; return result; }
  if (!dominantAxis(sum)) { result.reason="diagonal_initial_pulse"; return result; }
  result.reason="accepted";
  result.acceleration=scale(sum,1.0f/result.samples);
  float v[3]={fabsf(sum.x),fabsf(sum.y),fabsf(sum.z)};
  float largest=fmaxf(v[0],fmaxf(v[1],v[2]));
  float runner=(v[0]+v[1]+v[2])-largest-fminf(v[0],fminf(v[1],v[2]));
  result.consistency=fminf(1.0f,fmaxf(0.0f,coherence*(largest-runner)/largest));
  return result;
}

struct GyroSample { uint32_t us; float dps; bool clipped; Vec3 sensorDps={0,0,0}; };
struct GyroPeak {
  float dps = 0;
  uint16_t count = 0;
  uint32_t maxGapUs = 60000;
  bool complete = false, clipped = false;
  Vec3 sensorDps = {0,0,0};
};
struct GyroHistory {
  // At least 100 ms at our maximum 1 kHz read rate, plus FIFO readout margin.
  static const uint16_t CAPACITY = 192;
  GyroSample samples[CAPACITY];
  uint16_t next = 0, count = 0;
  void push(GyroSample s) {
    samples[next] = s;
    next = (next + 1) % CAPACITY;
    if (count < CAPACITY) ++count;
  }
  GyroPeak peak(uint32_t center) const {
    GyroPeak result;
    int32_t previous = -30000;
    uint32_t maxGap = 0;
    for (uint16_t i = 0; i < count; ++i) {
      const GyroSample& s = samples[(next + CAPACITY - count + i) % CAPACITY];
      int32_t delta = (int32_t)(s.us - center);  // Also works across micros() rollover.
      if (delta < -30000 || delta > 30000) continue;
      uint32_t gap = (uint32_t)(delta - previous);
      if (gap > maxGap) maxGap = gap;
      previous = delta;
      if (s.dps > result.dps) { result.dps=s.dps; result.sensorDps=s.sensorDps; }
      result.clipped |= s.clipped;
      ++result.count;
    }
    uint32_t endGap = (uint32_t)(30000 - previous);
    result.maxGapUs = maxGap > endGap ? maxGap : endGap;
    result.complete = result.count >= 2 && result.maxGapUs <= 5000;
    return result;
  }
};
