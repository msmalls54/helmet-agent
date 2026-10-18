import { createServer, request, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { timingSafeEqual } from "node:crypto";

export const LOCAL_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000"];
export const AGENT_ORIGINS = ["https://chatgpt.com", "https://chat.openai.com", "https://claude.ai"];
export function originAllowed(origin: string | undefined, publicOrigin?: string | null) {
  return !origin || [...LOCAL_ORIGINS, ...AGENT_ORIGINS, ...(publicOrigin ? [publicOrigin] : [])].includes(origin);
}
const hopHeaders = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"]);
const equalToken = (value: string, expected: string) => {
  const a = Buffer.from(value); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};
export async function startGateway(options: { token: string; backendPort: number; publicOrigin: () => string | null }) {
  const server = createServer((incoming, response) => {
    let url: URL;
    try { url = new URL(incoming.url ?? "/", "http://localhost"); }
    catch { return reply(response, 400, "Invalid request URL"); }
    // A separate loopback entrance makes this boundary independent of forwarded
    // headers. The tunnel never connects to the firmware's LAN receiver socket.
    if (url.pathname !== "/mcp") return reply(response, 404, "Not found");
    if (!["GET", "POST", "DELETE", "OPTIONS", "HEAD"].includes(incoming.method ?? "")) return reply(response, 405, "Method not allowed");
    const tokens = url.searchParams.getAll("access_token");
    if (tokens.length !== 1 || !equalToken(tokens[0], options.token)) return reply(response, 401, "A valid private connection URL is required");
    if (!originAllowed(incoming.headers.origin, options.publicOrigin())) return reply(response, 403, "Origin not allowed");
    // This server uses stateless JSON responses. MCP permits 405 for the
    // optional GET/SSE stream; ending it avoids an idle relay connection.
    if (incoming.method === "GET") {
      response.setHeader("Allow", "POST, DELETE, OPTIONS, HEAD");
      return reply(response, 405, "Use POST for stateless MCP requests");
    }
    // A protocol client may add query parameters, but the access key is never
    // forwarded to framework logs, inspector state or a tool handler.
    url.searchParams.delete("access_token");
    proxy(incoming, response, options.backendPort, url.pathname + url.search);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Gateway did not bind an IPv4 port.");
  return { server, port: address.port, close: () => closeServer(server) };
}
function reply(response: ServerResponse, status: number, message: string) {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify({ error: message }));
}
function proxy(incoming: IncomingMessage, response: ServerResponse, backendPort: number, path: string) {
  const headers = Object.fromEntries(Object.entries(incoming.headers).filter(([name]) =>
    !hopHeaders.has(name) && !name.startsWith("x-forwarded-") && !["host", "forwarded", "x-original-host"].includes(name)));
  headers.host = "localhost:3000";
  const upstream = request({ hostname: "127.0.0.1", port: backendPort, method: incoming.method, path, headers }, remote => {
    const outputHeaders = Object.fromEntries(Object.entries(remote.headers).filter(([name]) => !hopHeaders.has(name)));
    response.writeHead(remote.statusCode ?? 502, outputHeaders);
    remote.pipe(response);
    remote.on("error", () => response.destroy());
  });
  upstream.on("error", () => {
    if (!response.headersSent) reply(response, 503, "Helmet server is starting; retry shortly");
    else response.destroy();
  });
  incoming.on("aborted", () => upstream.destroy());
  response.on("close", () => upstream.destroy());
  incoming.pipe(upstream);
}
export const closeServer = (server: Server) => new Promise<void>((resolve, reject) => {
  server.close(error => error ? reject(error) : resolve());
  server.closeAllConnections();
});
