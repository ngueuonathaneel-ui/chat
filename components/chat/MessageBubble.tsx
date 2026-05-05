/**
 * MessageBubble - Composant de bulle de message
 * 
 * Design:
 * - Animations Framer Motion (spring physics)
 * - Tailwind personnalisé avec couleurs CSS variables
 * - Réactions emoji-mart intégrées
 * - Pin indicator
 * 
 * Accessibilité:
 * - ARIA labels pour statut
 * - Contraste WCAG AA
 */

'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Check, CheckCheck, Pin, MoreVertical } from 'lucide-react';
import type { Message } from '@/hooks/useMessages';

interface MessageBubbleProps {
  message: Message;
  isSelf: boolean;
  onReact?: (messageId: string, emoji: string) => void;
  onPin?: (messageId: string, pinned: boolean) => void;
  showReactions?: boolean;
}

const statusIcons = {
  sending: null,
  sent: <Check className="w-3 h-3" />,
  delivered: <CheckCheck className="w-3 h-3" />,
  read: <CheckCheck className="w-3 h-3 text-blue-400" />,
};

export function MessageBubble({
  message,
  isSelf,
  onReact,
  onPin,
  showReactions = true,
}: MessageBubbleProps) {
  const [showActions, setShowActions] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const handleReaction = useCallback(
    (emoji: string) => {
      onReact?.(message.id, emoji);
      setShowEmojiPicker(false);
    },
    [message.id, onReact]
  );

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        type: 'spring',
        stiffness: 400,
        damping: 28,
        mass: 0.8,
      }}
      className={cn(
        'group relative flex max-w-[85%] md:max-w-[70%]',
        isSelf ? 'ml-auto flex-row-reverse' : 'mr-auto flex-row'
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => {
        setShowActions(false);
        setShowEmojiPicker(false);
      }}
    >
      {/* Avatar (visible only for other users in groups) */}
      {!isSelf && (
        <div className="flex-shrink-0 mr-2 mt-auto">
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
            {message.sender.username.charAt(0).toUpperCase()}
          </div>
        </div>
      )}

      {/* Message Content */}
      <div className="flex flex-col">
        {/* Sender name (for group chats) */}
        {!isSelf && (
          <span className="text-xs text-muted-foreground mb-1 ml-1">
            {message.sender.username}
          </span>
        )}

        {/* Bubble */}
        <div
          className={cn(
            'relative px-4 py-2.5 rounded-2xl text-[15px] leading-relaxed',
            'break-words whitespace-pre-wrap',
            'transition-all duration-200',
            isSelf
              ? 'rounded-br-md'
              : 'rounded-bl-md',
            // Colors via CSS variables for dark mode support
            isSelf
              ? 'text-[var(--message-self-text)]'
              : 'text-[var(--message-other-text)]'
          )}
          style={{
            backgroundColor: isSelf
              ? 'var(--message-self)'
              : 'var(--message-other)',
          }}
        >
          {/* Pin indicator */}
          {message.pinned && (
            <div className="absolute -top-2 -right-2">
              <Pin className="w-4 h-4 text-[var(--message-pinned)] fill-[var(--message-pinned)]" />
            </div>
          )}

          {/* Reply indicator */}
          {message.replyToId && (
            <div className="text-xs opacity-70 mb-1 border-l-2 border-current pl-2">
              Réponse à un message
            </div>
          )}

          {/* Message text (decrypted) */}
          {message.decryptedContent || message.cipher}

          {/* Footer: Time + Status */}
          <div
            className={cn(
              'flex items-center gap-1 mt-1 text-[11px]',
              isSelf ? 'justify-end' : 'justify-start',
              isSelf ? 'opacity-80' : 'opacity-60'
            )}
          >
            <time className="font-mono tracking-tight">
              {formatTime(message.createdAt)}
            </time>
            {isSelf && statusIcons[message.status] && (
              <span className="ml-1">{statusIcons[message.status]}</span>
            )}
          </div>
        </div>

        {/* Reactions */}
        {showReactions && message.reactions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className={cn(
              'flex gap-1 mt-1 flex-wrap',
              isSelf ? 'justify-end' : 'justify-start'
            )}
          >
            {message.reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                onClick={() => handleReaction(reaction.emoji)}
                className={cn(
                  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs',
                  'bg-background/80 border border-border/50',
                  'hover:bg-accent transition-colors'
                )}
              >
                <span>{reaction.emoji}</span>
                {reaction.userIds.length > 1 && (
                  <span className="text-muted-foreground">
                    {reaction.userIds.length}
                  </span>
                )}
              </button>
            ))}
          </motion.div>
        )}
      </div>

      {/* Actions Menu (on hover) */}
      <AnimatePresence>
        {showActions && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className={cn(
              'absolute top-0 flex gap-1',
              isSelf ? 'left-0 -translate-x-full pr-2' : 'right-0 translate-x-full pl-2'
            )}
          >
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="p-1.5 rounded-full bg-background/90 shadow-sm border border-border/50 hover:bg-accent transition-colors"
              aria-label="Ajouter une réaction"
            >
              <span className="text-sm">😊</span>
            </button>
            
            <button
              onClick={() => onPin?.(message.id, !message.pinned)}
              className={cn(
                'p-1.5 rounded-full bg-background/90 shadow-sm border border-border/50 hover:bg-accent transition-colors',
                message.pinned && 'text-[var(--message-pinned)]'
              )}
              aria-label={message.pinned ? 'Désépingler' : 'Épingler'}
            >
              <Pin className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick Emoji Picker */}
      <AnimatePresence>
        {showEmojiPicker && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className={cn(
              'absolute z-20 flex gap-1 p-2 rounded-lg bg-background shadow-lg border border-border',
              isSelf ? 'right-full mr-2' : 'left-full ml-2'
            )}
            style={{ bottom: '100%' }}
          >
            {['👍', '❤️', '😂', '😮', '😢', '🙏'].map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleReaction(emoji)}
                className="text-lg hover:scale-125 transition-transform p-1"
              >
                {emoji}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
