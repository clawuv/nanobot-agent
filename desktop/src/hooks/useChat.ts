import { useState, useCallback, useRef } from "react";
import { useWebSocket, type WSMessage } from "./useWebSocket";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  images?: string[];
  timestamp: string;
  isStreaming?: boolean;
}

interface UseChatOptions {
  gatewayUrl?: string;
  sessionKey?: string;
  modelId?: string;
}

export function useChat({
  gatewayUrl = "ws://localhost:18790",
  sessionKey = "desktop:direct",
  modelId,
}: UseChatOptions = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const currentSessionKey = useRef(sessionKey);
  currentSessionKey.current = sessionKey;
  const currentModelId = useRef(modelId);
  currentModelId.current = modelId;

  const onMessage = useCallback((msg: WSMessage) => {
    switch (msg.type) {
      case "progress":
        setProgress(msg.content);
        break;

      case "tool_hint":
        setProgress(`🔧 ${msg.content}`);
        break;

      case "reply":
        setIsLoading(false);
        setProgress("");
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: msg.content,
            timestamp: new Date().toISOString(),
          },
        ]);
        break;

      case "error":
        setIsLoading(false);
        setProgress("");
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: "assistant",
            content: `⚠️ ${msg.content}`,
            timestamp: new Date().toISOString(),
          },
        ]);
        break;
    }
  }, []);

  const { connected, sendMessage } = useWebSocket({
    url: `${gatewayUrl}/api/chat`,
    onMessage,
  });

  const send = useCallback(
    (content: string, images: string[] = []) => {
      if (!content.trim() && images.length === 0) return;

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: content.trim(),
        images,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);
      setProgress("");
      sendMessage(content.trim(), currentSessionKey.current, images, currentModelId.current);
    },
    [sendMessage]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setProgress("");
    setIsLoading(false);
  }, []);

  const loadSession = useCallback(
    async (key: string) => {
      currentSessionKey.current = key;
      try {
        const safeKey = key.replace(":", "__");
        const res = await fetch(
          `${gatewayUrl.replace("ws://", "http://").replace("wss://", "https://")}/api/sessions/${safeKey}`
        );
        if (res.ok) {
          const data = await res.json();
          setMessages(
            (data.messages || []).map((m: any, i: number) => ({
              id: `${m.role}-${i}`,
              role: m.role,
              content: typeof m.content === "string" ? m.content : "",
              images: Array.isArray(m.images) ? m.images : [],
              timestamp: m.timestamp || "",
            }))
          );
        }
      } catch {
        // Failed to load session; start fresh
        setMessages([]);
      }
    },
    [gatewayUrl]
  );

  return {
    messages,
    isLoading,
    progress,
    connected,
    send,
    clearMessages,
    loadSession,
    sessionKey: currentSessionKey,
  };
}
