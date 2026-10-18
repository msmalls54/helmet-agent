# Helmet Agent server

[Project overview](../README.md) · [Current state](../CURRENT_STATE.md) ·
[Short demo runbook](../docs/DEMO.md) · [Evidence index](../evidence/README.md)

One TypeScript process on port 3000 receives helmet telemetry, saves it in SQLite,
and supplies five MCP tools and two inline SVG widgets.

Relative helmet-impact telemetry, not a diagnosis; a human trainer decides.
These are inner-shell measurements. The impact side remains estimated and unverified.

## Start the demo

From the `helmet-agent` project folder in PowerShell:

```powershell
.\tools\Start-Helmet.ps1
```

Or double-click **Start Helmet.cmd** in that folder. Keep its window open.
The launcher starts/reuses the Windows **Helmet-Agent** 2.4 GHz mobile hotspot,
loads the Windows-encrypted Inkbox variables, builds the server/widget and starts
one Node process with a hidden managed HTTPS tunnel helper. After the one-time
`tools/Set-HelmetNgrok.ps1` setup, it uses the claimed static ngrok hostname and
Windows-encrypted token automatically. It reuses an already-running Helmet Agent instead of starting a
second copy. If Windows requests administrator approval, it is for the scoped Node
firewall rule. Press Ctrl+C in the server window to stop it.

Keep the laptop connected to the venue's **Y Combinator** network. The Feather joins
the laptop's private **Helmet-Agent** network and posts to `192.168.137.1:3000`.
USB powers the board; hit delivery uses Wi-Fi. No firmware changes were needed.
The launcher checks the hotspot address against the firmware secrets before starting.

