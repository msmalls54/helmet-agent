import { z } from "zod";
import type { MCPServer } from "mcp-use/server";
import { object } from "mcp-use/server";
import { Store, type ImpactRow } from "./store.js";
import { TELEMETRY_NOTICE, INTERPRETATION_RULE, type Impact } from "./telemetry.js";

export const getImpactsSchema = z.object({
  since_minutes: z.number().min(1).max(10080).default(60).describe("Look back from server receipt time, 1 minute to 7 days."),
  min_g: z.number().min(0).max(1000).default(0).describe("Minimum relative helmet-impact magnitude, in g."),
  player: z.string().trim().min(1).max(80).optional().describe("Exact player label, for example #44."),
});
export function compactImpact(row: ImpactRow) {
  const hit = JSON.parse(row.payload) as Impact;
  return {
    impact_id: row.impact_id, received_at: row.received_at,
    boot_id: row.boot_id, device_ms: row.device_ms,
    helmet_id: row.helmet_id, player: row.player, peak_g: hit.peak_g,
    peak_rot_rads: hit.peak_rot_rads, peak_rot_dps: hit.peak_rot_dps,
    location: hit.location, location_validated: hit.location_validated,
    location_method: typeof hit.location_method === "string" ? hit.location_method : null,
    location_confidence: typeof hit.location_confidence === "number" ? hit.location_confidence : null,
    location_confidence_basis: typeof hit.location_confidence_basis === "string" ? hit.location_confidence_basis : null,
    gyro_peak_sensor_dps: hit.gyro_peak_sensor_dps ?? null,
    gyro_axis_frame: typeof hit.gyro_axis_frame === "string" ? hit.gyro_axis_frame : null,
    quality: { fifo_samples: hit.fifo_samples, gyro_window_complete: hit.gyro_window_complete,
      accel_clipped: hit.accel_clipped, gyro_clipped: hit.gyro_clipped,
      accel_window_left_censored: hit.accel_window_left_censored === true,
      initial_pulse_samples: typeof hit.initial_pulse_samples === "number" ? hit.initial_pulse_samples : null,
      calibration_capture: hit.calibration_capture },
  };
}
export function getImpacts(store: Store, input: z.input<typeof getImpactsSchema>, now = Date.now()) {
  const args = getImpactsSchema.parse(input);
  const since = new Date(now - args.since_minutes * 60_000).toISOString();
  const where = "received_at >= ? AND peak_g >= ?" + (args.player ? " AND player = ?" : "");
  const params: (string | number)[] = [since, args.min_g];
  if (args.player) params.push(args.player);
  const total = (store.db.prepare(`SELECT COUNT(*) AS count FROM impacts WHERE ${where}`).get(...params) as { count: number }).count;
  const rows = store.db.prepare(`SELECT * FROM impacts WHERE ${where} ORDER BY impact_id DESC LIMIT 200`).all(...params) as ImpactRow[];
  const maximum = store.db.prepare(`SELECT * FROM impacts WHERE ${where} ORDER BY peak_g DESC, impact_id DESC LIMIT 1`).get(...params) as ImpactRow | undefined;
  const maxHit = maximum ? compactImpact(maximum) : undefined;
  const direction = maxHit && ["front", "back", "left", "right", "top"].includes(maxHit.location)
    ? `, ${maxHit.location_validated ? "" : "estimated "}${maxHit.location} side` : "";
  const filter = `${args.since_minutes} min${args.player ? ` for ${args.player}` : ""}${args.min_g ? ` at or above ${args.min_g} g` : ""}`;
  const summary = `${total} ${total === 1 ? "hit" : "hits"} in last ${filter}` +
    (maxHit ? `, max ${Number(maxHit.peak_g.toFixed(2))} g on ${maxHit.player}${direction}` : "") + ".";
  return {
    summary, count: total, hits: rows.map(compactImpact), truncated: total > rows.length,
    time_basis: "server_received_at; buffered delivery can arrive later than the hit",
    last_heartbeats: store.lastHeartbeats().filter(h => !args.player || h.player === args.player),
    notice: TELEMETRY_NOTICE,
    interpretation_rule: INTERPRETATION_RULE,
  };
}
export function registerGetImpacts(server: MCPServer, store: Store) {
  server.tool({ name: "get_impacts", description: `Read live helmet hits. Filter by minutes, minimum reading or player. Returns saved impact IDs, time, reading, sensor direction and capture quality. Use show_last_hit for the visual. ${TELEMETRY_NOTICE} ${INTERPRETATION_RULE}`,
    schema: getImpactsSchema, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } },
    async args => object(getImpacts(store, args)));
}
