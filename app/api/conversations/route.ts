/**
 * /api/conversations
 *
 *   GET  → liste des conversations de l'utilisateur (avec dernier message + unread)
 *   POST → crée une nouvelle conversation (DM ou group)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const CreateSchema = z.object({
  memberIds: z.array(z.string().uuid()).min(1).max(50),
  title: z.string().max(80).optional(),
  isGroup: z.boolean().default(false),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const conversations = await prisma.conversation.findMany({
    where: { members: { some: { userId } } },
    orderBy: { updatedAt: "desc" },
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
          sender: { select: { username: true } },
        },
      },
    },
  });

  // Compute unreadCount per conversation
  const result = await Promise.all(
    conversations.map(async (conv) => {
      const me = conv.members.find((m) => m.userId === userId);
      const lastReadAt = me?.lastReadAt ?? new Date(0);
      const unreadCount = await prisma.message.count({
        where: {
          conversationId: conv.id,
          createdAt: { gt: lastReadAt },
          senderId: { not: userId },
        },
      });
      const lastMessage = conv.messages[0];
      return {
        id: conv.id,
        title: conv.title,
        isGroup: conv.isGroup,
        avatarUrl: conv.avatarUrl,
        members: conv.members,
        lastMessage: lastMessage
          ? {
              content: lastMessage.content,
              createdAt: lastMessage.createdAt.toISOString(),
              sender: { username: lastMessage.sender.username },
            }
          : undefined,
        unreadCount,
        isPinned: false,
        updatedAt: conv.updatedAt.toISOString(),
      };
    })
  );

  return NextResponse.json({ conversations: result });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { memberIds, title, isGroup } = parsed.data;
  const allMemberIds = Array.from(new Set([userId, ...memberIds]));

  // For DMs (2 members), reuse existing conversation if any.
  if (!isGroup && allMemberIds.length === 2) {
    const [a, b] = allMemberIds;
    const existing = await prisma.conversation.findFirst({
      where: {
        isGroup: false,
        AND: [
          { members: { some: { userId: a } } },
          { members: { some: { userId: b } } },
        ],
      },
    });
    if (existing) {
      return NextResponse.json({ conversation: existing }, { status: 200 });
    }
  }

  const conversation = await prisma.conversation.create({
    data: {
      title: isGroup ? title : null,
      isGroup,
      members: {
        create: allMemberIds.map((id) => ({
          userId: id,
          role: id === userId ? "OWNER" : "MEMBER",
        })),
      },
    },
    include: {
      members: { include: { user: { select: { id: true, username: true, avatarUrl: true } } } },
    },
  });

  return NextResponse.json({ conversation }, { status: 201 });
}
