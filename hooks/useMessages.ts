/**
 * Hook useMessages - Pagination infinie avec déduplication
 *
 * Algorithmes:
 * - Pagination cursor-based: O(log n) avec index composite
 * - Déduplication: Hash SHA-256 + Set avec fenêtre temporelle
 * - Race condition handling: tempId → id mapping
 */

"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { useInView } from "react-intersection-observer";
import { useSocketContext } from "@/providers/SocketProvider";
import { computeDedupHash, decryptMessage } from "@/lib/crypto-client";
import { useSession } from "next-auth/react";

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  sender: {
    id: string;
    username: string;
    avatarUrl: string | null;
  };
  cipher: string;
  nonce: string;
  decryptedContent?: string;
  type: "TEXT" | "VOICE" | "FILE" | "LINK_PREVIEW";
  fileUrl?: string;
  fileName?: string;
  duration?: number;
  replyToId?: string;
  createdAt: string;
  dedupHash: string;
  pinned: boolean;
  status: "sending" | "sent" | "delivered" | "read";
  tempId?: string;
  reactions: Array<{
    emoji: string;
    userIds: string[];
  }>;
}

interface UseMessagesReturn {
  messages: Message[];
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  sentinelRef: (node?: Element | null) => void;
  sendMessage: (
    content: string,
    type?: Message["type"],
    options?: { fileUrl?: string; replyToId?: string; nonce?: string },
  ) => Promise<void>;
  markAsRead: (messageId: string) => void;
  addReaction: (messageId: string, emoji: string) => void;
  pinMessage: (messageId: string, pinned: boolean) => void;
}

const PAGE_SIZE = 30;

