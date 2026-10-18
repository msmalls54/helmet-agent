# Helmet telemetry: Serial and Wi-Fi

[Current project state](../CURRENT_STATE.md) · [Demo runbook](../docs/DEMO.md) ·
[Evidence index](../evidence/README.md). Dated checks below preserve earlier stages;
use the current-state page to identify the latest firmware and pending retests.

This firmware produces **relative helmet-impact telemetry**. The sensors measure
their mounting on the helmet, not skull motion. A human trainer makes evaluation
decisions. The firmware now delivers to the real mcp-use/SQLite server, which
provides MCP history, an SVG helmet widget and an explicit Inkbox review tool.
Claude and ChatGPT connect through the protected MCP entrance. The server now
runs a bounded background agent review loop; see [automatic reviews](../docs/AUTOMATIC_ALERTS.md).
Its empty-helmet demo policy is not a medical evaluation threshold.
See [server instructions](../server/README.md) for the current demo.

## Wi-Fi to the laptop

At the event, the Feather's direct 2.4 GHz scan could not see `Y Combinator`,
although the laptop connected on 5/6 GHz. The selected arrangement keeps the
laptop on that venue network and uses Windows mobile hotspot to provide a
separate **Helmet-Agent** 2.4 GHz link to the helmet. It uses no phone or cellular
connection. Windows reported the helmet-link listener IP as **192.168.137.1**.
Leave Windows mobile hotspot on while using this arrangement. Restart it with:

```powershell
.\tools\Start-HelmetWifi.ps1
```

That helper reads the ignored firmware credentials, verifies the band, and writes
the detected listener IP back into `secrets.h`. It leaves an unrelated active
hotspot alone. Its nonsecret receipt is `evidence/wifi-laptop-link.json`.

Verified October 17, 2026: periodic network heartbeats and two real impact POSTs
arrived, at 27.14017 g and 35.32343 g of relative helmet-impact telemetry. Both
matched their original Serial JSON, retained all 32 FIFO samples and had complete
gyro windows. The second was captured with the helmet link switched off, retained
in the queue for at least 28 seconds, then delivered after automatic reconnection.
Queue drops and sensor I2C errors were zero. Saved calibration was unchanged;
18 on-device mathematical checks and four local listener tests passed. The
listener and laptop helmet link were left running; the Serial monitor was closed.
Receipt: `evidence/wifi-transport-status.json`.

`helmet_impact/secrets.h` contains the local network settings and is ignored by
Git. `secrets.example.h` is the committed template. Both the Feather and laptop
must use the same LAN, and the access point must allow traffic between them.
Set `SERVER_HOST` to the laptop's address on the **helmet link**, without
`http://`. In the current arrangement that is 192.168.137.1, rather than the
laptop's separate address on the venue network.

From the `helmet-agent` folder, start the helmet Wi-Fi link and real server:

```powershell
.\tools\Start-Helmet.ps1
```

The server saves `/heartbeat` and `/impact` to SQLite and logs each new hit.
`GET /health` on localhost shows the latest saved heartbeat. The old Python
listener remains a transport diagnostic only; do not run it while the real server
uses port 3000. Its old log/receipt above describes the transport-only checkpoint.

Network work runs on a separate FreeRTOS task on core 0. The sensor loop only
copies impact JSON into a 50-entry queue with zero queue wait. The oldest hit
stays queued until HTTP success; failures retry. A full queue reports loss of the
newest hit explicitly while preserving its Serial record. The queue is in RAM,
so pending hits do not survive a power cycle. Connect/read timeouts are 400 ms.
Each POST includes `helmet_id`, `player`, and a per-boot `boot_id`. Small network
heartbeats report uptime, RSSI, saved-calibration state and queue counts every
10 seconds, with an immediate heartbeat on connection.

The existing Serial JSON and gravity-calibration commands are retained. Serial
also reports connection state, IP, signal strength, retries and delivery results.
NeoPixel: blue blink while connecting, green pulse when connected, red flash on
an impact. A separate LED task prevents its driver from delaying sensor capture.
`WiFi.setSleep(false)` disables radio sleep; power-bank auto-off still depends
on the particular power bank.

