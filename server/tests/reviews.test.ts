import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/store.js";
import { Reviews } from "../src/reviews.js";
import type { Delivery, Messenger } from "../src/inkbox.js";
import { hit } from "./fixtures.js";

const delivered: Delivery = { message_id: "test-message", conversation_id: "test-conversation", status: "delivered", service: "imessage", recipient_delivery_status: "delivered", delivered_at: "2026-10-17T20:00:00Z" };
test("future trainer texts omit missing direction and preserve the raw location", async () => {
  for (const location of ["unknown", "uncalibrated"] as const) {
    const store = new Store(":memory:");
    try {
      const id = store.saveImpact({ ...hit, location }).impact_id;
      let body = "";
      const messenger: Messenger = { conversationId: "test-conversation",
        async send(text) { body = text; return delivered; }, async read() { return delivered; } };
      await new Reviews(store, () => messenger, 0).flag({ impact_id: id, note: "Review setting reached" });
      assert.match(body, /Reading: 42 g\.\nReason: Review setting reached\./);
      assert.doesNotMatch(body, /direction|not determined|unknown|uncalibrated/i);
      assert.equal(store.getImpact(id)?.location, location);
    } finally { store.close(); }
  }
});
test("review includes telemetry and note, concurrent/repeated calls and restart send only once", async () => {
  const store = new Store(":memory:");
  try {
    const id = store.saveImpact(hit).impact_id;
    let sends = 0;
    const messenger: Messenger = { conversationId: "test-conversation",
      async send(text, key) { sends++; assert.match(text, /^Check #44\.\nHelmet impact recorded at /); assert.match(text, /Reading: 42 g\. Sensor direction: RIGHT\./); assert.match(text, /Reason: Demo connectivity test\./); assert.match(text, /Relative helmet-impact telemetry\./); assert.doesNotMatch(text, /unverified|may be|estimated|server|\d{4}-\d{2}-\d{2}T/); assert.match(key, /^helmet-review:/); return delivered; },
      async read() { return delivered; } };
    const reviews = new Reviews(store, () => messenger, 0);
    const args = { impact_id: id, note: "Demo connectivity test" };
    const results = await Promise.all([reviews.flag(args), reviews.flag(args)]);
    assert.equal(results[0].status, "delivered"); assert.equal(sends, 1);
    const restarted = new Reviews(store, () => messenger, 0);
    assert.equal((await restarted.flag({ ...args, note: "Changed note" })).already_flagged, true);
    assert.equal(sends, 1);
    assert.equal((await reviews.flag({ ...args, impact_id: 999 })).ok, false);
  } finally { store.close(); }
});
test("lost send response retains exact body and key; accepted receipt survives polling failure", async () => {
  const store = new Store(":memory:");
  try {
    const id = store.saveImpact(hit).impact_id;
    const attempts: { text: string; key: string }[] = [];
    const messenger: Messenger = { conversationId: "test-conversation",
      async send(text, key) { attempts.push({ text, key }); if (attempts.length === 1) throw new Error("network timeout"); return { ...delivered, status: "sent" }; },
      async read() { throw new Error("poll unavailable"); } };
    const args = { impact_id: id, note: "Demo only" };
    assert.equal((await new Reviews(store, () => messenger, 0).flag(args)).status, "unknown");
    const retry = await new Reviews(store, () => messenger, 0).flag(args);
    assert.equal(retry.status, "sent"); assert.deepEqual(attempts[0], attempts[1]);
    assert.equal((await new Reviews(store, () => messenger, 0).flag(args)).status, "sent");
    assert.equal(attempts.length, 2);
  } finally { store.close(); }
});
