# Run the helmet demo

## Before the audience arrives

1. Keep the laptop on the venue Wi-Fi. Double-click **Start Helmet.cmd** in the
   project folder. Leave that window open. It starts/reuses the private helmet
   Wi-Fi, builds the server and starts the fixed ngrok tunnel.
   The Wi-Fi helper disables Windows' five-minute no-client shutdown for this
   configured link, so unplugging the board during mounting does not leave it
   without a network later. It also allows ten seconds for Windows to assign
   the private IP. This does not prevent laptop sleep or every adapter failure.
   Stop the private link with `tools/Start-HelmetWifi.ps1 -Stop` when finished.
2. Power the Feather using the already-tested USB cable. Keep all cable pulls
   off the board sockets. Physical mounting and the drop power arrangement must
   pass inspection before a drop; a power-bank heartbeat alone does not qualify it.
3. Double-click **Check Helmet.cmd**. Every software check should say **PASS**.
   This sends no texts and creates no hits. It does not prove a new tap, a client
   render, phone delivery or physical survival.
4. Open [the inspector](http://localhost:3000/inspector). Open ChatGPT or Claude
   with the existing **Helmet Agent Live Demo** connection enabled. Confirm the
   client can see all five tools, including `exposure_load` and `show_practice_week`.
   An old chat may cache the earlier three tools. Refresh its existing connector's
   tool list and start a fresh chat if needed; keep the same private URL.
5. Confirm **Automatic trainer reviews: PASS** in Check Helmet. With the user
   present and a physical test explicitly planned, rehearse one qualifying event through the automatic phone loop,
   retrieval and widget. Use that hit's database `impact_id`; do not select an old row.

Before presenting, open **both** “Show me the last hit” and the simulated #72
practice view in the client you will use. A first preview may need one **Retry**
in Claude or **Try again** in ChatGPT. Keep the successfully loaded views open;
this host preview issue remains separate from the MCP connection. Use the local
inspector as the visual fallback. Check Helmet prints both cooldown countdowns
and the remaining 24-hour review budget. Wait for the relevant countdown to reach
zero; never delete delivery receipts to reset it.

The live card shows a white helmet on dark green. Its map accumulates complete
readings over a rolling 60 minutes by server arrival time. A named direction adds
red to that zone; an undirected hit adds red across the helmet and counts once.
More or stronger readings add color; old readings fade out of the window. This
is a visual summary, not injury risk or total force. The card refreshes every ten
seconds while visible. Unknown direction is never replaced with front in the data.
Trainer messages continue to omit missing direction; old messages stay intact.

Both entries under **Resources** now load with data. **Helmet** opens live
readings; **Practice** opens the sample #72 week. Click a day and then a drill.
The local inspector preview upload cap supports its duplicated inline bundle;
receiver and public-access limits are unchanged.

| Tool | What it helps you do |
| --- | --- |
| `show_last_hit` | Open the live helmet map and latest reading. |
| `get_impacts` | Retrieve the exact saved hits for a player and time window. |
| `show_practice_week` | Open practice trends and click through days and drills. |
| `exposure_load` | Compare a drill with the player's earlier sessions and other players in that period. |
| `flag_for_review` | Text the trainer about one saved live hit; repeated requests reuse its existing message. |

For the sample walkthrough, Thursday inside run is the finding: #72 has 8 hits in
20 minutes, versus 7 in 60 earlier minutes; the other players have 3 and 2 in the
same 20-minute period. The agent identifies who and which drill to check, then
shows the records behind that comparison.

## Act 1 — the physical event

Say: **“This helmet gives an agent a physical event it can investigate.”**

Use a supported empty-helmet tap until a specific demo drop height/surface has
passed physical qualification. Keep the cable loose. The background agent should
read recent history and send **Check #44** for a qualifying event without a chat
request. Current configurable demo rules are ≥40 g, or 3 usable ≥10 g readings
within 90 seconds. A smaller isolated event is recorded without a text. These
are review settings, not injury thresholds. Allow time for model/API and Inkbox
delivery. Single-reading cooldown is 30 seconds; cluster cooldown is five minutes;
20 model reviews are allowed per rolling 24 hours. Then ask:

> Any hits in the last 10 minutes? Use fresh live data. Tell me the newest
> impact ID, player, relative helmet reading, sensor direction and capture quality.

Expect `get_impacts`, a new stable database ID, and an actual recent receipt time.
An older `show_last_hit` result does not prove the latest tap triggered.

> Show me the last hit.

Expect the matching widget, reading and player. Optionally ask:

> Flag that specific hit for the trainer. Reason: one tap on an empty helmet
> during the live demonstration; please evaluate the player in the proposed workflow.

The explicit tool returns the same review if the worker already requested it;
it does not create another text for that impact. Keep these receipts distinct:
agent request, provider acceptance/delivery, and the user actually seeing the phone.
The real-model/Inkbox loop passed isolated software tests and the controlled
physical rehearsal below. See [automatic operation](AUTOMATIC_ALERTS.md).

Latest physical rehearsal: one held empty-helmet tap at **8:47 PM October 17**
produced event 32, **44.65 g**, complete/unclipped capture and an automatic text
confirmed on the user's phone. Provider delivery was saved 9.054 seconds after
ingestion. Direction was not determined. This rehearsed the held-tap move;
release-drop survival remains unverified. Earlier setup handling also triggered
the cluster rule, so finish assembly before enabling/rehearsing alerts and keep
the helmet still before the take. Preserve those handling records as such.

## Act 2 — the agent investigates practice

Say: **“Now we switch to an invented week of football practice. Every record
in this next view is simulated.”**

> In the simulated week, who should the trainer check after Thursday practice,
> and why? Compare earlier drills and the other players in that period, then
> show the practice view. Keep it to four sentences. Do not send a text.

Expected findings:

- #72: Thursday inside run **8 impacts / 20 minutes**, versus **7 / 60 minutes**
  across three earlier inside-run periods, **3.43×** the earlier rate.
- Same Thursday drill: #44 has **3 / 20 minutes**, #21 has **2 / 20 minutes**;
  #72 is **2.67×** the highest of these two fictional peers. Roles differ and
  are shown. This is a three-player illustration, not a full-team norm.
- All eight #72 inside-run readings are **14–24 g**, below the default 40 g
  single-reading setting. The pattern comes from frequency and drill context.
- #21 has the week's largest single illustrative reading: **76 g in Friday's game**. The repeated-contact finding
  is a different question from selecting the maximum g.
- Thursday's 110-minute plan includes stretch, position warm-up, walkthrough,
  inside run, offense-specific unit, team and scout. The first three have known
  zero observations in this fictional scenario.
- If asked for staff history, #72's fictional record reports four prior concussions
  in eight years. This is separate human context, not a computed injury score.
- Trainer follow-up: check the player. Coach follow-up: review that practice
  period, confirm participation and mounting, and review film if available.
  The project has no connected video analysis.

> Show the simulated practice week for #72.

Select Mon/Thu or a drill in the widget to compare contexts without another
model call. The day/drill controls update counts, observation minutes, own
history and same-period peers. The largest single event remains a separate
week-level reference. This view is explicitly simulated and sends no text.

Expect `show_practice_week`, the **SIMULATED** label, drill bars and rate comparison.
Do not pass simulated IDs to `flag_for_review`; the review tool accepts only live
numeric database impact IDs.

## Recovery

| What happens | First action |
| --- | --- |
| Helmet lights are off | Fully seat the known working USB cable in the actual bank/laptop socket; press the bank button once. |
| Heartbeat is stale | Check power, Windows Helmet-Agent hotspot and cable plugs. Run Check Helmet again after a new heartbeat. |
| Fresh heartbeat but no hit | Confirm normal mode. A pulse can be below the per-axis hardware threshold. Inspect capture/diagnostic evidence before changing settings; do not keep punching harder. |
| New practice tools missing | Refresh tool discovery for the existing connection; start a fresh chat. The ngrok URL should remain the same. |
| ChatGPT says “Couldn't display Helmet Agent” | Click **Try again** once. This restored the practice widget in the recorded rehearsal. If it still fails, use the inspector as an explicitly local fallback. |
| Inspector works but cloud agent fails | Check the public MCP result in Check Helmet. Keep the private URL/access key intact; use the inspector as an explicitly local fallback. |
| Text status is unknown | Recheck the same impact's saved review receipt; never generate a fresh send just because the first outcome is uncertain. |
| Board moves or socket is strained | Stop physical testing. Repair retention, then recalibrate if sensor orientation moved. Repeat the normal tap before another release. |

Relative helmet-impact telemetry, not a diagnosis; a human trainer decides.
All physical tests use the empty helmet. See [current state](../CURRENT_STATE.md)
for the unresolved physical gates and [mounting plan](../evidence/mounting-drop-readiness.json).
