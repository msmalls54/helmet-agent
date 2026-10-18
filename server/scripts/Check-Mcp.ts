// Read-only protocol smoke check. Never invokes the phone-sending tool.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const client = new Client({ name: "helmet-readonly-check", version: "1.0.0" });
try {
  await client.connect(new StreamableHTTPClientTransport(new URL("http://127.0.0.1:3000/mcp")));
  const tools = await client.listTools();
  const result = await client.callTool({ name: "get_impacts", arguments: {} });
  if (!tools.tools.some(t => t.name === "get_impacts") || result.isError) {
    throw new Error("get_impacts was not registered or returned an error.");
  }
  for (const tool of tools.tools) {
    if (!tool.description?.includes("Relative helmet-impact telemetry, not a diagnosis; a human trainer decides.")) {
      throw new Error(`Missing telemetry/human review description on ${tool.name}`);
    }
  }
  const widget = tools.tools.some(t => t.name === "show_last_hit")
    ? await client.callTool({ name: "show_last_hit", arguments: {} }) : undefined;
  if (widget?.isError) throw new Error("show_last_hit failed.");
  console.log(JSON.stringify({ checked_at_utc: new Date().toISOString(), tools: tools.tools.map(t => ({ name: t.name, description: t.description })), result, widget }, null, 2));
} finally { await client.close(); }
