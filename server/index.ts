import { MCPServer } from "mcp-use/server";
import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { loadEnvFile } from "node:process";
import { Store } from "./src/store.js";
import { addReceiver } from "./src/receiver.js";
import { TELEMETRY_NOTICE } from "./src/telemetry.js";
import { registerGetImpacts } from "./src/impacts.js";
import { registerReviews, Reviews } from "./src/reviews.js";
import { registerLastHit } from "./src/last-hit.js";
import { registerPractice } from "./src/practice.js";
import { startRemoteAccess } from "./src/tunnel.js";
import { AlertLoop, readAlertConfig } from "./src/alert-loop.js";
import { xaiAlertAgent } from "./src/alert-agent.js";

// mcp-use imports the entry during type generation with listening disabled.
// Do not create a public tunnel during that import.
const managedImport = (globalThis as { __mcpUseHmrMode?: boolean }).__mcpUseHmrMode === true;
if (!managedImport && existsSync(resolve(".env"))) loadEnvFile(resolve(".env"));
const store = new Store(process.env.HELMET_DB_PATH ?? resolve("data/helmet.sqlite"));
const remote = !managedImport && process.env.HELMET_TUNNEL === "1" ? await startRemoteAccess(3000) : undefined;
const reviews = new Reviews(store);
const alertConfig = readAlertConfig();
const agent = !managedImport && alertConfig.mode !== "off" && process.env.HELMET_AGENT_API_KEY
  ? xaiAlertAgent(process.env.HELMET_AGENT_API_KEY, process.env.HELMET_AGENT_MODEL) : undefined;
// Keep the model key in the adapter closure, not in future child-process environments.
delete process.env.HELMET_AGENT_API_KEY;
const alerts = !managedImport ? new AlertLoop(store, reviews, agent, alertConfig) : undefined;
export const server = new MCPServer({
  name: "helmet-agent", title: "Helmet Agent", version: "1.0.0",
  description: "Give an agent a physical event to investigate. Read live helmet hits, investigate practice patterns and request a trainer check. " + TELEMETRY_NOTICE, host: "0.0.0.0", baseUrl: remote?.origin() ?? undefined,
  // Cloud connectors use independent JSON requests through the HTTPS relay.
  // Avoid keeping per-client SSE sessions open across that relay.
  stateless: true,
});
// mcp-use 1.34.8 does not assign the widget version to this instance. Version
// templates by their actual bytes: new widgets bypass client caches, while an
// unchanged rebuild/restart retains the same resource URIs and connector setup.
const widgetFiles = ["helmet", "practice"].map(name => resolve("dist/resources/widgets", name, "index.html"));
if (!managedImport && widgetFiles.every(file => existsSync(file))) {
  const hash = createHash("sha256");
  for (const file of widgetFiles) hash.update(readFileSync(file));
  server.buildId = hash.digest("hex").slice(0, 16);
}
addReceiver(server.app, store, console.log, remote, alerts);
registerGetImpacts(server, store);
registerReviews(server, store, reviews);
registerLastHit(server, store, alertConfig);
registerPractice(server, store);
export default server;

await server.listen(3000);
alerts?.start();
if (alertConfig.mode !== "off" && !agent && !managedImport) console.error("[AUTO] Not armed: model credential missing. See tools/Set-HelmetAgent.ps1.");
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await alerts?.stop();
  await remote?.stop();
  await server.close();
  store.close();
}
process.once("SIGINT", () => { void stop().finally(() => process.exit(0)); });
process.once("SIGTERM", () => { void stop().finally(() => process.exit(0)); });
