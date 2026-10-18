# Nine-tap comparison

Goal: see whether **your light, medium and firm taps produce increasing readings**
with the existing boards, mounting and wiring. The helmet stays empty, upright
on the same table. This is a hand-labeled repeatability check at one contact
point; there is no measured-force reference.

**Completed result:** [nine back and nine front attempts](../evidence/tap-comparison-results.html)
saved 17 waveforms: 13 clean, four settling flags and one uncaptured front-light
attempt. Neither all-nine-usable criterion passed. The test improved recording
and diagnosis, but did not establish reliable hardness ranking or change the
normal live peak metric. No further physical taps are planned this round.

**October 17 protocol update:** the user requested the full nine back attempts
and a separate nine front attempts after back firm 2 failed the settling guard.
Resume preserves the first four files, including that rejection. With
`--continue-settling`, a settling-only flag no longer ends the sequence; it stays
excluded from the primary comparison. Missing data, clipping and read faults
still stop. The 0.6 g limit and firmware are unchanged. The first triplet was
disclosed before resuming, and bench entry establishes a fresh local baseline;
record those interruptions rather than describing this as a fully blinded run.

## Physical setup

1. Keep the helmet on the table in one orientation throughout the test.
2. Choose one solid back-shell spot above the rear padding. Mark it with a small
   piece of removable tape if available. Use that exact spot and the same knuckle.
3. Keep the USB lead slack. Use the same light hold on the facemask for each tap
   if needed to prevent sliding. Do not change the support between tap strengths.
4. One quick tap when prompted. Let it settle between attempts. No punches,
   releases, drops or extra equipment required.

There are **nine taps total**, three per level. The fixed order balances each
level across early, middle and late positions:

| Round | First | Second | Third |
| --- | --- | --- | --- |
| 1 | Light | Medium | Firm |
| 2 | Firm | Light | Medium |
| 3 | Medium | Firm | Light |

The recorder keeps magnitudes hidden until the end, so an earlier result does
not encourage changing the next tap. If you accidentally double-tap, tell the
operator; keep that attempt and note it. Do not replace it quietly.

## Install and run

Installing needs laptop USB briefly. Ordinary bank-powered Wi-Fi operation does
not provide a firmware-upload connection. Saved orientation is preserved.

```powershell
& .\tools\Build-TapComparison.ps1 -Upload -Port COM3
python .\tools\serial_capture.py --port COM3 --seconds 8 --send status --log .\evidence\tap-precheck.log
python .\tools\tap_comparison.py session --port COM3 --directory .\evidence\tap-comparison-20261017
```

Use a fresh directory for each session. The plan and attempt files are created
exclusively and cannot be overwritten. Keep the one Serial connection open for
all nine attempts. Press Enter when ready for the next prompt, then tap only
after `READY`. Each armed window lasts 60 seconds. A missing or bad recording
ends the session rather than asking for unlimited repeats.

To finish the existing back sequence without overwriting its attempts, then
record front contacts in a **separate** directory:

```powershell
python .\tools\tap_comparison.py session --port COM3 --directory .\evidence\tap-comparison-20261017-retry1 --site back --resume --continue-settling
python .\tools\tap_comparison.py session --port COM3 --directory .\evidence\tap-comparison-front-20261017 --site front --continue-settling
```

For front contacts use one fixed solid-shell spot directly above the facemask.
Keep the same orientation and support within each site. Never pool front and
back readings. Nine attempts recorded and nine usable recordings are separate
report fields; retaining a rejected attempt does not turn it into a pass.

The operator can also capture one labeled trial at a time with the `capture`
subcommand; `stop --port COM3` restores normal mode. The full session runs `stop`
in its cleanup path. Always check the acknowledgement and the normal heartbeat.

## What changed

- Bench mode streams the existing ADXL375 FIFO at **800 Hz over 400 kHz I2C**.
  It retains 20 ms before onset and up to 200 ms afterward, ending after a 20 ms
  below-2-g quiet tail. A later crossing during that tail extends the same event.
- A local stationary baseline is measured on entry; the normal baseline and
  orientation in Preferences are untouched. A shifted resting tail is flagged.
- The saved waveform includes numbered XYZ samples and the nominal sample period.
  FIFO full/overrun, I2C faults, clipping and window limits invalidate comparison.
- Raw peak g is the **preselected primary measurement**. The 5 ms trailing mean
  of acceleration magnitudes (four samples), sampled pulse span/time above 2 g,
  and acceleration-magnitude area in g·ms remain separate supporting readings.
  Area uses the first-to-last above-threshold span with neighboring samples for
  trapezoidal bracketing. It is not force impulse, energy or velocity change.
- Gyro peak is retained from the estimated +/-30 ms peak window, with its own
  completeness/clipping flags. No invented alignment with the head axes.
- No bench result is queued or POSTed as a live impact. Heartbeats mark normal
  impact detection as paused. Normal detection returns on `stop`, restart, or
  ten minutes without another trial. The bench mode is never saved to Preferences.
- Normal-mode impacts also gain a **captured-window** pulse summary. Their
  existing 1600 Hz peak, calibration and alert settings retain their meanings.

The bench bandwidth is 400 Hz versus normal mode's 800 Hz, so do not compare its
peak directly to the previous 44.6 g normal-mode event. This test compares all
nine recordings under the same bench settings. Duration and gyro timing remain
sampled estimates; nominal ODR is not an independently measured clock reference.

## Result

The session saves `comparison.json` and a readable `comparison.html`. Success
means all nine acceleration recordings are usable and the raw group medians
increase **light < medium < firm**. The report also shows overlap and every
attempt. Missing, clipped or incomplete attempts make the outcome incomplete.
The software never swaps in a secondary metric to manufacture a pass.

A positive result supports only this setup and your effort labels. It does not
establish equal response across sides, contact force or player head acceleration.

Manufacturer references: [ADXL375 FIFO, I2C and mounting](https://www.analog.com/media/en/technical-documentation/data-sheets/ADXL375.PDF),
[shock amplitude and duration](https://www.analog.com/en/resources/app-notes/an-1266.html).
