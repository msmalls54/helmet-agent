// Read-only check of the historical connectivity message. Never sends a message.
import { readFileSync } from "node:fs";
import { inkboxMessenger } from "../src/inkbox.js";
const prior = JSON.parse(readFileSync(new URL("../../evidence/inkbox-outbound-test-status.json", import.meta.url), "utf8").replace(/^\uFEFF/, ""));
const receipt = await inkboxMessenger().read(prior.message_id);
console.log(JSON.stringify({ checked_at_utc: new Date().toISOString(), read_only: true, messages_sent: 0, previous_test_receipt: receipt }, null, 2));
