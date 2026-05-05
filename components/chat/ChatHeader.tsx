/**
 * ChatHeader - En-tête de conversation
 * 
 * Features:
 * - Titre et avatar dynamiques
 * - Indication du nombre de membres (groupes)
 * - Menu d'options (recherche, infos, etc.)
 * - Status online/offline
 */

'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Users, Search, Phone, Video, Info, MoreVertical, ChevronLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface ChatHeaderProps {
  title: string;
  isGroup: boolean;
  members: Array<{
    id: string;
    username: string;
    avatarUrl: string | null;
    role: string;
  }>;
  memberCount: number;
  isOnline?: boolean;
  lastSeen?: string;
}

export function ChatHeader({
  title,
  isGroup,
  members,
  memberCount,
  isOnline,
  lastSeen,
}: ChatHeaderProps) {
  const router = useRouter();
  const [showSearch, setShowSearch] = useState(false);

  const statusText = isGroup
    ? `${memberCount} membres`
    : isOnline
    ? 'En ligne'
    : lastSeen
    ? `Vu ${lastSeen}`
    : 'Hors ligne';

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        {/* Back button (mobile) */}
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden h-9 w-9"
          onClick={() => router.push('/conversations')}
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>

        {/* Avatar */}
        <div className="relative">
          {isGroup ? (
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
              {title.charAt(0).toUpperCase()}
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
              {title.charAt(0).toUpperCase()}
            </div>
          )}

          {/* Online indicator (for 1:1) */}
          {!isGroup && (
            <span
              className={cn(
                'absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background',
                isOnline ? 'bg-[var(--status-online)]' : 'bg-[var(--status-offline)]'
              )}
            />
          )}
        </div>

        {/* Info */}
        <div className="min-w-0">
          <h1 className="font-semibold text-base truncate">{title}</h1>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            {isGroup && <Users className="w-3 h-3" />}
            {statusText}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {/* Search toggle */}
        <AnimatePresence>
          {showSearch && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 'auto', opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <input
                type="text"
                placeholder="Rechercher dans la conversation..."
                className="h-9 px-3 rounded-lg bg-muted text-sm border-0 focus:ring-2 focus:ring-primary/30 w-64"
                autoFocus
              />
            </motion.div>
          )}
        </AnimatePresence>

        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={() => setShowSearch(!showSearch)}
        >
          <Search className="w-5 h-5" />
        </Button>

        <Button variant="ghost" size="icon" className="h-9 w-9 hidden sm:flex">
          <Phone className="w-5 h-5" />
        </Button>

        <Button variant="ghost" size="icon" className="h-9 w-9 hidden sm:flex">
          <Video className="w-5 h-5" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <MoreVertical className="w-5 h-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>
              <Info className="w-4 h-4 mr-2" />
              Infos du groupe
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Search className="w-4 h-4 mr-2" />
              Rechercher
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive">
              Quitter la conversation
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
