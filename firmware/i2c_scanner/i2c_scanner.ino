// First check: power the STEMMA QT port and look for both sensor addresses.
#include <Wire.h>

void setup() {
  Serial.begin(115200);
  unsigned long started = millis();
  while (!Serial && millis() - started < 8000) delay(10);

  // This Feather switches its STEMMA QT power using GPIO 7.
  pinMode(I2C_POWER, OUTPUT);
  digitalWrite(I2C_POWER, HIGH);
  delay(20);
  Wire.begin();
  Wire.setClock(100000);  // Also suitable for the later, longer cable.
  Wire.setTimeOut(20);
  Serial.println("# I2C scanner: expected 0x53 (ADXL375), 0x6A (ISM330DHCX), 0x36 (battery monitor).");
}

void loop() {
  bool adxlFound = false, imuFound = false;
  unsigned int count = 0;
  Serial.print("{\"type\":\"i2c_scan\",\"addresses\":[");
  for (uint8_t address = 1; address < 127; address++) {
    Wire.beginTransmission(address);
    uint8_t result = Wire.endTransmission();
    if (result != 0) continue;
    if (count++) Serial.print(',');
    Serial.printf("\"0x%02X\"", address);
    if (address == 0x53) adxlFound = true;
    if (address == 0x6A) imuFound = true;
  }
  Serial.printf("],\"adxl375\":%s,\"ism330dhcx\":%s}\n",
                adxlFound ? "true" : "false", imuFound ? "true" : "false");
  if (!adxlFound || !imuFound) {
    Serial.println("# Missing sensor: unplug USB, reseat each STEMMA QT plug, reconnect, then check the scan again.");
  }
  delay(3000);
}
