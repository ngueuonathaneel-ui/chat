/**
 * Conversations List Page
 *
 * - Server Component pour data fetching initial
 * - Redirect vers la première conversation si disponible
 * - Empty state avec CTA
 */

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { EmptyConversations } from "@/components/chat/EmptyConversations";

export default async function ConversationsPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  // Get user's conversations
  const conversations = await prisma.conversation.findMany({
    where: {
      members: {
        some: {
          userId: session.user.id,
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: 1,
    select: {
      id: true,
    },
  });

  // If user has conversations, redirect to the most recent one
  if (conversations.length > 0) {
    redirect(`/conversations/${conversations[0].id}`);
  }

  // Otherwise, show empty state
  return <EmptyConversations />;
}
