"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export type RealtimeMessage = {
  id: string;
  end_user_id: string;
  direction: "in" | "out";
  body: string;
  sent_as_proxy: boolean;
  created_at: string;
  sent_by_staff_id: string | null;
};

export type MessageRealtimeListener = (message: RealtimeMessage) => void;

type ListenerEntry = {
  listener: MessageRealtimeListener;
  filter?: (message: RealtimeMessage) => boolean;
};

let channel: RealtimeChannel | null = null;
let subscriberCount = 0;
const listeners = new Set<ListenerEntry>();

function parseRealtimeMessage(payload: Record<string, unknown>): RealtimeMessage | null {
  const id = payload.id;
  const endUserId = payload.end_user_id;
  const direction = payload.direction;
  const body = payload.body;
  const createdAt = payload.created_at;

  if (
    typeof id !== "string" ||
    typeof endUserId !== "string" ||
    (direction !== "in" && direction !== "out") ||
    typeof body !== "string" ||
    typeof createdAt !== "string"
  ) {
    return null;
  }

  return {
    id,
    end_user_id: endUserId,
    direction,
    body,
    sent_as_proxy: Boolean(payload.sent_as_proxy),
    created_at: createdAt,
    sent_by_staff_id:
      typeof payload.sent_by_staff_id === "string" ? payload.sent_by_staff_id : null,
  };
}

function notifyListeners(message: RealtimeMessage) {
  for (const entry of listeners) {
    if (entry.filter && !entry.filter(message)) {
      continue;
    }
    entry.listener(message);
  }
}

function ensureChannel() {
  if (channel) {
    return;
  }

  const supabase = createClient();

  channel = supabase
    .channel("message-realtime")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
      },
      (payload) => {
        const message = parseRealtimeMessage(payload.new as Record<string, unknown>);
        if (message) {
          notifyListeners(message);
        }
      }
    )
    .subscribe();
}

function teardownChannel() {
  if (!channel) {
    return;
  }

  const supabase = createClient();
  supabase.removeChannel(channel);
  channel = null;
}

export function subscribeToMessages(
  listener: MessageRealtimeListener,
  filter?: (message: RealtimeMessage) => boolean
): () => void {
  const entry: ListenerEntry = { listener, filter };
  listeners.add(entry);
  subscriberCount += 1;
  ensureChannel();

  return () => {
    listeners.delete(entry);
    subscriberCount -= 1;

    if (subscriberCount <= 0) {
      subscriberCount = 0;
      teardownChannel();
    }
  };
}
