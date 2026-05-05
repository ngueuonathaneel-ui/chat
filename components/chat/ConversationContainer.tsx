/**
 * ConversationContainer - Wrapper client pour la logique E2E et real-time
 *
 * Responsabilités:
 * - Gestion des clés E2E (génération, stockage sessionStorage)
 * - Échange de clés Diffie-Hellman avec les autres membres
 * - Chiffrement/déchiffrement des messages
 */

"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { generateKeyPair } from "@/lib/crypto-client";
import { Button } from "@/components/ui/button";
import { Lock, Loader2 } from "lucide-react";

interface ConversationContainerProps {
  conversationId: string;
  children: React.ReactNode;
}

interface KeyState {
  myKeys: { publicKey: Uint8Array; privateKey: Uint8Array } | null;
  theirPublicKeys: Map<string, Uint8Array>;
  isInitialized: boolean;
  error: string | null;
}

export function ConversationContainer({
  conversationId,
  children,
}: ConversationContainerProps) {
  const { data: session } = useSession();
  const [keyState, setKeyState] = useState<KeyState>({
    myKeys: null,
    theirPublicKeys: new Map(),
    isInitialized: false,
    error: null,
  });
  const [isSettingUp, setIsSettingUp] = useState(true);

  // Initialize E2E keys
  useEffect(() => {
    if (!session?.user?.id || !conversationId) return;

    const setupE2E = async () => {
      try {
        setIsSettingUp(true);

        // Check for existing keys in sessionStorage
        const storageKey = `e2e_keys_${conversationId}_${session.user.id}`;
        const stored = sessionStorage.getItem(storageKey);

        let myKeys: { publicKey: Uint8Array; privateKey: Uint8Array };

        if (stored) {
          const parsed = JSON.parse(stored);
          myKeys = {
            publicKey: new Uint8Array(parsed.publicKey),
            privateKey: new Uint8Array(parsed.privateKey),
          };
        } else {
          myKeys = await generateKeyPair();
          sessionStorage.setItem(
            storageKey,
            JSON.stringify({
              publicKey: Array.from(myKeys.publicKey),
              privateKey: Array.from(myKeys.privateKey),
            }),
          );
        }

        setKeyState((prev) => ({
          ...prev,
          myKeys,
          isInitialized: true,
        }));

        // TODO: Exchange public keys with server/other members
      } catch (error) {
        console.error("E2E setup error:", error);
        setKeyState((prev) => ({
          ...prev,
          error: "Failed to initialize encryption",
        }));
      } finally {
        setIsSettingUp(false);
      }
    };

    setupE2E();
  }, [conversationId, session?.user?.id]);

  if (isSettingUp) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Initialisation du chiffrement...</span>
        </div>
      </div>
    );
  }

  if (keyState.error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
        <Lock className="w-12 h-12 text-destructive" />
        <p className="text-destructive font-medium">{keyState.error}</p>
        <Button onClick={() => window.location.reload()}>Réessayer</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Context provider would go here for E2E functions */}
      {children}
    </div>
  );
}
