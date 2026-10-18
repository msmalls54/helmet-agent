import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { canonical, type Heartbeat, type Impact } from "./telemetry.js";

export interface ImpactRow {
  impact_id: number; received_at: string; helmet_id: string; boot_id: string;
  device_id: number; device_ms: number; player: string; peak_g: number;
  location: string; payload: string;
}
export class Store {
  readonly db: Database.Database;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("busy_timeout = 3000");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS impacts (
        impact_id INTEGER PRIMARY KEY, received_at TEXT NOT NULL,
        helmet_id TEXT NOT NULL, boot_id TEXT NOT NULL, device_id INTEGER NOT NULL,
        device_ms INTEGER NOT NULL, player TEXT NOT NULL, peak_g REAL NOT NULL,
        location TEXT NOT NULL, payload TEXT NOT NULL,
        UNIQUE(helmet_id, boot_id, device_id)
      );
      CREATE INDEX IF NOT EXISTS impacts_time ON impacts(received_at);
      CREATE TABLE IF NOT EXISTS heartbeats (
        heartbeat_id INTEGER PRIMARY KEY, received_at TEXT NOT NULL,
        helmet_id TEXT NOT NULL, player TEXT NOT NULL, payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS heartbeat_helmet_time ON heartbeats(helmet_id, received_at);
    `);
  }
  saveImpact(hit: Impact, now = new Date().toISOString()) {
    // The acknowledgement is sent only after this synchronous transaction commits.
    return this.db.transaction(() => {
      const payload = canonical(hit);
      const old = this.db.prepare("SELECT impact_id, payload FROM impacts WHERE helmet_id=? AND boot_id=? AND device_id=?")
        .get(hit.helmet_id, hit.boot_id, hit.id) as { impact_id: number; payload: string } | undefined;
      if (old) {
        if (old.payload !== payload) throw new Error("identity_conflict");
        return { impact_id: old.impact_id, duplicate: true };
      }
      const result = this.db.prepare(`INSERT INTO impacts
        (received_at,helmet_id,boot_id,device_id,device_ms,player,peak_g,location,payload)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(now, hit.helmet_id, hit.boot_id, hit.id,
          hit.ms, hit.player, hit.peak_g, hit.location, payload);
      return { impact_id: Number(result.lastInsertRowid), duplicate: false };
    })();
  }
  saveHeartbeat(beat: Heartbeat, now = new Date().toISOString()) {
    this.db.prepare("INSERT INTO heartbeats(received_at,helmet_id,player,payload) VALUES (?,?,?,?)")
      .run(now, beat.helmet_id, beat.player, canonical(beat));
  }
  lastHeartbeats() {
    const rows = this.db.prepare(`SELECT h.* FROM heartbeats h JOIN
      (SELECT helmet_id, MAX(heartbeat_id) AS latest FROM heartbeats GROUP BY helmet_id) x
      ON h.heartbeat_id=x.latest`).all() as { received_at: string; payload: string }[];
    return rows.map(row => ({ received_at: row.received_at, ...JSON.parse(row.payload) }));
  }
  getImpact(id: number) {
    return this.db.prepare("SELECT * FROM impacts WHERE impact_id=?").get(id) as ImpactRow | undefined;
  }
  close() { this.db.close(); }
}
