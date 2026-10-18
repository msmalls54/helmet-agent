# Automatic trainer reviews

**Qualifying helmet event → background agent reads history → connected phone
receives a review request.** Smaller isolated hits stay in history without a
model call or text. No browser chat or manual tool request is required.

The worker runs inside the existing mcp-use Node server. Firmware capture,
calibration, Wi-Fi queue, MCP connections and the private receiver are unchanged.
Manufact's mcp-use still supplies the receiver/tools/widgets; the background
agent uses the configured xAI Grok API, and Inkbox sends the iMessage.

## Current demonstration policy

- Target: **helmet-1 / #44**. This is an empty-helmet demonstration.
- Configurable demo triggers: **one reading ≥40 g**, or **3 usable readings
  ≥10 g within 90 seconds**. These are relative helmet readings and **not injury
  thresholds**. A human trainer decides what the observation means.
- A cluster uses same-boot device milliseconds, not upload timing. Duplicate,
  other-player, other-boot, future, calibration and incomplete/clipped captures
  cannot inflate it. A delayed batch of old uploads does not create a fresh burst.
- Live data currently has one helmet and no drill participation/peer schedule.
  A live cluster is a descriptive count trigger; it cannot establish an unusual
  football rate versus teammates. Same-drill peer investigation is available
  only in the explicitly simulated practice fixture.
- Before requesting review, the real model must call the bound history tool.
  It gets the preceding 60 minutes for this player/helmet, through the current
  event: exact count, up to 50 compact records and a truncation flag. Later
  events, calibration and explicitly simulated records are excluded.
- The local handler validates the current impact ID, evidence IDs and review
  basis. The phone message is assembled from verified reading/time/direction,
  history count and capture flags; unbounded model prose is audit-only.
- **30 seconds between single-reading reviews; five minutes between cluster
  texts for the same player; 20 reviewed jobs per rolling 24 hours.** A recent
  review of either kind suppresses a repeat cluster. All hits remain in history
  with a saved policy/outcome, including those that send nothing.
  At most two model investigations per job, each at most two API calls with
  650 output tokens/call and a 12-second request timeout. No web search/tools
  that create other effects are available to the model.
- A fresh calibrated normal-mode heartbeat from the same board boot is required.
  Events older than 60 seconds by receipt or estimated same-boot device age
  are skipped. The device-age check handles the millisecond counter wrapping.
- First activation begins after the existing live rows. It never sends a batch
  of historical demonstration hits. Restarts resume saved unfinished work.

The 60-minute history uses server receipt time; the short-cluster rule uses
same-boot device intervals. Buffered delivery can differ from physical hit
time. Sensor direction remains an unvalidated estimate. These are **relative
helmet-impact telemetry**, not a diagnosis; a human trainer decides.

## Start and check

On this laptop, the encrypted model key and ignored `.env` live setting are
configured. Double-click **Start Helmet.cmd**, leave its window open, then run
**Check Helmet.cmd**. Look for **Automatic trainer reviews: PASS**.

The read-only check also shows seconds remaining for single-hit and cluster
cooldowns, plus the rolling 24-hour review budget. Wait for the relevant cooldown
to reach zero before a physical rehearsal. A restart preserves these guards.
Phone notes use plain facts such as “Relative helmet reading reached the 40 g
review setting,” “3 helmet hits at or above 10 g in 90 seconds,” and “Please
check #44.” Capture warnings say “recording is partial or clipped.” Saved older
texts retain their original bodies and delivery identities.

The launcher loads Inkbox, model and tunnel credentials after the build. The
model token is Windows-user encrypted in
`%LOCALAPPDATA%/HelmetAgent/secrets/agent.dpapi`; it is not committed or printed.
The model API origin is fixed to `https://api.x.ai`; redirects are rejected and
response storage is disabled. Tunnel helpers do not inherit model/Inkbox keys.

To configure a replacement xAI key, run `tools/Set-HelmetAgent.ps1` and paste it
at the hidden prompt. `-UseConfiguredXai` copies an already-configured process
credential only when its configured API origin is the official xAI origin.

Ignored `server/.env` controls:

```dotenv
HELMET_ALERT_MODE=live
HELMET_ALERT_HELMET_ID=helmet-1
HELMET_ALERT_PLAYER="#44"
HELMET_ALERT_SINGLE_G=40
HELMET_ALERT_CLUSTER_COUNT=3
HELMET_ALERT_CLUSTER_SECONDS=90
HELMET_ALERT_CLUSTER_MIN_G=10
HELMET_ALERT_CLUSTER_COOLDOWN_SECONDS=300
```