The current launcher manages the Node rule with `tools/Allow-HelmetServer.ps1`;
it disables the old Python rule. Historically, `tools/Allow-HitListener.ps1`
adds an administrator-approved rule restricted to the Python executable, TCP
3000, Wi-Fi, the chosen laptop address and the local subnet. Its nonsecret result
is recorded in `evidence/wifi-firewall-rule.json`. Stop the listener with Ctrl+C.
To remove this demo rule later, use an administrator PowerShell:

```powershell
Remove-NetFirewallRule -Name 'HelmetAgent-Temporary-3000'
```

Local listener contract tests (synthetic data, separate ephemeral port):

```powershell
python -m unittest discover -s tools -p test_hit_listener.py -v
```

## Current calibration method: gravity positions

Tap-based orientation calibration has been replaced with five still positions.
This separates the helmet's sensor orientation from the unverified direction of
a vibrating impact pulse. Each position is averaged for two seconds; excessive
motion/noise or failed reads are rejected. Opposite front/back and left/right
positions cancel sensor offset. Crown up checks the remaining signed axis.
A preview appears before a separate `save` command writes Preferences.

Verified October 16, 2026: all five positions passed, averaging 1,032-1,033
readings each, with zero I2C errors. The preview mapping was front +Z, back -Z,
left -X, right +X, top -Y. It was saved and read back, then retained exactly after
the user power-cycled USB. Subsequent COM3 heartbeats confirmed normal detection
armed, calibration exited, and zero I2C errors. The updated on-device mathematical
self-test passed 18 checks. The monitor is closed; USB can be unplugged.
Receipt: `evidence/gravity-calibration-status.json`.

This still uses a simple signed-axis mapping: sensors mounted too diagonally or
inconsistent positions can be rejected. Gravity orientation alone does not
validate impact contact location. The diagnostic update estimates side from the
first retained pulse samples, with `location_validated:false`. This is an
experimental change awaiting the physical repeat test, not a verified improvement.
If the beginning is missing, samples disagree, or acceleration clips, the side
is `unknown`. `location_confidence` is a 0–1 signal-consistency score, explicitly
not a validated probability of correct location. Gyro vectors are reported in
their own sensor axes; no uncalibrated gyro-to-helmet fusion is performed.

## Timed raw pulse diagnostic

Connect USB to the laptop and open the Serial monitor at 115200. Keep the helmet
in its normal upright resting pose; type `zero` if that pose has changed.
Type `probe` and wait for **PROBE READY**. For 60 seconds, the firmware reads
acceleration independently of the hardware shock trigger. Normal impact events
are paused, while Wi-Fi heartbeats continue. `stop` ends early; the timeout
automatically restores normal impact detection without changing saved calibration.

Every second, `diagnostic_window` prints the measured peak even below 5 g, achieved
sample rate and maximum sampling gap. Pulses above 5 g produce
`diagnostic_pulse` with peak, sampled span above 5 g, longest sampled raw-axis span
above the hardware threshold, clipping and whether a nearby hardware shock was
observed. `diagnostic_sample` lines retain a bounded raw XYZ trace around that
pulse. Trace gaps and truncation remain explicit. Printing a completed diagnostic
trace pauses further probe sampling; this mode is for one tap at a time.

The shared 100 kHz bus cannot stream both sensors at their full internal rates.
These diagnostic peaks and durations are sampled estimates, with the actual
rate/gaps printed, not a reconstruction of the detector's internal 3200 Hz signal.
Absence of an observed hardware shock is not by itself proof of its rejection reason.

The next network heartbeat includes `diagnostic_mode`, `impact_detection_paused`,
`diagnostic_window_peak_g` and the latest sampled `near_miss` summary, if any.
Near misses are observed only during this explicit probe. They are not saved as
impacts or sent to the trainer. Return to normal mode before the live demo.
Raw traces require laptop USB; normal impacts/heartbeats work with power-bank USB.

