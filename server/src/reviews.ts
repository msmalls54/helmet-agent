import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { object, type MCPServer } from "mcp-use/server";
import type { Store } from "./store.js";
import { compactImpact } from "./impacts.js";
import { TELEMETRY_NOTICE, INTERPRETATION_RULE } from "./telemetry.js";
import { inkboxMessenger, type Delivery, type Messenger } from "./inkbox.js";

export const reviewSchema = z.object({
  impact_id: z.number().int().positive().describe("Stable impact_id returned by get_impacts, not the device's per-boot id."),
  note: z.string().trim().min(1).max(500).describe("Short factual reason for requesting human review. Do not include injury-severity labels or head-impact threshold comparisons."),
});
interface ReviewRow {
  impact_id: number; conversation_id: string; idempotency_key: string;
  note: string; message_text: string; message_id: string | null;
  status: string; receipt: string | null; created_at: string; updated_at: string;
}

export class Reviews {
  private active = new Map<number, Promise<Record<string, unknown>>>();
  constructor(private store: Store, private messenger: () => Messenger = inkboxMessenger, private pollMs = 12000) {
    store.db.exec(`CREATE TABLE IF NOT EXISTS reviews (
      impact_id INTEGER PRIMARY KEY REFERENCES impacts(impact_id),
      conversation_id TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE,
      note TEXT NOT NULL, message_text TEXT NOT NULL, message_id TEXT,
      status TEXT NOT NULL, receipt TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`);
  }
  flag(input: z.input<typeof reviewSchema>) {
    const args = reviewSchema.parse(input);
    const running = this.active.get(args.impact_id);
    if (running) return running;
    const operation = this.perform(args).finally(() => this.active.delete(args.impact_id));
    this.active.set(args.impact_id, operation);
    return operation;
  }
  private async perform(args: z.output<typeof reviewSchema>): Promise<Record<string, unknown>> {
    const impact = this.store.getImpact(args.impact_id);
    if (!impact) return { ok: false, error: "Impact not found; no message sent.", notice: TELEMETRY_NOTICE };
    let messenger: Messenger;
    try { messenger = this.messenger(); } catch {
      return { ok: false, error: "Inkbox is not configured; load the encrypted environment before starting.", notice: TELEMETRY_NOTICE };
    }
    let row = this.store.db.prepare("SELECT * FROM reviews WHERE impact_id=?").get(args.impact_id) as ReviewRow | undefined;
    const alreadyFlagged = !!row;
    if (row && row.conversation_id !== messenger.conversationId) {
      return { ok: false, error: "This impact already has a review for a different configured conversation; no new message sent." };
    }
    if (!row) {
      const hit = compactImpact(impact);
      const time = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit",
      }).format(new Date(hit.received_at));
      const note = args.note.replace(/[.!?]+$/, "");
      const quality = hit.quality.fifo_samples !== 32 || !hit.quality.gyro_window_complete || hit.quality.accel_clipped || hit.quality.gyro_clipped || hit.quality.accel_window_left_censored
        ? "\nSensor recording is partial or clipped." : "";
      const direction = ["front", "back", "left", "right", "top"].includes(hit.location)
        ? ` Sensor direction: ${hit.location.toUpperCase()}.` : "";
      const message = `Check ${hit.player}.\nHelmet impact recorded at ${time}.\n` +
        `Reading: ${Number(hit.peak_g.toFixed(1))} g.${direction}\n` +
        `Reason: ${note}.\nRelative helmet-impact telemetry.${quality}`;
      const now = new Date().toISOString();
      // Save the exact body and key BEFORE a network request. An ambiguous outcome
      // is retried only with this same key and same text, including after restart.
      this.store.db.prepare(`INSERT INTO reviews
        (impact_id,conversation_id,idempotency_key,note,message_text,status,created_at,updated_at)
        VALUES (?,?,?,?,?,'prepared',?,?)`).run(args.impact_id, messenger.conversationId,
          `helmet-review:${randomUUID()}`, args.note, message, now, now);
      row = this.store.db.prepare("SELECT * FROM reviews WHERE impact_id=?").get(args.impact_id) as ReviewRow;
    }
    let delivery: Delivery | undefined = row.receipt ? JSON.parse(row.receipt) : undefined;
    try {
      delivery = row.message_id ? await messenger.read(row.message_id) : await messenger.send(row.message_text, row.idempotency_key);
      this.save(row.impact_id, delivery);
      const deadline = Date.now() + (alreadyFlagged ? 0 : this.pollMs);
      while (!["delivered", "failed", "read"].includes(delivery.status) && Date.now() < deadline) {
        await delay(Math.min(1000, deadline - Date.now()));
        delivery = await messenger.read(delivery.message_id);
        this.save(row.impact_id, delivery);
      }
    } catch {
      // Never expose provider exceptions (which may contain request details).
      // Keep the last positive receipt; a polling failure does not undo acceptance.
      if (!delivery) this.store.db.prepare("UPDATE reviews SET status='unknown',updated_at=? WHERE impact_id=?")
        .run(new Date().toISOString(), row.impact_id);
      return { ok: !!delivery, impact_id: row.impact_id, already_flagged: alreadyFlagged,
        status: delivery?.status ?? "unknown", delivery: delivery ?? null,
        message: delivery ? "Last provider receipt retained; latest status check unavailable." : "Send outcome is unconfirmed. Repeating this impact reuses its saved key; do not create a new send.",
        notice: TELEMETRY_NOTICE };
    }
    return { ok: delivery.status !== "failed", impact_id: row.impact_id, already_flagged: alreadyFlagged,
      note: row.note, status: delivery.status, delivery,
      message: alreadyFlagged ? "Existing review returned; no new message sent." : "Review requested in the connected Inkbox conversation.",
      handset_receipt_confirmed: false, notice: TELEMETRY_NOTICE };
  }
  private save(id: number, receipt: Delivery) {
    this.store.db.prepare("UPDATE reviews SET message_id=?,status=?,receipt=?,updated_at=? WHERE impact_id=?")
      .run(receipt.message_id, receipt.status, JSON.stringify(receipt), new Date().toISOString(), id);
  }
}
export function registerReviews(server: MCPServer, store: Store, reviews = new Reviews(store)) {
  server.tool({ name: "flag_for_review", description: `Text the connected trainer phone about one saved live hit. Use impact_id from get_impacts and a short reason. Returns delivery status. Repeating the same hit returns its existing message; simulated practice IDs cannot send texts. ${TELEMETRY_NOTICE} ${INTERPRETATION_RULE}`,
    schema: reviewSchema, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true } },
    async args => object(await reviews.flag(args)));
}
