/**
 * MessageList - Liste des messages avec infinite scroll
 * 
 * Algorithmes:
 * - Pagination infinie avec Intersection Observer
 * - Déduplication côté client (hash-based)
 * - Grouping par date (Aujourd'hui, Hier, etc.)
 * - Auto-scroll to bottom sur nouveaux messages
 * 
 * Performance:
 * - Virtualization pour >100 messages (optionnel)
 * - Memoization des composants MessageBubble
 */

'use client';

import { useRef, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';
import { useMessages } from '@/hooks/useMessages';
import { Loader2, MessageSquare } from 'lucide-react';
import { useSession } from 'next-auth/react';

interface MessageListProps {
  conversationId: string;
  typingUsers?: string[];
}

function formatDateSeparator(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  
  if (date.toDateString() === now.toDateString()) {
    return 'Aujourd\'hui';
  }
  
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Hier';
  }
  
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function groupMessagesByDate(messages: ReturnType<typeof useMessages>['messages']) {
  const groups: { date: string; messages: typeof messages }[] = [];
  
  messages.forEach((message) => {
    const dateKey = new Date(message.createdAt).toDateString();
    const lastGroup = groups[groups.length - 1];
    
    if (lastGroup && lastGroup.date === dateKey) {
      lastGroup.messages.push(message);
    } else {
      groups.push({ date: dateKey, messages: [message] });
    }
  });
  
  return groups;
}

export function MessageList({ conversationId, typingUsers = [] }: MessageListProps) {
  const { data: session } = useSession();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);
  
  const {
    messages,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    sentinelRef,
    sendMessage,
    markAsRead,
    addReaction,
    pinMessage,
  } = useMessages(conversationId);

  // Scroll to bottom on new messages (if user was already at bottom)
  useEffect(() => {
    if (wasAtBottomRef.current && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Track scroll position
  const handleScroll = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    
    const { scrollTop, scrollHeight, clientHeight } = container;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    wasAtBottomRef.current = isAtBottom;
  }, []);

  // Group messages by date
  const groupedMessages = useMemo(() => groupMessagesByDate(messages), [messages]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
        <MessageSquare className="w-16 h-16 mb-4 opacity-20" />
        <p className="text-lg font-medium">Aucun message</p>
        <p className="text-sm">Envoyez le premier message pour démarrer la conversation</p>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4"
    >
      {/* Sentinel for infinite scroll (top) */}
      {hasNextPage && (
        <div ref={sentinelRef} className="flex justify-center py-4">
          {isFetchingNextPage && (
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          )}
        </div>
      )}

      {/* Message groups */}
      <div className="space-y-6">
        {groupedMessages.map((group) => (
          <div key={group.date} className="space-y-4">
            {/* Date separator */}
            <div className="flex justify-center">
              <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
                {formatDateSeparator(group.messages[0].createdAt)}
              </span>
            </div>

            {/* Messages */}
            <div className="space-y-3">
              <AnimatePresence initial={false}>
                {group.messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    isSelf={message.senderId === session?.user?.id}
                    onReact={addReaction}
                    onPin={pinMessage}
                  />
                ))}
              </AnimatePresence>
            </div>
          </div>
        ))}
      </div>

      {/* Typing indicators */}
      {typingUsers.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-end"
        >
          <TypingIndicator username={typingUsers[0]} />
        </motion.div>
      )}

      {/* Bottom anchor */}
      <div ref={bottomRef} />
    </div>
  );
}
