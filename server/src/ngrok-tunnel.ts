import { spawn, type ChildProcess } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";

// Pin the claimed HTTPS hostname. A missing/invalid reservation must never
// silently fall back to a random URL and strand the existing agent connections.
export function ngrokOrigin(domain: string | undefined) {
  if (!domain) throw new Error("Missing ngrok domain. Run tools/Set-HelmetNgrok.ps1 first.");
  let value: URL;
  try { value = new URL(domain.includes("://") ? domain : `https://${domain}`); }
  catch { throw new Error("Invalid ngrok domain; supply only the claimed HTTPS hostname."); }
  if (value.protocol !== "https:" || value.username || value.password || value.port ||
      value.pathname !== "/" || value.search || value.hash ||
      !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.(?:ngrok-free\.(?:app|dev)|ngrok\.(?:app|dev|io))$/.test(value.hostname)) {
    throw new Error("Invalid ngrok domain; use the ngrok hostname claimed in your account.");
  }
  return value.origin;
}

export function ngrokChildEnvironment(environment: NodeJS.ProcessEnv, authtoken: string) {
  const clean = Object.fromEntries(Object.entries(environment).filter(([key]) => {
    const name = key.toUpperCase();
    return !name.startsWith("INKBOX_") && !name.startsWith("NGROK_") && !name.startsWith("HELMET_AGENT_") &&
      !["HELMET_MCP_ACCESS_TOKEN", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "XAI_API_KEY", "OPENROUTER_API_KEY"].includes(name);
  }));
  // This is the only secret the tunnel helper needs. It never appears in argv,
  // the generated config, logs, Git, or the MCP connection URL.
  return { ...clean, NGROK_AUTHTOKEN: authtoken };
}

export function createNgrokTunnel(logPath: string, configPath: string, spawnProcess: typeof spawn = spawn) {
  const origin = ngrokOrigin(process.env.HELMET_NGROK_DOMAIN);
  const authtoken = process.env.NGROK_AUTHTOKEN;
  delete process.env.NGROK_AUTHTOKEN;
  if (!authtoken || !/^[A-Za-z0-9_-]{20,200}$/.test(authtoken)) {
    throw new Error("Missing or invalid encrypted ngrok authtoken. Run tools/Set-HelmetNgrok.ps1 first.");
  }
  let child: ChildProcess | undefined;
  let connected = false;
  let stopping = false;
  writeFileSync(configPath, JSON.stringify({ version: "3", agent: {
    web_addr: false, remote_management: false, update_check: false,
    log: "stdout", log_format: "json", log_level: "info",
  } }, null, 2) + "\n", { mode: 0o600 });
  const redact = (value: string) => value.split(authtoken).join("[private]")
    .replace(/access_token=[A-Za-z0-9_-]+/g, "access_token=[private]");
  return {
    status: () => ({ url: connected ? origin : null }),
    async start(port: number) {
      child = spawnProcess(process.env.HELMET_NGROK_PATH ?? "ngrok", [
        "http", `http://127.0.0.1:${port}`, "--url", origin,
        "--inspect=false", "--config", configPath,
      ], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
        env: ngrokChildEnvironment(process.env, authtoken) });
      return await new Promise<{ url: string }>((resolve, reject) => {
        let pending = "";
        const timeout = setTimeout(() => {
          child?.kill(); reject(new Error("ngrok did not connect within 45 seconds. See ignored .mcp-use/state/ngrok.log."));
        }, 45000);
        const consume = (chunk: Buffer) => {
          pending += chunk.toString();
          let end: number;
          while ((end = pending.indexOf("\n")) >= 0) {
            const line = pending.slice(0, end); pending = pending.slice(end + 1);
            appendFileSync(logPath, redact(line) + "\n");
            let event: { msg?: string; url?: string };
            try { event = JSON.parse(line); } catch { continue; }
            if (event.msg === "started tunnel" && event.url) {
              if (event.url !== origin) {
                child?.kill(); clearTimeout(timeout);
                reject(new Error("ngrok returned a different hostname; the configured static domain was not used."));
                continue;
              }
              connected = true; clearTimeout(timeout); resolve({ url: origin });
            }
            if (event.msg === "session closed") connected = false;
          }
          // A malformed log cannot grow memory without a bound.
          if (pending.length > 65536) pending = pending.slice(-8192);
        };
        child!.stdout!.on("data", consume);
        child!.stderr!.on("data", consume);
        child!.once("error", () => {
          clearTimeout(timeout); reject(new Error("Could not start ngrok. Install the official Windows agent and rerun the launcher."));
        });
        child!.once("exit", () => {
          connected = false; clearTimeout(timeout);
          if (!stopping) console.error("[TUNNEL] ngrok stopped. Local capture continues; restart the launcher. The saved domain stays the same.");
          reject(new Error("ngrok exited before connecting. See ignored .mcp-use/state/ngrok.log."));
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
