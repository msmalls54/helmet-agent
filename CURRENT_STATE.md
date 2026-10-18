# Current state

Last reconciled: **October 17, 2026**. Start here before changing hardware or
adding demo features. [setup.json](setup.json) is the machine-readable companion;
dated receipts are snapshots, not a claim that a device is connected now.

**Product documentation:** the user requested the product README skill. The
README now leads with the trainer's player/reason/evidence handoff, the real
44.65 g held-tap receipt and confirmed phone arrival, then the #72 practice
pattern. The physical-input hook stays near the opening. Actual current helmet
and practice screenshots support the story; setup and detailed engineering
notes follow. Claude reviewed the proposed positioning in a new conversation
to preserve the user's existing unsent strategy draft. Alert selectivity, shell
reading, provider delivery timing, sample-source separation and different peer
roles remain explicit. [Copy-pass receipt](evidence/readme-value-pass.json).
No runtime behavior changed, no phone messages were sent and no physical tests
were requested. This checkout has no configured Git remote; changes are local.

**Hackathon readiness assessment (October 17):** supported for demonstrating
helmet events over Wi-Fi, recorded history, MCP visuals and selective trainer
notifications. The controlled rehearsal receipt records a real 44.6 g event and
user-confirmed phone delivery; this is prior end-to-end evidence, not a fresh
post-benchmark phone test. Reliable hit-hardness ranking remains unproven and
location is optional. Keep the demo claim centered on event/context/review;
freeze measurement changes and rehearse the existing flow.

**Both requested nine-attempt sequences are complete; no recording is armed.**
Back: nine waveforms, seven clean and two settling flags. Front: eight waveforms,
six clean and two settling flags, plus one final light attempt without a pulse
above the 2 g trigger (observed whole-window maximum 1.85493 g). That miss is
not a zero-g hit. The original back timeout is retained separately; the canceled
front slot-5 window had no reported contact, was archived unchanged, and the
slot was rescheduled with user authorization. Eighteen planned contact attempts
were reported, plus the earlier timed-out contact.

**Measurement verdict:** neither site met the predeclared all-nine-usable
criterion. Usable front group medians rise, with only one clean firm capture;
back light/medium readings overlap and are not consistently ordered. Including
flagged captures descriptively does not make the primary comparison pass.
The preselected 5 ms means have more orderly group medians but remain secondary.
These hand taps do not establish reliable hit-hardness ranking or input force.
The live normal-mode peak calculation and review thresholds were not changed.
The improvement demonstrated is richer bench recording, not calibrated live
hit strength. The original measurement goal remains open. No new physical test
is planned this round; analysis can use the saved waveforms.

**Restored normal operation:** both recorder processes closed. Serial confirms
saved map -X/+X/+Y/-Y/-Z, detection armed and zero I2C errors. The post-test
Wi-Fi heartbeat was calibrated/normal, revision tap-bench-v1, queue/drop zero.
Read-only SQLite count was zero new live impacts during the entire bench window.
No test impacts were inserted into the demo history. Host regression suite:
24 tests pass. Current power is laptop USB.

[Readable results](evidence/tap-comparison-results.html),
[full receipt](evidence/tap-comparison-final-result.json),
[restored device check](evidence/tap-comparison-restored-health.json),
[final Claude review](evidence/tap-comparison-final-claude.png).
All raw waveforms, settling flags, timing failure, cancellation and interrupted
baseline/feedback conditions remain in the receipts.

**Tap-comparison update installed (10:34 PM October 17):** the user connected
laptop USB. The checked `be98a15` build uploaded successfully; the exact saved
map -X/+X/+Y/-Y/-Z matched before upload, after upload and after mode restoration.
Normal capture is armed with zero I2C errors. A fresh Wi-Fi heartbeat reports
`tap-bench-v1`, calibrated/normal, and zero queued/dropped hits.

