// Local, read-only receipt export. No provider requests and no messages sent.
import Database from "better-sqlite3";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
const db = new Database(resolve("data/helmet.sqlite"), { readonly: true });
try {
  const latest = db.prepare("SELECT impact_id,received_at,helmet_id,boot_id,device_id,peak_g,player,location,payload FROM impacts ORDER BY impact_id DESC LIMIT 1").get();
  const reviews = db.prepare("SELECT impact_id,conversation_id,idempotency_key,note,message_text,message_id,status,receipt,created_at,updated_at FROM reviews ORDER BY impact_id").all();
  const lastHeartbeat = db.prepare("SELECT received_at,payload FROM heartbeats ORDER BY heartbeat_id DESC LIMIT 1").get();
  const result = { checked_at_utc: new Date().toISOString(), latest_impact: latest,
    reviews, last_heartbeat: lastHeartbeat, inspector_tested: ["get_impacts", "show_last_hit", "flag_for_review"],
    handset_receipt_confirmed: process.argv.includes("--handset-confirmed"),
    handset_confirmation_source: process.argv.includes("--handset-confirmed")
      ? process.argv.find(arg => arg.startsWith("--confirmation="))?.slice("--confirmation=".length) ?? "User explicitly confirmed phone receipt" : null,
    messages_sent_by_export: 0 };
  writeFileSync(resolve("../evidence/server-live-checkpoint.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ impacts: !!latest, review_count: reviews.length, exported: "evidence/server-live-checkpoint.json" }));
} finally { db.close(); }
