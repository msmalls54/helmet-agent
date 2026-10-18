import { createTunnelManager } from "@mcp-use/tunnel";
import { appendFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { startGateway } from "./remote-gateway.js";
import { createCloudflareTunnel } from "./cloudflare-tunnel.js";
import { createNgrokTunnel } from "./ngrok-tunnel.js";

export async function startRemoteAccess(backendPort: number) {
  // The key is private local configuration, never committed or put in a tool.
  const envPath = resolve(".env");
  if (existsSync(envPath)) loadEnvFile(envPath);
  let token = process.env.HELMET_MCP_ACCESS_TOKEN;
  if (!token) {
    token = randomBytes(32).toString("base64url");
    appendFileSync(envPath, `\nHELMET_MCP_ACCESS_TOKEN=${token}\n`, { mode: 0o600 });
    process.env.HELMET_MCP_ACCESS_TOKEN = token;
  }
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) throw new Error("Invalid HELMET_MCP_ACCESS_TOKEN in ignored server/.env.");
  const stateFolder = resolve(".mcp-use/state");
  mkdirSync(stateFolder, { recursive: true });
  let publicOrigin: string | null = null;
  const gateway = await startGateway({ token, backendPort, publicOrigin: () => publicOrigin });
  const selected = process.env.HELMET_TUNNEL_PROVIDER ?? (process.env.HELMET_NGROK_DOMAIN ? "ngrok" : "cloudflare");
  if (!["ngrok", "cloudflare", "manufact"].includes(selected)) {
    await gateway.close(); throw new Error("Unknown HELMET_TUNNEL_PROVIDER. Use ngrok, cloudflare or manufact.");
  }
  const provider = selected === "ngrok" ? "ngrok static domain" : selected === "manufact" ? "mcp-use / Manufact" : "Cloudflare Quick Tunnel";
  let tunnel: ReturnType<typeof createCloudflareTunnel> | ReturnType<typeof createTunnelManager>;
  try {
    tunnel = selected === "ngrok"
      ? createNgrokTunnel(resolve(stateFolder, "ngrok.log"), resolve(stateFolder, "ngrok-agent.json"))
      : selected === "manufact"
        ? createTunnelManager(resolve(stateFolder, "helmet-tunnel.json"), { localHostHeader: "localhost" })
        : createCloudflareTunnel(resolve(stateFolder, "cloudflared.log"));
  } catch (error) { await gateway.close(); throw error; }
  const connectionPath = resolve(stateFolder, "helmet-connection.json");
  const publish = (origin: string) => {
    const connectionUrl = new URL("/mcp", origin);
    connectionUrl.searchParams.set("access_token", token!);
    const receipt = { provider, stable_hostname: selected === "ngrok", public_origin: origin,
      mcp_url: connectionUrl.toString(), backend_port: backendPort,
      gateway_bind: "127.0.0.1", gateway_port: gateway.port,
      exposed_paths: ["/mcp"], connected_at_utc: new Date().toISOString() };
    writeFileSync(connectionPath, JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600 });
    console.log(`[TUNNEL] MCP connection URL (keep private): ${receipt.mcp_url}`);
    console.log("[TUNNEL] Only /mcp is exposed. Impact uploads, heartbeats and inspector remain private.");
    publicOrigin = origin;
  };
  try { publish((await tunnel.start(gateway.port)).url); }
  catch (error) { await tunnel.stop(); await gateway.close(); throw error; }
  // The managed client reconnects itself. If its public address changes, persist
  // the new connection URL so the launcher never prints an obsolete address.
  const refresh = setInterval(() => {
    const next = tunnel.status().url;
    if (next && next !== publicOrigin) publish(next);
  }, 3000);
  refresh.unref();
  return {
    origin: () => tunnel.status().url ?? publicOrigin,
    status: () => ({ enabled: true, connected: tunnel.status().url !== null,
      public_origin: tunnel.status().url, connection_file: connectionPath }),
    async stop() { clearInterval(refresh); await tunnel.stop(); await gateway.close(); },
  };
}
