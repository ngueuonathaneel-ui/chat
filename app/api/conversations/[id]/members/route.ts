/**
 * /api/conversations/[id]/members
 *
 *   POST → ajoute un membre (OWNER/ADMIN seulement)
 *
 * Délégation suppression sur /api/conversations/[id]/members/[userId]
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const AddSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["MEMBER", "ADMIN"]).default("MEMBER"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const me = await prisma.conversationMember.findFirst({
    where: { conversationId: id, userId: session.user.id },
  });
  if (!me || (me.role !== "OWNER" && me.role !== "ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = AddSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  // Idempotent : conflict if already member
  const exists = await prisma.conversationMember.findFirst({
    where: { conversationId: id, userId: parsed.data.userId },
  });
  if (exists) {
    return NextResponse.json({ error: "Already a member" }, { status: 409 });
  }

  const member = await prisma.conversationMember.create({
    data: {
      conversationId: id,
      userId: parsed.data.userId,
      role: parsed.data.role,
    },
    include: {
      user: { select: { id: true, username: true, avatarUrl: true } },
    },
  });
  return NextResponse.json({ member }, { status: 201 });
}
