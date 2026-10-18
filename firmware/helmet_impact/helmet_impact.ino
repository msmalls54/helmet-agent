/*
 * Relative helmet-impact telemetry. Serial plus queued Wi-Fi, no diagnosis.
 * Sensors measure the helmet/sensor mounting, not a person's skull.
 *
 * ADXL375 register sequence: Analog Devices ADXL375 Rev B and AN-1266.
 * Gyro scale and registers: ST ISM330DHCX datasheet, +/-4000 dps.
 */
#include <Wire.h>
#include <Adafruit_ADXL375.h>
#include <Adafruit_ISM330DHCX.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include "ImpactMath.h"
#include "PulseProbe.h"
#include "PulseCapture.h"
#include "WifiDelivery.h"

// Tune this first if taps are not detected. The actual hardware step is 0.78 g.
#define SHOCK_THRESHOLD_G 10.0f
#define SHOCK_MAX_DURATION_MS 50.0f

constexpr uint8_t ACC_ADDR = 0x53, GYRO_ADDR = 0x6A;
constexpr uint8_t REG_THRESHOLD = 0x1D, REG_DURATION = 0x21;
constexpr uint8_t REG_LATENT = 0x22, REG_WINDOW = 0x23, REG_AXES = 0x2A;
constexpr uint8_t REG_RATE = 0x2C, REG_POWER = 0x2D, REG_ENABLE = 0x2E;
constexpr uint8_t REG_MAP = 0x2F, REG_SOURCE = 0x30, REG_FORMAT = 0x31;
constexpr uint8_t REG_DATA = 0x32, REG_FIFO = 0x38, REG_FIFO_STATUS = 0x39;
constexpr uint8_t SINGLE_SHOCK = 0x40;
constexpr uint8_t PRETRIGGER_SAMPLES = 31;
constexpr uint32_t SAMPLE_US = 625;  // 1600 Hz accelerometer output rate.
constexpr uint32_t POLL_US = 2500, GYRO_POLL_US = 1000, DEBOUNCE_US = 300000;
constexpr float ACC_G_PER_LSB = 0.049f, GYRO_DPS_PER_LSB = 0.140f;
constexpr float DEG_TO_RAD_F = 0.017453292519943295f;

Adafruit_ADXL375 accelerometer(375, &Wire);
Adafruit_ISM330DHCX imu;
GyroHistory gyroHistory;
Vec3 baseline = {0,0,0}, latestGyro = {0,0,0};
bool latestGyroValid = false, calibrated = false, armed = false;
int8_t savedMap[5] = {}, pendingMap[5] = {};
const char* sideNames[] = {"front", "back", "left", "right", "top"};
const char* poseNames[] = {"crown_up", "front_down", "back_down", "left_down", "right_down"};
const char* poseInstructions[] = {
  "upright as worn, crown pointing up",
  "facemask pointing straight down",
  "back of helmet pointing straight down, facemask up",
  "wearer's LEFT side pointing straight down",
  "wearer's RIGHT side pointing straight down"
};
Vec3 gravityPoses[5] = {};
int calStep = -1;  // -1 normal; 0..4 gravity poses; 5 preview awaiting save.
uint32_t i2cErrors = 0, gyroReads = 0, nextId = 1;
uint32_t lastGyroUs = 0, lastPollUs = 0, lastHeartbeatMs = 0, lastEventUs = 0;
uint32_t heartbeatGyroReads = 0;
bool haveEvent = false;
bool forceHeartbeat = false;
bool traceNextImpact = false;  // Serial-only diagnostic; no extra impact or text.
char command[48] = {};
uint8_t commandLength = 0;
bool commandOverflow = false;
bool probeActive=false;
PulseProbe probe;
WifiDiagnostic wifiDiagnostic;
uint32_t probeStartedMs=0, lastProbeUs=0, lastProbePollUs=0;
uint32_t probeWindowMs=0, probeWindowSamples=0, probePreviousUs=0, probeWindowGapUs=0;
uint32_t nextProbeId=1;
float probeWindowPeak=0;
uint32_t probeHardwareUs=0;
bool haveProbeHardware=false;
bool benchActive=false, benchClockAnchored=false;
PulseCapture bench;
Vec3 benchBaseline={0,0,0};
uint32_t benchStartedMs=0, benchPollUs=0, benchNextSampleUs=0, benchTrialId=0;
uint32_t benchErrorsAtArm=0;

struct Impact {
  bool active = false, fifoRead = false, clipped = false;
  uint32_t detectedUs = 0, detectedMs = 0, peakUs = 0;
  uint8_t samples = 0;
  Vec3 accel = {0,0,0};
  Vec3 trace[32];
  float peakG = 0, rawPeakG = 0;
} impact;

