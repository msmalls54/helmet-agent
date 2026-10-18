import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { spawn } from "node:child_process";
import { ngrokOrigin, ngrokChildEnvironment, createNgrokTunnel } from "../src/ngrok-tunnel.js";

test("ngrok pins a claimed HTTPS hostname and isolates helper credentials", () => {
  assert.equal(ngrokOrigin("helmet-example.ngrok-free.app"), "https://helmet-example.ngrok-free.app");
  assert.equal(ngrokOrigin("https://helmet-example.ngrok-free.dev/"), "https://helmet-example.ngrok-free.dev");
  for (const value of [undefined, "http://helmet-example.ngrok-free.app", "https://evil.example", "helmet.ngrok-free.app/mcp", "helmet.ngrok-free.app?access_token=secret", "https://user:pass@helmet.ngrok-free.app", "helmet.ngrok-free.app:444"]) {
    assert.throws(() => ngrokOrigin(value));
  }
  const env = ngrokChildEnvironment({ PATH: "programs", INKBOX_API_KEY: "inkbox-secret", inkbox_lowercase: "also-secret", HELMET_MCP_ACCESS_TOKEN: "mcp-secret", NGROK_API_KEY: "not-needed", NGROK_AUTHTOKEN: "old",
    HELMET_AGENT_API_KEY: "model-secret", OPENAI_API_KEY: "other-model-secret", XAI_API_KEY: "xai-secret" }, "tunnel-only-secret");
  assert.deepEqual(env, { PATH: "programs", NGROK_AUTHTOKEN: "tunnel-only-secret" });
});

test("ngrok readiness uses the fixed domain, secret-free config, hidden helper and clean shutdown", async () => {
  const folder = mkdtempSync(join(tmpdir(), "helmet-ngrok-test-"));
  const previousDomain = process.env.HELMET_NGROK_DOMAIN;
  const previousToken = process.env.NGROK_AUTHTOKEN;
  process.env.HELMET_NGROK_DOMAIN = "helmet-example.ngrok-free.app";
  process.env.NGROK_AUTHTOKEN = "unit-test-ngrok-token-not-real";
  let killed = false;
  const fake = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(), stderr: new PassThrough(), exitCode: null, signalCode: null,
    kill() { killed = true; queueMicrotask(() => fake.emit("exit", 0)); return true; },
  });
  const spawnFake = ((_exe: string, args: string[], options: { env: NodeJS.ProcessEnv; windowsHide: boolean }) => {
    assert.equal(options.windowsHide, true);
    assert.equal(options.env.NGROK_AUTHTOKEN, "unit-test-ngrok-token-not-real");
    assert(!("INKBOX_API_KEY" in options.env));
    assert(!("HELMET_MCP_ACCESS_TOKEN" in options.env));
    assert(!args.join(" ").includes("unit-test-ngrok-token"));
    assert(args.includes("--inspect=false"));
    assert(args.includes("https://helmet-example.ngrok-free.app"));
    queueMicrotask(() => fake.stdout.write(JSON.stringify({ msg: "started tunnel", url: "https://helmet-example.ngrok-free.app" }) + "\n"));
    return fake;
  }) as unknown as typeof spawn;
  try {
    const logPath = join(folder, "ngrok.log");
    const configPath = join(folder, "ngrok.json");
    const tunnel = createNgrokTunnel(logPath, configPath, spawnFake);
    assert.equal(process.env.NGROK_AUTHTOKEN, undefined);
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    assert.equal(config.agent.web_addr, false);
    assert.equal(config.agent.remote_management, false);
    assert(!readFileSync(configPath, "utf8").includes("token"));
    assert.equal(tunnel.status().url, null);
    assert.deepEqual(await tunnel.start(54321), { url: "https://helmet-example.ngrok-free.app" });
    assert.equal(tunnel.status().url, "https://helmet-example.ngrok-free.app");
    fake.stderr.write("unit-test-ngrok-token-not-real access_token=private-connection-key\n");
    assert(!readFileSync(logPath, "utf8").includes("unit-test-ngrok-token-not-real"));
    assert(!readFileSync(logPath, "utf8").includes("private-connection-key"));
    await tunnel.stop();
    assert(killed); assert.equal(tunnel.status().url, null);
  } finally {
    if (previousDomain === undefined) delete process.env.HELMET_NGROK_DOMAIN; else process.env.HELMET_NGROK_DOMAIN = previousDomain;
    if (previousToken === undefined) delete process.env.NGROK_AUTHTOKEN; else process.env.NGROK_AUTHTOKEN = previousToken;
    rmSync(folder, { recursive: true, force: true });
  }
});
