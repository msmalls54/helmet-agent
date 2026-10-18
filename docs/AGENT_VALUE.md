# Helmet Agent: the demo story

**Give an agent a physical event to investigate.**

The agent consumes the sensor records through MCP. The trainer receives a
specific player and a reason to check them; the coach gets a practice period to
review. Helmet Agent supplies recorded contact, time and history so the agent
can investigate a question and request attention.

## Say it in 30 seconds

“Agents can read a document, but a hit on the field is invisible to them until
something records it. We put sensors in a football helmet and made the records
available through MCP. A qualifying event starts an agent that checks history
and texts a person. Then we show a fictional practice week where the useful
finding is repeated contact during inside run. The trainer makes the call.”

## Walk an interviewer through it in two minutes

1. **Show the physical connection.** “These two sensors measure motion at the
   helmet's inner shell. The board sends records over Wi-Fi to this laptop.
   USB currently supplies power.” Use a supported empty-helmet tap; use a drop
   only after the mounting and power arrangement pass physical qualification.
2. **Show the new record.** Ask “Any hits in the last 10 minutes?” Point to the
   player, stable impact ID and receipt time. “This is a saved event the agent
   can retrieve. Capture quality travels with the reading.”
3. **Show the visual and action.** Ask “Show me the last hit.” The widget shows
   the matching player and reading. A qualifying event starts the background
   history check and trainer text without a chat request. A smaller isolated
   hit stays recorded without a text. Show the actual phone message separately
   from the provider's delivery receipt.
4. **Switch sources out loud.** “The live hardware path works. Now this is a
   fictional week of football practice.” Open #72's practice view. Select Monday
   and Thursday inside run. “He has eight contacts in 20 observed minutes on
   Thursday, against seven in 60 earlier minutes. His readings are 14–24 g;
   this finding comes from frequency and drill context.”
5. **Explain the useful follow-up.** “That's 3.43 times his earlier rate. The
   two fictional peers had three and two contacts in the same period. A trainer
   has a player to check; a coach has a drill and assignment to review. The
   agent can explain which records support that request.”

Use **“relative helmet reading”** beside the number. The measurement is
**relative helmet-impact telemetry, not a diagnosis; a human trainer decides.**

## Exact prompts and tool sequence

| What to show | Prompt | Tool and arguments |
| --- | --- | --- |
| Real recent events | “Any hits in the last 10 minutes? Use live data. Give me the newest impact ID, player, reading, direction and capture quality.” | `get_impacts({"since_minutes":10,"min_g":0,"player":"#44"})` |
| Latest helmet visual | “Show me the last hit.” | `show_last_hit({})` |
| Explicit trainer request, if useful | “Flag that specific live hit for the trainer. Note: empty-helmet demonstration; please check the player in the proposed workflow.” | `flag_for_review({"impact_id":<ID returned above>,"note":"Empty-helmet demonstration; please check the player in the proposed workflow."})` |
| Practice investigation | “Use the simulated week. Investigate offensive lineman #72. Which Thursday drill changed against his earlier practices? Compare the same-period peers using observed minutes and show the supporting records. Compare that finding with the largest single reading across players. Do not send messages.” | `exposure_load({"data_source":"simulated_week","player":"#72"})`; then `exposure_load({"data_source":"simulated_week"})` for the all-player largest-reading comparison |
| Practice visual | “Show the simulated practice week for #72.” | `show_practice_week({"player":"#72"})` |

`flag_for_review` uses the server's stable numeric `impact_id`, not the board's
counter. Repeating the request returns the existing review; it does not create
another message. Fictional practice IDs cannot send texts.

The background worker uses the same history-and-review workflow. Current demo
settings qualify a reading at or above 40 g, or three usable readings at or above
10 g within 90 device seconds. Code enforces freshness, evidence checks,
cooldowns and delivery identity. Those are configurable review settings, not
medical thresholds. There is one real helmet; the automatic worker has no live
teammate or drill schedule.

## What the agent adds

A threshold rule can send a text. That alone does not require an agent.

The agent interface adds a way to investigate different questions using the
same records: what happened recently, what changed in one drill, which earlier
periods support the comparison, and whether repeated contact tells a different
story from the maximum reading. It presents the evidence and can request human
review through a tool that returns a saved delivery status.

The automatic worker is deliberately constrained: code qualifies candidates;
the model must read history before requesting review. It does not invent
thresholds or decide whether someone is injured. The clearest demonstration of
contextual investigation is the practice walkthrough, where the source is
explicitly fictional.

MCP makes the physical record usable by more than one agent client. ChatGPT and
Claude can retrieve the same saved events and invoke the same review tool. They
do not need to parse a Serial log or trust a number typed into a chat. In the
theme's language, **agents want this input because physical events otherwise
fall outside their available context**. “Feel” is the hook; recorded motion,
history and action are the working capability.

