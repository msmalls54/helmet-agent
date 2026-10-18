# Connect the real agents

Start everything from the project folder with `tools/Start-Helmet.ps1` or
double-click `Start Helmet.cmd`. Keep the laptop on the venue network and keep
that window open. The server, tools and widget use mcp-use by Manufact. Once the
one-time ngrok setup below is complete, the launcher uses the account's claimed
static ngrok domain. Only the authenticated MCP entrance is exposed. Cloudflare
remains an explicit fallback; it does not preserve its hostname on a full restart.

## One-time fixed-domain setup

1. Sign in at [ngrok](https://dashboard.ngrok.com/). In **Domains**, claim/copy the
   free assigned development hostname. Copy the authtoken from **Your Authtoken**.
2. Install the signed official [Windows ngrok agent](https://ngrok.com/download/windows).
   The launcher finds `ngrok` on PATH or `%LOCALAPPDATA%\Programs\Ngrok\ngrok.exe`.
3. From the project folder, run `tools\Set-HelmetNgrok.ps1`. Paste the hostname,
   then paste the authtoken at the hidden prompt. The script saves both in
   `%LOCALAPPDATA%\HelmetAgent\secrets\ngrok.dpapi`, encrypted for this Windows user.
   It does not create ngrok's usual plaintext authtoken file or print the token.
4. Stop the old launcher with Ctrl+C, then start with `tools\Start-Helmet.ps1`.
   The launcher reuses a running server rather than swapping its tunnel in place.
   Once encrypted ngrok settings exist, ngrok
   is the default. `-TunnelProvider ngrok` selects it explicitly. An invalid token
   or unavailable claimed domain fails clearly; it never substitutes a random URL.
5. Connect ChatGPT and Claude to the whole private URL below. The ngrok hostname
   and the existing local MCP access key are reused across complete restarts.
   Keep the encrypted settings and ignored `server/.env` to retain that identity.

The ngrok helper forwards to the same loopback-only `/mcp` gateway, not port 3000.
Traffic inspection and its local web API are disabled. The helper receives only
its ngrok authtoken, not Inkbox credentials or the MCP access key. Agent requests
still require the private URL key and pass the existing origin checks.

Free ngrok displays its own warning page for browser-style HTML requests before
they reach the application. The real ChatGPT and Claude MCP requests work without
clicking it. Application requests outside `/mcp` still return 404; the check records
ngrok's separate HTTP 200 warning and verifies the gateway's browser GET 404s using
the vendor's diagnostic header. This warning exposes no helmet receiver data.
[ngrok free-plan behavior](https://ngrok.com/docs/pricing-limits/free-plan-limits).

Copy the **whole HTTPS MCP connection URL** printed by the launcher. It ends with
`/mcp?access_token=...`. Treat that full URL as a private access key: it grants the
five helmet tools and the existing review-message capability. The public hostname
alone cannot use the tools. The launcher can print the current URL again without
starting another server. No credentials or full connection URLs are stored in Git.

## ChatGPT

1. Open [Plugins](https://chatgpt.com/plugins).
2. **Add → Add custom MCP server**.
3. Name: **Helmet Agent Live Demo** (the active connection on this laptop).
4. Description: **Retrieve helmet impacts, show the last hit, and request trainer review.**
5. Connection: **Server URL**. Paste the entire private HTTPS MCP connection URL.
6. Authentication: **No authentication**. The URL already supplies the access key;
   this server does not use an OAuth sign-in flow.
7. Review the warning, select **I understand and want to continue**, then
   **Create as a plugin**. Inspect the five discovered tools.
8. Install/connect if prompted. Start a new chat, type **@**, and choose
   **Helmet Agent Live Demo**.

The browser may show an action confirmation before a phone message; approve the
specific review request in the test. After changing tools/metadata, refresh the
custom plugin and start a new chat.

[Official ChatGPT connection instructions](https://developers.openai.com/plugins/deploy/connect-chatgpt).

## Claude

1. Open **Settings → Customize → Connectors**. Some clients display it directly
   as **Settings → Connectors**.
2. **+ Add → Add custom connector**.
3. Name: **Helmet Agent Live Demo**. Server URL: the same full private HTTPS MCP URL.
4. Click **Continue** and wait for server discovery.
5. Authentication: **No sign-in**. No extra request headers are needed because
   the URL contains this demo's access key.
6. Click **Add**, then connect/enable if prompted.
7. In a new chat, use the **+ → Connectors** menu to enable **Helmet Agent Live Demo**.

[Official Claude connection instructions](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

## Gate test

The configured background agent now reads history and requests a trainer text
for an eligible fresh hit without a chat prompt. It shares the review sender, so
the explicit flag request below returns the same message if already requested.
Check Helmet reports whether automatic reviews are armed. No extra connector
tool or URL change is needed. See [worker operation](../docs/AUTOMATIC_ALERTS.md).

With the connector enabled, make one firm knuckle tap on the supported empty helmet.
Then ask either agent:

> Any hits in the last 10 minutes?

Check that it calls `get_impacts` with `since_minutes: 10` and identifies the new
hit's database `impact_id`, player, magnitude and sensor direction.

Then ask:

> Flag it for the trainer.

Check for `flag_for_review` with that specific `impact_id` and a concise reason.
The phone should receive a direct **Check #44** message. A repeated flag for the
same hit returns its original delivery record without sending another message.

In ChatGPT ask:

> Show me the last hit.

It should call `show_last_hit` and render the helmet widget with the same player,
reading and highlighted sensor direction. A successful inspector preview alone
does not prove that ChatGPT rendered it. Record the actual client result separately.

The tool results retain capture-quality flags and `location_validated: false`.
The sensor direction label is a classification of relative helmet-impact telemetry;
it has not been validated as physical contact location. A human trainer decides.

## Fictional football-practice investigation

The server now also exposes two read-only tools, `exposure_load` and
`show_practice_week`. If a previously connected client still lists only three
tools, refresh that client's tool discovery; the private server URL is unchanged.
Actual client discovery/rendering for these new tools must be verified separately
from the earlier three-tool gate receipt.

October 17 rehearsal: the existing ChatGPT plugin initially cached the original
three tools. **Manage → Refresh tools**, followed by reloading the existing chat,
exposed the practice tools without a new URL or connection. ChatGPT retrieved
the #72/#21 comparison and displayed the practice widget after one **Try again**
on its failed sandbox. See `evidence/practice-client-rehearsal.json` and its
screenshot. Claude's practice-tool rehearsal is still pending.

After the live test, ask:

> Use exposure_load with data_source simulated_week. Investigate offensive
> lineman #72. Which Thursday practice period changed against his own earlier
> periods? Account for observation minutes and scout-team work. Include his
> fictional reported concussion history as context for the human trainer, not
> as a calculated injury score. Do not send messages.

Then ask:

> Show the simulated practice week for #72.

Expected: a 110-minute practice with stretch, position warm-up, walkthrough,
inside run, offense-specific unit, team and scout periods. Thursday inside run
has 8 impacts in 20 minutes versus 7 in 60 earlier minutes (3.43 times the rate).
The fictional history is four reported prior concussions in eight years playing.
All events and history are invented and labeled. No synthetic row is inserted
into live history or eligible for the phone-review tool.

## Connection checks

From `server/`, `npx tsx scripts/Check-Tunnel.ts` tests the real HTTPS MCP endpoint,
inline widget resource and blocked public receiver routes without sending a text.
The nonsecret receipt is `evidence/gate-public-https.json`.

The public server uses stateless JSON requests. The optional MCP GET/SSE stream
returns 405 immediately; clients continue with POST. This avoids leaving cloud
connector sessions open across the relay. The check also exercises concurrent
history calls and verifies that the optional GET cannot hang.

The actual ChatGPT/Claude test and phone receipt are recorded separately in
`evidence/gate-live-agents.json`. A server protocol check alone is not a visual
widget test. Gemini CLI can connect over HTTP too, but the user has deferred it.

After the one-time migration, stop the launcher with Ctrl+C, run it again, and
check that the private connection URL is unchanged. Then ask both existing agents
for recent hits without changing either connector. Ask ChatGPT to show the last
hit and verify the widget. This restart check is separate from a local protocol
test; do not mark it passed until both real clients answer after the restart.

If a connector cannot reach the server, check laptop internet, launcher output and
the current connection URL first. A stable hostname keeps the saved connector
valid; the laptop and tunnel must still be running. Check ngrok's ignored local
log for account/network errors if it cannot start.

For fallback, stop the launcher and run `tools\Start-Helmet.ps1 -TunnelProvider cloudflare`.
A Quick Tunnel keeps its URL only while its helper stays running; a full restart
creates a new URL. The launcher saves and prints that URL. ChatGPT currently
offers no URL editor: uninstall the obsolete connection, retain its history,
and add a custom server again. In Claude disconnect the old entry and add the
replacement. The active connection is named **Helmet Agent Live Demo** in both
clients. Earlier disconnected entries and their previous chats are retained.
Do not expose the inspector or firmware receiver to work around a connection error.

Vendor references: [ngrok CLI `--url`](https://ngrok.com/docs/gateway/agent/cli),
[account-assigned free domains](https://ngrok.com/docs/gateway/domains),
[agent configuration](https://ngrok.com/docs/gateway/agent/config/v3).

## Verified restart on this laptop

The latest October 17 rehearsal also verifies the five-tool practice flow in
both actual clients. Ask “In the simulated week, who should the trainer check
after Thursday practice, and why? Compare earlier drills and the other players
in that period, then show the practice view. Do not send a text.” Both retrieve
#72's 8/20 versus 7/60 comparison. The 76 g week maximum is #21's Friday game,
not Thursday practice. Updated widgets report their own height to the client.
Tool names and arguments remain the same. The existing tool lists were refreshed
once for the updated widget templates, without adding connections or widening
access. An old conversation can retain earlier metadata; use the prepared demo chat.

First-load previews have required one **Retry** (Claude) or **Try again**
(ChatGPT). Open the live and practice cards before presenting and keep them
loaded; the inspector is a fallback. This host issue is not claimed fixed.
Widget resource URIs are versioned by the built HTML content; unchanged rebuilds
keep the same widget URIs and private connection URL. See
`evidence/demo-ready-software.json` for the latest scope and screenshots.

On October 17, both the Node server and ngrok helper were fully stopped and
started again. The private MCP URL stayed identical. The existing **Helmet Agent
Live Demo** connections in ChatGPT and Claude retrieved impact 7 and fresh
heartbeats without re-adding or reconnecting either client. ChatGPT rendered the
13.38 g RIGHT widget after its preview's **Try again** button; that preview retry
also occurred on the initial installation. The restart check sent no messages.
See `evidence/ngrok-migration-status.json` for client IDs, timestamps and images.
The separately recorded physical/phone gate remains historical evidence; this
transport check does not verify the board's later power-bank setup.