export function useMessages(conversationId: string): UseMessagesReturn {
  const { data: session } = useSession();
  const { emit, on, off } = useSocketContext();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingNextPage, setIsFetchingNextPage] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // Set pour déduplication O(1)
  const seenHashesRef = useRef<Set<string>>(new Set());
  const tempIdMapRef = useRef<Map<string, string>>(new Map()); // tempId -> serverId
  const isFetchingRef = useRef(false);
  const lastConversationIdRef = useRef<string | null>(null);

  // Intersection Observer pour infinite scroll
  const { ref: sentinelRef, inView } = useInView({
    threshold: 0,
    rootMargin: "200px",
  });

  // Fetch initial
  useEffect(() => {
    if (!conversationId) return;

    // Guard contre React Strict Mode double-render
    if (lastConversationIdRef.current === conversationId) return;
    lastConversationIdRef.current = conversationId;

    const fetchInitial = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(
          `/api/conversations/${conversationId}/messages?limit=${PAGE_SIZE}`,
        );
        if (!res.ok) throw new Error("Failed to fetch");

        const data = await res.json();
        const msgs = data.messages as Message[];

        // Déchiffrement E2E (stub temporaire)
        const dummyPublicKey = new Uint8Array(32);
        const dummyPrivateKey = new Uint8Array(32);
        const decryptedMsgs = await Promise.all(
          msgs.map(async (m) => ({
            ...m,
            decryptedContent: await decryptMessage(
              m.cipher,
              m.nonce,
              dummyPublicKey,
              dummyPrivateKey,
            ),
          })),
        );

        // Filtrer les doublons
        const unique = decryptedMsgs.filter((m) => {
          if (seenHashesRef.current.has(m.dedupHash)) return false;
          seenHashesRef.current.add(m.dedupHash);
          return true;
        });

        setMessages(unique);
        setHasNextPage(data.hasMore);
        setNextCursor(data.nextCursor);
      } catch (error) {
        console.error("Failed to fetch messages:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchInitial();

    // Reset state on conversation change
    return () => {
      const seenHashes = seenHashesRef.current;
      const tempIdMap = tempIdMapRef.current;
      seenHashes.clear();
      tempIdMap.clear();
    };
  }, [conversationId]);

  // Fetch next page (infinite scroll)
  useEffect(() => {
    if (!inView || !hasNextPage || isFetchingNextPage || isLoading) return;
    if (isFetchingRef.current) return;

    const fetchNext = async () => {
      isFetchingRef.current = true;
      setIsFetchingNextPage(true);

      try {
        const res = await fetch(
          `/api/conversations/${conversationId}/messages?cursor=${nextCursor}&limit=${PAGE_SIZE}`,
        );
        if (!res.ok) throw new Error("Failed to fetch");

        const data = await res.json();
        const msgs = data.messages as Message[];

        // Déchiffrement E2E (stub temporaire)
        const dummyPublicKey = new Uint8Array(32);
        const dummyPrivateKey = new Uint8Array(32);
        const decryptedMsgs = await Promise.all(
          msgs.map(async (m) => ({
            ...m,
            decryptedContent: await decryptMessage(
              m.cipher,
              m.nonce,
              dummyPublicKey,
              dummyPrivateKey,
            ),
          })),
        );

        // Filtrer les doublons
        const unique = decryptedMsgs.filter((m) => {
          if (seenHashesRef.current.has(m.dedupHash)) return false;
          seenHashesRef.current.add(m.dedupHash);
          return true;
        });

        // Append (les messages sont déjà ordonnés DESC par le serveur)
        setMessages((prev) => [...prev, ...unique]);
        setHasNextPage(data.hasMore);
        setNextCursor(data.nextCursor);
      } catch (error) {
        console.error("Failed to fetch next page:", error);
      } finally {
        setIsFetchingNextPage(false);
        isFetchingRef.current = false;
      }
    };

    fetchNext();
  }, [
    inView,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    nextCursor,
    conversationId,
  ]);

  // Socket event handlers
  useEffect(() => {
    if (!conversationId) return;

    const handleReceive = async (payload: Message) => {
      // Déduplication côté client
      if (seenHashesRef.current.has(payload.dedupHash)) {
        return;
      }

      // Vérifier si c'est un de nos messages (matching tempId)
      if (payload.senderId === session?.user?.id) {
        const tempId = Array.from(tempIdMapRef.current.entries()).find(
          ([, serverId]) => serverId === payload.id,
        )?.[0];

        if (tempId) {
          // Mettre à jour le message existant au lieu d'en créer un nouveau
          setMessages((prev) =>
            prev.map((m) =>
              m.tempId === tempId ? { ...payload, status: "delivered" } : m,
            ),
          );
          return;
        }
      }

      // Déchiffrement E2E (stub temporaire)
      const dummyPublicKey = new Uint8Array(32);
      const dummyPrivateKey = new Uint8Array(32);
      const decryptedContent = await decryptMessage(
        payload.cipher,
        payload.nonce,
        dummyPublicKey,
        dummyPrivateKey,
      );

      seenHashesRef.current.add(payload.dedupHash);
      setMessages((prev) => [...prev, { ...payload, decryptedContent }]);
    };

    const handleSent = (payload: {
      id: string;
      tempId?: string;
      status: string;
    }) => {
      if (payload.tempId) {
        tempIdMapRef.current.set(payload.tempId, payload.id);

        setMessages((prev) =>
          prev.map((m) =>
            m.tempId === payload.tempId
              ? {
                  ...m,
                  id: payload.id,
                  status: payload.status as Message["status"],
                }
              : m,
          ),
        );
      }
    };

    const handleRead = (payload: { messageId: string; userId: string }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === payload.messageId ? { ...m, status: "read" } : m,
        ),
      );
    };

    const handleReacted = (payload: {
      messageId: string;
      userId: string;
      emoji: string;
      added: boolean;
    }) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== payload.messageId) return m;

          const reactions = [...m.reactions];
          const existingIdx = reactions.findIndex(
            (r) => r.emoji === payload.emoji,
          );

          if (payload.added) {
            if (existingIdx >= 0) {
              reactions[existingIdx].userIds.push(payload.userId);
            } else {
              reactions.push({
                emoji: payload.emoji,
                userIds: [payload.userId],
              });
            }
          } else {
            if (existingIdx >= 0) {
              reactions[existingIdx].userIds = reactions[
                existingIdx
              ].userIds.filter((id) => id !== payload.userId);
              if (reactions[existingIdx].userIds.length === 0) {
                reactions.splice(existingIdx, 1);
              }
            }
          }

          return { ...m, reactions };
        }),
      );
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on("message:receive", handleReceive as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on("message:sent", handleSent as any);
    on("message:read", handleRead);
    on("message:reacted", handleReacted);

    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      off("message:receive", handleReceive as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      off("message:sent", handleSent as any);
      off("message:read", handleRead);
      off("message:reacted", handleReacted);
    };
  }, [conversationId, on, off, session?.user?.id]);

  // Actions
  const sendMessage = useCallback(
    async (
      cipher: string,
      type: Message["type"] = "TEXT",
      options?: { fileUrl?: string; replyToId?: string; nonce?: string },
    ) => {
      if (!session?.user) return;

      const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date();
      const dedupHash = await computeDedupHash(cipher, session.user.id, now);

      // Optimistic update
      const optimisticMessage: Message = {
        id: tempId,
        tempId,
        conversationId,
        senderId: session.user.id,
        sender: {
          id: session.user.id,
          username: session.user.name || "Unknown",
          avatarUrl: session.user.image || null,
        },
        cipher,
        nonce: options?.nonce || "",
        type,
        fileUrl: options?.fileUrl,
        replyToId: options?.replyToId,
        createdAt: now.toISOString(),
        dedupHash,
        pinned: false,
        status: "sending",
        reactions: [],
      };

      setMessages((prev) => [...prev, optimisticMessage]);

      // Envoyer via Socket.IO
      emit("message:send", {
        conversationId,
        cipher,
        nonce: options?.nonce || "",
        tempId,
        type,
        fileUrl: options?.fileUrl,
        replyToId: options?.replyToId,
      });
    },
    [conversationId, emit, session],
  );

  const markAsRead = useCallback(
    (messageId: string) => {
      emit("message:read", { messageId, conversationId });
    },
    [conversationId, emit],
  );

  const addReaction = useCallback(
    (messageId: string, emoji: string) => {
      emit("message:react", { messageId, emoji });
    },
    [emit],
  );

  const pinMessage = useCallback(
    (messageId: string, pinned: boolean) => {
      emit("message:pin", { messageId, conversationId, pinned });
    },
    [conversationId, emit],
  );

  return {
    messages,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    sentinelRef,
    sendMessage,
    markAsRead,
    addReaction,
    pinMessage,
  };
}
