/**
 * /api/ai/summarize
 *
 * Résume les N derniers messages d'une conversation pour l'utilisateur.
 * Sécurité : nécessite l'appartenance à la conversation.
 * Note : les messages sont chiffrés en base. Ici on opère sur leur version
 *        en clair fournie par le client (qui détient les clés). Pour une
 *        vraie E2E, il faut soit (a) IA locale dans le navigateur, soit
 *        (b) accepter un compromis "résumé côté serveur" + zero-knowledge proof.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { summarizeConversation } from "@/lib/ai/summarize";

const Schema = z.object({
  conversationId: z.string().uuid(),
  messages: z.array(z.string().min(1).max(2000)).min(1).max(200),
  maxSentences: z.number().int().min(1).max(10).optional(),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation" }, { status: 400 });
  }
  const member = await prisma.conversationMember.findFirst({
    where: {
      conversationId: parsed.data.conversationId,
      userId: session.user.id,
    },
  });
  if (!member) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const summary = await summarizeConversation(parsed.data.messages, {
    maxSentences: parsed.data.maxSentences,
  });
  return NextResponse.json({ summary });
}