The new `tap-bench-v1` software adds an isolated 800 Hz / 400 kHz streamed FIFO
recorder with 20 ms prehistory and up to 200 ms after onset. It saves the full
sampled pulse, raw peak, a separate 5 ms mean peak, sampled duration, magnitude
area and gyro-window quality. Bench taps never enter live history or the trainer
queue. Normal capture/calibration return on `stop`, reset or ten minutes without
another trial; orientation Preferences and normal alert settings are preserved.
Build and software checks passed. The installed cable chain accepted bench
entry and a two-second quiet 400 kHz check with zero I2C errors; explicit `stop`
restored normal 1600 Hz / 100 kHz capture. The completed trial status is above;
the short bus check alone does not establish complete pulse capture or ordering.

The user authorized nine self-labeled taps on the table at one back-shell spot:
three light, three medium and three firm, in a balanced fixed order. No pendulum
supplies or hardware changes are required. The report tests whether raw peak
group medians increase and shows overlap; it cannot establish contact force,
player head acceleration or injury severity. An invalid recording stops the
session by default. The user now requests full back/front sequences; settling-only
flags are retained while recording continues. Other recording faults still stop.
See the completed results above. No tap is armed.
[Test instructions](docs/TAP_COMPARISON.md),
[installation receipt](evidence/tap-comparison-installation.json),
[earlier software preparation](evidence/tap-comparison-software.json),
[Claude review](evidence/tap-comparison-claude-review.png).

**Hardware constraint (user, October 17):** finish with the installed boards,
wiring and mounting. Do not plan replacement sensors, SPI rewiring or another
physical rebuild for this demo. Measurement improvements must work within the
existing hardware; proposed capture changes need software verification before
any upload. Reference-rig validation remains future measurement work, not a
completed capability. The demonstrated phone path remains the demo foundation.
The user's measurement question is specifically whether the number can convey
how hard a person was hit. Peak shell acceleration has not been validated for
that purpose. A different display label or an unvalidated combined score would
not close this gap. A longer sampled pulse and rotation window are implemented
in the installed bench update and the two completed runs, without validation
as a severity measurement. Normal-mode peak/initial-pulse meanings are retained
with an added captured-window pulse summary. Full bench waveforms are saved over
Serial, separately from live Wi-Fi history.

**Cumulative helmet map and Resources repair:** the white helmet stays visible
on a dark green card. Over a rolling 60-minute receipt window, complete readings
with a named direction add red to that zone; undirected readings add equally
across the whole helmet and still count as one event. More or stronger readings
increase the red on a fixed visual scale. This is a display, not an injury score
or a head-acceleration estimate. There is no assumed front location.
The card refreshes through a read-only tool call every ten seconds while visible.
Raw direction/confidence, review settings and saved messages/keys remain intact.
The long diagnosis/trainer footer was removed from both visuals at user request;
tool interpretation rules and raw source/capture details remain available.

The Resources failure was reproduced: its preview POST contained 2,533,316 bytes
because the inspector included duplicate inline HTML, exceeding the local 2 MiB
cap. Only the two loopback preview-store paths now allow 4 MiB. Socket-peer and
origin checks, 4 KiB telemetry/MCP request limits and the public /mcp-only gateway
remain enforced. Both resources fetch their data when opened directly. Practice
uses one **Sample practice** badge; machine-readable sample provenance stays.
34 tests pass, including a real local HTTP preview upload and map source/window
isolation. No new physical input or phone text was used. Claude reviewed the map
and preview repair. Older presentation receipts remain dated evidence.
The final green/white/red map renders in actual ChatGPT and Claude after one
initial host preview retry each. Existing connections were refreshed in place.
Both visuals have the long footer removed. The server remains running.
[Current receipt](evidence/cumulative-map-preview-repair.json).

