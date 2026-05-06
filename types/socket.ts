/**
 * Types Socket.IO - Contrats stricts Client ↔ Server
 *
 * Architecture: Event-driven avec acknowledgements typés
 * Sécurité: Validation Zod côté serveur pour tous les payloads
 */

import type { MessageType, MemberRole } from "@prisma/client";

// ─────────────────────────────────────────────
// Client → Server Events
// ─────────────────────────────────────────────

export interface ClientToServerEvents {
  "message:send": (
    payload: SendMessagePayload,
    ack?: (result: SendMessageAck) => void,
  ) => void;

  "message:read": (payload: ReadMessagePayload) => void;
  "message:react": (payload: ReactMessagePayload) => void;
  "message:pin": (payload: PinMessagePayload) => void;
  "message:delete": (payload: DeleteMessagePayload) => void;

  typing: (payload: TypingPayload) => void;
  "presence:update": (payload: PresencePayload) => void;

  "conversation:join": (payload: JoinConversationPayload) => void;
  "conversation:leave": (payload: LeaveConversationPayload) => void;
  "conversation:typing": (payload: TypingPayload) => void;
}

// ─────────────────────────────────────────────
// Server → Client Events
// ─────────────────────────────────────────────

export interface ServerToClientEvents {
  "message:receive": (payload: MessagePayload) => void;
  "message:sent": (payload: MessageSentPayload) => void;
  "message:read": (payload: MessageReadPayload) => void;
  "message:reacted": (payload: MessageReactedPayload) => void;
  "message:pinned": (payload: MessagePinnedPayload) => void;
  "message:deleted": (payload: MessageDeletedPayload) => void;

  typing: (payload: TypingEventPayload) => void;
  "presence:update": (payload: PresenceUpdatePayload) => void;

  error: (payload: SocketErrorPayload) => void;
  connected: (payload: { socketId: string }) => void;
}

// ─────────────────────────────────────────────
// Payloads détaillés
// ─────────────────────────────────────────────

export interface SendMessagePayload {
  conversationId: string;
  cipher: string; // Ciphertext base64 (E2E)
  nonce: string; // Nonce base64 (24 bytes libsodium)
  tempId?: string; // ID temporaire client pour tracking
  type: MessageType;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  duration?: number; // Secondes pour audio
  replyToId?: string; // ID message parent (thread)
}

export interface SendMessageAck {
  success: boolean;
  id?: string; // ID permanent serveur
  tempId?: string; // Echo du tempId
  error?: {
    code: ErrorCode;
    message: string;
    retryAfter?: number;
  };
}

export interface MessagePayload {
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
  type: MessageType;
  fileUrl?: string;
  fileName?: string;
  duration?: number;
  replyToId?: string;
  createdAt: string; // ISO 8601
  dedupHash: string; // SHA-256 pour déduplication
  pinned: boolean;
}

export interface MessageSentPayload {
  id: string;
  tempId?: string;
  status: "sent" | "delivered" | "read";
  timestamp: string;
}

export interface ReadMessagePayload {
  messageId: string;
  conversationId: string;
}

export interface MessageReadPayload {
  messageId: string;
  userId: string;
  readAt: string;
}

export interface ReactMessagePayload {
  messageId: string;
  emoji: string; // Unicode emoji
}

export interface MessageReactedPayload {
  messageId: string;
  userId: string;
  emoji: string;
  added: boolean; // true = ajouté, false = retiré
}

export interface PinMessagePayload {
  messageId: string;
  conversationId: string;
  pinned: boolean;
}

export interface MessagePinnedPayload {
  messageId: string;
  conversationId: string;
  pinned: boolean;
  pinnedBy: string;
  pinnedAt: string;
}

export interface DeleteMessagePayload {
  messageId: string;
  conversationId: string;
}

export interface MessageDeletedPayload {
  messageId: string;
  conversationId: string;
  deletedBy: string;
  deletedAt: string;
}

export interface TypingPayload {
  conversationId: string;
}

export interface TypingEventPayload {
  conversationId: string;
  userId: string;
  username: string;
}

export interface PresencePayload {
  status: "online" | "away" | "offline" | "dnd";
}

export interface PresenceUpdatePayload {
  userId: string;
  status: "online" | "away" | "offline" | "dnd";
  lastSeen?: string;
}

export interface JoinConversationPayload {
  conversationId: string;
}

export interface LeaveConversationPayload {
  conversationId: string;
}

// ─────────────────────────────────────────────
// Error Handling
// ─────────────────────────────────────────────

export type ErrorCode =
  | "AUTH_REQUIRED"
  | "SESSION_EXPIRED"
  | "INVALID_TOKEN"
  | "FORBIDDEN"
  | "VALIDATION"
  | "RATE_LIMITED"
  | "MESSAGE_TOO_OLD"
  | "REPLAY_ATTACK"
  | "INTERNAL"
  | "CONVERSATION_NOT_FOUND"
  | "NOT_MEMBER";

export interface SocketErrorPayload {
  code: ErrorCode;
  message: string;
  retryAfter?: number;
  details?: unknown;
}

// ─────────────────────────────────────────────
// Socket Data (auth middleware)
// ─────────────────────────────────────────────

export interface SocketData {
  userId: string;
  username: string;
  email: string;
}
