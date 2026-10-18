import { compactImpact } from "./impacts.js";
import { captureNeedsReview, validateAgentReview, type AlertAgent, type AlertHistory } from "./alert-agent.js";
import type { Reviews } from "./reviews.js";
import type { ImpactRow, Store } from "./store.js";
import { assessAlert, defaultAlertPolicy, readAlertPolicy, type AlertPolicy } from "./alert-policy.js";

export interface AlertConfig {
  mode: "off" | "dry_run" | "live"; helmetId: string; player: string;
  cooldownMs: number; maxPerDay: number; maxAgeMs: number;
  policy: AlertPolicy;
}
export const defaultAlertConfig: AlertConfig = { mode: "off", helmetId: "helmet-1", player: "#44",
  cooldownMs: 30000, maxPerDay: 20, maxAgeMs: 60000, policy: defaultAlertPolicy };
export function readAlertConfig(env = process.env): AlertConfig {
  const mode = env.HELMET_ALERT_MODE ?? "off";
  if (!["off", "dry_run", "live"].includes(mode)) throw new Error("HELMET_ALERT_MODE must be off, dry_run or live.");
  return { ...defaultAlertConfig, mode: mode as AlertConfig["mode"],
    helmetId: env.HELMET_ALERT_HELMET_ID || "helmet-1", player: env.HELMET_ALERT_PLAYER || "#44", policy: readAlertPolicy(env) };
}
interface Job {
  impact_id: number; state: string; attempts: number; delivery_attempts: number;
  model_attempted_at: string | null; review_requested_at: string | null;
  analysis: string | null; note: string | null; result: string | null;
  detail: string | null; updated_at: string;
}
export class AlertLoop {
  private timer?: NodeJS.Timeout;
  private active?: Promise<void>;
  private stopped = false;
  constructor(private store: Store, private reviews: Reviews, private agent: AlertAgent | undefined,
    readonly config: AlertConfig, private log = console.log, private now = Date.now,
    private testLabel = "") {
    store.db.exec(`CREATE TABLE IF NOT EXISTS alert_cursor (id INTEGER PRIMARY KEY CHECK(id=1), impact_id INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS alert_jobs (
        impact_id INTEGER PRIMARY KEY REFERENCES impacts(impact_id), state TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0, delivery_attempts INTEGER NOT NULL DEFAULT 0,
        model_attempted_at TEXT, review_requested_at TEXT, analysis TEXT, note TEXT, result TEXT, detail TEXT, policy TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      ); CREATE INDEX IF NOT EXISTS alert_jobs_state ON alert_jobs(state, impact_id);`);
    const columns = store.db.prepare("PRAGMA table_info(alert_jobs)").all() as { name: string }[];
    if (!columns.some(c => c.name === "policy")) store.db.exec("ALTER TABLE alert_jobs ADD COLUMN policy TEXT");
    if (config.mode !== "off") {
      // First activation starts AFTER the existing DB. Restarts retain only already-enqueued unfinished work.
      store.db.prepare("INSERT OR IGNORE INTO alert_cursor SELECT 1, COALESCE(MAX(impact_id),0) FROM impacts").run();
      store.db.prepare("UPDATE alert_jobs SET state='pending' WHERE state='deciding'").run();
    }
  }
  start() {
    if (this.config.mode === "off" || !this.agent || this.timer) return;
    this.stopped = false;
    this.timer = setInterval(() => { void this.tick(); }, 500); this.timer.unref();
    void this.tick();
    this.log(`[AUTO] ${this.config.mode} selective demo reviews for ${this.config.player}: ${this.config.policy.singleG}g or ${this.config.policy.clusterCount} hits/${this.config.policy.clusterWindowMs/1000}s; ${this.config.maxPerDay}/24h cap.`);
  }
  tick(): Promise<void> {
    if (this.active) return this.active;
    if (this.stopped || this.config.mode === "off" || !this.agent) return Promise.resolve();
    this.active = this.perform().catch(() => {
      this.log("[AUTO] Worker storage/processing error; check local health. No new send key created.");
    }).finally(() => { this.active = undefined; });
    return this.active;
  }
  async stop() { this.stopped = true; clearInterval(this.timer); this.timer = undefined; await this.active; }
  status() {
    const counts = this.store.db.prepare("SELECT state, count(*) count FROM alert_jobs GROUP BY state").all();
    const latest = this.store.db.prepare("SELECT impact_id,state,attempts,delivery_attempts,detail,updated_at FROM alert_jobs ORDER BY impact_id DESC LIMIT 5").all();
    const previous = this.store.db.prepare(`SELECT MAX(j.review_requested_at) time FROM alert_jobs j JOIN impacts i USING(impact_id)
      WHERE i.player=? AND j.review_requested_at IS NOT NULL`).get(this.config.player) as {time:string|null};
    const used = (this.store.db.prepare("SELECT count(*) n FROM alert_jobs WHERE model_attempted_at>=?")
      .get(new Date(this.now()-86400000).toISOString()) as {n:number}).n;
    const wait = (ms:number) => previous.time ? Math.max(0,Math.ceil((Date.parse(previous.time)+ms-this.now())/1000)) : 0;
    return { mode: this.config.mode, armed: this.config.mode !== "off" && !!this.agent && !this.stopped,
      model: this.agent?.model ?? null, blocked_reason: this.config.mode !== "off" && !this.agent ? "missing_model_key" : null,
      policy: "selective empty-helmet demo: configured single reading or recent cluster; agent reads history before review; no injury threshold",
      review_rules: this.config.policy,
      helmet_id: this.config.helmetId, player: this.config.player,
      review_readiness: { single_cooldown_seconds_remaining:wait(this.config.cooldownMs),
        cluster_cooldown_seconds_remaining:wait(this.config.policy.clusterCooldownMs),
        review_jobs_remaining_24h:Math.max(0,this.config.maxPerDay-used) },
      cooldown_seconds: this.config.cooldownMs / 1000, max_reviews_per_24h: this.config.maxPerDay,
      max_event_age_seconds: this.config.maxAgeMs / 1000, counts, latest };
  }
  private finish(id: number, state: string, detail: string) {
    this.store.db.prepare("UPDATE alert_jobs SET state=?,detail=?,updated_at=? WHERE impact_id=?")
      .run(state, detail, new Date(this.now()).toISOString(), id);
    this.log(`[AUTO] Impact ${id}: ${state} (${detail}).`);
  }
  private readHistory(hit: ImpactRow): AlertHistory {
    const since = new Date(Date.parse(hit.received_at) - 60 * 60000).toISOString();
    const params = [hit.helmet_id, hit.player, since, hit.received_at, hit.impact_id];
    const where = "helmet_id=? AND player=? AND received_at>=? AND received_at<=? AND impact_id<=? AND json_extract(payload,'$.calibration_capture')=0 AND COALESCE(json_extract(payload,'$.simulated'),0)=0 AND lower(substr(boot_id,1,4)) NOT IN ('sim-','sim_')";
    const count = (this.store.db.prepare("SELECT count(*) count FROM impacts WHERE " + where).get(...params) as { count: number }).count;
    const hits = (this.store.db.prepare("SELECT * FROM impacts WHERE " + where + " ORDER BY impact_id DESC LIMIT 50").all(...params) as ImpactRow[]).map(compactImpact);
    return { count, returned_count: hits.length, truncated: count > hits.length, since, through: hit.received_at,
      policy: assessAlert(compactImpact(hit), hits, this.config.policy),
      time_basis: "server receipt time through this event; queued delivery can arrive late; not the physical occurrence time", hits };
  }
  private guard(hit: ImpactRow): string | null {
    const raw = JSON.parse(hit.payload);
    if (hit.helmet_id !== this.config.helmetId || hit.player !== this.config.player) return "outside configured helmet/player";
    if (raw.calibration_capture || raw.simulated || raw.diagnostic_mode && raw.diagnostic_mode !== "normal" || /^sim[-_]/i.test(hit.boot_id)) return "calibration/simulated/diagnostic record";
    if (this.now() - Date.parse(hit.received_at) > this.config.maxAgeMs) return "event expired";
    const beat = this.store.lastHeartbeats().find(h => h.helmet_id === hit.helmet_id);
    if (!beat || beat.boot_id !== hit.boot_id || beat.player !== hit.player || !beat.calibrated ||
      beat.diagnostic_mode !== "normal" || beat.impact_detection_paused !== false ||
      this.now() - Date.parse(beat.received_at) > 30000) return "waiting for fresh calibrated normal-mode heartbeat from the same boot";
    // Same-boot device clocks reveal old offline-queued events, including millis wrap.
    const estimate = beat.uptime_ms + this.now() - Date.parse(beat.received_at);
    const age = ((estimate - hit.device_ms + 2147483648) % 4294967296 + 4294967296) % 4294967296 - 2147483648;
    if (age > this.config.maxAgeMs || age < -5000) return "stale or inconsistent device time";
    return null;
  }
  private async perform() {
    const iso = new Date(this.now()).toISOString();
    this.store.db.transaction(() => {
      const cursor = this.store.db.prepare("SELECT impact_id FROM alert_cursor WHERE id=1").get() as { impact_id: number };
      const ids = this.store.db.prepare("SELECT impact_id FROM impacts WHERE impact_id>? ORDER BY impact_id LIMIT 100").all(cursor.impact_id) as { impact_id: number }[];
      for (const { impact_id } of ids) this.store.db.prepare("INSERT OR IGNORE INTO alert_jobs(impact_id,created_at,updated_at) VALUES (?,?,?)").run(impact_id, iso, iso);
      if (ids.length) this.store.db.prepare("UPDATE alert_cursor SET impact_id=? WHERE id=1").run(ids[ids.length - 1].impact_id);
    })();
    const jobs = this.store.db.prepare("SELECT * FROM alert_jobs WHERE state IN ('pending','review_pending') ORDER BY impact_id LIMIT 100").all() as Job[];
    for (const job of jobs) {
      if (this.stopped) return;
      const row = this.store.getImpact(job.impact_id)!;
      if (job.state === "review_pending") {
        // A prepared/ambiguous send resumes its exact saved key/body, never a new model decision.
        if (this.now() - Date.parse(job.updated_at) < 5000) continue;
        if (job.delivery_attempts >= 3) { this.finish(row.impact_id, "needs_attention", "delivery outcome unresolved; saved key retained"); continue; }
        const saved = this.store.db.prepare("SELECT message_id,created_at FROM reviews WHERE impact_id=?").get(row.impact_id) as { message_id: string | null; created_at: string } | undefined;
        if (!saved) {
          const reason = this.guard(row);
          if (reason) { this.finish(row.impact_id, "skipped", reason); continue; }
        } else if (!saved.message_id && this.now() - Date.parse(saved.created_at) > 120000) {
          this.finish(row.impact_id, "needs_attention", "ambiguous send too old for automatic retry; original key retained"); continue;
        }
        await this.deliver(job, row); return;
      }
      const problem = this.guard(row);
      if (problem) {
        if (problem.startsWith("waiting") && this.now() - Date.parse(row.received_at) < this.config.maxAgeMs) continue;
        this.finish(row.impact_id, "skipped", problem); continue;
      }
      const history = this.readHistory(row);
      this.store.db.prepare("UPDATE alert_jobs SET policy=? WHERE impact_id=?").run(JSON.stringify(history.policy), row.impact_id);
      if (!history.policy.eligible) {
        this.finish(row.impact_id, "observed", "below configured review rules; saved in history, no model call or text"); continue;
      }
      const previous = this.store.db.prepare(`SELECT MAX(j.review_requested_at) time FROM alert_jobs j JOIN impacts i USING(impact_id)
        WHERE i.player=? AND j.review_requested_at IS NOT NULL`).get(row.player) as { time: string | null };
      const cooldown = history.policy.reason === "recent_cluster" ? this.config.policy.clusterCooldownMs : this.config.cooldownMs;
      if (previous.time && this.now() - Date.parse(previous.time) < cooldown) {
        this.finish(row.impact_id, "suppressed", `${history.policy.reason} notification cooldown; hit retained in history`); continue;
      }
      const used = (this.store.db.prepare("SELECT count(*) n FROM alert_jobs WHERE model_attempted_at>=?")
        .get(new Date(this.now() - 86400000).toISOString()) as { n: number }).n;
      if (used >= this.config.maxPerDay && !job.attempts) { this.finish(row.impact_id, "suppressed", "24-hour agent review budget reached"); continue; }
      if (job.attempts >= 2) { this.finish(row.impact_id, "needs_attention", "bounded model retries exhausted; no text sent"); continue; }
      if (job.attempts && this.now() - Date.parse(job.updated_at) < 3000) continue;
      this.store.db.prepare("UPDATE alert_jobs SET state='deciding',attempts=attempts+1,model_attempted_at=?,updated_at=? WHERE impact_id=?").run(iso, iso, row.impact_id);
      try {
        const hit = compactImpact(row);
        const analysis = await this.agent!.investigate(hit, () => history);
        if (JSON.stringify(analysis.history.policy) !== JSON.stringify(history.policy)) throw new Error("Policy evidence changed.");
        validateAgentReview(hit, analysis);
        const changed = this.guard(row);
        if (changed) { this.finish(row.impact_id, "skipped", "post-analysis check: " + changed); return; }
        // The phone text uses verified facts, never unconstrained model prose.
        const count = analysis.history.count;
        const triggerText = history.policy.reason === "recent_cluster"
          ? `${history.policy.recent_usable_count} helmet hits at or above ${this.config.policy.clusterMinG} g in ${this.config.policy.clusterWindowMs/1000} seconds.`
          : `Relative helmet reading reached the ${this.config.policy.singleG} g review setting.`;
        const note = `${this.testLabel || "Empty-helmet demo."} ${triggerText} ${count} recorded ${count === 1 ? "hit" : "hits"} in the past hour. ` +
          (captureNeedsReview(hit) ? "Check the player and sensor recording; the recording was partial or clipped." :
            `Please check ${hit.player}.`);
        this.store.db.prepare("UPDATE alert_jobs SET state=?,analysis=?,note=?,updated_at=? WHERE impact_id=?")
          .run(this.config.mode === "dry_run" ? "dry_run" : "review_pending", JSON.stringify(analysis), note, new Date(this.now()).toISOString(), row.impact_id);
        if (this.config.mode === "dry_run") { this.log(`[AUTO] Impact ${row.impact_id}: dry run saved; no text sent.`); return; }
        if (this.stopped) return; // Decision persists; a fresh restart can resume it.
        await this.deliver({ ...job, note, delivery_attempts: 0 }, row);
      } catch {
        // Do not expose provider errors, headers, prompts, keys or model response text.
        this.store.db.prepare("UPDATE alert_jobs SET state=CASE WHEN analysis IS NULL THEN 'pending' ELSE 'review_pending' END,detail='agent request/validation failed',updated_at=? WHERE impact_id=?")
          .run(new Date(this.now()).toISOString(), row.impact_id);
        this.log(`[AUTO] Impact ${row.impact_id}: agent request/validation failed; bounded retry pending.`);
      }
      return;
    }
  }
  private async deliver(job: Job, hit: ImpactRow) {
    const now = new Date(this.now()).toISOString();
    this.store.db.prepare("UPDATE alert_jobs SET delivery_attempts=delivery_attempts+1,review_requested_at=COALESCE(review_requested_at,?),updated_at=? WHERE impact_id=?").run(now, now, hit.impact_id);
    const result = await this.reviews.flag({ impact_id: hit.impact_id, note: job.note! });
    this.store.db.prepare("UPDATE alert_jobs SET result=?,updated_at=? WHERE impact_id=?").run(JSON.stringify(result), new Date(this.now()).toISOString(), hit.impact_id);
    const status = String(result.status ?? "unknown");
    if (status === "unknown" || !result.ok && status !== "failed") {
      this.finish(hit.impact_id, "review_pending", "delivery unresolved; retry keeps the original key/body");
    } else if (status === "failed") this.finish(hit.impact_id, "needs_attention", "provider reported failure; no new send created");
    else this.finish(hit.impact_id, status === "delivered" || status === "read" ? "delivered" : "review_pending", "provider status: " + status);
  }
}
