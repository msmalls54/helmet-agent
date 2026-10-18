#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <atomic>
#include <stdarg.h>
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "WifiDelivery.h"
#include "secrets.h"

namespace {
constexpr size_t MAX_JSON = 1536;  // Existing queue size; pulse metadata remains bounded.
constexpr uint8_t HIT_CAPACITY = 50;
constexpr uint32_t HEARTBEAT_MS = 10000, RETRY_MS = 1000;
struct HitMessage { uint16_t size; uint32_t id; char json[MAX_JSON]; };
struct StatusMessage { char text[192]; };
QueueHandle_t hits = nullptr, statuses = nullptr, diagnostics = nullptr;
std::atomic<bool> connected{false}, calibrationSaved{false};
std::atomic<uint32_t> redUntil{0}, queueDrops{0};
char bootId[17] = {};

// The worker never writes to Serial: the sensor loop owns all Serial output.
void report(const char* format, ...) {
  StatusMessage message = {};
  va_list args;
  va_start(args,format);
  vsnprintf(message.text,sizeof(message.text),format,args);
  va_end(args);
  xQueueSend(statuses,&message,0);
}

int post(const char* path, const char* json, size_t size) {
  // All connect/write/response waits stay on core 0, away from the sensor loop.
  NetworkClient client;
  HTTPClient http;
  http.setConnectTimeout(400);
  http.setTimeout(400);
  http.setReuse(false);
  if (!http.begin(client,String(SERVER_HOST),SERVER_PORT,String(path),false)) return -100;
  http.addHeader("Content-Type","application/json");
  int status = http.POST(reinterpret_cast<uint8_t*>(const_cast<char*>(json)),size);
  http.end();
  return status;
}

void statusLedTask(void*) {
  // This task alone touches the NeoPixel. Its driver can wait for the RMT
  // peripheral without delaying sensor sampling or a red flash during HTTP.
  pinMode(NEOPIXEL_POWER,OUTPUT);
  digitalWrite(NEOPIXEL_POWER,NEOPIXEL_POWER_ON);
  uint32_t previousColor = UINT32_MAX;
  for (;;) {
    uint32_t now = millis();
    uint32_t until = redUntil.load();
    uint8_t r=0,g=0,b=0;
    if (until && (int32_t)(until-now)>0) r=40;
    else if (connected.load()) { if (now%2000 < 120) g=24; }
    else if (now%1000 < 350) b=24;
    uint32_t color = (r<<16)|(g<<8)|b;
    if (color != previousColor) {
      rgbLedWrite(PIN_NEOPIXEL,r,g,b);
      previousColor = color;
    }
    vTaskDelay(pdMS_TO_TICKS(20));
  }
}

void deliveryTask(void*) {
  WiFi.persistent(false);  // Credentials stay in secrets.h, not Wi-Fi NVS.
  WiFi.setHostname(HELMET_ID);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.onEvent([](WiFiEvent_t, WiFiEventInfo_t info) {
    report("# WIFI disconnected reason=%u; will retry",info.wifi_sta_disconnected.reason);
  },ARDUINO_EVENT_WIFI_STA_DISCONNECTED);
  // This boot-time scan blocks only the network worker, never sensor capture.
  int found=WiFi.scanNetworks(false,true);
  int matched=0, best=-1;
  for (int i=0;i<found;++i) if (WiFi.SSID(i)==WIFI_SSID) {
    ++matched;
    if (best<0 || WiFi.RSSI(i)>WiFi.RSSI(best)) best=i;
  }
  report("# WIFI 2.4 GHz scan: networks=%d target_matches=%d",found,matched);
  if (best>=0) report("# WIFI target visible rssi=%ld channel=%ld auth=%d",
                     (long)WiFi.RSSI(best),(long)WiFi.channel(best),(int)WiFi.encryptionType(best));
  String visible[6];
  int visibleCount=0;
  for (int i=0;i<found && visibleCount<6;++i) {
    String name=WiFi.SSID(i);
    bool alreadySeen=false;
    for (int j=0;j<visibleCount;++j) if (visible[j]==name) alreadySeen=true;
    if (name.length() && !alreadySeen) {
      visible[visibleCount++]=name;
      report("# WIFI visible 2.4 GHz ssid=%s rssi=%ld channel=%ld auth=%d",
             name.c_str(),(long)WiFi.RSSI(i),(long)WiFi.channel(i),(int)WiFi.encryptionType(i));
    }
  }
  WiFi.scanDelete();
  report("# WIFI connecting to %s",WIFI_SSID);
  WiFi.begin(WIFI_SSID,WIFI_PASSWORD);
  WiFi.setSleep(false);
  bool wasConnected = false;
  uint32_t lastConnect = millis(), lastHitTry=0, lastHeartbeat=0;
  HitMessage pending = {};
  for (;;) {
    uint32_t now = millis();
    bool online = WiFi.status() == WL_CONNECTED;
    connected.store(online);
    if (online && !wasConnected) {
      WiFi.setSleep(false);
      report("# WIFI connected ip=%s rssi=%ld dBm server=%s:%u",
             WiFi.localIP().toString().c_str(),(long)WiFi.RSSI(),SERVER_HOST,SERVER_PORT);
      lastHeartbeat = now-HEARTBEAT_MS;  // Prove the link immediately on connect.
    } else if (!online && wasConnected) {
      report("# WIFI disconnected; queued hits retained, reconnecting");
    }
    wasConnected = online;
    if (!online) {
      if ((uint32_t)(now-lastConnect) >= 10000) {
        report("# WIFI connecting (retry), status=%d",(int)WiFi.status());
        WiFi.reconnect();
        lastConnect = now;
      }
      vTaskDelay(pdMS_TO_TICKS(50));
      continue;
    }
    if ((uint32_t)(now-lastHeartbeat) >= HEARTBEAT_MS) {
      JsonDocument heartbeat;
      heartbeat["type"]="heartbeat";
      heartbeat["firmware_revision"]="tap-bench-v1";
      heartbeat["helmet_id"]=HELMET_ID; heartbeat["player"]=PLAYER;
      heartbeat["boot_id"]=bootId;
      heartbeat["uptime_ms"]=now; heartbeat["rssi"]=WiFi.RSSI();
      heartbeat["calibrated"]=calibrationSaved.load();
      heartbeat["queued_hits"]=uxQueueMessagesWaiting(hits);
      heartbeat["dropped_hits"]=queueDrops.load();
      WifiDiagnostic diagnostic;
      if (xQueuePeek(diagnostics,&diagnostic,0)==pdTRUE) {
        heartbeat["diagnostic_mode"]=diagnostic.benchActive ? "tap_comparison" : (diagnostic.probeActive ? "raw_pulse_probe" : "normal");
        heartbeat["impact_detection_paused"]=diagnostic.probeActive || diagnostic.benchActive;
        heartbeat["diagnostic_window_peak_g"]=diagnostic.windowPeakG;
        heartbeat["near_miss_observation"]="explicit_probe_only";
        if (diagnostic.haveNearMiss) {
          auto near=heartbeat["near_miss"].to<JsonObject>();
          near["id"]=diagnostic.pulseId; near["ms"]=diagnostic.pulseMs;
          near["age_ms"]=(uint32_t)(now-diagnostic.pulseMs);
          near["peak_g"]=diagnostic.peakG;
          near["span_above_5g_ms"]=diagnostic.durationMs;
          near["longest_raw_axis_above_shock_ms"]=diagnostic.longestAxisMs;
          near["samples"]=diagnostic.samples; near["max_gap_ms"]=diagnostic.maxGapMs;
          near["hardware_shock_observed"]=false;
          near["sampled_estimate"]=true;
          near["accel_clipped"]=diagnostic.nearMissClipped;
        }
      }
      char body[1152];
      if (measureJson(heartbeat)>=sizeof(body)) {
        report("# WIFI heartbeat exceeded buffer; not sent.");
        lastHeartbeat=now; continue;
      }
      size_t size=serializeJson(heartbeat,body,sizeof(body));
      int status=post("/heartbeat",body,size);
      report("# WIFI heartbeat HTTP=%d queued=%u dropped=%lu",status,
             (unsigned)uxQueueMessagesWaiting(hits),(unsigned long)queueDrops.load());
      lastHeartbeat=now;
    }
    // Peek rather than remove: a hit remains among the 50 retained messages
    // until acknowledged. Failed POSTs retry the same boot_id + impact id.
    if ((uint32_t)(now-lastHitTry) >= RETRY_MS && xQueuePeek(hits,&pending,0)==pdTRUE) {
      int status=post("/impact",pending.json,pending.size);
      if (status>=200 && status<300) {
        xQueueReceive(hits,&pending,0);
        report("# WIFI delivered impact id=%lu HTTP=%d queued=%u",
               (unsigned long)pending.id,status,(unsigned)uxQueueMessagesWaiting(hits));
        lastHitTry=now-RETRY_MS;  // Drain a backlog without one-second spacing.
      } else {
        report("# WIFI impact id=%lu HTTP=%d; retained for retry",
               (unsigned long)pending.id,status);
        lastHitTry=now;
      }
    }
    vTaskDelay(pdMS_TO_TICKS(20));
  }
}
}  // namespace

