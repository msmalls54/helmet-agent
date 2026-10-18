import type { compactImpact } from "./impacts.js";

type Hit = ReturnType<typeof compactImpact>;
export interface AlertPolicy {
  singleG: number; clusterCount: number; clusterWindowMs: number;
  clusterMinG: number; clusterCooldownMs: number;
}
// Adjustable demonstration review rules; never medical or injury thresholds.
export const defaultAlertPolicy: AlertPolicy = {
  singleG: 40, clusterCount: 3, clusterWindowMs: 90000, clusterMinG: 10,
  clusterCooldownMs: 300000,
};
export function readAlertPolicy(env = process.env): AlertPolicy {
  const number = (name: string, fallback: number, min: number, max: number, integer = false) => {
    const value = env[name] === undefined ? fallback : Number(env[name]);
    if (!Number.isFinite(value) || value < min || value > max || integer && !Number.isInteger(value))
      throw new Error(`${name} is outside its supported range.`);
    return value;
  };
  return {
    singleG: number("HELMET_ALERT_SINGLE_G", 40, 1, 1000),
    clusterCount: number("HELMET_ALERT_CLUSTER_COUNT", 3, 2, 10, true),
    clusterWindowMs: number("HELMET_ALERT_CLUSTER_SECONDS", 90, 10, 600) * 1000,
    clusterMinG: number("HELMET_ALERT_CLUSTER_MIN_G", 10, 0, 1000),
    clusterCooldownMs: number("HELMET_ALERT_CLUSTER_COOLDOWN_SECONDS", 300, 30, 3600) * 1000,
  };
}
export const captureNeedsReview = (hit: Hit) => hit.quality.fifo_samples !== 32 ||
  !hit.quality.gyro_window_complete || hit.quality.accel_clipped || hit.quality.gyro_clipped ||
  hit.quality.accel_window_left_censored;

export function assessAlert(hit: Hit, history: Hit[], policy = defaultAlertPolicy) {
  // Compare physical device intervals within ONE boot. A backlog uploaded together
  // must not become a false cluster just because receipt times are close.
  const recent = [...new Map(history.filter(h => h.player === hit.player && h.helmet_id === hit.helmet_id &&
    h.boot_id === hit.boot_id && h.impact_id <= hit.impact_id && !h.quality.calibration_capture &&
    !captureNeedsReview(h) && h.peak_g >= policy.clusterMinG &&
    ((hit.device_ms - h.device_ms) >>> 0) <= policy.clusterWindowMs).map(h => [h.impact_id, h])).values()];
  const currentUsable = recent.some(h => h.impact_id === hit.impact_id);
  const reason = hit.peak_g >= policy.singleG ? "large_reading" as const :
    currentUsable && recent.length >= policy.clusterCount ? "recent_cluster" as const : "below_policy" as const;
  return {
    eligible: reason !== "below_policy", reason, thresholds: policy,
    recent_usable_count: recent.length,
    evidence_ids: reason === "recent_cluster" ? recent.sort((a,b) => b.impact_id-a.impact_id).slice(0,10).map(h => h.impact_id) : [hit.impact_id],
    summary: reason === "large_reading" ? `${hit.peak_g.toFixed(1)} g meets the configured ${policy.singleG} g demo review setting.` :
      reason === "recent_cluster" ? `${recent.length} usable hits at or above ${policy.clusterMinG} g within ${policy.clusterWindowMs / 1000} seconds on the same device boot.` :
      "Recorded in history; neither the configured single-reading nor recent-cluster rule is met.",
    time_basis: "same-boot device milliseconds, through this event; no inferred drill participation",
    peer_comparison: "unavailable: this live helmet has no team observation/drill schedule",
    interpretation: "Configurable empty-helmet demo review rules, not injury thresholds or a diagnosis. A human trainer decides.",
  };
}
export type AlertAssessment = ReturnType<typeof assessAlert>;
