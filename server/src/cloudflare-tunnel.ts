import { spawn, type ChildProcess } from "node:child_process";
import { appendFileSync } from "node:fs";

// Keep one Quick Tunnel alive for the whole demo. Network reconnection is
// handled by cloudflared without allocating a new public hostname.
export function createCloudflareTunnel(logPath: string) {
  let child: ChildProcess | undefined;
  let url: string | null = null;
  let connected = false;
  let stopping = false;
  return {
    status: () => ({ url: connected ? url : null }),
    async start(port: number) {
      child = spawn(process.env.HELMET_CLOUDFLARED_PATH ?? "cloudflared", [
        "tunnel", "--no-autoupdate", "--protocol", "http2",
        "--url", `http://127.0.0.1:${port}`, "--http-host-header", "localhost",
      ], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
        env: Object.fromEntries(Object.entries(process.env).filter(([key]) => {
          const name = key.toUpperCase();
          return !name.startsWith("INKBOX_") && !name.startsWith("NGROK_") && !name.startsWith("HELMET_AGENT_") &&
            !["HELMET_MCP_ACCESS_TOKEN", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "XAI_API_KEY", "OPENROUTER_API_KEY"].includes(name);
        })) });
      return await new Promise<{ url: string }>((resolve, reject) => {
        let logTail = "";
        const timeout = setTimeout(() => {
          child?.kill(); reject(new Error("Cloudflare tunnel did not connect within 45 seconds. See ignored .mcp-use/state/cloudflared.log."));
        }, 45000);
        const consume = (chunk: Buffer) => {
          const text = chunk.toString();
          appendFileSync(logPath, text);
          logTail = (logTail + text).slice(-8192);
          const match = logTail.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/);
          if (match) url = match[0];
          if (logTail.includes("Registered tunnel connection")) connected = true;
          if (connected && url) { clearTimeout(timeout); resolve({ url }); }
        };
        child!.stdout!.on("data", consume);
        child!.stderr!.on("data", consume);
        child!.once("error", () => {
          clearTimeout(timeout); reject(new Error("Could not start cloudflared. Install it with winget install --id Cloudflare.cloudflared --exact."));
        });
        child!.once("exit", () => {
          connected = false; clearTimeout(timeout);
          if (!stopping) console.error("[TUNNEL] cloudflared stopped. Local helmet capture continues; restart the launcher and update the agent URL.");
          reject(new Error("cloudflared exited before connecting."));
        });
      });
    },
    async stop() {
      stopping = true; connected = false;
      if (!child || child.exitCode !== null || child.signalCode !== null) return;
      await new Promise<void>(resolve => {
        const timeout = setTimeout(resolve, 5000);
        child!.once("exit", () => { clearTimeout(timeout); resolve(); });
        child!.kill();
      });
    },
  };
}