Verified October 17, 2026: the diagnostic firmware was uploaded without erasing
Preferences. The same five-side mapping returned, the 50 ms duration register
passed startup readback, and all 28 on-device mathematical checks passed. A
60-second no-tap probe recorded 59 windows at 461-470 samples/second, with a
largest observed sampling gap of 3.282 ms. Wi-Fi heartbeats reported the paused
mode during the probe, then normal mode after its automatic timeout. Detection
was armed again with zero I2C errors, and the database still contained the same
seven impacts. This idle check did not test physical impact detection or
direction. Receipt:
`evidence/shock-diagnostics-status.json`.

A subsequent user-confirmed crown tap, held clear of the table, produced a
6.910004 g sampled baseline-subtracted vector peak. The largest sampled raw-axis
value was 3.234 g against the configured 10.14 g threshold. No hardware shock
flag was observed; the near-miss details arrived in a Wi-Fi heartbeat. This is
consistent with a below-threshold tap, but the bus-limited probe cannot exclude
shorter internal detector peaks or explain the earlier crown misses. Normal
detection resumed automatically with zero I2C errors. Normal-mode impact
delivery and side accuracy still need a physical repeat test. Receipt:
`evidence/crown-diagnostic-test.json`.

## Earlier calibration signal check: October 16, 2026

After securing the sensors and setting the helmet upright, a hands-off check
reproduced a false calibration event at the old 3.12 g trigger setting. It
incorrectly established the front direction from a 1.09 g baseline-subtracted
pulse. Earlier weak front/back captures are therefore not reliable calibration
evidence; the exact source of the background pulse remains unknown.

That intermediate version used a 6.24 g hardware trigger and rejected direction captures
below 3.0 g above the measured resting baseline. The normal trigger is unchanged.
The updated sketch compiled, uploaded, and passed 17 mathematical self-tests,
including rejection of the actual false pulse. A repeat 22-second hands-off
check produced no events, with zero I2C errors. This validates that check only;
all four physical directions, the top label, and reboot persistence still need
verification. Receipts: `evidence/calibration-no-tap-before-fix.json` and
`evidence/calibration-guard-validation.json`.

## Earlier pause for mounting: October 16, 2026

Calibration was resumed with the sensors positioned inside the helmet. COM3
briefly disconnected, then recovered; subsequent live readings had zero I2C
errors. One light front tap did not register. A firmer front tap was accepted,
but the back tap measured the same signed axis direction and was rejected.
Both recorded events had 32 FIFO samples and complete gyro windows. Table
rocking is a possible cause, not a confirmed diagnosis of the mismatch.

The partial mapping was discarded. The user is repositioning the Feather so
the USB plug clears the helmet's rim. `cancel` was acknowledged, and the monitor
was closed before that work. No complete mapping was saved; no post-cancel
heartbeat was collected. The receipt is `evidence/calibration-resume-status.json`.

Next: inspect the user's new mounting photo, reconnect USB, verify live readings,
then restart all four sides with the helmet steady in one orientation. Finish
side/top label checks and reboot persistence before claiming calibration passes.

## Earlier stopping point: October 15, 2026

The user requested a stopping point during calibration. The main sketch is flashed
and running on COM3. The unfinished calibration was cancelled over USB; two
subsequent heartbeats confirmed `armed:true`, `cal_step:-1`, `calibrated:false`,
the normal 10.14 g threshold, and zero I2C errors. The monitor was closed to finish
the session. It is safe to unplug USB; the firmware remains in flash.

Verified today: both expected sensor addresses, both sensor register settings,
live acceleration/gyro heartbeats, and 12 mathematical self-tests. Initial tap
testing exposed incomplete FIFO captures. After adding FIFO priming/full-capture
waiting and buffered Serial output, two real impact events reported 42.09587 g
and 64.52209 g, each with 32 FIFO samples and complete gyro windows, without capture
warnings. The user clarified that **three** taps were made; why one did not create
an event is unknown. This does not prove a controlled lighter/firmer comparison.

