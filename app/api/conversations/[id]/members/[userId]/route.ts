/**
 * /api/conversations/[id]/members/[userId]
 *
 *   DELETE → retire un membre (OWNER/ADMIN, ou self-leave)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, userId: targetId } = await params;

  const me = await prisma.conversationMember.findFirst({
    where: { conversationId: id, userId: session.user.id },
  });
  if (!me) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const isSelf = targetId === session.user.id;
  const isPrivileged = me.role === "OWNER" || me.role === "ADMIN";
  if (!isSelf && !isPrivileged) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isSelf) {
    const target = await prisma.conversationMember.findFirst({
      where: { conversationId: id, userId: targetId },
    });
    if (target?.role === "OWNER") {
      return NextResponse.json(
        { error: "Cannot remove owner" },
        { status: 403 }
      );
    }
  }

  await prisma.conversationMember.deleteMany({
    where: { conversationId: id, userId: targetId },
  });
  return NextResponse.json({ success: true });
}
