# Inkbox setup

Created on October 16, 2026 for the helmet prototype, under Mike's Org in the
Inkbox account signed in as `[local-account-email]`.

- Identity: `@your-helmet-agent` (Helmet Agent).
- Mailbox: `your-helmet-agent@inkboxmail.com`.
- Runtime key: **Helmet demo runtime**, scoped to this identity.
- Live API checks confirmed an active key, active identity/mailbox, and shared
  messaging enabled. See `../evidence/inkbox-setup-status.json` for the receipt.
- On October 16, the user connected their phone through the shared router.
  The API confirmed one active connection and receipt of their inbound `START`
  message. See `../evidence/inkbox-phone-connection-status.json`.
- One explicitly requested test reply was sent to the user's active conversation.
  Inkbox reported it delivered over iMessage. See
  `../evidence/inkbox-outbound-test-status.json` for the message ID and timestamps.
  This is provider-confirmed delivery; the user has not yet confirmed seeing it.
- October 17 server integration: a real 20.71599 g relative helmet-impact reading
  for #44 was retrieved and drawn in `/inspector`, then `flag_for_review` sent
  message `3de3f95d-8486-4980-89b5-773d17785494`. Inkbox reported **delivered** and
  the user explicitly confirmed **Yes — message arrived**. The saved hit and
  review survived a server restart; a repeated tool call returned that same message.
  See `../evidence/server-live-checkpoint.json` and `../evidence/server-restart-review.json`.
- No dedicated number or paid subscription was purchased, and no calls were placed.

## Private variable set

The live variables are encrypted with Windows DPAPI for the current Windows
account at:

`C:\Users\Small\AppData\Local\HelmetAgent\secrets\inkbox.dpapi`

The private directory has inheritance disabled and allows only the current
Windows user and SYSTEM. The file is outside this repository and OneDrive.
It contains the API key, identity ID/handle, mailbox address, and shared router
connection details. `INKBOX_PHONE_NUMBER` and `INKBOX_TRAINER_PHONE` are blank.
The temporary encrypted transfer key was removed after import.
An attempted update to add the connected demo recipient was blocked by automatic
approval review before execution. The encrypted variable set remains unchanged;
the recipient is available through the authenticated connection API.

No plaintext API key is saved in a project `.env`, source code, shell command,
or Git. `server/.env.example` documents the variable names without the live key.
The SDK base URL is `https://inkbox.ai`; REST paths begin with `/api/v1`.

From the `helmet-agent` folder in PowerShell:

```powershell
# Read-only check: no messages or calls; prints only safe status fields.
.\server\scripts\Test-Inkbox.ps1

# Load variables into this terminal and programs started from it.
. .\server\scripts\Load-Inkbox.ps1
```

The second command prints no key. The Node server uses `process.env.INKBOX_API_KEY`
and `process.env.INKBOX_CONVERSATION_ID`. The loader pins the already-connected
conversation from the verified START receipt without modifying the encrypted key.
The whole-system launcher `tools/Start-Helmet.ps1` does this automatically.
Close a manually loaded terminal when finished, or remove the process variables:

```powershell
Get-ChildItem Env:INKBOX_* | Remove-Item
```

DPAPI encryption is specific to this Windows account and machine. It is not a
cloud deployment secret store or a portable backup. Programs running as this
Windows user can access loaded variables. For deployment, supply the key through
the host's private secret manager; do not copy the encrypted local file into Git.
Rotate/revoke keys through <https://inkbox.ai/console/api-keys>.

## Connect the demo phone

The free shared service requires the recipient to initiate the connection. The
router returned by the authenticated API during setup was **[router-discovered-at-runtime]**.
From the intended demo/trainer phone, send this exact text to that number:

```text
connect @your-helmet-agent
```

Follow Inkbox's confirmation in Messages. The router can change: the read-only
check above resolves its current number again. It is a shared connection router,
not a dedicated number owned by this project. The explicit helmet review tool is
now implemented. An autonomous agent alert loop has not been added.

The confirmation supplies the agent's direct messaging number. Tap that number
and send `START` there. This inbound step was successfully verified for the user
on October 16. The router number and direct messaging number serve different
purposes; use the number supplied by the current confirmation for direct texts.

Inkbox documents shared messaging with recipient opt-in and SMS/RCS fallback.
Outbound delivery to the connected phone was verified through Inkbox's delivery
status for the single test reply. The send used the existing conversation ID,
so no local recipient phone-number setting was needed. Its idempotency key and
message ID are saved in `../evidence/inkbox-outbound-test-request.json`; inspect
that message instead of sending duplicates if reconciling this test later.
A dedicated VoIP SMS/voice number is a paid option; no upgrade was purchased.

Future alert text must describe **relative helmet-impact telemetry**, ask for
human review, and avoid claims of concussion diagnosis or measured head forces.

Official references:

- [Key scopes and authentication](https://inkbox.ai/docs/api-keys)
- [Shared router and recipient connection](https://inkbox.ai/docs/api/imessage/router)
- [Pricing](https://inkbox.ai/pricing)