Calibration captured only the front step before stopping; no complete mapping
was saved. Its temporary partial mapping was discarded. Location remains
`uncalibrated`. Saving a complete mapping, checking real side labels, checking top,
and verifying persistence after reboot remain undone.

Next session: keep the sensors fixed in the intended mounting, reconnect USB,
open `Open Serial Monitor.cmd`, and run the four-side calibration below. Keep the
mounting still at startup and while `next` measures its baseline. Start calibration
from `cal`; the partial front step must be repeated. After saving, reset and verify
`status` still reports the same mapping. Do not proceed to Wi-Fi or server work
until the user sends the next stage prompt. Durable receipts are in `evidence/`.

## Open the monitor

Double-click **Open Serial Monitor.cmd** in the `helmet-agent` folder. It finds the
Feather application port automatically and opens at **115200 baud**. Readings appear
in the window. Type a command and press Enter to send it. Close this window before
uploading another sketch. Its USB output is also saved in `evidence/serial-live.log`.

The helper uses Python and pyserial 3.5, installed during this session. You can also
use Arduino CLI's monitor with the current COM number:

```powershell
& "$env:LOCALAPPDATA\Programs\ArduinoCLI\arduino-cli.exe" monitor --port COM3 --config baudrate=115200
```

Only one program can use the serial port at a time. Ctrl+C closes the CLI monitor.

## Upload from PowerShell

Open Terminal/PowerShell in the `helmet-agent` folder. Prepare these two variables:

```powershell
$cli = "$env:LOCALAPPDATA\Programs\ArduinoCLI\arduino-cli.exe"
$board = 'esp32:esp32:adafruit_feather_esp32s3_nopsram:CDCOnBoot=cdc'
& $cli board list
```

The board profile is **Adafruit Feather ESP32-S3 No PSRAM**, with USB CDC on boot
enabled and 8 MB flash. Use the COM number just listed, which may change when the
board enters upload mode. The examples below use COM4; substitute the observed port.

First upload the scanner:

```powershell
& $cli compile --fqbn $board --output-dir build/i2c_scanner firmware/i2c_scanner
& $cli upload --port COM4 --fqbn $board --input-dir build/i2c_scanner firmware/i2c_scanner
& $cli board list
```

Open the monitor on the application port. The scanner prints every three seconds.
The **expected** output is:

```json
{"type":"i2c_scan","addresses":["0x36","0x53","0x6A"],"adxl375":true,"ism330dhcx":true}
```

0x36 is the Feather battery monitor. Continue only when both 0x53 and 0x6A appear.
Then close the monitor and upload the main sketch:

```powershell
& $cli compile --fqbn $board --output-dir build/helmet_impact firmware/helmet_impact
& $cli board list
& $cli upload --port COM3 --fqbn $board --input-dir build/helmet_impact firmware/helmet_impact
```

Again, substitute the current upload port. Open the monitor. Keep the mounting
still at startup while the firmware measures its stationary baseline.

## Tap test

Tape the sensor boards securely to a book, with cables supported. Tap the book
beside the sensors. Look for a single JSON line whose `type` is `impact`, with
`id`, `ms`, `peak_g`, `peak_rot_rads`, `peak_rot_dps`, `location`, and `ax/ay/az`.
Tap once, wait a second, then try a firmer tap. Compare the measured `peak_g` values;
the mounting and direction also affect them. No physical test result is implied
by the example output or the firmware's mathematical self-test.

Until calibration is complete, location is explicitly `uncalibrated`.
A JSON heartbeat appears every five seconds, including resting acceleration,
gyro magnitude, achieved `gyro_read_hz`, `i2c_errors`, and calibration status.
Missing readings are reported as null, rather than a fabricated zero.

`peak_g` and `ax/ay/az` are in g **relative to the measured stationary baseline**.
That removes the initial gravity vector and sensor offset; it does not track
gravity as the helmet turns. Keep the same resting pose for comparisons. After
changing it, keep still, type `zero`, and press Enter. `raw_peak_sample_g` retains
the sensor magnitude at the chosen peak before baseline subtraction.

