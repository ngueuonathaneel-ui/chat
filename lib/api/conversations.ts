/**
 * API Functions - Server-side data fetching
 *
 * Architecture:
 * - Server Actions / API helpers
 * - Prisma queries optimisées
 * - Type-safe responses
 */

import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function getConversations() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return [];
  }

  const conversations = await prisma.conversation.findMany({
    where: {
      members: {
        some: {
          userId: session.user.id,
        },
      },
    },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatarUrl: true,
            },
          },
        },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          sender: {
            select: {
              username: true,
            },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return conversations.map((conv) => ({
    id: conv.id,
    title: conv.title,
    isGroup: conv.isGroup,
    avatarUrl: conv.avatarUrl,
    members: conv.members,
    lastMessage: conv.messages[0]
      ? {
          content: conv.messages[0].content.substring(0, 100), // Truncated
          createdAt: conv.messages[0].createdAt.toISOString(),
          sender: {
            username: conv.messages[0].sender.username,
          },
        }
      : undefined,
    unreadCount: 0, // TODO: Calculate based on lastReadAt
    isPinned: false, // TODO: Add pinned field to ConversationMember
    updatedAt: conv.updatedAt.toISOString(),
  }));
}

export async function getMessages(
  conversationId: string,
  options: {
    cursor?: string;
    limit?: number;
  } = {},
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const { cursor, limit = 30 } = options;

  // Verify membership
  const membership = await prisma.conversationMember.findFirst({
    where: {
      conversationId,
      userId: session.user.id,
    },
  });

  if (!membership) {
    throw new Error("Forbidden");
  }

  // Build cursor filter
  let cursorFilter = {};
  if (cursor) {
    try {
      const decoded = Buffer.from(cursor, "base64url").toString("utf-8");
      const [timestamp, id] = decoded.split("::");
      cursorFilter = {
        OR: [
          { createdAt: { lt: new Date(timestamp) } },
          { createdAt: { equals: new Date(timestamp) }, id: { lt: id } },
        ],
      };
    } catch {
      // Invalid cursor, ignore
    }
  }

  const messages = await prisma.message.findMany({
    where: {
      conversationId,
      ...cursorFilter,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1, // +1 to check for more
    include: {
      sender: {
        select: {
          id: true,
          username: true,
          avatarUrl: true,
        },
      },
      reactions: {
        select: {
          emoji: true,
          userId: true,
        },
      },
    },
  });

  const hasMore = messages.length > limit;
  const sliced = hasMore ? messages.slice(0, limit) : messages;

  // Group reactions by emoji
  const messagesWithReactions = sliced.map((msg) => ({
    ...msg,
    reactions: Object.entries(
      msg.reactions.reduce(
        (acc, r) => {
          if (!acc[r.emoji]) acc[r.emoji] = [];
          acc[r.emoji].push(r.userId);
          return acc;
        },
        {} as Record<string, string[]>,
      ),
    ).map(([emoji, userIds]) => ({ emoji, userIds })),
  }));

  // Generate next cursor
  const nextCursor =
    hasMore && sliced.length > 0
      ? Buffer.from(
          `${sliced[sliced.length - 1].createdAt.toISOString()}::${sliced[sliced.length - 1].id}`,
        ).toString("base64url")
      : null;

  return {
    messages: messagesWithReactions,
    nextCursor,
    hasMore,
  };
}
