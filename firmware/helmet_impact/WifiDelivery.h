#pragma once
#include <ArduinoJson.h>

struct WifiDiagnostic {
  bool probeActive=false, benchActive=false, haveNearMiss=false, nearMissClipped=false;
  uint32_t pulseId=0, pulseMs=0, samples=0;
  float peakG=0, durationMs=0, longestAxisMs=0, maxGapMs=0, windowPeakG=0;
};
// One-entry overwrite queue; the Wi-Fi worker sees a consistent snapshot.
void updateWifiDiagnostic(const WifiDiagnostic& value);

// Only copies a bounded message to a queue; never performs network I/O.
bool beginWifiDelivery();
void queueWifiImpact(JsonDocument& impact);
void flashWifiImpactLed();
// Called from loop(); drains status messages only outside an impact capture.
void pollWifiDelivery(bool calibrated, bool captureActive);