bool beginWifiDelivery() {
  snprintf(bootId,sizeof(bootId),"%08lx%08lx",(unsigned long)esp_random(),(unsigned long)esp_random());
  hits=xQueueCreate(HIT_CAPACITY,sizeof(HitMessage));
  statuses=xQueueCreate(12,sizeof(StatusMessage));
  diagnostics=xQueueCreate(1,sizeof(WifiDiagnostic));
  if (!hits || !statuses || !diagnostics) return false;
  WifiDiagnostic initial;
  xQueueOverwrite(diagnostics,&initial);
  if (xTaskCreatePinnedToCore(statusLedTask,"helmet-led",3072,nullptr,1,nullptr,0)!=pdPASS) return false;
  return xTaskCreatePinnedToCore(deliveryTask,"helmet-wifi",8192,nullptr,1,nullptr,0)==pdPASS;
}

void updateWifiDiagnostic(const WifiDiagnostic& value) {
  if (diagnostics) xQueueOverwrite(diagnostics,&value);
}

void flashWifiImpactLed() { redUntil.store(millis()+220); }

void queueWifiImpact(JsonDocument& doc) {
  doc["helmet_id"]=HELMET_ID; doc["player"]=PLAYER; doc["boot_id"]=bootId;
  HitMessage message = {};
  message.id=doc["id"].as<uint32_t>();
  if (measureJson(doc)>=sizeof(message.json)) {
    ++queueDrops;
    Serial.println("# WIFI queue rejected oversized impact; Serial record preserved.");
    return;
  }
  message.size=serializeJson(doc,message.json,sizeof(message.json));
  if (xQueueSend(hits,&message,0)!=pdTRUE) {
    ++queueDrops;
    Serial.println("# WIFI queue full (50 retained hits); newest hit not queued, Serial record preserved.");
  }
}

void pollWifiDelivery(bool calibrated, bool captureActive) {
  calibrationSaved.store(calibrated);
  if (captureActive || !Serial) return;
  StatusMessage message;
  if (xQueueReceive(statuses,&message,0)==pdTRUE) {
    // One write keeps status text from interleaving with the existing JSON.
    size_t size=strlen(message.text);
    message.text[size++]='\n';
    Serial.write(reinterpret_cast<const uint8_t*>(message.text),size);
  }
}
