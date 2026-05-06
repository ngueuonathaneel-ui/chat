/**
 * Page Conversation - Affichage des messages et composer
 *
 * Architecture:
 * - Server Component pour header (données initiales)
 * - Client Components pour real-time (MessageList, Composer)
 * - E2E encryption via libsodium
 */

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { ConversationContainer } from "@/components/chat/ConversationContainer";
import { ConversationContent } from "@/components/chat/ConversationContent";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function getConversation(id: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatarUrl: true,
              publicKey: true,
            },
          },
        },
      },
    },
  });

  return conversation;
}

export default async function ConversationPage({ params }: PageProps) {
  const { id } = await params;
  const conversation = await getConversation(id);

  if (!conversation) {
    notFound();
  }

  // Format pour le header
  const otherMembers = conversation.members.filter(
    (m: any) => m.role !== "OWNER",
  );
  const title = conversation.isGroup
    ? conversation.title || "Groupe sans nom"
    : otherMembers[0]?.user.username || "Inconnu";

  return (
    <ConversationContainer conversationId={id}>
      <ChatHeader
        title={title}
        isGroup={conversation.isGroup}
        members={conversation.members.map((m) => ({
          id: m.user.id,
          username: m.user.username,
          avatarUrl: m.user.avatarUrl,
          role: m.role,
        }))}
        memberCount={conversation.members.length}
      />

      <ConversationContent conversationId={id} />
    </ConversationContainer>
  );
}
