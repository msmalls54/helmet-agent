import { z } from "zod";
import { object, widget, type MCPServer } from "mcp-use/server";
import type { ImpactRow, Store } from "./store.js";
import { TELEMETRY_NOTICE, INTERPRETATION_RULE } from "./telemetry.js";
import { DEMO_AS_OF, DEMO_LABEL, FOOTBALL_SOURCES, simulatedPracticeWeek, type PracticeHit, type PracticePeriod, type PracticePlayer } from "./practice-data.js";

export const exposureSchema = z.object({
  data_source: z.enum(["live", "simulated_week"]).default("live").describe("Live sensor records by default. Choose simulated_week explicitly for fictional practice patterns; never mix the sources."),
  since_minutes: z.number().int().min(1).max(10080).default(10080),
  player: z.string().trim().min(1).max(80).optional().describe("Exact player label, e.g. #44."),
  drill: z.string().trim().min(1).max(80).optional().describe("Exact practice period: stretch, position_warmup, walkthrough, inside_run, unit, team, scout or game. Live records currently have no drill schedule."),
});
const rounded = (n: number) => Math.round(n * 100) / 100;
const footballDate = (iso: string) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date(iso));
export function quantile(values: number[], q: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), index = (sorted.length - 1) * q;
  return rounded(sorted[Math.floor(index)] + (sorted[Math.ceil(index)] - sorted[Math.floor(index)]) * (index % 1));
}
// Compare rates only within the same fully observed fictional practice period.
// Roles remain visible: three different positions are not a validated cohort.
export function compareDrillPeers(hits: PracticeHit[], periods: PracticePeriod[], profiles: PracticePlayer[]) {
  const stats = periods.filter(p => p.session_type === "practice" && p.coverage === "complete_synthetic_observation" &&
    Number.isFinite(p.observed_minutes) && p.observed_minutes > 0).map(p => {
      const rows=hits.filter(h => h.period_id===p.id && h.quality_ok);
      return {...p, count:rows.length, rate:rows.length/p.observed_minutes,
        position:profiles.find(a => a.player===p.player)?.position ?? null, event_ids:rows.map(h=>h.event_id)};
    });
  return stats.map(p => {
    const peers=stats.filter(q => q.player!==p.player && q.starts_at===p.starts_at && q.drill===p.drill &&
      q.drill_label===p.drill_label && q.contact_plan===p.contact_plan && q.dress===p.dress);
    const highest=peers.length ? Math.max(...peers.map(q=>q.rate)) : null;
    const ratio=highest && highest>0 ? p.rate/highest : null;
    const notable=peers.length>=2 && p.count>=5 && highest!==null && (highest===0 || p.rate>=2.5*highest);
    return {player:p.player,period_id:p.id,day:p.day,drill:p.drill,drill_label:p.drill_label,
      count:p.count,observed_minutes:p.observed_minutes,impacts_per_10_minutes:rounded(p.rate*10),event_ids:p.event_ids,
      peers:peers.map(q=>({player:q.player,position:q.position,practice_role:q.practice_role,count:q.count,
        observed_minutes:q.observed_minutes,impacts_per_10_minutes:rounded(q.rate*10)})),
      peer_count:peers.length,ratio_to_highest_peer:ratio===null ? null : rounded(ratio),
      highest_peer_impacts_per_10_minutes:highest===null ? null : rounded(highest*10),notable,
      rule:"At least 5 usable events and 2.5x the highest same-period peer rate, with at least 2 fully observed peers; all-zero peers are reported without division.",
      scope:"Fictional same-drill descriptive comparison across different playing roles; not an injury score or a position-matched norm."};
  });
}
function liveHit(row: ImpactRow): PracticeHit {
  const h = JSON.parse(row.payload);
  return { event_id: "live-" + row.impact_id, impact_id: row.impact_id, simulated: false,
    player: row.player, position: null, helmet_id: row.helmet_id, observed_at: row.received_at,
    peak_g: row.peak_g, location: row.location, drill: null, period_id: null,
    practice_role: null, drill_label: null, session_type: null,
    capture_profile: null, // Legacy/device data do not identify a verified comparable mounting/configuration.
    quality_ok: h.fifo_samples === 32 && h.gyro_window_complete === true && !h.accel_clipped && !h.gyro_clipped && !h.calibration_capture && !h.accel_window_left_censored };
}
export function analyzePractice(hits: PracticeHit[], periods: PracticePeriod[], profiles: PracticePlayer[] = []) {
  const players = [...new Set(hits.map(h => h.player))].sort().map(player => {
    const rows = hits.filter(h => h.player === player), usable = rows.filter(h => h.quality_ok);
    const profile = profiles.find(p => p.player === player);
    return { player, position: rows[0].position, practice_role: profile?.practice_role ?? null,
      medical_history: profile ? { simulated: true, source: "fictional_staff_record", years_played: profile.years_played,
        reported_prior_concussions: profile.reported_prior_concussions, reported_concussion_years: profile.reported_concussion_years,
        interpretation: "Reported history for trainer handoff only. Zero means none reported in this fictional record, not medical clearance. No risk multiplier is calculated." } : null,
      count: rows.length, usable_count: usable.length,
      excluded_quality_count: rows.length - usable.length, median_g: quantile(usable.map(h => h.peak_g), .5),
      p95_g: quantile(usable.map(h => h.peak_g), .95), max_g: usable.length ? Math.max(...usable.map(h => h.peak_g)) : null,
      days: [...new Set(rows.map(h => footballDate(h.observed_at)))].map(date => ({ date, count: rows.filter(h => footballDate(h.observed_at) === date).length })) };
  });
  const periodStats = periods.map(period => {
    const rows = hits.filter(h => h.period_id === period.id), usable = rows.filter(h => h.quality_ok);
    return { ...period, count: rows.length, usable_count: usable.length,
      max_g:usable.length?Math.max(...usable.map(h=>h.peak_g)):null,
      impacts_per_10_minutes: rounded(usable.length / period.observed_minutes * 10),
      event_ids: usable.map(h => h.event_id) };
  });
  const candidates = periodStats.filter(p => p.session_type === "practice" && p.usable_count >= 5).flatMap(period => {
    const prior = periodStats.filter(p => p.player === period.player && p.drill === period.drill && p.session_type === "practice" && p.starts_at < period.starts_at);
    const count = prior.reduce((n, p) => n + p.usable_count, 0), minutes = prior.reduce((n, p) => n + p.observed_minutes, 0);
    if (prior.length < 3 || count === 0) return [];
    const ratio = (period.usable_count / period.observed_minutes) / (count / minutes);
    if (ratio < 2.5) return [];
    return [{ player: period.player, day: period.day, drill: period.drill, period_id: period.id,
      count: period.usable_count, observed_minutes: period.observed_minutes,
      impacts_per_10_minutes: period.impacts_per_10_minutes, prior_periods: prior.length,
      prior_count: count, prior_observed_minutes: minutes, prior_impacts_per_10_minutes: rounded(count / minutes * 10),
      rate_ratio: rounded(ratio), event_ids: period.event_ids,
      reason: period.usable_count + " recorded impacts in " + period.observed_minutes + " observed minutes; " + rounded(ratio) + "x this player's earlier same-drill rate.",
      follow_up: "Trainer: check the player. Coach: review this practice period and its video if available; confirm participation and sensor mounting before changing the drill." }];
  }).sort((a, b) => b.rate_ratio - a.rate_ratio);
  const magnitudeOutliers = hits.filter(h => h.quality_ok).flatMap(hit => {
    if (!hit.capture_profile) return [];
    // Earlier data only: this event and future hits cannot raise their own baseline.
    const baseline = hits.filter(h => h.quality_ok && h.player === hit.player && h.helmet_id === hit.helmet_id && h.capture_profile === hit.capture_profile && h.observed_at < hit.observed_at);
    const median = quantile(baseline.map(h => h.peak_g), .5);
    if (baseline.length < 20 || median === null || median <= 0 || hit.peak_g < 2 * median) return [];
    return [{ event_id: hit.event_id, impact_id: hit.impact_id, simulated: hit.simulated, player: hit.player,
      peak_g: hit.peak_g, baseline_n: baseline.length, prior_median_g: median, ratio_to_prior_median: rounded(hit.peak_g / median),
      rule: "demo rule: at least 2x the same player's prior median on the same helmet/profile, at least 20 earlier usable events; not an injury threshold" }];
  });
  return { players, periods: periodStats, review_candidates: candidates, magnitude_outliers: magnitudeOutliers };
}
export function exposureLoad(store: Store, input: z.input<typeof exposureSchema>, now = Date.now()) {
  const args = exposureSchema.parse(input), simulated = args.data_source === "simulated_week";
  const asOf = simulated ? Date.parse(DEMO_AS_OF) : now;
  const since = new Date(asOf - args.since_minutes * 60_000).toISOString();
  let allHits: PracticeHit[], periods: PracticePeriod[], profiles: PracticePlayer[] = [], truncated = false, total: number | null = null;
  if (simulated) ({ hits: allHits, periods, players: profiles } = simulatedPracticeWeek());
  else {
    const where = "received_at >= ? AND received_at <= ?" + (args.player ? " AND player = ?" : "") + (args.drill ? " AND 0" : "");
    const params = [since, new Date(asOf).toISOString(), ...(args.player ? [args.player] : [])];
    total = (store.db.prepare("SELECT count(*) n FROM impacts WHERE " + where).get(...params) as { n: number }).n;
    const rows = store.db.prepare("SELECT * FROM impacts WHERE " + where + " ORDER BY received_at DESC, impact_id DESC LIMIT 5001").all(...params) as ImpactRow[];
    truncated = rows.length > 5000; allHits = rows.slice(0, 5000).map(liveHit); periods = [];
  }
  const hits = allHits.filter(h => h.observed_at >= since && Date.parse(h.observed_at) <= asOf && (!args.player || h.player === args.player) && (!args.drill || h.drill === args.drill));
  const selectedPeriods = periods.filter(p => p.starts_at >= since && Date.parse(p.starts_at) + p.observed_minutes * 60_000 <= asOf && (!args.player || p.player === args.player) && (!args.drill || p.drill === args.drill));
  // Exclude partial periods from rate comparisons rather than inventing observation time.
  const analysis = analyzePractice(hits, selectedPeriods, profiles);
  const allObservedPeriods=periods.filter(p=>p.starts_at>=since && Date.parse(p.starts_at)+p.observed_minutes*60000<=asOf && (!args.drill || p.drill===args.drill));
  const teamHits=allHits.filter(h=>h.observed_at>=since && Date.parse(h.observed_at)<=asOf && (!args.drill || h.drill===args.drill));
  const peerComparisons=simulated ? compareDrillPeers(teamHits,allObservedPeriods,profiles).filter(p=>!args.player || p.player===args.player) : [];
  const largest=simulated ? [...teamHits].filter(h=>h.quality_ok).sort((a,b)=>b.peak_g-a.peak_g)[0] : undefined;
  const focus = analysis.review_candidates[0];
  const summary = simulated
    ? "Sample practice: " + (focus ? focus.player + " stands out in " + focus.day + " " + focus.drill.replaceAll("_", " ") + ": " + focus.reason : hits.length + " recorded impacts; no practice-period spike meets the demo rule.")
    : "LIVE SENSOR RECORDS: " + total + " impacts" + (truncated ? " (latest 5000 analyzed)" : "") + ". No drill schedule or comparable mounting profile is recorded; practice rates and personal outlier alerts are unavailable.";
  return { data_source: args.data_source, simulated, label: simulated ? DEMO_LABEL : "LIVE SENSOR RECORDS — physical helmet tests",
    summary, as_of: new Date(asOf).toISOString(), since, count: total ?? hits.length, analysis_record_count: hits.length, truncated,
    calendar_time_zone: "America/Los_Angeles",
    time_basis: simulated ? "fictional occurrence timestamps and explicit per-player observation periods" : "server receipt time; queued delivery can arrive later than the hit",
    ...analysis, peer_comparisons:peerComparisons,
    peer_review_candidates:peerComparisons.filter(p=>p.notable),
    team_context:simulated ? {players:profiles.map(p=>({player:p.player,position:p.position,practice_role:p.practice_role})),
      largest_single_event:largest ? {player:largest.player,peak_g:largest.peak_g,event_id:largest.event_id,session_type:largest.session_type} : null,
      scope:"The three fictional players in this fixture, not a full team or a validated position-matched reference group."} : null,
    events_truncated: hits.length > 60,
    events: [...hits].sort((a, b) => a.observed_at.localeCompare(b.observed_at)).slice(-60).map(h => ({
      event_id: h.event_id, impact_id: h.impact_id, simulated: h.simulated, player: h.player,
      position: h.position, practice_role: h.practice_role, observed_at: h.observed_at,
      peak_g: h.peak_g, location: h.location, drill: h.drill, drill_label: h.drill_label, period_id: h.period_id,
      quality_ok: h.quality_ok, reviewable_impact_id: h.simulated ? null : h.impact_id })),
    baseline_status: simulated ? "fictional fixed mounting; historical comparisons use earlier same-player records only" : "insufficient verified comparable baseline; no live personal outlier alerts",
    medical_history_rule: "Mention fictional staff-reported history only when the user asks. Keep it separate from contact-based findings; never use it to rank players, calculate risk, diagnose injury or clear participation. Missing live history stays unknown.",
    comparison_rule: "Practice-period signal: at least 5 usable events and 2.5x own earlier same-drill rate, with at least 3 complete prior periods. This is an explainable demo heuristic, not Riddell's algorithm or a medical threshold.",
    follow_up_boundary: "No diagnosis, return-to-play decision, video analysis or message is performed. Fictional IDs cannot be passed to flag_for_review; that tool accepts live database impact IDs only.",
    sources: simulated ? FOOTBALL_SOURCES : [], notice: TELEMETRY_NOTICE, interpretation_rule: INTERPRETATION_RULE };
}
export function registerPractice(server: MCPServer, store: Store) {
  server.tool({ name: "exposure_load", description: "Investigate who recorded more contact and during which drill. Compare hits per observed minute with the player's earlier drills and other players in the same period. Choose simulated_week for the fictional #72 OL, #44 LB and #21 RB practice data; live records have no drill or teammate schedule. Returns counts, comparisons and supporting event IDs. Mention staff-reported medical history only when asked; never use it to rank players or infer risk. Sends no message. " + TELEMETRY_NOTICE + " " + INTERPRETATION_RULE,
    schema: exposureSchema, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } }, async args => object(exposureLoad(store, args)));
  server.tool({ name: "show_practice_week", description: "Open the sample practice trends for #72 OL, #44 LB or #21 RB. Starts at Thursday inside run. Select a day or drill to compare contact with earlier practices and other players in that period. Sample data is separate from live helmet readings. Sends no message. " + TELEMETRY_NOTICE,
    schema: z.object({ player: z.enum(["#72", "#44", "#21"]).default("#72") }),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    widget: { name: "practice", invoking: "Loading practice trends…", invoked: "Practice trends shown" } }, async args => {
      const report = exposureLoad(store, { data_source: "simulated_week", player: args.player });
      // The visual needs observation counts and comparisons, not every event or
      // repeated evidence paragraph. Full records remain in exposure_load.
      const view = {
        data_source: report.data_source, simulated: report.simulated, summary: report.summary,
        players: report.players.map(p => ({ player:p.player, position:p.position, practice_role:p.practice_role })),
        periods: report.periods.map(p => ({ id:p.id, day:p.day, drill:p.drill, drill_label:p.drill_label,
          session_type:p.session_type, starts_at:p.starts_at, observed_minutes:p.observed_minutes,
          usable_count:p.usable_count, impacts_per_10_minutes:p.impacts_per_10_minutes, max_g:p.max_g })),
        review_candidates: report.review_candidates.map(p => ({period_id:p.period_id})),
        peer_comparisons: report.peer_comparisons.map(p => ({period_id:p.period_id, notable:p.notable,
          peer_count:p.peer_count, ratio_to_highest_peer:p.ratio_to_highest_peer,
          peers:p.peers.map(q => ({player:q.player,position:q.position,count:q.count,
            observed_minutes:q.observed_minutes,impacts_per_10_minutes:q.impacts_per_10_minutes}))})),
        team_context: report.team_context ? {largest_single_event:report.team_context.largest_single_event} : null,
      };
      return widget({ props: { report:view }, message: report.summary + " " + TELEMETRY_NOTICE });
    });
}