// Keep every I2C read checked: a missing cable must not become a zero-valued hit.
bool readBytes(uint8_t address, uint8_t reg, uint8_t* data, uint8_t size) {
  Wire.beginTransmission(address);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) { ++i2cErrors; return false; }
  if (Wire.requestFrom(address, size) != size) {
    while (Wire.available()) Wire.read();
    ++i2cErrors;
    return false;
  }
  for (uint8_t i = 0; i < size; ++i) data[i] = Wire.read();
  return true;
}
bool writeByte(uint8_t address, uint8_t reg, uint8_t value) {
  Wire.beginTransmission(address);
  Wire.write(reg);
  Wire.write(value);
  if (Wire.endTransmission() == 0) return true;
  ++i2cErrors;
  return false;
}
bool writeAcc(uint8_t reg, uint8_t value) { return writeByte(ACC_ADDR, reg, value); }
bool readAcc(uint8_t reg, uint8_t& value) { return readBytes(ACC_ADDR, reg, &value, 1); }
int16_t signedWord(const uint8_t* bytes) {
  return (int16_t)((uint16_t)bytes[0] | ((uint16_t)bytes[1] << 8));
}
bool readAcceleration(Vec3& value, bool& clipped) {
  uint8_t bytes[6];
  if (!readBytes(ACC_ADDR, REG_DATA, bytes, 6)) return false;
  int16_t x = signedWord(bytes), y = signedWord(bytes+2), z = signedWord(bytes+4);
  // At 1600 Hz bit 0 is always zero. Do NOT shift the word or double the scale.
  value = {x*ACC_G_PER_LSB, y*ACC_G_PER_LSB, z*ACC_G_PER_LSB};
  clipped = abs(x) >= 4090 || abs(y) >= 4090 || abs(z) >= 4090;
  delayMicroseconds(5);  // FIFO requires >=5 us before the next data/status read.
  return true;
}
void sampleGyro() {
  uint32_t started = micros();
  if ((uint32_t)(started - lastGyroUs) < GYRO_POLL_US) return;
  lastGyroUs = started;
  uint8_t bytes[6];
  // Only six gyro bytes, not the library's full temperature+gyro+accel read.
  // readGyroscope() in LSM6DS 4.7.4 hardcodes a different scale; avoid it here.
  if (!readBytes(GYRO_ADDR, 0x22, bytes, 6)) { latestGyroValid = false; return; }
  int16_t x = signedWord(bytes), y = signedWord(bytes+2), z = signedWord(bytes+4);
  latestGyro = {x*GYRO_DPS_PER_LSB, y*GYRO_DPS_PER_LSB, z*GYRO_DPS_PER_LSB};
  latestGyroValid = true;
  uint32_t stamp = started + (uint32_t)(micros()-started)/2;
  gyroHistory.push({stamp, magnitude(latestGyro),
                    abs(x) >= 32760 || abs(y) >= 32760 || abs(z) >= 32760, latestGyro});
  ++gyroReads;
}
void printJson(JsonDocument& doc) {
  if (!Serial) return;
  // One USB write avoids hundreds of individual character writes interrupting
  // the gyro sampling loop. Never print a truncated JSON object.
  static char line[2048];  // Also fits the optional 32-sample direction trace.
  if (measureJson(doc) > sizeof(line)-2) {
    Serial.println("# ERROR: JSON output exceeded the line buffer.");
    return;
  }
  size_t size = serializeJson(doc, line, sizeof(line)-1);
  line[size++] = '\n';
  Serial.write((const uint8_t*)line, size);
}
void fail(const char* message) {
  armed = false;
  writeAcc(REG_ENABLE, 0);
  while (true) {
    Serial.print("# ERROR: "); Serial.println(message);
    Serial.println("# Unplug USB, reseat STEMMA QT plugs, reconnect. Check COM port and data cable before changing code.");
    delay(5000);
  }
}
uint8_t thresholdCode() {
  return (uint8_t)constrain((int)lroundf(SHOCK_THRESHOLD_G / 0.78f), 1, 255);
}
bool disarmFifo() {
  armed = false;
  return writeAcc(REG_ENABLE, 0) && writeAcc(REG_FIFO, 0);
}
bool armFifo() {
  // Bypass clears the old capture. Merely rewriting TRIGGER does not re-arm it.
  uint8_t ignored;
  if (!writeAcc(REG_POWER, 0) || !disarmFifo() || !readAcc(REG_SOURCE, ignored) ||
      !writeAcc(REG_THRESHOLD, thresholdCode()) ||
      !writeAcc(REG_FIFO, 0xE0 | PRETRIGGER_SAMPLES) ||  // Trigger, INT2, 31 pre.
      !writeAcc(REG_POWER, 0x08)) return false;
  // Fill the pre-trigger history BEFORE enabling shock interrupts. An immediate
  // bump after re-arming otherwise starts with fewer than 31 saved samples.
  uint32_t primeStarted = micros();
  while ((uint32_t)(micros()-primeStarted) < 25000) {
    sampleGyro();
    delayMicroseconds(50);
  }
  if (!readAcc(REG_SOURCE, ignored) || !writeAcc(REG_ENABLE, SINGLE_SHOCK)) return false;
  lastPollUs = micros();
  armed = true;
  return true;
}
void zeroBaseline() {
  // Subtract a stationary baseline (gravity + mounting offsets). This is NOT
  // orientation tracking: re-zero after changing the sensor's resting pose.
  if (!disarmFifo() || !writeAcc(REG_POWER, 0x08)) fail("Could not start baseline measurement.");
  Vec3 sum = {0,0,0};
  for (uint8_t i = 0; i < 64; ++i) {
    Vec3 a; bool clipped;
    if (!readAcceleration(a, clipped) || clipped) fail("Baseline read failed or saturated.");
    sum.x += a.x; sum.y += a.y; sum.z += a.z;
    sampleGyro();
    delay(1);
  }
  baseline = {sum.x/64, sum.y/64, sum.z/64};
}
void stopProbe() {
  if (!disarmFifo()) fail("Could not stop the diagnostic probe.");
  probeActive=false; probe.resetPulse(); haveEvent=false;
  wifiDiagnostic.probeActive=false; updateWifiDiagnostic(wifiDiagnostic);
  if (!armFifo()) fail("Could not restore normal capture after probe.");
  Serial.println("# PROBE ended. Normal impact detection restored; calibration unchanged.");
}
void startProbe() {
  uint8_t ignored;
  if (!disarmFifo() || !writeAcc(REG_POWER,0x08) || !readAcc(REG_SOURCE,ignored) ||
      !writeAcc(REG_ENABLE,SINGLE_SHOCK)) fail("Could not start diagnostic probe.");
  // BYPASS reads current samples independently of the shock/FIFO trigger.
  probe=PulseProbe(); probeActive=true;
  probeStartedMs=probeWindowMs=millis(); lastProbeUs=lastProbePollUs=micros();
  probeWindowSamples=probePreviousUs=probeWindowGapUs=0; probeWindowPeak=0;
  haveProbeHardware=false;
  wifiDiagnostic.probeActive=true; updateWifiDiagnostic(wifiDiagnostic);
  Serial.println("# PROBE READY for 60 seconds: normal impact events paused. Tap once. Raw pulse diagnostics only; type stop to end early.");
}
void finishProbePulse() {
  uint32_t id=nextProbeId++, now=millis();
  if (!probe.hardwareSeen) {
    wifiDiagnostic.haveNearMiss=true; wifiDiagnostic.pulseId=id; wifiDiagnostic.pulseMs=now;
    wifiDiagnostic.peakG=probe.peakG;
    wifiDiagnostic.durationMs=(probe.lastAboveUs-probe.firstUs)/1000.0f;
    wifiDiagnostic.longestAxisMs=probe.longestAxisUs/1000.0f;
    wifiDiagnostic.samples=probe.pulseSamples; wifiDiagnostic.maxGapMs=probe.maxGapUs/1000.0f;
    wifiDiagnostic.nearMissClipped=probe.clipped;
  }
  wifiDiagnostic.windowPeakG=fmaxf(wifiDiagnostic.windowPeakG,probe.peakG);
  updateWifiDiagnostic(wifiDiagnostic);
  JsonDocument doc;
  doc["type"]="diagnostic_pulse"; doc["id"]=id; doc["ms"]=now;
  doc["peak_g"]=probe.peakG; doc["raw_axis_peak_g"]=probe.rawAxisPeakG;
  doc["span_above_5g_ms"]=(probe.lastAboveUs-probe.firstUs)/1000.0f;
  doc["longest_raw_axis_above_shock_ms"]=probe.longestAxisUs/1000.0f;
  doc["hardware_shock_observed"]=probe.hardwareSeen;
  doc["near_miss"]=!probe.hardwareSeen;
  doc["sampled_estimate"]=true; doc["max_gap_ms"]=probe.maxGapUs/1000.0f;
  doc["accel_clipped"]=probe.clipped;
  doc["hardware_association_window_ms"]=20;
  doc["samples"]=probe.pulseSamples; doc["trace_truncated"]=probe.traceTruncated;
  doc["impact_detection_paused"]=true; doc["threshold_g"]=thresholdCode()*0.78f;
  doc["max_duration_ms"]=SHOCK_MAX_DURATION_MS;
  doc["baseline_ax"]=baseline.x; doc["baseline_ay"]=baseline.y; doc["baseline_az"]=baseline.z;
  printJson(doc);
  // Only this explicit diagnostic mode prints traces. No trace is an impact POST.
  for (uint16_t i=0; i<probe.count && Serial; ++i) {
    const ProbePoint& point=probe.trace[(probe.next+PulseProbe::CAPACITY-probe.count+i)%PulseProbe::CAPACITY];
    int32_t relative=(int32_t)(point.us-probe.firstUs);
    if (relative < -20000) continue;
    JsonDocument sample;
    sample["type"]="diagnostic_sample"; sample["pulse_id"]=id;
    sample["relative_us"]=relative;
    sample["ax"]=point.raw.x; sample["ay"]=point.raw.y; sample["az"]=point.raw.z;
    printJson(sample);
  }
  probe.resetPulse();
}
void serviceProbe() {
  if (!probeActive) return;
  if ((uint32_t)(millis()-probeStartedMs)>=60000) { stopProbe(); return; }
  uint32_t now=micros();
  if ((uint32_t)(now-lastProbePollUs)>=POLL_US) {
    uint8_t source;
    if (readAcc(REG_SOURCE,source) && (source&SINGLE_SHOCK)) {
      haveProbeHardware=true; probeHardwareUs=now;
      if (probe.active) probe.hardwareSeen=true;
    }
    lastProbePollUs=now;
  }
  if ((uint32_t)(now-lastProbeUs)<1250) return;
  lastProbeUs=now;
  Vec3 raw; bool clipped;
  if (!readAcceleration(raw,clipped)) return;
  uint32_t stamp=now+(uint32_t)(micros()-now)/2;
  if (probePreviousUs) probeWindowGapUs=max(probeWindowGapUs,(uint32_t)(stamp-probePreviousUs));
  probePreviousUs=stamp;
  Vec3 dynamic=subtract(raw,baseline);
  probeWindowPeak=fmaxf(probeWindowPeak,magnitude(dynamic)); ++probeWindowSamples;
  bool finished=probe.sample(raw,dynamic,stamp,thresholdCode()*0.78f);
  if (probe.active) {
    probe.clipped|=clipped;
    int32_t association=(int32_t)(probeHardwareUs-probe.firstUs);
    if (haveProbeHardware && association>=-20000 && association<=20000) probe.hardwareSeen=true;
  }
  if (finished) finishProbePulse();
  uint32_t elapsed=millis()-probeWindowMs;
  if (elapsed>=1000) {
    JsonDocument window;
    window["type"]="diagnostic_window"; window["ms"]=millis();
    window["peak_g"]=probeWindowPeak; window["sample_hz"]=probeWindowSamples*1000.0f/elapsed;
    window["max_gap_ms"]=probeWindowGapUs/1000.0f; window["impact_detection_paused"]=true;
    printJson(window);
    wifiDiagnostic.windowPeakG=probeWindowPeak; updateWifiDiagnostic(wifiDiagnostic);
    probeWindowPeak=0; probeWindowSamples=probeWindowGapUs=0; probeWindowMs=millis();
  }
}
void printMapping() {
  JsonDocument doc;
  doc["type"] = "calibration"; doc["saved"] = calibrated;
  doc["method"] = "five_static_gravity_positions";
  doc["impact_location_validated"] = false;
  if (calibrated) for (int i = 0; i < 5; ++i) doc[sideNames[i]] = savedMap[i];
  doc["axis_encoding"] = "signed incoming direction: 1=X,2=Y,3=Z";
  printJson(doc);
}
void calibrationPrompt() {
  Serial.printf("# CAL %d/5: hold helmet %s. Keep completely still, then type next. No taps.\n",
                calStep+1, poseInstructions[calStep]);
  Serial.println("# Sensors stay fixed to the helmet. Type cancel to discard this attempt.");
}
void captureGravityPose() {
  Serial.println("# CAL capturing for two seconds. Hold still; do not tap.");
  Vec3 sum = {}, squares = {};
  float gyroSquares = 0;
  uint32_t count = 0, gyroCount = 0, errorsBefore = i2cErrors;
  uint32_t started = millis();
  bool clippedAny = false;
  while ((uint32_t)(millis()-started) < 2000) {
    Vec3 a; bool clipped;
    if (!readAcceleration(a,clipped)) break;
    clippedAny |= clipped;
    sum.x += a.x; sum.y += a.y; sum.z += a.z;
    squares.x += a.x*a.x; squares.y += a.y*a.y; squares.z += a.z*a.z;
    ++count;
    sampleGyro();
    if (latestGyroValid) { gyroSquares += dot(latestGyro,latestGyro); ++gyroCount; }
    delayMicroseconds(100);
  }
  Vec3 mean = count ? scale(sum,1.0f/count) : Vec3{0,0,0};
  float spread = count ? sqrtf(fmaxf(0,dot(squares,{1,1,1})/count-dot(mean,mean))) : 999;
  float gyroRms = gyroCount ? sqrtf(gyroSquares/gyroCount) : 999;
  bool stationary = count >= 300 && !clippedAny && errorsBefore == i2cErrors &&
                    spread <= 0.6f && gyroRms <= 10.0f;
  JsonDocument doc;
  doc["type"] = "calibration_pose"; doc["pose"] = poseNames[calStep];
  doc["samples"] = count; doc["mean_ax_g"] = mean.x;
  doc["mean_ay_g"] = mean.y; doc["mean_az_g"] = mean.z;
  doc["accel_spread_g"] = spread; doc["gyro_rms_dps"] = gyroRms;
  doc["accepted"] = stationary; doc["i2c_errors"] = i2cErrors;
  printJson(doc);
  if (!stationary) {
    Serial.println("# CAL pose rejected: movement, noise, clipping or a read failure. Nothing saved; repeat this position.");
    calibrationPrompt(); return;
  }
  gravityPoses[calStep] = mean;
  if (++calStep < 5) { calibrationPrompt(); return; }
  if (!gravityMapping(gravityPoses,pendingMap)) {
    Serial.println("# CAL geometry rejected: positions did not establish distinct, consistent helmet axes. Nothing saved.");
    calStep = 0; calibrationPrompt(); return;
  }
  JsonDocument preview;
  preview["type"] = "calibration_preview"; preview["saved"] = false;
  preview["method"] = "five_static_gravity_positions";
  for (int i=0; i<5; ++i) preview[sideNames[i]] = pendingMap[i];
  preview["axis_encoding"] = "signed helmet direction: 1=X,2=Y,3=Z";
  preview["impact_location_validated"] = false;
  printJson(preview);
  Serial.println("# CAL preview only. Return helmet upright, keep still, then type save to store this mapping, or cancel.");
}
void saveCalibration() {
  zeroBaseline();  // User has returned the helmet to its upright resting pose.
  Preferences prefs;
  int8_t check[5] = {};
  bool saved = false;
  if (validMapping(pendingMap) && prefs.begin("helmet", false)) {
    saved = prefs.putBytes("map-v1", pendingMap, 5) == 5 &&
            prefs.getBytes("map-v1", check, 5) == 5 && memcmp(check, pendingMap, 5) == 0;
    prefs.end();
  }
  if (saved) { memcpy(savedMap, pendingMap, 5); calibrated = true; }
  Serial.println(saved ? "# CAL saved and read back. Gravity orientation only; physical hit location remains unverified. Recalibrate after remounting."
                       : "# CAL storage failed. New mapping was not activated.");
  calStep = -1;
  printMapping();
}
void printBenchStatus() {
  JsonDocument doc;
  doc["type"]="bench_status"; doc["active"]=benchActive;
  doc["firmware_revision"]="tap-bench-v1";
  doc["trial_armed"]=bench.busy(); doc["calibrated"]=calibrated;
  doc["accel_hz"]=benchActive ? 800 : 1600; doc["i2c_hz"]=benchActive ? 400000 : 100000;
  doc["threshold_g"]=benchActive ? PulseCapture::THRESHOLD : SHOCK_THRESHOLD_G;
  doc["impact_detection_paused"]=benchActive;
  doc["live_impacts_posted"]=false;
  doc["i2c_errors"]=i2cErrors;
  printJson(doc);
}
void stopBench() {
  bench.cancel(); benchClockAnchored=false;
  Wire.setClock(100000);  // Also recover when the bench bus-speed check failed.
  if (!writeAcc(REG_POWER,0) || !disarmFifo() || !writeAcc(REG_RATE,0x0E) ||
      !writeAcc(REG_MAP,SINGLE_SHOCK) || !writeAcc(REG_POWER,0x08))
    fail("Could not restore normal configuration after bench capture.");
  haveEvent=false;
  if (!armFifo()) fail("Could not restore normal capture after bench test.");
  benchActive=false;
  wifiDiagnostic.benchActive=false; updateWifiDiagnostic(wifiDiagnostic);
  Serial.println("# BENCH ended. Normal impact capture restored; saved orientation and baseline unchanged.");
  printBenchStatus();
}
void startBench() {
  if (benchActive) { printBenchStatus(); return; }
  traceNextImpact=false;
  if (!disarmFifo() || !writeAcc(REG_POWER,0)) fail("Could not pause capture for bench mode.");
  benchActive=true; bench=PulseCapture(); benchClockAnchored=false;
  wifiDiagnostic.benchActive=true; updateWifiDiagnostic(wifiDiagnostic);
  Wire.setClock(400000);
  if (!writeAcc(REG_RATE,0x0D) || !writeAcc(REG_POWER,0x08)) { stopBench(); return; }
  delay(20);
  // Local stationary baseline only. Never write Preferences or replace baseline.
  Vec3 sum={}, squares={}; float gyroSquares=0;
  uint32_t before=i2cErrors; uint16_t count=0;
  for (uint16_t i=0;i<128;++i) {
    Vec3 raw; bool clipped;
    if (!readAcceleration(raw,clipped) || clipped) break;
    sum.x+=raw.x; sum.y+=raw.y; sum.z+=raw.z;
    squares.x+=raw.x*raw.x; squares.y+=raw.y*raw.y; squares.z+=raw.z*raw.z;
    sampleGyro();
    if (!latestGyroValid) break;
    gyroSquares+=dot(latestGyro,latestGyro); ++count;
    delayMicroseconds(1250);
  }
  Vec3 mean=count ? scale(sum,1.0f/count) : Vec3{0,0,0};
  float spread=count ? sqrtf(fmaxf(0,dot(squares,{1,1,1})/count-dot(mean,mean))) : 999;
  if (count!=128 || i2cErrors!=before || spread>0.6f || sqrtf(gyroSquares/128)>10.0f) {
    Serial.println("# BENCH baseline rejected: keep still or check the cable. Normal mode restored.");
    stopBench(); return;
  }
  benchBaseline=mean;
  uint8_t rate;
  if (!readAcc(REG_RATE,rate) || rate!=0x0D || !writeAcc(REG_FIFO,0x80)) {
    stopBench(); return;
  }
  benchStartedMs=millis(); benchPollUs=micros();
  Serial.println("# BENCH READY. 800 Hz streamed acceleration, 20 ms prehistory, up to 200 ms post-onset. Type trial for ONE tap; stop restores normal. Test taps never become live impacts.");
  printBenchStatus();
}
void finishBenchTrial() {
  auto m=bench.metrics();
  Vec3 tailMean={};
  if (bench.count>=PulseCapture::QUIET) {
    for(uint16_t i=bench.count-PulseCapture::QUIET;i<bench.count;++i) {
      tailMean.x+=bench.values[i].x; tailMean.y+=bench.values[i].y; tailMean.z+=bench.values[i].z;
    }
    tailMean=scale(tailMean,1.0f/PulseCapture::QUIET);
  }
  float restShift=magnitude(tailMean);
  uint32_t peakUs=bench.count ? bench.stamps[m.peakIndex] : micros();
  GyroPeak gyro=gyroHistory.peak(peakUs);
  // Serial output can stall. Pause STREAM before printing, then explicitly
  // discard that gap and re-prime quiet history before another trial.
  if (!writeAcc(REG_POWER,0) || !writeAcc(REG_FIFO,0)) {
    bench.i2cGap=true;
  }
  JsonDocument doc;
  doc["type"]="bench_result"; doc["trial_id"]=benchTrialId; doc["ms"]=millis();
  doc["detected"]=bench.detected; doc["complete"]=bench.complete() && i2cErrors==benchErrorsAtArm && restShift<=0.6f;
  doc["peak_g"]=m.peakG; doc["peak_5ms_g"]=m.peak5msG;
  doc["smoothing"]="trailing_mean_of_4_magnitudes";
  doc["rest_shift_g"]=restShift;
  doc["observed_window_peak_g"]=bench.observedPeakG;
  doc["span_above_2g_ms"]=m.spanMs; doc["time_above_2g_ms"]=m.aboveMs;
  doc["accel_area_g_ms"]=m.areaGms; doc["area_is_force_impulse"]=false;
  doc["samples"]=bench.count; doc["sample_period_us"]=PulseCapture::PERIOD_US;
  doc["accel_hz"]=800; doc["i2c_hz"]=400000; doc["threshold_g"]=2;
  doc["sample_rate_basis"]="sensor_setting_nominal";
  doc["peak_index"]=m.peakIndex;
  doc["accel_clipped"]=bench.clipped; doc["fifo_overrun"]=bench.fifoOverrun;
  doc["i2c_gap"]=bench.i2cGap || i2cErrors!=benchErrorsAtArm;
  doc["left_censored"]=m.leftCensored; doc["right_censored"]=m.rightCensored;
  doc["capture_limited"]=bench.maxedOut; doc["timed_out"]=bench.timedOut;
  doc["timing_estimated"]=true; doc["live_impacts_posted"]=false;
  doc["gyro_peak_dps"]=gyro.dps; doc["gyro_window_complete"]=gyro.complete;
  doc["gyro_clipped"]=gyro.clipped; doc["gyro_window_ms"]=60;
  doc["gyro_max_gap_ms"]=gyro.maxGapUs/1000.0f;
  printJson(doc);
  for (uint16_t i=0;i<bench.count && Serial;++i) {
    JsonDocument point;
    point["type"]="bench_sample"; point["trial_id"]=benchTrialId; point["index"]=i;
    point["relative_us"]=((int32_t)i-PulseCapture::PRE)*(int32_t)PulseCapture::PERIOD_US;
    point["ax"]=bench.values[i].x; point["ay"]=bench.values[i].y; point["az"]=bench.values[i].z;
    printJson(point);
  }
  JsonDocument end; end["type"]="bench_end"; end["trial_id"]=benchTrialId;
  end["samples"]=bench.count; printJson(end);
  bench.cancel(); bench.gap(false); benchClockAnchored=false;
  if (!writeAcc(REG_POWER,0x08) || !writeAcc(REG_FIFO,0x80)) { stopBench(); return; }
}
void serviceBench() {
  if (!benchActive) return;
  if ((uint32_t)(millis()-benchStartedMs)>=600000) { stopBench(); return; }
  uint32_t now=micros();
  if (bench.busy() && (uint32_t)(now-bench.armedUs)>=60000000) bench.expire();
  if ((uint32_t)(now-benchPollUs)>=1000) {
    benchPollUs=now;
    uint8_t status;
    if (!readAcc(REG_FIFO_STATUS,status)) {
      bench.gap(false); bench.expire();
    } else {
      uint8_t available=status&0x3F;
      if (available>=32) {
        // A full STREAM FIFO may already have overwritten a sample. Reject it.
        bench.gap(true); bench.expire(); benchClockAnchored=false;
        if (!writeAcc(REG_FIFO,0) || !writeAcc(REG_FIFO,0x80)) { stopBench(); return; }
      } else {
        // Re-anchor during quiet waiting so oscillator drift over minutes does
        // not shift the gyro window. Keep a uniform clock during the short pulse.
        if (available && (!benchClockAnchored || (bench.phase!=PulseCapture::Capturing && bench.phase!=PulseCapture::Done))) {
          benchNextSampleUs=micros()-(available-1)*PulseCapture::PERIOD_US;
          benchClockAnchored=true;
        }
        for(uint8_t i=0;i<available;++i) {
          Vec3 raw; bool clipped;
          if (!readAcceleration(raw,clipped)) { bench.gap(false); bench.expire(); benchClockAnchored=false; break; }
          bench.feed(subtract(raw,benchBaseline),benchNextSampleUs,clipped);
          benchNextSampleUs+=PulseCapture::PERIOD_US;
          sampleGyro();
        }
      }
    }
  }
  if (bench.phase==PulseCapture::Done) {
    auto m=bench.metrics();
    if (!bench.count || (int32_t)(micros()-bench.stamps[m.peakIndex])>=30000) finishBenchTrial();
  }
}
void printImpact() {
  GyroPeak rotation = gyroHistory.peak(impact.peakUs);
  InitialPulse initial=initialPulse(impact.trace,impact.samples);
  const char* location=impact.clipped ? "unknown" : impactLocation(initial.acceleration,savedMap,calibrated);
  JsonDocument doc;
  doc["type"] = "impact";
  doc["id"] = nextId++; doc["ms"] = impact.detectedMs;
  doc["peak_g"] = impact.peakG;
  if (rotation.count) {
    doc["peak_rot_rads"] = rotation.dps * DEG_TO_RAD_F;
    doc["peak_rot_dps"] = rotation.dps;
  } else { doc["peak_rot_rads"] = nullptr; doc["peak_rot_dps"] = nullptr; }
  doc["location"] = location;
  doc["location_method"] = "opposite_initial_pulse_axis";
  doc["location_confidence"] = calibrated && strcmp(location,"unknown") ? initial.consistency : 0;
  doc["location_confidence_basis"] = "initial_pulse_signal_consistency_not_probability";
  doc["initial_pulse_samples"] = initial.samples;
  doc["initial_ax_g"]=initial.acceleration.x; doc["initial_ay_g"]=initial.acceleration.y; doc["initial_az_g"]=initial.acceleration.z;
  doc["accel_window_left_censored"] = initial.leftCensored;
  doc["peak_g_scope"]="captured_20ms_window";
  auto pulse=pulseMetrics(impact.trace,impact.samples,SAMPLE_US);
  auto summary=doc["pulse_window"].to<JsonObject>();
  summary["peak_5ms_g"]=pulse.peak5msG;
  summary["span_above_2g_ms"]=pulse.spanMs;
  summary["accel_area_g_ms"]=pulse.areaGms;
  summary["bounded"]=pulse.detected && !pulse.leftCensored && !pulse.rightCensored && !impact.clipped;
  if (rotation.count) {
    auto gyroVector=doc["gyro_peak_sensor_dps"].to<JsonObject>();
    gyroVector["x"]=rotation.sensorDps.x; gyroVector["y"]=rotation.sensorDps.y; gyroVector["z"]=rotation.sensorDps.z;
  } else doc["gyro_peak_sensor_dps"]=nullptr;
  doc["gyro_axis_frame"] = "sensor_axes_not_aligned_to_helmet";
  doc["location_validated"] = false;
  doc["ax"] = impact.accel.x; doc["ay"] = impact.accel.y; doc["az"] = impact.accel.z;
  doc["accel_basis"] = "rest_baseline_subtracted_g";
  doc["raw_peak_sample_g"] = impact.rawPeakG;
  doc["fifo_samples"] = impact.samples;
  doc["gyro_samples"] = rotation.count;
  doc["gyro_window_complete"] = rotation.complete;
  doc["gyro_max_gap_ms"] = rotation.maxGapUs/1000.0f;
  doc["gyro_window_basis"] = "estimated_fifo_peak_plus_minus_30ms";
  doc["timing_estimated"] = true;
  doc["accel_clipped"] = impact.clipped; doc["gyro_clipped"] = rotation.clipped;
  doc["calibration_capture"] = calStep >= 0;
  printJson(doc);
  queueWifiImpact(doc);  // Existing Serial JSON above is unchanged.
  if (traceNextImpact && Serial) {
    traceNextImpact=false;
    // Capture is finished, including the future gyro window. This one-shot
    // record reveals the actual FIFO that chose the side; it is never POSTed.
    JsonDocument trace;
    trace["type"]="impact_direction_trace";
    trace["impact_id"]=nextId-1;
    trace["location"]=location;
    trace["reason"]=impact.clipped ? "accelerometer_clipped" :
      (!calibrated ? "uncalibrated" :
       (!strcmp(initial.reason,"accepted") && !strcmp(location,"unknown") ? "unmapped_direction" : initial.reason));
    trace["initial_samples"]=initial.samples;
    trace["coherence"]=initial.coherence;
    trace["initial_mean_x"]=initial.diagnosticMean.x;
    trace["initial_mean_y"]=initial.diagnosticMean.y;
    trace["initial_mean_z"]=initial.diagnosticMean.z;
    trace["sample_period_us"]=SAMPLE_US;
    trace["accel_basis"]="rest_baseline_subtracted_g";
    auto map=trace["map_front_back_left_right_top"].to<JsonArray>();
    for (int i=0;i<5;++i) map.add(savedMap[i]);
    auto samples=trace["samples_xyz"].to<JsonArray>();
    for (uint8_t i=0;i<impact.samples;++i) {
      auto xyz=samples.add<JsonArray>();
      xyz.add(impact.trace[i].x); xyz.add(impact.trace[i].y); xyz.add(impact.trace[i].z);
    }
    printJson(trace);
  }
}
void serviceImpact() {
  if (!impact.active) return;
  // One post-trigger sample needs 625 us; 2 ms also covers the >=5 us settling rule.
  if (!impact.fifoRead && (uint32_t)(micros()-impact.detectedUs) >= 2000) {
    uint8_t status;
    if (!readAcc(REG_FIFO_STATUS, status) || !(status & 0x80)) {
      Serial.println("# ERROR: shock capture was not readable; no impact reported.");
      impact.active = false; disarmFifo(); return;
    }
    uint8_t count = status & 0x3F;
    if (count != 32) {
      // Keep sampling the gyro while waiting; do not freeze an unfinished FIFO.
      if ((uint32_t)(micros()-impact.detectedUs) < 25000) return;
      Serial.printf("# ERROR: incomplete FIFO capture (%u samples after %lu us); no impact reported.\n",
                    count, (unsigned long)(micros()-impact.detectedUs));
      impact.active = false; disarmFifo(); return;
    }
    if (!writeAcc(REG_POWER, 0)) {
      Serial.println("# ERROR: could not preserve FIFO for readout; no impact reported.");
      impact.active = false; disarmFifo(); return;
    }
    // Standby preserves the FIFO, stopping new accel samples during readout.
    // Read each XYZ sample in ONE six-byte burst. Interleave gyro reads so its
    // history continues while the slower 100 kHz bus drains the accelerometer.
    for (uint8_t i = 0; i < count; ++i) {
      Vec3 raw; bool clipped;
      if (!readAcceleration(raw, clipped)) {
        Serial.println("# ERROR: FIFO read failed; no impact reported.");
        impact.active = false; disarmFifo(); return;
      }
      Vec3 dynamic = subtract(raw, baseline);
      impact.trace[i]=dynamic;
      float g = magnitude(dynamic);
      if (g > impact.peakG) {
        impact.peakG = g; impact.accel = dynamic; impact.rawPeakG = magnitude(raw);
        int32_t offset = ((int32_t)i - PRETRIGGER_SAMPLES) * (int32_t)SAMPLE_US;
        impact.peakUs = impact.detectedUs + offset;
      }
      impact.clipped |= clipped;
      ++impact.samples;
      sampleGyro();
    }
    impact.fifoRead = true;
    if (!writeAcc(REG_POWER, 0x08) || !disarmFifo()) fail("Could not exit FIFO readout.");
  }
  // Wait for the future half of the gyro window before choosing its peak.
  if (impact.fifoRead && (int32_t)(micros()-impact.peakUs) >= 30000) {
    printImpact();
    impact.active = false;
  }
}
void pollShock() {
  if (!armed || impact.active || (uint32_t)(micros()-lastPollUs) < POLL_US) return;
  lastPollUs = micros();
  uint8_t source;
  if (!readAcc(REG_SOURCE, source)) return;
  if (!(source & SINGLE_SHOCK)) return;
  lastEventUs = micros(); haveEvent = true;
  flashWifiImpactLed();
  impact = Impact(); impact.active = true;
  impact.detectedUs = lastEventUs; impact.detectedMs = millis();
  impact.peakUs = lastEventUs;
  armed = false;  // Do not clear FIFO until serviceImpact has read it.
}
void heartbeat() {
  uint32_t now = millis();
  uint32_t elapsed = now-lastHeartbeatMs;
  if (impact.active || !elapsed || (!forceHeartbeat && elapsed < 5000)) return;
  forceHeartbeat = false;
  lastHeartbeatMs = now;
  Vec3 rest; bool clipped;
  bool accelOk = readAcceleration(rest, clipped);
  JsonDocument doc;
  doc["type"] = "heartbeat"; doc["ms"] = now;
  doc["firmware_revision"]="tap-bench-v1";
  if (accelOk) {
    doc["rest_accel_g"] = magnitude(rest);
    doc["rest_ax_g"] = rest.x; doc["rest_ay_g"] = rest.y; doc["rest_az_g"] = rest.z;
  } else doc["rest_accel_g"] = nullptr;
  if (latestGyroValid) doc["gyro_dps"] = magnitude(latestGyro);
  else doc["gyro_dps"] = nullptr;
  doc["gyro_read_hz"] = (gyroReads-heartbeatGyroReads)*1000.0f/elapsed;
  heartbeatGyroReads = gyroReads;
  doc["i2c_errors"] = i2cErrors; doc["calibrated"] = calibrated;
  doc["armed"] = armed; doc["cal_step"] = calStep;
  doc["shock_threshold_g"] = thresholdCode()*0.78f;
  doc["shock_max_duration_ms"] = SHOCK_MAX_DURATION_MS;
  doc["diagnostic_mode"] = probeActive ? "raw_pulse_probe" : "normal";
  doc["impact_detection_paused"] = probeActive;
  if (wifiDiagnostic.haveNearMiss) {
    auto near=doc["near_miss"].to<JsonObject>();
    near["id"]=wifiDiagnostic.pulseId; near["peak_g"]=wifiDiagnostic.peakG;
    near["span_above_5g_ms"]=wifiDiagnostic.durationMs;
    near["longest_raw_axis_above_shock_ms"]=wifiDiagnostic.longestAxisMs;
    near["sampled_estimate"]=true;
  }
  doc["calibration_method"] = "five_static_gravity_positions";
  printJson(doc);
}
void selfTest() {
  unsigned int passed = 0, failed = 0;
  auto check = [&](bool ok) { ok ? ++passed : ++failed; };
  check(fabsf(magnitude({3,4,0})-5) < 0.0001f);
  check(fabsf(100*GYRO_DPS_PER_LSB-14) < 0.0001f);
  check(fabsf(180*DEG_TO_RAD_F-3.14159265f) < 0.0001f);
  int8_t map[5] = {1,-1,2,-2,3};
  check(validMapping(map));
  check(strcmp(impactLocation({-10,0,0},map,true),"front") == 0);
  check(strcmp(impactLocation({0,10,0},map,true),"right") == 0);
  check(strcmp(impactLocation({0,0,-10},map,true),"top") == 0);
  check(strcmp(impactLocation({10,10,0},map,true),"unknown") == 0);
  check(strcmp(impactLocation({10,0,0},map,false),"uncalibrated") == 0);
  check(topAxis(-2,1) == 3);
  Vec3 poses[5] = {{0,0,1},{-1,0,0},{1,0,0},{0,-1,0},{0,1,0}};
  int8_t gravityMap[5] = {};
  check(gravityMapping(poses,gravityMap) && memcmp(gravityMap,map,5)==0);
  for (int i=0;i<5;++i) { poses[i].x+=1.1f; poses[i].y-=0.4f; poses[i].z+=0.2f; }
  check(gravityMapping(poses,gravityMap) && memcmp(gravityMap,map,5)==0);
  poses[2] = poses[1];  // Repeating the same pose cannot establish an axis.
  check(!gravityMapping(poses,gravityMap));
  Vec3 rotated[5] = {{0,0,1},{0,1,0},{0,-1,0},{-1,0,0},{1,0,0}};
  int8_t rotatedMap[5] = {-2,2,1,-1,3};
  check(gravityMapping(rotated,gravityMap) && memcmp(gravityMap,rotatedMap,5)==0);
  rotated[0].z = -1;  // Crown down is not crown up.
  check(!gravityMapping(rotated,gravityMap));
  Vec3 falsePulse[5];
  for (int i=0;i<5;++i) falsePulse[i] = {0.23275f,-1.059625f,-0.093406f};
  check(!gravityMapping(falsePulse,gravityMap));
  static GyroHistory history;  // Keep the expanded vector history off the 8 KiB loop stack.
  history.next=history.count=0;
  uint32_t center = 10000;  // The pre-window crosses uint32_t rollover.
  history.push({center-31000, 999, false});
  for (int32_t offset=-30000; offset<=30000; offset+=2000)
    history.push({center+offset, offset==0 ? 75.0f : 2.0f, false});
  history.push({center+31000, 999, false});
  GyroPeak peak = history.peak(center);
  check(peak.complete && peak.count==31 && peak.dps==75);
  history.next=history.count=0;
  history.push({center, 5, false});
  check(!history.peak(center).complete);
  Vec3 waveform[32]={};
  waveform[4]={-8,0,0}; waveform[5]={-10,1,0}; waveform[6]={-12,0,0}; waveform[7]={-8,-1,0};
  waveform[20]={0,0,40};  // Later ringing must not choose the side.
  InitialPulse initial=initialPulse(waveform,32);
  check(initial.samples==4 && !initial.leftCensored && initial.consistency>0.8f);
  check(strcmp(impactLocation(initial.acceleration,map,true),"front")==0);
  waveform[0]={-30,0,0}; initial=initialPulse(waveform,32);
  check(initial.leftCensored && initial.consistency==0 && initial.samples==0);
  waveform[0]={0,0,0}; waveform[4]={8,0,0}; waveform[5]={-8,0,0}; waveform[6]={0,0,0};
  initial=initialPulse(waveform,32);
  check(initial.consistency==0);
  check(!strcmp(initial.reason,"opposed_initial_samples"));
  memset(waveform,0,sizeof(waveform));
  waveform[4]={6,0,0}; initial=initialPulse(waveform,32);
  check(!strcmp(initial.reason,"too_few_initial_samples") && initial.diagnosticMean.x==6 && initial.acceleration.x==0);
  waveform[5]={6,0,0}; initial=initialPulse(waveform,32);
  check(!strcmp(initial.reason,"accepted") && initial.coherence==1 && initial.acceleration.x==6);
  waveform[4]={6,6,0}; waveform[5]={6,6,0}; initial=initialPulse(waveform,32);
  check(!strcmp(initial.reason,"diagonal_initial_pulse") && initial.acceleration.x==0 && initial.diagnosticMean.x==6);
  memset(waveform,0,sizeof(waveform));
  for (int i=4;i<20;++i) waveform[i]=i<8 ? Vec3{6,0,8} : Vec3{12,0,0};
  initial=initialPulse(waveform,32);
  check(initial.samples==16 && !strcmp(initial.reason,"accepted"));
  check(strcmp(impactLocation(initial.acceleration,map,true),"back")==0);
  waveform[8]={0,0,0};  // Quiet gap keeps later motion out of the initial pulse.
  initial=initialPulse(waveform,32);
  check(initial.samples==4 && initial.acceleration.x==0);
  for (int i=4;i<20;++i) waveform[i]=i<12 ? Vec3{10,0,0} : Vec3{-10,0,0};
  initial=initialPulse(waveform,32);
  check(!strcmp(initial.reason,"opposed_initial_samples") && initial.acceleration.x==0);
  static PulseProbe probeTest;
  probeTest.resetPulse(); probeTest.next=probeTest.count=0;
  check(!probeTest.sample({0,0,0},{0,0,0},1000,10.14f));
  check(!probeTest.sample({6,0,0},{6,0,0},2000,10.14f));
  check(!probeTest.sample({8,0,0},{8,0,0},4000,10.14f));
  check(!probeTest.sample({0,0,0},{0,0,0},6000,10.14f));
  check(probeTest.sample({0,0,0},{0,0,0},12000,10.14f));
  check(probeTest.peakG==8 && probeTest.lastAboveUs-probeTest.firstUs==2000 && !probeTest.hardwareSeen);
  JsonDocument doc;
  doc["type"] = "selftest"; doc["passed"] = passed; doc["failed"] = failed;
  doc["synthetic_math_only"] = true;
  printJson(doc);
}
void handleCommand() {
  if (!strcmp(command,"help")) {
    Serial.println("# Commands: cal, next, save, cancel, zero, status, selftest, trace, traceoff, probe, bench (isolated streamed test), trial (one bench tap), trialcancel, stop, help.");
  } else if (!strcmp(command,"status")) {
    printMapping(); if (benchActive) printBenchStatus(); else forceHeartbeat = true;
  } else if (!strcmp(command,"stop") && benchActive) {
    stopBench();
  } else if (!strcmp(command,"bench") && calStep<0 && !probeActive && !impact.active) {
    startBench();
  } else if (!strcmp(command,"trial") && benchActive && !bench.busy()) {
    ++benchTrialId; benchStartedMs=millis(); bench.arm(micros()); benchErrorsAtArm=i2cErrors;
    JsonDocument doc; doc["type"]="bench_armed"; doc["trial_id"]=benchTrialId;
    doc["window_seconds"]=60; doc["primary_metric"]="peak_g"; printJson(doc);
  } else if (!strcmp(command,"trialcancel") && benchActive) {
    bench.expire();
  } else if (benchActive) {
    Serial.println("# Bench mode: use trial, trialcancel, status or stop. Calibration and live impacts are paused.");
  } else if (!strcmp(command,"selftest")) {
    selfTest();
  } else if (!strcmp(command,"trace") && calStep < 0 && !probeActive) {
    traceNextImpact=true;
    Serial.println("# TRACE ready: next normal impact also prints its FIFO and side-rejection reason. Detection, Wi-Fi and saved calibration unchanged.");
  } else if (!strcmp(command,"traceoff")) {
    traceNextImpact=false;
    Serial.println("# TRACE cancelled. Normal detection unchanged.");
  } else if (!strcmp(command,"stop") && probeActive) {
    stopProbe();
  } else if (!strcmp(command,"stop") && !probeActive) {
    printBenchStatus();  // Idempotent acknowledgement when already normal.
  } else if (probeActive) {
    Serial.println("# Probe active: type stop before calibration or baseline commands.");
  } else if (impact.active) {
    Serial.println("# Wait for the current impact to finish, then repeat the command.");
  } else if (!strcmp(command,"cal")) {
    if (!disarmFifo() || !writeAcc(REG_POWER,0x08)) fail("Could not start gravity calibration.");
    calStep = 0; memset(pendingMap,0,5); memset(gravityPoses,0,sizeof(gravityPoses)); calibrationPrompt();
  } else if (!strcmp(command,"probe") && calStep < 0) {
    startProbe();
  } else if (!strcmp(command,"next") && calStep >= 0 && calStep < 5 && !armed) {
    captureGravityPose();
  } else if (!strcmp(command,"save") && calStep == 5 && !armed) {
    saveCalibration();
  } else if (!strcmp(command,"cancel")) {
    disarmFifo(); calStep = -1; haveEvent = false;
    zeroBaseline();
    if (!armFifo()) fail("Could not restore impact detection.");
    Serial.println("# Calibration cancelled. Previous saved mapping kept.");
  } else if (!strcmp(command,"zero") && calStep < 0) {
    Serial.println("# Measuring the stationary baseline. Keep still...");
    zeroBaseline(); haveEvent = false;
    if (!armFifo()) fail("Could not re-arm after zero.");
    Serial.println("# Baseline updated.");
  } else if (command[0]) {
    Serial.println("# Unknown command or wrong calibration step. Type help.");
  }
}
void readCommands() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c=='\r' || c=='\n') {
      if (commandOverflow) Serial.println("# Command too long; ignored.");
      else if (commandLength) { command[commandLength] = 0; handleCommand(); }
      commandLength = 0; commandOverflow = false;
    } else if (commandLength < sizeof(command)-1) command[commandLength++] = c;
    else commandOverflow = true;
  }
}
void setup() {
  Serial.begin(115200);
  uint32_t start = millis();
  while (!Serial && millis()-start < 8000) delay(10);
  pinMode(I2C_POWER, OUTPUT); digitalWrite(I2C_POWER, HIGH); delay(20);
  Wire.begin(); Wire.setClock(100000); Wire.setTimeOut(20);
  Serial.println("# Relative helmet-impact telemetry. Keep sensors still during startup. A human trainer makes evaluation decisions.");
  if (!accelerometer.begin(ACC_ADDR)) fail("ADXL375 not found at 0x53.");
  if (!imu.begin_I2C(GYRO_ADDR, &Wire)) fail("ISM330DHCX not found at 0x6A.");
  imu.setAccelDataRate(LSM6DS_RATE_SHUTDOWN);
  imu.setGyroRange(ISM330DHCX_GYRO_RANGE_4000_DPS);
  imu.setGyroDataRate(LSM6DS_RATE_1_66K_HZ);
  // BDU + automatic address increment for consistent six-byte gyro reads.
  if (!writeByte(GYRO_ADDR,0x12,0x44)) fail("Gyro configuration failed.");
  if (!writeAcc(REG_POWER,0) || !writeAcc(REG_ENABLE,0) ||
      !writeAcc(REG_FORMAT,0x0B) ||  // Mandatory fixed bits + right justification.
      !writeAcc(REG_RATE,0x0E) ||  // 1600 Hz, normal power.
      !writeAcc(REG_DURATION,(uint8_t)lroundf(SHOCK_MAX_DURATION_MS/0.625f)) ||
      !writeAcc(REG_LATENT,0) || !writeAcc(REG_WINDOW,0) ||
      !writeAcc(REG_AXES,0x07) || !writeAcc(REG_MAP,SINGLE_SHOCK))
    fail("Accelerometer configuration failed.");
  uint8_t format, rate, gyroControl, gyroMode, duration;
  if (!readAcc(REG_FORMAT,format) || format!=0x0B || !readAcc(REG_RATE,rate) || rate!=0x0E ||
      !readAcc(REG_DURATION,duration) || duration!=(uint8_t)lroundf(SHOCK_MAX_DURATION_MS/0.625f) ||
      !readBytes(GYRO_ADDR,0x11,&gyroControl,1) || gyroControl!=0x81 ||
      !readBytes(GYRO_ADDR,0x12,&gyroMode,1) || gyroMode!=0x44)
    fail("Sensor register readback did not match the requested settings.");
  Preferences prefs;
  if (prefs.begin("helmet",true)) {
    calibrated = prefs.getBytesLength("map-v1")==5 && prefs.getBytes("map-v1",savedMap,5)==5 && validMapping(savedMap);
    prefs.end();
  }
  delay(100);  // Let gyro startup settle before saving its readings.
  zeroBaseline();
  if (!armFifo()) fail("Could not arm impact detection.");
  Serial.println("# READY: tap the mounting. Type cal to map helmet sides; zero after changing resting pose; help for commands.");
  printMapping();
  lastHeartbeatMs = millis();
  heartbeatGyroReads = gyroReads;
  if (!beginWifiDelivery()) fail("Could not allocate Wi-Fi delivery queues/tasks.");
}
void loop() {
  sampleGyro();
  if (benchActive) {
    serviceBench(); readCommands();
    pollWifiDelivery(calibrated,true);
    delayMicroseconds(50); return;
  }
  if (probeActive) {
    serviceProbe(); readCommands();
    // Serial heartbeat pauses during raw acquisition; network heartbeats continue.
    pollWifiDelivery(calibrated,probe.active);
    delayMicroseconds(50); return;
  }
  serviceImpact();
  // During the 300 ms dead time, interrupts remain disabled and the FIFO empty.
  // A bump in the dead time cannot sit latched and masquerade as a later event.
  if (!armed && !impact.active && calStep < 0 &&
      (!haveEvent || (uint32_t)(micros()-lastEventUs) >= DEBOUNCE_US)) {
    if (!armFifo()) fail("Could not re-arm FIFO; check the sensor cable.");
  }
  pollShock();
  readCommands();
  heartbeat();
  pollWifiDelivery(calibrated,impact.active);
  delayMicroseconds(50);
}
