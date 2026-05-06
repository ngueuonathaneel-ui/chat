/**
 * API Route: GET /api/conversations/[id]/messages
 *
 * Features:
 * - Cursor-based pagination (O(log n))
 * - Auth middleware (membership check)
 * - Response with dedup hashes
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: conversationId } = await params;
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor");
    const limit = Math.min(parseInt(searchParams.get("limit") || "30"), 100);

    // Verify membership
    const membership = await prisma.conversationMember.findFirst({
      where: {
        conversationId,
        userId: session.user.id,
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Build cursor filter (ASC order)
    let cursorFilter = {};
    if (cursor) {
      try {
        const decoded = Buffer.from(cursor, "base64url").toString("utf-8");
        const [timestamp, id] = decoded.split("::");
        cursorFilter = {
          OR: [
            { createdAt: { gt: new Date(timestamp) } },
            { createdAt: { equals: new Date(timestamp) }, id: { gt: id } },
          ],
        };
      } catch {
        // Invalid cursor, ignore
      }
    }

    // Fetch messages with cursor-based pagination (ASC pour afficher plus récents en bas)
    const messages = await prisma.message.findMany({
      where: {
        conversationId,
        ...cursorFilter,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: limit + 1,
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
      id: msg.id,
      conversationId: msg.conversationId,
      senderId: msg.senderId,
      sender: msg.sender,
      cipher: msg.content, // Renamed for clarity (E2E encrypted)
      nonce: msg.nonce,
      type: msg.type,
      fileUrl: msg.fileUrl,
      fileName: msg.fileName,
      duration: msg.duration,
      replyToId: msg.replyToId,
      createdAt: msg.createdAt.toISOString(),
      dedupHash: msg.dedupHash,
      pinned: msg.pinned,
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

    return NextResponse.json({
      messages: messagesWithReactions,
      nextCursor,
      hasMore,
    });
  } catch (error) {
    console.error("Messages API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