**8:47 PM controlled rehearsal passed:** one user-reported held back-shell
knuckle tap produced one new event, **32 / 44.64918 g**, FIFO32, complete gyro,
unclipped and uncensored, same boot. The >=40 g selective rule qualified; Grok
read history, requested review, and Inkbox delivery was saved **9.054 seconds**
after ingestion. The user confirmed the new **44.6 g** text arrived. Direction
remains **unknown / confidence 0** in the raw record. Inspector, ChatGPT and Claude show
the exact live card in the earlier presentation. The current map uses undirected
whole-helmet shading for this record. This verifies
the current selective physical-to-phone path for a held
tap, not drop survival. **No more physical taps this round.**
[Controlled receipt](evidence/controlled-held-rehearsal.json).

Records 27–30 at 8:43 PM came during user-reported assembly handling ("yea i was
messing with it"). They are not evidence of four distinct football contacts.
The third record qualified the cluster rule and one provider-delivered text;
handset receipt for that earlier handling text is unconfirmed. Record 31 also
arrived during the setup window, with exact physical action unverified.
Immutable live rows remain intact; handling context is in the
[separate receipt](evidence/assembly-handling-cluster.json). This demonstrates
that the demo cluster setting can alert during handling. No threshold, debounce
or firmware change was made. Latest review budget: five jobs remaining.

**8:41 PM button check:** after the user reported an accidental button press,
all six checks passed. Heartbeat 7.3 seconds old, same boot 867fef4991b7c027,
saved calibration, normal detection and queue/drop zero. User reports the bank
is firmly in place; attachment method and completed cable routing are not
confirmed. No impact/drop trial was requested or verified by this check.

**8:29 PM recovery:** the photo now shows the INIU tucked into a side gap, with
large loose USB loops over the inner panel. Snug fit is user-reported, not a
verified retainer. Materials available: tape, hot glue and Scotch fasteners.
The helmet heartbeat became stale (last old boot receipt 8:22 PM); both Windows
Wi-Fi Direct adapters were disconnected. Restoring the existing Helmet-Agent
hotspot returned the same 192.168.137.1 and the helmet reconnected without a board
reset. Fresh boot **867fef4991b7c027**, calibrated/normal, queue/drop zero; all six
checks pass again. Windows idle auto-off was read back **true**, then disabled
and independently read back **false**, with one connected client. It is a
plausible outage contributor, not a proven shutdown timeline.
`Start-HelmetWifi.ps1` now preserves that setting and waits up to ten seconds for
IPv4 assignment after startup. No firmware/server rebuild or phone send occurred.
The user proposes gluing the bank; recommendation remains external power during
impacts. Retention adhesive does not protect internal cells from shock. No bank
gluing, impact trial or drop qualification has been confirmed.

Return check, **8:08 PM October 17**: all six read-only software checks passed;
heartbeat 4.1 seconds old, saved calibration/normal detection, queue/drop zero,
both review cooldowns ready and seven rolling-budget jobs available. The user
confirms laptop USB power with the bank separate. No new physical input or text
was requested by this check. The subsequent inside-helmet photo shows all three
boards lit, with a long sensor-cable loop and the white USB lead. Photo alone does
not establish bond strength. The user reports the separate INIU bank at 57%.
Choose the bank position/holder and actual demonstration power arrangement before
final cable routing; the assistant's earlier cable-first sequence was premature.
No new attachment or drop has been confirmed. Inspect bank size/ports and available
retainers next; do not treat glue/tape/padding as evidence of battery impact suitability.
Claude cross-reviewed the physical sequence; cable slack/landing/bounce and the
actual power arrangement must be established before a release. A consumer bank's
stationary power test does not establish that it can be dropped.
INIU's [own safety guide](https://uk-main.iniushop.com/pt-pt/blogs/blog/power-bank-safety-use-guide)
explicitly advises against dropping its bank; its
[care guide](https://uk-main.iniushop.com/blogs/blog/extend-power-bank-life-tips)
warns of internal damage despite an intact case. Rechecked October 17. Claude
has been asked to cross-check this corrected sequence and source boundary.

## Working and demonstrated

- ESP32-S3, ADXL375 and ISM330DHCX read over 100 kHz I2C. Gravity orientation
  mapping persists across reboot. Current diagnostic firmware is uploaded with
  50 ms shock duration; normal mode resumes after the timed probe. The opt-in
  Serial `trace` diagnostic is uploaded. The subsequent 16-sample first-pulse
  direction update passes 36 math checks and preserves calibration. Trace retains
  the real normal-event FIFO/rejection reason without changing side thresholds.
- Real impacts travel over private 2.4 GHz Wi-Fi to SQLite. The offline queue and
  reconnect delivered a held impact. Receiver retries are deduplicated.
- ChatGPT and Claude retrieved real history through a fixed authenticated ngrok
  URL after a full server/tunnel restart without re-adding connections. ChatGPT
  displayed the live helmet widget. A requested Inkbox text reached the user's phone.
- Five MCP tools are exposed by mcp-use: `get_impacts`, `show_last_hit`,
  `flag_for_review`, `exposure_load`, `show_practice_week`.
- Automatic reviews are built and **armed in the running server** for helmet-1 /
  #44. A real xAI agent reads recent history and uses the shared review sender.
  The current selective demo settings are one reading ≥40 g or three usable
  readings ≥10 g within 90 device seconds. Smaller isolated events stay in
  history without a model call or text. Single-review cooldown is 30 seconds;
  cluster cooldown is five minutes; the 24-hour cap is 20 reviewed jobs.
  The earlier labeled isolated software input produced one provider-delivered
  Inkbox text; duplicate upload/worker restart produced no extra text. At that
  earlier test the live DB stayed at seven actual impacts and three reviews.
  [Integration receipt](evidence/automatic-alert-loop-test.json),
  [runtime receipt](evidence/automatic-alert-runtime.json), [operation](docs/AUTOMATIC_ALERTS.md).
- **Real automatic phone gate passed:** one user-reported back tap produced
  impact **8**, **70.44279 g** of relative helmet-impact telemetry, 32 FIFO samples,
  complete gyro window and no clipping. The background agent read history and
  requested review in one attempt; Inkbox reported delivered **10.905 seconds**
  after ingestion, and the user confirmed the new #44 / 70.4 g text on the phone.
  No manual flag was requested. The sensor reported **unknown** side, confidence 0.
  [Physical test receipt](evidence/automatic-alert-physical-test.json).
- The separate simulated week contains 143 fictional events, three profiles and
  87 observed player-periods. The #72 OL inside-run comparison is 8/20 minutes
  against 7/60 earlier minutes, 3.43×, and 2.67× the highest of two same-period
  fictional peers (#44: 3/20; #21: 2/20). Those eight readings are 14–24 g; the
  frequency example does not depend on the 40 g single-reading setting.
  Fictional medical histories are context, never a risk multiplier or clearance decision.
- Both updated widgets passed local inspector checks in light/dark themes. The
  interactive practice widget fits about 417 px at its maximum 800 px width.
  Day/drill controls update observation denominators, own history and peer
  comparisons. MCP Apps and Apps SDK previews work. The live card distinguishes
  older every-hit-policy reviews from current selective settings.
- **Demo copy and actual-client pass:** ChatGPT and Claude retrieved the #72
  practice comparison and rendered the revised practice card. Claude's live
  card also rendered the saved 22.37 g FRONT event. Both components now use
  mcp-use's size-reporting provider; Claude's practice frame expanded from
  150 to 376 px with no content overflow. Widget resource URIs use a hash of
  built HTML so changed templates avoid stale client caches and unchanged
  restarts retain their version. First-load host previews still sometimes need
  one Retry/Try again; pre-open both views before the audience arrives.
  See [demo-ready receipt](evidence/demo-ready-software.json) and
  [interview guide](docs/AGENT_VALUE.md). Claude second-reviewed the story,
  wording, source boundaries and sizing fix. No new phone text or physical
  input was requested while the user walked.
  Display-only practice props now use 15,344 bytes by omitting duplicate event
  lists and narrative fields; full investigation evidence stays in `exposure_load`.
- **Selective software update verified:** 31 automated tests passed. Separate
  real-Grok single-reading and cluster tests used fake messengers and isolated
  databases: no phone texts and no synthetic live rows. The third 14 g event
  qualified after two silent observations; retry/restart retained one logical
  review. The running server restarted with the same private MCP URL and fresh
  calibrated heartbeat. That software-only checkpoint had 26 actual records;
  the subsequent physical/handling receipts above bring the live total to 32. See
  [policy restart](evidence/selective-policy-restart.json),
  [single model test](evidence/selective-alert-model-test.json),
  [cluster model test](evidence/selective-cluster-model-test.json).
- ChatGPT's existing plugin tool list was refreshed without changing its URL or
  re-adding the connection. It retrieved #72's 3.43× drill pattern, compared #21's
  76 g single illustrative reading and rendered the practice widget. The sandbox
  required one **Try again**. See the [client receipt](evidence/practice-client-rehearsal.json).
- **Check Helmet.cmd** runs a read-only software preflight and records
  [demo-preflight.json](evidence/demo-preflight.json). It checks freshness,
  calibration, normal detection, queue/drop counters, local/public tools,
  simulation isolation, armed automatic worker, widget resources and the public
  route/key/origin boundary.

## Gates still open

| Gate | Current evidence / next action |
| --- | --- |
| Physical retention and drop survival | User reports all three boards glued, cool and fixed, including a second inspection after the five-area tap test. Latest sensor photo shows ADXL375 near a slot edge; full support and drop retention are not independently verified. Central inner-crown layout and new gravity map are saved/read back after power cycling; [calibration receipt](evidence/post-mount-calibration-status.json), [mounting guide](evidence/sensor-crown-placement-guide.png). Five test areas emitted complete Wi-Fi events; no drops tested. Stationary bank operation passed. |
| Power arrangement for drops | INIU bank powered the board/Wi-Fi separately. That verifies power, not impact suitability. Resolve retention and battery protection before releases. |
| Contact-side accuracy | Earlier five-area check had one matching label and four unknowns. Retry collected five real FIFO traces; extending first-pulse averaging from 4 to 16 samples matches all five development traces. The update then passed one fresh front spot check: impact 26, 22.36718 g, FRONT, 32 FIFO samples, complete gyro window, unclipped and Serial/Wi-Fi matched. Two reported final taps produced one event; separation was unmeasured. Other sides were not independently retested after the update. No general accuracy claim. [Retry study](evidence/direction-retry-study.json). |
| First-load client preview | Updated practice views render in ChatGPT and Claude; some first loads require one host Retry/Try again. Keep loaded views open, with the inspector as fallback. |

The crown diagnostic captured 6.91 g dynamic vector magnitude, sampled raw-axis
peak 3.234 g, and no hardware shock flag, below the configured 10.14 g per-axis
threshold in the observed samples. This supports a below-threshold explanation
for that diagnostic tap; it does not establish every earlier missed tap's cause.

After gluing/remounting and accepting the calibration retry, the held-clear tap
check produced impacts 15–19: front 14.79 g (unknown), back 19.34 g (unknown),
left 11.31 g (left), right 11.17 g (unknown), crown 40.51 g (unknown). All five
Serial records matched server payloads, had 32 FIFO samples and complete gyro
windows, and were unclipped. The left test contained two user-reported taps but
only one event; this does not establish why the other tap was not separate.
Automatic review jobs for 15–18 reached provider-delivered state; 19 was held by
the existing player notification cooldown. The user confirmed receipt of exactly
four new trainer texts. No firmware changed during this spot check,
and the result does not establish equal-input magnitude accuracy or drop survival.

Rear mounting does not restrict detection to rear contacts, but acceleration is
measured at the sensor's mounting point. Rotation and local vibration can change
the reading; neither rear placement nor crown placement establishes comparable
response across contact sides. Gravity calibration maps orientation and does not
correct this effect. Repeat the five-side detection check after final mounting;
manual taps do not establish equal-input magnitude accuracy. See
[rigid-body point acceleration](https://courses.physics.illinois.edu/tam212/su2025/rkg.html)
and the [ADXL375 mounting guidance, p. 26](https://www.analog.com/media/en/technical-documentation/data-sheets/ADXL375.PDF).

The central crown layout is an engineering choice for a consistent central
measurement point, not a demonstrated optimum or equal sensitivity across sides.
Post-mount cable communication at 100 kHz, new gravity calibration and the
five-area detection spot check are verified; side identification remains incomplete.
A helmet-mounted accelerometer/gyro
[validation study](https://pubmed.ncbi.nlm.nih.gov/25476162/) likewise emphasizes
checking the actual helmet, sensor location and impact direction; its accuracy
figures do not transfer to this prototype.

## Priorities

1. **Back/front tests completed:** keep normal detection running. Preserve the
   measured result: richer bench captures, but no reliable hardness calibration.
   Both quality criteria were unmet; retain every flag and uncaptured attempt.
   No further physical taps this round. Use existing waveforms for any follow-up
   software analysis, without substituting a metric to manufacture a pass.
2. **Controlled held-tap phone gate is complete:** event 32 qualified the current
   single-reading rule, and the user confirmed the new text. Leave the existing
   normal detection/server running after the completed comparison.
3. Finish the exact-event ChatGPT visual check and use the prepared live +
   simulated walkthrough. The inspector already renders event 32. One real
   helmet cannot supply live teammate/drill baselines; simulation stays isolated.
   Release-drop retention and the bank's impact suitability remain open.

The empty-helmet demo policy uses configured single-reading/cluster candidates,
not every small hit. Its settings are operational demo rules, not injury thresholds.
Measurement interpretation checked against the firmware: `peak_g` is the largest
three-axis acceleration magnitude after subtracting the stationary baseline in
the captured window. It measures motion at the mounted sensor, not contact force
or a validated player-head measurement. The 44.6 g empty-helmet event therefore
does not establish injury severity; the 40 g setting controls the demo alert.
Calibration review (Oct. 17): orientation calibration does not establish a
conversion from peak sensor acceleration to contact force. Manual taps are not
measured input loads, so their ordering does not by itself prove a sensor fault.
Code and ADXL375 datasheet review identified a capture limitation: the single
shock interrupt occurs after acceleration falls below threshold; at 1600 Hz,
31 pretrigger samples retain about 19.4 ms before that interrupt, although DUR
now accepts pulses up to 50 ms. An earlier peak in a sufficiently long pulse
can therefore be outside the saved window. This is a supported design concern,
not a demonstrated cause of the recorded tap differences. Separately, the
datasheet recommends SPI >=2 MHz for 1600 Hz sampling and limits continuous
100 kHz I2C acquisition to 200 Hz; current acquisition uses 100 kHz I2C and a
frozen FIFO readout. The FIFO strategy must be assessed explicitly before
claiming continuous waveform fidelity or extending capture via continuous reads.
The installed bench mode addresses capture coverage using the datasheet's
800 Hz / 400 kHz pairing, while preserving normal capture. Its lower bandwidth
means its peaks must not be compared directly to the earlier 1600 Hz readings.
The new normal-mode payload adds a captured-window pulse summary only; no
threshold or automatic-review setting changes. Independently measured inputs
remain future validation work at fixed contact sites; validate
head acceleration against an instrumented headform, not an empty-shell reading.
References: [ADXL375 shock/FIFO and mounting guidance](https://www.analog.com/media/en/technical-documentation/data-sheets/ADXL375.PDF)
and [CHAMP laboratory validation](https://pmc.ncbi.nlm.nih.gov/articles/PMC9652295/).
The user-authorized [Claude second opinion](https://claude.ai/chat/a56fe569-e079-4f28-9912-351e7bb1bf61)
also identified the end-trigger window concern and recommended controlled
reference comparisons before correction factors. [Review screenshot](evidence/calibration-second-opinion.png).
Its numerical sharp-tap estimates and claim that a boundary peak proves
truncation were not independently validated or adopted. Neither that review nor
the current code inspection establishes the cause of the observed tap ordering.
The selective software paths passed with a fake messenger, followed by the
user-confirmed real selective phone rehearsal for event 32. The later authorized
back and front nine-attempt comparisons are now completed with quality failures;
release-drop survival remains unverified.
The model credential is configured in the Windows encrypted store. The background
worker runs in the Node process and does not need a ChatGPT/Claude chat open.

Defer Gemini, deployment migration and extra visual redesign until these gates
are closed. Manufact mcp-use remains the server and widget framework.

## Operating state

Laptop: venue **Y Combinator** Wi-Fi. Helmet: private Windows **Helmet-Agent**
2.4 GHz link, server **192.168.137.1:3000**. USB is power; telemetry is Wi-Fi.
Current user report and port check: helmet is on laptop USB, application COM3.
The installed revision is `tap-bench-v1`; current boot is `548074738ece83b9`.
The saved map is unchanged; the installation receipt has the fresh checks.
The following USB details are historical checkpoints from before the bank return,
not current port availability. Boot 38886c45cf560502 followed the earlier
16-sample direction update. The exact map was saved/read back;
USB confirms calibration step -1, detection armed, gyro rate about 792 Hz and
zero I2C errors. The pending one-shot trace was explicitly cancelled and the
reader closed after the unsuccessful first front tap. The user requested another
round; five real FIFO outputs are verified. A final fresh front test then matched
FRONT on the new firmware (impact 26). Trace is cancelled, reader closed and
normal detection remains armed with saved calibration and zero I2C errors.
The private hotspot was restored at 5:20 PM. Intermittent HTTP -1/-11 failures
remain among successful heartbeat deliveries. No queued/dropped hits were
reported. An earlier preflight failed freshness, then the preflight after bank
return passed; use the timestamp in the latest receipt for its scope. The
Wi-Fi heartbeat's paused flag currently covers probe mode only; use Serial's
armed/cal_step fields to identify active gravity calibration.
The local MCP inspector is open in the in-app browser. The user confirmed bank
power and then return to laptop USB. The bank boot 90564e6ecc193662 supplied
28 received heartbeats over 310.271 seconds, all calibrated/normal with zero
queued/dropped hits. Maximum heartbeat gap was 30.331 seconds; this is not a
continuous electrical measurement or a drop test. Exact map -X/+X/+Y/-Y/-Z was
read back over USB after return. The latest read-only software preflight passed
all six checks. See [post-mount bank receipt](evidence/post-mount-power-bank-check.json).
The first front trace (impact 20, 16.86522 g) was rejected specifically by
diagonal axis dominance in its first four samples, with high coherence 0.989412.
Its sustained pulse identifies front when averaged longer. The uploaded update
uses up to 16 contiguous above-5-g samples, stops at a quiet sample, and retains
the same onset/coherence/axis guards. It replayed all five development traces
with matching labels; one subsequent fresh front test matched. Replaying
impact 16's peak vector alone would label the user's back tap as right; no
peak-only fallback was added. Historical unknown events are not relabeled.

SQLite is `server/data/helmet.sqlite` (ignored). Secrets are ignored firmware
`secrets.h`, ignored server `.env`, and user-bound Windows DPAPI files outside
the repository. Public exposure is authenticated `/mcp` only. Keep the complete
connection URL private. Known dependency advisory details remain in the server guide.

## Resume safely

Read [the demo runbook](docs/DEMO.md), run **Check Helmet.cmd**, then inspect the
relevant receipt in [the evidence index](evidence/README.md). Preserve historical
receipts, current calibration and live data. Never insert synthetic hits into the
live database to make the demo appear successful.
