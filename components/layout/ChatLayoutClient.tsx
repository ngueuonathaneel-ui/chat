/**
 * ChatLayoutClient - Layout interactif côté client
 *
 * Features:
 * - Sidebar responsive avec toggle mobile
 * - Sélection de conversation
 * - Gestion des états de loading
 */

"use client";

import { useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { ConversationList } from "@/components/chat/ConversationList";
import { NewConversationDialog } from "@/components/chat/NewConversationDialog";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";

interface ChatLayoutClientProps {
  children: React.ReactNode;
  initialConversations: Array<{
    id: string;
    title: string | null;
    isGroup: boolean;
    members: Array<{
      user: {
        id: string;
        username: string;
        avatarUrl: string | null;
      };
    }>;
    lastMessage?: {
      content: string;
      createdAt: string;
      sender: {
        username: string;
      };
    };
    unreadCount: number;
    isPinned: boolean;
    updatedAt: string;
  }>;
}

export function ChatLayoutClient({
  children,
  initialConversations,
}: ChatLayoutClientProps) {
  const router = useRouter();
  const params = useParams();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [conversations] = useState(initialConversations);
  const [isNewOpen, setIsNewOpen] = useState(false);

  const selectedId = typeof params?.id === "string" ? params.id : null;

  const handleSelect = useCallback(
    (id: string) => {
      router.push(`/conversations/${id}`);
      setIsMobileMenuOpen(false);
    },
    [router],
  );

  const handleCreate = useCallback(() => {
    setIsNewOpen(true);
  }, []);

  return (
    <>
      {/* Mobile menu toggle (glass) */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10 rounded-full glass border-border/60"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label={isMobileMenuOpen ? "Fermer le menu" : "Ouvrir le menu"}
        >
          {isMobileMenuOpen ? (
            <X className="w-5 h-5" />
          ) : (
            <Menu className="w-5 h-5" />
          )}
        </Button>
      </div>

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:relative z-40 w-80 h-full",
          "bg-sidebar border-r border-sidebar-border",
          "transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          isMobileMenuOpen
            ? "translate-x-0"
            : "-translate-x-full lg:translate-x-0",
        )}
      >
        <ConversationList
          conversations={conversations}
          selectedId={selectedId}
          onSelect={handleSelect}
          onCreate={handleCreate}
        />
      </aside>

      {/* Mobile overlay */}
      {isMobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-foreground/20 backdrop-blur-sm z-30"
          onClick={() => setIsMobileMenuOpen(false)}
          aria-hidden
        />
      )}

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 h-full bg-background">
        {children}
      </main>

      {/* New conversation modal */}
      <NewConversationDialog
        open={isNewOpen}
        onClose={() => setIsNewOpen(false)}
        onCreated={() => setIsNewOpen(false)}
      />
    </>
  );
}
