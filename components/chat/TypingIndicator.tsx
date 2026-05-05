/**
 * TypingIndicator - Animation de saisie en cours
 * 
 * Design:
 * - 3 dots avec animation staggered
 * - Couleur adaptative au thème
 * - Layout minimaliste dans bubble
 */

'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface TypingIndicatorProps {
  username?: string;
  className?: string;
}

export function TypingIndicator({ username, className }: TypingIndicatorProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-4 py-3 rounded-2xl rounded-bl-md w-fit',
        className
      )}
      style={{
        backgroundColor: 'var(--message-other)',
        color: 'var(--message-other-text)',
      }}
    >
      {username && (
        <span className="text-xs text-muted-foreground">
          {username}
        </span>
      )}
      
      <div className="flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: 'var(--typing-dot-color)' }}
            animate={{
              opacity: [0.3, 1, 0.3],
              y: [0, -4, 0],
            }}
            transition={{
              duration: 1.4,
              repeat: Infinity,
              delay: i * 0.2,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>
    </div>
  );
}
