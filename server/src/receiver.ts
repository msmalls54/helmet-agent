import type { Hono } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import { bodyLimit } from "hono/body-limit";
import { impactSchema, heartbeatSchema, TELEMETRY_NOTICE } from "./telemetry.js";
import type { Store } from "./store.js";
import { originAllowed } from "./remote-gateway.js";

export function addReceiver(app: Hono, store: Store, log = console.log,
  remote?: { origin: () => string | null; status: () => unknown },
  alerts?: { status: () => unknown }) {
  // Firmware needs LAN access. The inspector and phone-sending MCP tools do not.
  // Use the socket peer, never a caller-supplied Host or X-Forwarded-For header.
  app.use("*", async (c, next) => {
    if (c.req.path === "/impact" || c.req.path === "/heartbeat") {
      if (c.req.method !== "POST") return c.json({ error: "POST required" }, 405);
      return next();
    }
    let peer: string | undefined;
    try { peer = getConnInfo(c).remote.address; } catch { /* No real socket in unit tests. */ }
    if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(peer ?? "")) {
      return c.json({ error: "Inspector and MCP are available only on this laptop." }, 403);
    }
    const origin = c.req.header("Origin");
    if (!originAllowed(origin, remote?.origin())) {
      return c.json({ error: "Only the local inspector origin is allowed." }, 403);
    }
    return next();
  });
  const smallBody = bodyLimit({ maxSize: 4096, onError: c => c.json({ error: "Body too large" }, 413) });
  // Inspector posts the bundled inline HTML back to its LOCAL preview store.
  // Resources includes two copies of the inline bundle (~2.53 MB), unlike the
  // tool preview. The loopback check still runs first; firmware/MCP keep 4 KiB.
  const widgetBody = bodyLimit({ maxSize: 4 * 1024 * 1024, onError: c => c.json({ error: "Widget preview too large" }, 413) });
  const previewStores = new Set(["/inspector/api/resources/widget/store", "/inspector/api/mcp-apps/widget/store"]);
  app.use("*", (c, next) => (previewStores.has(c.req.path) ? widgetBody : smallBody)(c, next));
  for (const path of ["/impact", "/heartbeat"] as const) {
    app.post(path, async c => {
      let raw: unknown;
      try { raw = await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }
      const parsed = (path === "/impact" ? impactSchema : heartbeatSchema).safeParse(raw);
      if (!parsed.success) return c.json({ error: "Invalid telemetry", fields: parsed.error.issues.map(i => i.path.join(".")) }, 400);
      try {
        if (parsed.data.type === "impact") {
          const result = store.saveImpact(parsed.data);
          if (!result.duplicate) log(`[${new Date().toISOString()}] HIT ${result.impact_id} ${parsed.data.player}: ${parsed.data.peak_g.toFixed(2)} g, estimated ${parsed.data.location} side`);
          return c.json({ ok: true, ...result });
        }
        store.saveHeartbeat(parsed.data);
        return c.json({ ok: true });
      } catch (error) {
        if (error instanceof Error && error.message === "identity_conflict") return c.json({ error: "Event identity reused with different data" }, 409);
        console.error("SQLite write failed; telemetry was not acknowledged.");
        return c.json({ error: "Storage unavailable; retry" }, 503);
      }
    });
  }
  app.get("/health", c => c.json({ ok: true, service: "helmet-agent", heartbeats: store.lastHeartbeats(), remote: remote?.status() ?? { enabled: false },
    automatic_alerts: alerts?.status() ?? { mode: "off", armed: false }, notice: TELEMETRY_NOTICE }));
}
