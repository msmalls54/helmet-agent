// Recheck an ALREADY DELIVERED review through MCP after restart.
// Refuses to call the tool unless a positive saved delivery receipt exists.
import Database from "better-sqlite3";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const db = new Database(resolve("data/helmet.sqlite"), { readonly: true });
const row = db.prepare("SELECT impact_id,note,message_id FROM reviews WHERE status='delivered' AND message_id IS NOT NULL ORDER BY impact_id DESC LIMIT 1")
  .get() as { impact_id: number; note: string; message_id: string } | undefined;
db.close();
if (!row) throw new Error("No delivered review exists. This check will not create one.");
const client = new Client({ name: "helmet-existing-review-check", version: "1.0.0" });
try {
  await client.connect(new StreamableHTTPClientTransport(new URL("http://127.0.0.1:3000/mcp")));
  const result = await client.callTool({ name: "flag_for_review", arguments: { impact_id: row.impact_id, note: row.note } });
  const content = result.structuredContent as { already_flagged: boolean; delivery: { message_id: string }; status: string } | undefined;
  if (result.isError || !content?.already_flagged || content.delivery?.message_id !== row.message_id || content.status !== "delivered") {
    throw new Error("The existing delivered review did not reconcile.");
  }
  console.log(JSON.stringify({ checked_at_utc: new Date().toISOString(), after_restart: true, existing_message_reused: true, result }, null, 2));
} finally { await client.close(); }
