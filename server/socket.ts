/**
 * Socket.IO Server
 *
 * Architecture:
 * - Separate from Next.js (can run standalone)
 * - Redis adapter for horizontal scaling
 * - Zod validation for all events
 * - Rate limiting per user
 */

import { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { pubClient, subClient, checkRateLimit } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { computeDedupHash } from "@/lib/crypto";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from "@/types/socket";

// Validation schemas
const SendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  cipher: z
    .string()
    .min(1)
    .max(10 * 1024 * 1024), // Max 10MB
  nonce: z.string().min(1),
  tempId: z.string().optional(),
  type: z.enum(["TEXT", "VOICE", "FILE", "LINK_PREVIEW"]).default("TEXT"),
  fileUrl: z.string().optional(),
  fileName: z.string().optional(),
  fileSize: z.number().optional(),
  duration: z.number().optional(),
  replyToId: z.string().uuid().optional(),
});

const TypingSchema = z.object({
  conversationId: z.string().uuid(),
});

export function createSocketServer(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer<
    ClientToServerEvents,
    ServerToClientEvents,
    never,
    SocketData
  >(httpServer, {
    path: "/api/socket",
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:3000",
      credentials: true,
    },
    transports: ["websocket", "polling"],
    pingTimeout: 30000,
    pingInterval: 10000,
  });

  // Redis adapter for scaling
  io.adapter(createAdapter(pubClient, subClient));

  // Auth middleware
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;

    if (!token) {
      console.error("[Socket] Auth failed: no token");
      return next(new Error("AUTH_REQUIRED"));
    }

    try {
      const jwtSecret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET;
      if (!jwtSecret) {
        console.error("[Socket] Auth failed: no JWT secret configured");
        return next(new Error("INVALID_TOKEN"));
      }
      const decoded = jwt.verify(token, jwtSecret) as {
        sub: string;
        email: string;
        name: string;
      };

      // Verify session in Redis
      const sessionValid = await import("@/lib/redis").then((m) =>
        m.isSessionValid(decoded.sub, token),
      );

      if (!sessionValid) {
        console.error(
          "[Socket] Auth failed: session expired for user",
          decoded.sub,
        );
        return next(new Error("SESSION_EXPIRED"));
      }

      socket.data = {
        userId: decoded.sub,
        email: decoded.email,
        username: decoded.name,
      };

      console.log("[Socket] Auth success:", decoded.sub, decoded.name);
      next();
    } catch (error) {
      console.error("[Socket] Auth failed: invalid token", error);
      next(new Error("INVALID_TOKEN"));
    }
  });

  io.on("connection", (socket) => {
    console.log(`[Socket] Connected: ${socket.id} (${socket.data.username})`);

    const userId = socket.data.userId;

    socket.on("disconnect", (reason) => {
      console.log(`[Socket] Disconnected: ${socket.id}, reason: ${reason}`);
    });

    socket.on("error", (error) => {
      console.error(`[Socket] Error on ${socket.id}:`, error);
    });

    // Join user's rooms (conversations)
    joinUserConversations(socket, userId);

    // Message handler
    socket.on("message:send", async (payload, ack) => {
      try {
        // Rate limiting
        const rateLimit = await checkRateLimit(
          userId,
          "message:send",
          10000, // 10 second window
          30, // 30 messages max
        );

        if (!rateLimit.allowed) {
          ack?.({
            success: false,
            error: {
              code: "RATE_LIMITED",
              message: "Too many messages",
              retryAfter: Math.ceil((rateLimit.resetTime - Date.now()) / 1000),
            },
          });
          return;
        }

        // Validation
        const data = SendMessageSchema.parse(payload);

        // Verify membership
        const membership = await prisma.conversationMember.findFirst({
          where: {
            conversationId: data.conversationId,
            userId,
          },
        });

        if (!membership) {
          ack?.({
            success: false,
            error: { code: "FORBIDDEN", message: "Not a member" },
          });
          return;
        }

        // Compute dedup hash
        const dedupHash = await computeDedupHash(
          data.cipher,
          userId,
          new Date(),
        );

        // Create message
        const message = await prisma.message.create({
          data: {
            conversationId: data.conversationId,
            senderId: userId,
            content: data.cipher,
            nonce: data.nonce,
            type: data.type,
            fileUrl: data.fileUrl,
            fileName: data.fileName,
            fileSize: data.fileSize,
            duration: data.duration,
            replyToId: data.replyToId,
            dedupHash,
          },
          include: {
            sender: {
              select: {
                id: true,
                username: true,
                avatarUrl: true,
              },
            },
          },
        });

        // Broadcast to room
        const messagePayload = {
          id: message.id,
          conversationId: message.conversationId,
          senderId: message.senderId,
          sender: message.sender,
          cipher: message.content,
          nonce: message.nonce,
          type: message.type,
          fileUrl: message.fileUrl ?? undefined,
          fileName: message.fileName ?? undefined,
          duration: message.duration ?? undefined,
          replyToId: message.replyToId ?? undefined,
          createdAt: message.createdAt.toISOString(),
          dedupHash: message.dedupHash,
          pinned: message.pinned,
          reactions: [],
        };

        io.to(`conversation:${data.conversationId}`).emit(
          "message:receive",
          messagePayload,
        );

        // Acknowledge sender
        ack?.({
          success: true,
          id: message.id,
          tempId: data.tempId,
        });

        // Also send 'sent' confirmation
        socket.emit("message:sent", {
          id: message.id,
          tempId: data.tempId,
          status: "sent",
          timestamp: message.createdAt.toISOString(),
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          ack?.({
            success: false,
            error: {
              code: "VALIDATION",
              message: "Invalid payload",
            },
          });
        } else {
          console.error("Message send error:", error);
          ack?.({
            success: false,
            error: { code: "INTERNAL", message: "Server error" },
          });
        }
      }
    });

    // Typing handler
    socket.on("typing", async (payload) => {
      try {
        const data = TypingSchema.parse(payload);

        // Rate limit: 1 typing event per 3 seconds per conversation
        const rateLimit = await checkRateLimit(
          `${userId}:${data.conversationId}`,
          "typing",
          3000,
          1,
        );

        if (!rateLimit.allowed) return;

        // Verify membership
        const membership = await prisma.conversationMember.findFirst({
          where: {
            conversationId: data.conversationId,
            userId,
          },
        });

        if (!membership) return;

        // Broadcast to others in room
        socket.to(`conversation:${data.conversationId}`).emit("typing", {
          conversationId: data.conversationId,
          userId,
          username: socket.data.username,
        });
      } catch {
        // Ignore validation errors for typing
      }
    });

    // Presence update
    socket.on("presence:update", async (payload) => {
      const { setUserPresence } = await import("@/lib/redis");
      await setUserPresence(userId, payload.status);

      // Broadcast to all users
      io.emit("presence:update", {
        userId,
        status: payload.status,
        lastSeen: new Date().toISOString(),
      });
    });

    // Handle disconnection
    socket.on("disconnect", async (reason) => {
      console.log(`[Socket] Disconnected: ${socket.id}, reason: ${reason}`);

      // Mark as offline
      const { setUserPresence } = await import("@/lib/redis");
      await setUserPresence(userId, "offline", new Date());

      io.emit("presence:update", {
        userId,
        status: "offline",
        lastSeen: new Date().toISOString(),
      });
    });
  });

  return io;
}

async function joinUserConversations(
  socket: SocketIOServer["sockets"]["sockets"] extends Map<string, infer V>
    ? V
    : never,
  userId: string,
) {
  const memberships = await prisma.conversationMember.findMany({
    where: { userId },
    select: { conversationId: true },
  });

  for (const { conversationId } of memberships) {
    socket.join(`conversation:${conversationId}`);
  }
}
