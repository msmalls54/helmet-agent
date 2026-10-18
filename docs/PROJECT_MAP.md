# Project map

## Start here

| File | Job |
| --- | --- |
| `README.md` | Product story and demonstration entry point |
| `CURRENT_STATE.md` | Current verified capabilities, open gates and next priorities |
| `docs/DEMO.md` | Operator sequence, exact prompts, expected results and recovery |
| `docs/AGENT_VALUE.md` | Interview story, agent value, five-tool walkthrough and verified claims |
| `docs/AUTOMATIC_ALERTS.md` | Background agent policy, credential setup, limits and delivery recovery |
| `docs/BOTTLENECKS.md` | Demonstrated result, remaining engineering boundaries and next validation |
| `setup.json` | Machine-readable setup and receipt references |
| `evidence/README.md` | Index into dated checks, screenshots and test results |

## Code and local data

```text
helmet-agent/
  firmware/
    i2c_scanner/          Cable/sensor discovery sketch
    helmet_impact/       Capture, calibration, Wi-Fi queue and diagnostics
    README.md            Firmware settings and historical hardware checks
  server/
    index.ts             mcp-use composition and server lifecycle
    src/                 Receiver, SQLite, tools, background agent, Inkbox and tunnel
    resources/helmet/    Live hit widget
    resources/practice/  Explicit simulated-practice widget
    scripts/             Read-only checks, fixture export and secret loaders
    tests/               Focused behavior tests with in-memory/fake services
    data/                Local live SQLite; ignored by Git
    .mcp-use/            Generated runtime/private connection state; ignored
  tools/                 Windows launcher, Wi-Fi/firewall setup and serial tools
  docs/                  Short operator/navigation guides
  evidence/              Versioned test receipts and screenshots
  build/, .cache/        Generated local outputs; ignored
```

Historical evidence remains in place so earlier receipt links and commits keep
working. The temporary Python listener and its firewall helper are diagnostic
utilities, not the current server. Use **Start Helmet.cmd** for the real system.

## Everyday commands

From the project folder:

```powershell
.\tools\Start-Helmet.ps1
```

In a second PowerShell window:

```powershell
.\tools\Test-Helmet.ps1
```

From `server/` for development:

```powershell
npm ci
npm test
npm run build
npm run check:demo
```

The check requires the existing server/tunnel and live helmet. It does not start
them or alter network settings. Tests use isolated data/fake messaging. A build
does not update the already-running process: stop its launcher with Ctrl+C and
restart after server changes. The launcher reuses an existing process on port 3000.

## Configuration

| Location | Contents / handling |
| --- | --- |
| `firmware/helmet_impact/secrets.h` | Ignored Wi-Fi, listener IP, player and helmet identity. Template: `secrets.example.h`. |
| `server/.env` | Ignored local MCP access key. Template: `.env.example`. |
| `%LOCALAPPDATA%/HelmetAgent/secrets/` | Windows-user encrypted Inkbox/ngrok/model settings, loaded into process environment after build. |
| `server/.mcp-use/state/helmet-connection.json` | Ignored current private public-MCP URL. Never paste into committed docs/screenshots. |

Do not commit `.env`, `secrets.h`, plaintext credentials, live SQLite or private
connection URLs. Public MCP is `/mcp` only; local telemetry stays on the private
helmet link. The ngrok helper receives only the credentials it needs.

## Change discipline

Read current state first. Check likely power/cable/COM-port causes before changing
firmware for an apparent hardware failure. Keep capture/calibration behavior and
live/simulated boundaries intact. Run the tests relevant to a behavior change,
save the actual result, update current state and commit the working step.
Avoid large rearrangements during the event. Synced parent `sources/` is read-only.

The user requests a Claude second opinion for material demo/product choices and
technical uncertainty. Use the existing **Hackathon project strategy** browser
chat, share the concrete proposal and verified context, and check its advice
against code and receipts. Keep credentials out of the discussion. This is a
second review, not an extra permission gate.