## Calibrate the sides

Calibration must match the mounting orientation. A book can be used for practice:
choose fixed front/back/left/right edges. Repeat calibration after mounting in
the helmet or moving either sensor board.

1. Type `cal`, then Enter. Impact detection pauses during the five positions.
2. Keep the helmet upright as worn, crown up. Hold or support it still. Type
   `next`, then Enter. Keep still until the two-second capture finishes.
3. Repeat `next` only once settled in each requested position: facemask down,
   back down (facemask up), wearer's left side down, wearer's right side down.
4. Each `calibration_pose` JSON reports its mean vector, noise, gyro motion and
   acceptance. A rejected position stays on the same step. No taps are needed.
5. Check `calibration_preview`. This is not saved yet. Return the helmet upright,
   keep still, then type `save`. Alternatively, `cancel` discards the attempt.
6. Look for `CAL saved and read back` and `saved:true`. Reset the board while the
   helmet is still upright, then verify `status` retains the same mapping.

An inconsistent set restarts without saving. `cancel` preserves any previous
mapping and refreshes the resting baseline. Physical front/back/left/right/top
hit-label checks are separate; diagonal and bottom events may be `unknown`.

## How capture works

To investigate an `unknown` direction, connect laptop USB, type `trace`, then
make one labeled empty-helmet tap. Normal impact capture and Wi-Fi continue.
After that event's complete gyro window, one Serial-only
`impact_direction_trace` contains the same 32 FIFO XYZ samples (baseline
subtracted, 625 microseconds apart), saved map, initial mean, coherence and
rejection reason. It is not a second impact or a second notification. `traceoff`
cancels a pending trace; it is off after restart. This differs from `probe`,
which temporarily pauses normal impacts and samples current registers.

Reasons distinguish missing onset, too few initial samples, opposed initial
samples, diagonal pulse, clipping and an unmapped direction. Diagnostic means
remain visible when rejected; they do not override the `unknown` label. Current
thresholds and gravity calibration are unchanged by this diagnostic. Check the
actual trace before changing the classifier; peak-only fallback can give the
wrong contact side.

The direction classifier now averages the first contiguous above-5-g pulse for
up to **16 samples (~10 ms)**, instead of four (~2.5 ms). A quiet sample ends
that pulse; later rebounds are excluded. It retains the same two-sample minimum,
captured-onset requirement, coherence and axis-dominance checks. Five recorded
development traces replayed with matching sides; fresh physical validation is
recorded separately in `evidence/direction-retry-study.json`. Gravity mapping,
10.14 g hardware trigger, 50 ms duration and capture/gyro settings are unchanged.
Neither that replay nor the consistency score establishes general contact-side
accuracy.

- The ADXL375 runs at **1600 Hz**. Its hardware shock detector triggers a FIFO
  capture retaining 31 samples before the trigger and one after it. Thirty-two
  samples span about 20 ms. Only single-shock interrupts are enabled, mapped to
  the internal INT2 trigger source; no interrupt wire is needed.
- The firmware polls `INT_SOURCE` about every 2.5 ms, waits for the final sample,
  puts the accelerometer in standby to preserve the capture, and reads each XYZ
  sample in one six-byte burst. It resets the FIFO through BYPASS before rearming.
  It allows 25 ms to fill the history before enabling shocks, and waits for a full
  32-sample capture before putting the accelerometer in standby.
- `SHOCK_THRESHOLD_G` starts at 10 g in `helmet_impact.ino`. Hardware quantization
  makes that **10.14 g**. Maximum shock pulse duration is now 50 ms, read back at
  startup. This accepts longer above-threshold pulses, including more handling
  motion. It is a test setting, not a confirmed fix for the missed crown taps.
  The 32-sample history still spans only ~20 ms: a long pulse may lose its onset
  or earlier peak before its falling-edge shock trigger. Missing initial samples
  are flagged and are not assigned a side. This is a demo
  detection setting, not a medical evaluation threshold. If taps are too gentle,
  try 5 g and rebuild rather than striking the electronics harder.