Use `off` for manual review only or `dry_run` for real model analysis with no
phone send. Stop/restart the server after changing these settings. For a single
manual-only run, stop the existing launcher and run:

```powershell
.\tools\Start-Helmet.ps1 -NoAutomaticAlerts
```

That switch cannot disable an already-running worker by starting a second launcher;
the launcher tells you to stop the existing process first.

## Receipts and failures

Local [health](http://localhost:3000/health) reports the mode, whether the worker
is armed, model, limits and five latest job outcomes. This health route is not
public. Jobs and decisions are durable SQLite `alert_jobs` records alongside the
live data. Shared `reviews` records save the exact body and idempotency key before
a network send; the MCP review tool and automatic worker use the same sender.

A repeated upload or completed job does not send again. A restart after an
ambiguous send retries the saved body/key, not another model decision. A known
provider message is read for status, not resent. Delivery work gets at most three
attempts; an unresolved send without a known message ID older than two minutes
is held for attention. The original receipt/key remains intact. Provider accepted,
provider delivered and a human seeing the phone are distinct statuses.

`needs_attention` means inspect the saved job/review and correct the underlying
problem; never delete it or manufacture a fresh send key to force a retry.
`skipped`/`suppressed` include the specific freshness, source, cooldown or budget
reason. A model error does not send a threshold-based fallback text.
`observed` means the event was saved but did not meet a configured review rule;
no model call or phone send was made. The live widget distinguishes earlier
every-hit-policy reviews from outcomes under the current selective settings.

## What was tested

The automated tests cover background HTTP ingest, history scoping, quality,
freshness, cooldown/budget, duplicate uploads, restart after a lost send response,
read-only reconciliation, changed heartbeat conditions and invalid model output.

The integration test uses a separate temporary SQLite database and a fictional
`#TEST` input. A real Grok model called history then requested review. The real
Inkbox message was prefixed **AUTOMATIC LOOP TEST — SIMULATED DATA** and the provider
reported delivered. Repeating ingest and restarting its worker created no extra
message. It did not insert a fake impact into the live database.

Receipt: [automatic-alert-loop-test.json](../evidence/automatic-alert-loop-test.json).
Runtime receipt: [automatic-alert-runtime.json](../evidence/automatic-alert-runtime.json).
One real supported empty-helmet tap subsequently passed the complete automatic
path: impact 8, 70.44279 g relative helmet reading, agent history lookup, and
provider delivery 10.905 seconds after ingestion. The user confirmed the new
#44 / 70.4 g text. Side was unknown. See the
[physical test receipt](../evidence/automatic-alert-physical-test.json).
Post-mount impacts and the saved calibration have since been verified; the new
direction update passed one fresh front spot check. No further physical test is
requested this round. Physical drop survival is still unverified.

## Selective policy update, October 17

The new tests cover silent small events, short clusters, device-clock rollover,
offline batches, configuration bounds and a cluster cooldown longer than the
single-reading cooldown. Both real xAI paths passed in isolated temporary
databases with a **fake messenger**: one qualifying single event and one third
small event after two silent observations. No phone texts or synthetic live
database rows were created. Receipts:
[single reading](../evidence/selective-alert-model-test.json),
[cluster](../evidence/selective-cluster-model-test.json).

The first real-model attempt exposed an overlong audit observation. Audit-only
prose is now bounded locally to 350 characters; impact identity, review reason,
evidence IDs and message construction remain strict. Provider prose never
becomes the phone message.

The synthetic practice view compares complete same-period participation minutes
for three fictional players, with their different positions/roles visible. #72's
Thursday inside run has 8 hits/20 minutes, 3.43× his earlier same-drill rate and
2.67× the highest of the other two fictional players. All eight illustrative
readings are 14–24 g, below the default single-reading setting. It is a frequency
example, distinct from #21's 76 g single event. The widget sends no messages.

To rerun an isolated test with a real model and fake messenger, from PowerShell:

```powershell
. .\server\scripts\Load-Agent.ps1
Push-Location server
node node_modules\tsx\dist\cli.mjs scripts\Check-Automatic.ts
Pop-Location
Remove-Item Env:HELMET_AGENT_API_KEY
```

Adding `--send-test` sends **one real labeled test text** and additionally requires
`server/scripts/Load-Inkbox.ps1` in that process. It should be used only when a new
phone test is intended. The normal Check Helmet command never sends texts.

API implementation reference: [xAI function calling](https://docs.x.ai/developers/tools/function-calling).
