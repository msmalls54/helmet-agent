import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { startGateway, closeServer, originAllowed } from "../src/remote-gateway.js";

test("public entrance exposes only authenticated /mcp and preserves allowed origins and MCP transport headers", async () => {
  const backend = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json", "Mcp-Session-Id": "test-session" });
    res.end(JSON.stringify({ path: req.url, origin: req.headers.origin, session: req.headers["mcp-session-id"], forwarded: req.headers["x-forwarded-host"] ?? null }));
  });
  await new Promise<void>(resolve => backend.listen(0, "127.0.0.1", resolve));
  const address = backend.address();
  assert(address && typeof address !== "string");
  const token = "unit-test-token-is-not-a-real-secret";
  const gateway = await startGateway({ token, backendPort: address.port, publicOrigin: () => "https://test.tunnel.mcp-use.run" });
  const base = `http://127.0.0.1:${gateway.port}`;
  try {
    for (const path of ["/impact", "/heartbeat", "/health", "/inspector", "/sse", "/mcp/../impact", "/mcp-use/widgets/helmet", "/mcp/impact"]) {
      const result = await fetch(`${base}${path}?access_token=${token}`, { method: "POST" });
      assert.equal(result.status, 404, path); await result.text();
    }
    for (const query of ["", "?access_token=wrong", `?access_token=${token}&access_token=${token}`]) {
      const result = await fetch(`${base}/mcp${query}`, { method: "POST" });
      assert.equal(result.status, 401); await result.text();
    }
    const blocked = await fetch(`${base}/mcp?access_token=${token}`, { method: "POST", headers: { Origin: "https://evil.example" } });
    assert.equal(blocked.status, 403); await blocked.text();
    const stream = await fetch(`${base}/mcp?access_token=${token}`, { headers: { Accept: "text/event-stream" }, signal: AbortSignal.timeout(2000) });
    assert.equal(stream.status, 405);
    assert.match(stream.headers.get("Allow") ?? "", /POST/); await stream.text();
    for (const origin of ["https://chatgpt.com", "https://claude.ai", "https://test.tunnel.mcp-use.run"]) {
      const response = await fetch(`${base}/mcp?access_token=${token}`, { method: "POST", headers: { Origin: origin, "Mcp-Session-Id": "abc", "X-Forwarded-Host": "evil.example" } });
      assert.equal(response.headers.get("Mcp-Session-Id"), "test-session");
      assert.deepEqual(await response.json(), { path: "/mcp", origin, session: "abc", forwarded: null });
    }
    assert.equal(originAllowed("https://chatgpt.com.evil.example"), false);
    assert.equal(originAllowed("null"), false);
    assert.equal(originAllowed(undefined), true); // Cloud MCP clients do not send browser Origin.
  } finally { await gateway.close(); await closeServer(backend); }
});