- The shock detector uses a higher internal rate than the 1600 Hz FIFO data.
  Very brief shocks can therefore trigger while the stored peak is below the
  threshold. Peaks are sampled estimates, not calibrated laboratory measurements.
- The gyro runs internally at **1.66 kHz**, at +/-4000 dps. The shared **100 kHz**
  I2C bus limits the host's actual read rate, shown by each heartbeat. A ring buffer
  retains at least ~100 ms at the maximum host read rate, with readout margin.
  Gyro reads continue between accelerometer FIFO reads.
- Rotation peaks use only samples within +/-30 ms of the **estimated FIFO peak
  time**, including future samples before printing. Interrupt polling makes the
  timing approximate. `gyro_window_complete:false` flags missing window coverage
  or gaps over 5 ms; clipping flags identify sensor saturation.
- Interrupts are disabled during the 300 ms dead time. Ignored bumps cannot remain
  latched and appear as a delayed second hit. Filling history adds about 25 ms
  before capture is armed again. Impact IDs restart at 1 on reboot;
  `ms` is the shock-detection time since boot, not wall-clock time.

Type `selftest` to check vector magnitude, unit conversions, direction mapping,
and gyro-window timing including timer rollover. This prints a `selftest` record
marked `synthetic_math_only:true`; it never fabricates an impact event.

## If something fails

Check the physical connection before changing the sketch:

1. **No usable COM port:** close other monitors. Use a known data-capable USB cable
   directly in a different laptop USB port. Hold BOOT, tap and release RESET while
   still holding BOOT, then release BOOT. Run `board list` again. Bootloader COM4
   and application COM3 were observed during this build; always recheck.
2. **Missing I2C sensor:** unplug USB before reseating both ends of every STEMMA QT
   cable. Reconnect and run the scanner. Both sketches enable `I2C_POWER` (GPIO 7)
   HIGH before `Wire.begin()` and use 100 kHz.
3. **No text after upload:** open the newly listed application COM port at 115200.
   Wait for a heartbeat, or tap RESET with the monitor open. Keep still at startup.
4. **No hits:** check heartbeats and zero I2C errors. Confirm the board is securely
   coupled to the tapped book. The 10 g trigger can miss light taps; lower the
   `SHOCK_THRESHOLD_G` define, rebuild, and upload if needed.
5. **Wrong side:** recalibrate in the final mounting. Keep its orientation fixed;
   diagonal readings are deliberately not assigned a confident side.

## Primary references

- [Analog Devices ADXL375 datasheet, Rev B](https://www.analog.com/media/en/technical-documentation/data-sheets/ADXL375.pdf)
- [AN-1266: Autonomous Shock Event Monitoring with the ADXL375](https://www.analog.com/en/resources/app-notes/an-1266.html)
- [AN-1057: Using an Accelerometer for Inclination Sensing](https://www.analog.com/en/resources/app-notes/an-1057.html)
- [ST ISM330DHCX datasheet](https://www.st.com/resource/en/datasheet/ism330dhcx.pdf)

Current project state is in [CURRENT_STATE.md](../CURRENT_STATE.md) and
`setup.json`. The database, MCP, agent and phone path are implemented; earlier
transport-only checkpoints remain historical receipts.

The installed `tap-bench-v1` update adds an isolated streamed recorder for the
[nine-tap table comparison](../docs/TAP_COMPARISON.md). USB upload, unchanged
calibration readback, a quiet bus check and normal restore passed. Bench mode
temporarily pauses normal impacts and never posts test taps to live history.
`stop`, reset or ten minutes without another trial restores normal capture.
The existing saved orientation and normal alert settings are preserved.
The completed nine-back/nine-front test saved 17 waveforms: 13 clean, four
settling-flagged and one uncaptured front light attempt. The raw peak comparison
did not establish reliable hardness ranking; normal-mode peak semantics and
review thresholds are unchanged. See the [full result](../evidence/tap-comparison-results.html).
General physical hit-location accuracy remains unvalidated.
