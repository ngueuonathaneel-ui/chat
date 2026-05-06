/**
 * ConversationContent - Connecte MessageList et Composer à useMessages
 */

"use client";

import { MessageList } from "./MessageList";
import { Composer } from "./Composer";
import { useMessages } from "@/hooks/useMessages";
import { encryptMessage } from "@/lib/crypto-client";

interface ConversationContentProps {
  conversationId: string;
}

export function ConversationContent({
  conversationId,
}: ConversationContentProps) {
  const { sendMessage } = useMessages(conversationId);

  const handleSend = async (
    content: string,
    type: "TEXT" | "VOICE" | "FILE",
    options?: { fileUrl?: string },
  ) => {
    // Chiffrement E2E (stub temporaire - à remplacer par libsodium)
    const dummyPublicKey = new Uint8Array(32);
    const dummyPrivateKey = new Uint8Array(32);
    const { cipher, nonce } = await encryptMessage(
      content,
      dummyPublicKey,
      dummyPrivateKey,
    );

    sendMessage(cipher, type, { fileUrl: options?.fileUrl, nonce });
  };

  return (
    <>
      <MessageList conversationId={conversationId} />
      <Composer conversationId={conversationId} onSend={handleSend} />
    </>
  );
}
