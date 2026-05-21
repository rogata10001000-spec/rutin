"use client";

import { useEffect, useRef } from "react";
import {
  subscribeToMessages,
  type MessageRealtimeListener,
  type RealtimeMessage,
} from "@/lib/message-realtime";

export function useMessageRealtime(
  onMessage: MessageRealtimeListener,
  filter?: (message: RealtimeMessage) => boolean
) {
  const onMessageRef = useRef(onMessage);
  const filterRef = useRef(filter);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    filterRef.current = filter;
  }, [filter]);

  useEffect(() => {
    return subscribeToMessages((message) => {
      onMessageRef.current(message);
    }, (message) => (filterRef.current ? filterRef.current(message) : true));
  }, []);
}
