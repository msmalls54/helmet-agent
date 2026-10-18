import { Inkbox } from "@inkbox/sdk";
import type { IMessage } from "@inkbox/sdk";

export interface Delivery {
  message_id: string; conversation_id: string; status: string;
  service: string; recipient_delivery_status: string | null;
  delivered_at: string | null;
}
export interface Messenger {
  conversationId: string;
  send(text: string, key: string): Promise<Delivery>;
  read(id: string): Promise<Delivery>;
}

export function inkboxMessenger(env = process.env): Messenger {
  const key = env.INKBOX_API_KEY;
  const identity = env.INKBOX_AGENT_ID;
  const conversation = env.INKBOX_CONVERSATION_ID;
  const base = env.INKBOX_BASE_URL || "https://inkbox.ai";
  if (!key || !identity || !conversation) throw new Error("Load the encrypted Inkbox environment and connected conversation first.");
  if (base.replace(/\/$/, "") !== "https://inkbox.ai") throw new Error("Inkbox origin must be https://inkbox.ai.");
  const client = new Inkbox({ apiKey: key, baseUrl: base, timeoutMs: 3000 });
  const compact = (message: IMessage): Delivery => {
    if (message.conversationId !== conversation || message.direction !== "outbound") throw new Error("Unexpected provider message identity.");
    const recipient = message.recipients?.[0];
    return { message_id: message.id, conversation_id: conversation,
      status: message.status ?? "accepted", service: message.service,
      recipient_delivery_status: recipient?.deliveryStatus ?? null,
      delivered_at: recipient?.deliveredAt?.toISOString() ?? null };
  };
  return {
    conversationId: conversation,
    async send(text, idempotencyKey) {
      const target = await client.imessages.getConversation(conversation, { agentIdentityId: identity });
      if (target.assignmentStatus !== "active" || target.isGroup) throw new Error("Intended one-to-one Inkbox connection is not active.");
      return compact(await client.imessages.send({ conversationId: conversation, agentIdentityId: identity, text, idempotencyKey }));
    },
    async read(id) { return compact(await client.imessages.get(id, { agentIdentityId: identity })); },
  };
}
