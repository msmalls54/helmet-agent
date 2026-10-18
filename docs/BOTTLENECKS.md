# Engineering bottlenecks

## Demonstrated result

A real empty-helmet tap reached the laptop over Wi-Fi, entered history, started
the background agent's history check and produced a trainer text. The saved
44.65 g rehearsal includes a delivery receipt and user-confirmed phone arrival.
ChatGPT and Claude retrieved the event and rendered its helmet view.

The demo connects physical events, investigation and a review request. The
following boundaries define the next engineering work; they do not erase that
working flow.

| Bottleneck | Evidence today | Next validation |
| --- | --- | --- |
| Consistent hit-strength ranking | Nine back and nine front attempts produced 17 waveforms. Front group readings generally rose with the user's effort labels; back light/medium readings overlapped. Four recordings had settling flags and one planned light attempt had no captured pulse. | Analyze the preserved waveforms, then validate a chosen metric against repeatable, independently measured input. The live peak calculation remains unchanged. |
| Contact direction | Some captures have a direction; others do not. Unknown events shade the whole helmet, while detected directions shade their zone. | Measure direction accuracy by side across repeated trials. Do not assign an unknown event to a guessed side. |
| Mounting and drop survival | Boards remained fixed through the reported tap checks. A held-tap rehearsal passed. | Qualify the complete assembly for the intended handling. Release-drop survival is still unverified. |
| Real team context | The physical helmet supplies live events. Drill participation, peer comparisons and the practice week currently come from a separate labeled fictional dataset. | Collect real drill schedules, observation time and multiple players before presenting those comparisons as field results. |
| Review settings | Selective single-reading and cluster paths are implemented. The 40 g demo setting triggered a confirmed phone message. | Evaluate alert usefulness with trainers and real observations. The configured setting is a review rule, not a validated injury threshold. |
| Deployment and access | The configured Windows laptop runs the server behind an authenticated MCP tunnel. | Before serving users, add account-bound access, hosted operation and load testing; resolve the dependency findings in the server guide. |

## Inspect the evidence

- [Controlled tap, agent history check and phone receipt](../evidence/controlled-held-rehearsal.json)
- [Completed front/back comparison](../evidence/tap-comparison-results.html)
- [Machine-readable comparison and raw recording hashes](../evidence/tap-comparison-final-result.json)
- [Automatic review rules and delivery controls](AUTOMATIC_ALERTS.md)
- [Server operation and deployment boundaries](../server/README.md)

For the demonstration, use the existing event-to-review flow and describe g as
the helmet sensor's reading. The measurement study is saved; no further taps or
hardware changes are scheduled this round.
