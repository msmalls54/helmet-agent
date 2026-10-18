// Fictional demo fixtures, never inserted into the live impacts/reviews database.
export interface PracticeHit {
  event_id: string; impact_id: number | null; simulated: boolean;
  player: string; position: string | null; helmet_id: string;
  observed_at: string; peak_g: number; location: string;
  drill: string | null; period_id: string | null; capture_profile: string | null;
  practice_role: string | null; drill_label: string | null; session_type: string | null;
  quality_ok: boolean;
}
export interface PracticePeriod {
  id: string; simulated: true; player: string; day: string; drill: string;
  session_type: "practice" | "game"; starts_at: string; observed_minutes: number;
  ends_at: string; drill_label: string; practice_role: string;
  contact_plan: string; dress: string; coverage: "complete_synthetic_observation";
}
export interface PracticePlayer {
  player: string; position: string; practice_role: string; years_played: number;
  reported_prior_concussions: number; reported_concussion_years: number[];
}
export const PRACTICE_PLAYERS: PracticePlayer[] = [
  { player: "#72", position: "OL", practice_role: "Second-team right guard; scout offense vs starting defense", years_played: 8, reported_prior_concussions: 4, reported_concussion_years: [2020, 2021, 2023, 2025] },
  { player: "#44", position: "LB", practice_role: "Starting defense; faces scout offense", years_played: 6, reported_prior_concussions: 0, reported_concussion_years: [] },
  { player: "#21", position: "RB", practice_role: "Second-team running back; scout offense vs starting defense", years_played: 8, reported_prior_concussions: 5, reported_concussion_years: [2019, 2020, 2022, 2024, 2025] },
];
export const DEMO_AS_OF = "2026-10-17T07:00:00.000Z";
export const DEMO_LABEL = "SIMULATED WEEK — fictional players, impacts and practice periods; no live athlete data.";
export const FOOTBALL_SOURCES = [
  { title: "Asken et al., drill-specific collegiate football impacts", url: "https://pubmed.ncbi.nlm.nih.gov/29987539/",
    use: "Track participation minutes and playing position. Reported drill means varied; fixture counts are invented, not calibrated against this study or transferred injury thresholds." },
  { title: "Urban et al. (2013), high-school football exposure", url: "https://saveinjuredkids.org/wp-content/uploads/2015/03/Urban-et-al-Head-Impact-Exposure-in-Youth-Football.pdf",
    use: "Scenario scale only: study averages 9.4 impacts/practice and 15.5/game. Fixture values are invented, not participant records or calibrated head-acceleration estimates." },
  { title: "Riddell InSite Analytics sample reports", url: "https://content.riddell.com/wp-content/themes/riddell_2013/assets/img/insite/2023InsiteAnalyticsReportPacket.pdf",
    use: "Practice-period, player and individual-history context. Our simple rules do not reproduce Riddell's proprietary metrics or national norms." },
];

export function simulatedPracticeWeek(): { hits: PracticeHit[]; periods: PracticePeriod[]; players: PracticePlayer[] } {
  const hits: PracticeHit[] = [], periods: PracticePeriod[] = [];
  const roster = [
    { ...PRACTICE_PLAYERS[0], inside: [2, 3, 2, 8], unit: 1, team: 3, scout: 3, game: 16 },
    { ...PRACTICE_PLAYERS[1], inside: [3, 3, 3, 3], unit: 1, team: 3, scout: 2, game: 18 },
    { ...PRACTICE_PLAYERS[2], inside: [1, 2, 1, 2], unit: 0, team: 2, scout: 1, game: 12 },
  ];
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  // Hand-authored, right-skewed illustrative readings, not a fitted clinical model.
  const magnitudes = [12, 14, 16, 18, 19, 20, 21, 22, 24, 27, 32, 39, 58];
  const sides = ["front", "front", "front", "front", "front", "back", "back", "top", "left", "right", "top"];
  roster.forEach((athlete, rosterIndex) => days.forEach((day, dayIndex) => {
    const date = "2026-10-" + (12 + dayIndex);
    const game = dayIndex === 4;
    const plan = game ? [{ drill: "game", label: "Friday game", start: "19:00", minutes: 120, count: athlete.game, contact: "game contact" }] : [
      { drill: "stretch", label: "Stretch / mobility", start: "15:00", minutes: 10, count: 0, contact: "noncontact" },
      { drill: "position_warmup", label: "Position warm-up / footwork", start: "15:10", minutes: 15, count: 0, contact: "noncontact" },
      { drill: "walkthrough", label: "Walkthrough / assignments", start: "15:25", minutes: 10, count: 0, contact: "walk tempo; no planned collision" },
      { drill: "inside_run", label: "Inside run", start: "15:35", minutes: 20, count: athlete.inside[dayIndex], contact: "full-speed blocking / thud; no planned tackle to ground" },
      { drill: "unit", label: athlete.position === "LB" ? "Defense-specific unit" : "Offense-specific unit", start: "15:55", minutes: 15, count: athlete.unit, contact: "controlled unit work" },
      { drill: "team", label: "Team offense vs defense", start: "16:10", minutes: 20, count: athlete.team, contact: "team / thud" },
      { drill: "scout", label: "Scout offense vs starting defense", start: "16:30", minutes: 20, count: athlete.scout, contact: "scout look / thud" },
    ];
    plan.forEach(period => {
      const id = "sim-" + athlete.player.slice(1) + "-" + day.toLowerCase() + "-" + period.drill;
      const starts = Date.parse(date + "T" + period.start + ":00-07:00");
      periods.push({ id, simulated: true, player: athlete.player, day, drill: period.drill,
        session_type: game ? "game" : "practice", starts_at: new Date(starts).toISOString(), observed_minutes: period.minutes,
        ends_at: new Date(starts + period.minutes * 60_000).toISOString(), drill_label: period.label,
        practice_role: athlete.practice_role, contact_plan: period.contact, dress: "full pads", coverage: "complete_synthetic_observation" });
      for (let i = 0; i < period.count; i++) {
        let reading = magnitudes[(i * 5 + dayIndex * 3 + rosterIndex * 2) % magnitudes.length];
        // The repeated-contact example stays BELOW the default 40 g single-hit
        // demo setting: its counts/context must explain the review candidate.
        if (athlete.player === "#72" && day === "Thu" && period.drill === "inside_run") reading = [14,18,16,22,19,24,17,21][i];
        // Largest single event deliberately belongs to another player: volume needs investigation too.
        if (athlete.player === "#21" && game && i === 0) reading = 76;
        hits.push({ event_id: id + "-" + (i + 1), impact_id: null, simulated: true,
          player: athlete.player, position: athlete.position, helmet_id: "sim-helmet-" + athlete.player.slice(1),
          observed_at: new Date(starts + (i + 1) / (period.count + 1) * period.minutes * 60_000).toISOString(),
          peak_g: reading, location: sides[(i + dayIndex * 2 + rosterIndex) % sides.length],
          drill: period.drill, period_id: id, capture_profile: "fictional-fixed-mount-v1", quality_ok: true,
          practice_role: athlete.practice_role, drill_label: period.label, session_type: game ? "game" : "practice" });
      }
    });
  }));
  return { hits: hits.sort((a, b) => a.observed_at.localeCompare(b.observed_at)), periods, players: PRACTICE_PLAYERS };
}
