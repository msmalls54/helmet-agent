import { z } from "zod";
import { heartbeatSchema } from "./telemetry.js";

// A reachable HTTP server is not proof that the helmet is connected or detecting.
const healthSchema = z.object({
  ok: z.literal(true), service: z.literal("helmet-agent"),
  heartbeats: z.array(heartbeatSchema.extend({ received_at: z.string().datetime() })),
});
export function inspectHelmetHealth(value: unknown, now = Date.now(), helmetId = "helmet-1") {
  const parsed = healthSchema.safeParse(value);
  if (!parsed.success) return { ok: false, problems: ["Server returned an invalid helmet health response."], heartbeat: null };
  const beat = parsed.data.heartbeats.find(h => h.helmet_id === helmetId);
  if (!beat) return { ok: false, problems: ["No heartbeat from " + helmetId + ". Check its power and private Wi-Fi link."], heartbeat: null };
  const age = (now - Date.parse(beat.received_at)) / 1000;
  const problems: string[] = [];
  if (age < -5 || age > 30) problems.push("Helmet heartbeat is stale or the laptop clock changed. Check power and Wi-Fi.");
  if (!beat.calibrated) problems.push("Saved orientation calibration is missing.");
  if (beat.diagnostic_mode !== "normal" || beat.impact_detection_paused !== false) problems.push("Normal impact detection is not confirmed. End calibration/probe mode and wait for a new heartbeat.");
  if (beat.queued_hits !== 0) problems.push("Hits are still queued on the helmet. Wait for delivery and rerun this check.");
  if (beat.dropped_hits !== 0) problems.push("The helmet reports dropped hits during this boot. Inspect the connection before the demo.");
  return { ok: problems.length === 0, problems, heartbeat: {
    helmet_id: beat.helmet_id, player: beat.player, boot_id: beat.boot_id,
    received_at: beat.received_at, age_seconds: Math.round(age * 10) / 10,
    calibrated: beat.calibrated, diagnostic_mode: beat.diagnostic_mode,
    impact_detection_paused: beat.impact_detection_paused,
    queued_hits: beat.queued_hits, dropped_hits: beat.dropped_hits, rssi: beat.rssi,
  } };
}