Open [the inspector](http://localhost:3000/inspector).
Before presenting, run `tools/Test-Helmet.ps1` from the project folder, or
double-click **Check Helmet.cmd**. This read-only check verifies fresh normal-mode
heartbeats, local/public MCP, the fictional pattern and inline widget resources;
it does not send texts or insert impacts. Its receipt is `evidence/demo-preflight.json`.
The MCP endpoint is `http://localhost:3000/mcp`.
Local [health status](http://localhost:3000/health) shows the latest heartbeat per helmet,
including receipt time, calibration state, RSSI and queue/drop counts.
The launcher also prints the **private public-HTTPS MCP connection URL** for
ChatGPT and Claude. Copy the whole URL, including its access key. See
[connect the agents](CONNECT_AGENTS.md) for the exact screens and demo prompts.

## Demo sequence

1. Support the empty helmet and give the solid shell one firm knuckle tap.
   With the configured live automatic worker armed, its agent reads recent
   history and requests the trainer text in the background. See
   [automatic reviews](../docs/AUTOMATIC_ALERTS.md) for limits and receipts.
2. In the inspector, execute `get_impacts` with its defaults.
3. Execute `show_last_hit` to see the same hit highlighted on the helmet.
4. Execute `flag_for_review` with that result's **impact_id** and a short note.
   For a test, say this was a tap on an empty helmet.

| Tool | Inputs | Result |
| --- | --- | --- |
| `get_impacts` | `since_minutes=60` (1–10080), `min_g=0`, optional exact `player` | One-line summary, exact count, up to 200 compact hits, capture flags, latest heartbeats |
| `show_last_hit` | none | Helmet widget, hit props and a one-line text message |
| `flag_for_review` | stable database `impact_id`, `note` (1–500 characters) | Saved review and actual Inkbox delivery status |
| `exposure_load` | `data_source="live"` by default, `since_minutes=10080`, optional `player`, `drill` | Counts, capture quality, and practice context; explicitly select `simulated_week` for the fictional scenario |
| `show_practice_week` | fictional `player="#72"` by default, `#44` or `#21` | Clearly labeled simulated-week widget; no phone action |

## Football practice investigation

After the live hit, widget and trainer-review demonstration, switch explicitly
to the **simulated week**. The scenario contains 143 invented impacts across
three fictional players: #72 (OL), #44 (LB) and #21 (RB), with four practices and
a Friday game. It is generated separately and never inserted into live SQLite.
Every event is labeled simulated and has no reviewable database impact ID.
The live phone tool cannot accept its `sim-...` IDs.

Ask the connected agent:

> Use exposure_load with data_source simulated_week. Who should the trainer
> check, and which practice period should the coach investigate? Compare each
> player with their own earlier periods, include the observation minutes, and
> distinguish the pattern from the biggest single hit. Do not send messages.

Then ask:

> Investigate #72's inside_run periods in the simulated week. What changed on
> Thursday, and what should the trainer and coach check next?

Finally:

> Show the simulated practice week for #72 with show_practice_week.

Expected finding: #72 has **8 impacts in 20 observed minutes** during Thursday
inside run, compared with **7 in 60 minutes** across the three earlier periods:
**3.43 times the earlier rate**. #21 has the week's largest single illustrative
reading. The agent can identify a repeated-contact pattern that a single-peak
alert misses, cite the underlying period/event IDs, and propose checking #72
and reviewing drill film. Video is not connected, and counts alone do not prove
poor technique or an injury.

Each 110-minute practice logs seven periods, including observed zero-hit periods:

| Period | Minutes | Thursday #72 impacts | Assignment |
| --- | ---: | ---: | --- |
| Stretch / mobility | 10 | 0 | Noncontact |
| Position warm-up / footwork | 15 | 0 | Noncontact |
| Walkthrough / assignments | 10 | 0 | Walk tempo |
| Inside run | 20 | 8 | Blocking / thud |
| Unit | 15 | 1 | Offense-specific; LB has defense-specific unit |
| Team | 20 | 3 | Team offense vs defense |
| Scout | 20 | 3 | Scout offense vs starting defense |

#72 is a second-team right guard who also works on scout offense; #21 is a
second-team/scout running back, and #44 plays starting defense. Event records
include player, position, assignment, timestamp, period and individual reading.
Zero-hit periods have explicit synthetic observation coverage; missing live
context is never treated as a verified zero.

Fictional staff-record histories deliberately illustrate different backgrounds:
#72 has 4 reported prior concussions over 8 years playing, #44 has none reported
over 6 years, and #21 has 5 over 8 years. These are not real medical records or a
representative prevalence sample. The histories are separate trainer context;
they do not change counts, outlier thresholds, signal rankings or authorize a
clearance decision. Missing live history returns null, never zero.

Rules are explainable demo choices, not medical thresholds or Riddell's
proprietary metrics: a period signal needs at least 5 usable events, 2.5 times
the earlier same-player/same-drill rate, and 3 complete earlier periods. A
magnitude outlier needs at least 20 earlier usable events on the same player,
helmet and capture profile, with a reading at least twice the prior median.
Clipped, incomplete, calibration and onset-censored captures are excluded.
The observation minutes are fictional per-player monitoring periods, not snaps
or regulation game-clock minutes. Calendar dates use America/Los_Angeles.

Live mode reports actual stored helmet tests and their capture quality. There
is currently no ingested drill schedule or verified comparable mounting profile,
so it does not invent drill rates or personal outlier alarms. Analysis is bounded
to the latest 5,000 matching records, with an exact total and truncation flag;
up to 60 event details are returned. Narrow by player/drill to inspect details.

The football framing comes from primary sources. Asken et al. tracked drill
participation and impacts per player per minute; rates varied by position and
drill. This supports contextual analysis, not a claim that inside run is always
the most contact-intensive drill. The fixture's period lengths and specific
counts are authored examples, not a validated simulation of that cohort.
[Asken et al.](https://pubmed.ncbi.nlm.nih.gov/29987539/)
Urban et al. studied 40
high-school players and recorded 16,502 impacts; reported session averages were
9.4 per practice and 15.5 per game. Those values inform scenario scale only.
Its head-acceleration magnitudes are not benchmarks for our inner-shell readings.
[Urban et al. (2013)](https://saveinjuredkids.org/wp-content/uploads/2015/03/Urban-et-al-Head-Impact-Exposure-in-Youth-Football.pdf)
Riddell's published reports combine practice plans, individual history and
position/playing-level national norms. Our demo uses that contextual framing;
it does not reproduce their sensor validation, national database or load score.
[Riddell sample reports](https://content.riddell.com/wp-content/themes/riddell_2013/assets/img/insite/2023InsiteAnalyticsReportPacket.pdf)

This is the stage story: **a live physical event gives the agent fresh evidence;
a clearly labeled fictional week demonstrates how it investigates patterns and
prepares a specific human follow-up.** A bounded automatic worker now uses the
same review sender for fresh live hits. It passed a real-model/Inkbox test with
an isolated labeled fixture and then a real empty-helmet tap with user-confirmed
phone delivery. See `evidence/automatic-alert-physical-test.json`.
The explicit `flag_for_review` tool remains available without duplicate sends.

Read-only protocol/widget check: `npx tsx scripts/Check-Practice.ts`.

The database impact ID is different from the device ID, which resets on reboot.
Time filters use **server receipt time**. A queued hit may have happened earlier;
the firmware does not supply a synchronized wall-clock impact time.
Trainer messages now lead with **Check #44**, followed by local recorded time,
one decimal reading, the sensor's direction label and the reason for review.
They omit internal IDs, server terminology and diagnostic claims. Existing saved
messages are retained exactly; new wording applies to new review requests.

Each impact generates at most one logical review message. Repeating the tool call
returns/refreshes the original delivery status and retains the original note.
The exact message body and idempotency key are saved before sending. A lost response
is retried with the same key; a known message is only read back, never resent.
`sent`/`accepted` is not `delivered`, and provider delivery is separate from a human
confirming it appeared on their phone. Calls do not diagnose or decide treatment.

## Files, secrets and data

- `src/receiver.ts`: same `POST /impact` and `POST /heartbeat` as the firmware.
- `data/helmet.sqlite`: ignored local SQLite database, with WAL enabled. Preserve
  the database and its WAL/SHM files when moving or backing up a running demo.
- `(helmet_id, boot_id, device id)` prevents Wi-Fi retries from double-counting hits.
  An identity reused with different data receives HTTP 409. Only committed writes
  receive a success response.
- `resources/helmet/widget.tsx`: SVG-only drawing; left/right refer to the wearer.
- `scripts/Load-Inkbox.ps1`: decrypts the existing DPAPI key into the child process
  environment. The pinned connected conversation comes from the verified START
  receipt. Optional `INKBOX_CONVERSATION_ID` overrides that selection explicitly.
  The provider verifies the connection is still active before sending.
- `tools/Set-HelmetNgrok.ps1` and `scripts/Load-Ngrok.ps1`: store/load the account's
  fixed ngrok domain and authtoken using CurrentUser DPAPI outside the checkout.
  The token is read at a hidden prompt, never a command-line argument or plaintext
  ngrok config. It is loaded after building and removed from the launcher on exit.
- No key or password is committed. `.env`, firmware `secrets.h`, DPAPI files, local
  databases, generated builds and node_modules are ignored.

The firmware's two receiver endpoints accept validated JSON bodies up to 4096 bytes.
The two loopback-only Inspector preview stores accept up to 2 MiB for the bundled
inline widget HTML. `scripts/Check-Preview.ts` verifies both preview stores while
checking that oversized firmware uploads and foreign browser origins stay blocked.
The main server's MCP, inspector and health routes require a loopback socket peer.
Allowed browser origins are local inspector, the current tunnel, ChatGPT and Claude;
other browser origins remain blocked. The Windows inbound rule permits Node TCP
3000 on the private helmet adapter/address/subnet only.

The MCP server, tools, inspector and widget use **mcp-use by Manufact**. With the
one-time ngrok settings installed, public transport uses the account's claimed
static ngrok hostname, reused on each full launcher restart. A hidden ngrok
helper forwards to a separate **loopback-only gateway** on an automatically chosen
local port. Its generated config contains no secret, disables traffic inspection,
the local inspection API and remote management, and keeps the token in the helper's
environment only. The launcher stops the helper with the server. Inkbox secrets
and the MCP access key are not passed to it. Cloudflare Quick Tunnel remains a
fallback for an account/network outage.
That gateway forwards exactly `/mcp`, checks a private 256-bit URL access key, and
strips the key before forwarding. Public `/impact`, `/heartbeat`, `/inspector`,
widget asset routes, `/health` and other application routes return 404.
On free ngrok, a browser-style HTML GET can receive the provider's own HTTP 200
warning page (`ERR_NGROK_6024`) before reaching this gateway. The real MCP client
requests work; the warning does not expose application data. `Check-Tunnel.ts`
records that edge behavior and separately confirms browser GET 404s at the gateway.
Widgets are bundled inline and travel through MCP `resources/read`, so no widget
asset routes need to be public. Normal MCP cloud clients omit browser Origin;
their access key is still required.

The access key is generated in ignored `server/.env`; the relay reservation token
and full connection URL are in ignored `server/.mcp-use/state/`. Neither belongs
in Git or shared screenshots. Anyone holding the complete connection URL has the
five tools, including the existing phone-review capability. This is scoped demo
access; use account-bound OAuth before a public product deployment. The firmware
receiver remains on the private helmet link without protocol authentication.
For a local-only run, use `tools/Start-Helmet.ps1 -LocalOnly`.
Keep the launcher running through the demo. The fixed ngrok hostname and persisted
MCP access key keep the connector URL unchanged after a restart; the laptop still
has to be online. Before ngrok is configured, the launcher retains Cloudflare.
To use that fallback explicitly, pass `-TunnelProvider cloudflare`; its Quick
Tunnel URL changes when cloudflared is restarted, requiring replacement agent
connections. Neither transport is a hosted deployment of the server.
The official Manufact tunnel remains available with
`$env:HELMET_TUNNEL_PROVIDER='manufact'` before starting, but was not reliable in
this venue test. See `CONNECT_AGENTS.md` for setup and actual test receipts.

## Checks and framework version

```powershell
cd server
npm test
npm run build
npx tsx scripts/Check-Mcp.ts
```

Tests use isolated temporary databases and fake Inkbox delivery; they cannot send
real messages. `Check-Mcp.ts` only reads live history and the widget. It checks that
every tool carries the telemetry/human-review description. For an authenticated,
read-only historical Inkbox check:

```powershell
. .\scripts\Load-Inkbox.ps1
npx tsx scripts/Check-Inkbox.ts
```

Scaffolded with `create-mcp-use-app@2.0.10`, blank template, SDK version **1.34.8**.
That release supports the requested `resources/.../widget.tsx` and
`widget({ props, message })` API. mcp-use 2 uses a different API. Versions are locked.
The build checks types directly before invoking the framework with `--no-typecheck`:
its own typecheck launcher mishandles Windows Node paths containing spaces.

Patched overrides update Hono, its Node adapter, the MCP SDK and PostHog. The npm
audit still reports six high-severity dependency entries from one unresolved
`braces`/`micromatch` glob-parser chain in the framework's widget build tooling
([advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)). This project passes
only checked-in widget paths, never request-supplied glob patterns. Do not describe
the dependency tree as audit-clean; revisit it before a public deployment.
