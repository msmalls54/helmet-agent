import type { Store } from "./store.js";

export const HELMET_ZONES = ["front", "back", "left", "right", "top"] as const;
export type HelmetZone = typeof HELMET_ZONES[number];
export interface HelmetMap {
  window_minutes: number; from: string; through: string; count: number;
  directed_count: number; undirected_count: number; excluded_count: number;
  zone_weights: Record<HelmetZone, number>;
  display_rule: string;
}

export function helmetMap(store: Store, player: string, helmetId: string, now = Date.now()): HelmetMap {
  const from = new Date(now - 60 * 60_000).toISOString(), through = new Date(now).toISOString();
  const scope = "player=? AND helmet_id=? AND received_at>=? AND received_at<=?";
  const params = [player, helmetId, from, through];
  const total = (store.db.prepare(`SELECT count(*) n FROM impacts WHERE ${scope}`).get(...params) as { n: number }).n;
  // Aggregate in SQLite rather than loading an ever-growing history into the widget.
  const groups = store.db.prepare(`SELECT location,count(*) n,sum(peak_g)/40.0 weight FROM impacts WHERE ${scope}
    AND json_extract(payload,'$.calibration_capture')=0
    AND coalesce(json_extract(payload,'$.simulated'),0)=0
    AND coalesce(json_extract(payload,'$.synthetic'),0)=0
    AND coalesce(json_extract(payload,'$.data_source'),'live') NOT IN ('simulated_week','synthetic','sample')
    AND json_extract(payload,'$.fifo_samples')=32
    AND json_extract(payload,'$.gyro_window_complete')=1
    AND json_extract(payload,'$.accel_clipped')=0 AND json_extract(payload,'$.gyro_clipped')=0
    AND coalesce(json_extract(payload,'$.accel_window_left_censored'),0)=0 GROUP BY location`)
    .all(...params) as { location: string; n: number; weight: number }[];
  const zone_weights: Record<HelmetZone, number> = { front: 0, back: 0, left: 0, right: 0, top: 0 };
  let directed_count = 0, undirected_count = 0;
  for (const group of groups) {
    if ((HELMET_ZONES as readonly string[]).includes(group.location)) {
      zone_weights[group.location as HelmetZone] += group.weight;
      directed_count += group.n;
    } else {
      for (const zone of HELMET_ZONES) zone_weights[zone] += group.weight;
      undirected_count += group.n;
    }
  }
  return { window_minutes: 60, from, through, count: directed_count + undirected_count,
    directed_count, undirected_count, excluded_count: total - directed_count - undirected_count,
    zone_weights,
    display_rule: "Darker means more or stronger complete recorded readings in the last 60 minutes. Named directions add to that zone; undirected readings add equally to every zone and still count as one event. Weights are visual only, not injury risk, force, dose or a head-acceleration estimate. Incomplete, clipped and calibration captures are excluded." };
}
