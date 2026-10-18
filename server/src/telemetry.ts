import { z } from "zod";

export const TELEMETRY_NOTICE = "Relative helmet-impact telemetry, not a diagnosis; a human trainer decides.";
export const INTERPRETATION_RULE = "These sensors measure the helmet's inner shell. Report capture quality; keep head-impact thresholds, injury scores, severity labels and return-to-play decisions out of the answer. Send review requests to the human trainer.";
const identity = {
  helmet_id: z.string().trim().min(1).max(80),
  player: z.string().trim().min(1).max(80),
  boot_id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
};
const finite = z.number().finite();
export const impactSchema = z.object({
  type: z.literal("impact"), ...identity,
  id: z.number().int().nonnegative().max(4294967295),
  ms: z.number().int().nonnegative().max(4294967295),
  peak_g: finite.min(0).max(1000),
  peak_rot_rads: finite.min(0).max(1000),
  peak_rot_dps: finite.min(0).max(60000),
  location: z.enum(["front", "back", "left", "right", "top", "unknown", "uncalibrated"]),
  location_validated: z.boolean(),
  ax: finite, ay: finite, az: finite,
  fifo_samples: z.number().int().min(0).max(32),
  gyro_window_complete: z.boolean(),
  accel_clipped: z.boolean(), gyro_clipped: z.boolean(),
  calibration_capture: z.boolean(),
}).passthrough();
export const heartbeatSchema = z.object({
  type: z.literal("heartbeat"), ...identity,
  uptime_ms: z.number().int().nonnegative().max(4294967295),
  rssi: finite.min(-150).max(0),
  calibrated: z.boolean(),
  queued_hits: z.number().int().min(0).max(50),
  dropped_hits: z.number().int().nonnegative(),
}).passthrough();
export type Impact = z.infer<typeof impactSchema>;
export type Heartbeat = z.infer<typeof heartbeatSchema>;

// Stable ordering makes identical retry bodies equal even if JSON keys move.
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