## The concrete football case

Fictional #72 is a second-team right guard working scout offense against the
starting defense. Thursday inside run has **8 contacts / 20 minutes**. His
three earlier inside-run periods total **7 / 60 minutes**: **3.43×** the rate.
Fictional #44, an LB, has **3 / 20**; fictional #21, an RB, has **2 / 20** in
the matched period. #72's rate is **2.67×** the highest of these two peers.
These are different positions, not a position-matched team norm.

All eight #72 readings are **14–24 g**. #21 has the week's largest individual
reading, **76 g during Friday's game**. Selecting only the largest reading misses the separate
question: why did #72 record more contact in this specific period?

The next actions are concrete: the trainer checks #72; the coach confirms his
participation and assignment, checks the sensor mounting, and reviews that
period's film if available. Film is not connected to this project. Fictional
staff-reported concussion history appears as trainer context, never as a risk
multiplier or an automatic participation decision.

## What each part does

| Part | Job in this build |
| --- | --- |
| ADXL375 + ISM330DHCX | Record acceleration and rotation at the helmet mounting point. |
| ESP32-S3 Feather | Detect events, retain an offline queue and send Wi-Fi records. |
| TypeScript + SQLite | Validate and save impacts, heartbeats, review jobs and delivery receipts. |
| Manufact **mcp-use** | Serve the five MCP tools, inspector and inline interactive widgets. This build runs on the laptop. |
| Grok through the xAI API | Run the background history-check and review tool sequence. |
| Inkbox | Send the review request to the connected iMessage conversation and report delivery status. |
| ngrok | Give ChatGPT and Claude a fixed authenticated HTTPS entrance to `/mcp`. The impact receiver stays off the public tunnel. |
| ChatGPT / Claude | Let a person ask questions, retrieve evidence, view widgets and request review. They are separate from the background Grok worker. |

## What is demonstrated, and what remains

The dated receipts show a real physical hit reaching SQLite, a background
history lookup, an Inkbox delivery in 10.9 seconds, and the user's confirmation
that the text arrived. This was under the earlier every-hit demo policy. The
new selective single-reading and cluster paths passed with a real Grok model,
isolated databases and fake messengers. They created no new live rows or phone
texts. A subsequent controlled held tap produced one event, 32 / 44.65 g, and
the automatic single-reading rule sent a text the user confirmed. Provider
delivery was saved 9.054 seconds after ingestion. Its side was unknown. This
rehearses the held-tap move, not a release drop. Assembly handling also triggered
a separate cluster text, so those records are kept separate from deliberate
test evidence. The latest preflight passed all six software checks.

Both widgets were checked in the local inspector in light and dark themes,
including the practice day/drill controls. ChatGPT and Claude retrieved the
practice comparison and rendered the updated practice view. Claude's previously
clipped view now reports its full height to the host. Both clients have required
one preview Retry on first load; open the views before presenting. Current
client proof and restart checks are in the demo-ready receipt below.

One fresh front-direction test passed after the firmware change. This is not a
validated five-side classifier. Physical drop survival and retention remain
open. Actual trainer adoption, reduced workload and improved player outcomes
have not been measured. Those are the next product questions, not demo results.

Evidence: [current state](../CURRENT_STATE.md),
[physical automatic text](../evidence/automatic-alert-physical-test.json),
[selective cluster test](../evidence/selective-cluster-model-test.json),
[widget checks](../evidence/mcp-review-visuals.json),
[latest software/client rehearsal](../evidence/demo-ready-software.json).

## Editing and second review

The copy pass follows [Humanizer](https://github.com/blader/humanizer/blob/main/SKILL.md):
specific claims, plain actions and no invented certainty. Visual hierarchy follows
[Anthropic's frontend-design guidance](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)
within the user's minimal SVG design. These were read as guidance, not installed
as executable dependencies. Claude reviewed the story, wording and widget fix;
the live tests and saved records determine what this guide claims.

## Short answers for the interviewer

**“Why not just use a threshold?”** “A threshold gets you an alert. This also
gives agents the history and practice context to answer follow-up questions and
show their evidence. We demonstrate those as separate steps.”

**“Does it make football safer?”** “It gives staff another recorded reason to
check a player and review a practice period. We have demonstrated the handoff;
we have not measured injury outcomes.”

**“Does the agent feel pain?”** “It receives a physical event it could not
observe before. The sensors measure helmet motion; the agent can retrieve it,
investigate its context and request human attention.”

**“What makes this useful tomorrow?”** “A trainer can ask who needs attention
and get a player, a reason and the records behind it. The product test is whether
that helps staff act with less searching and less alert noise.”
