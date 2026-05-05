/**
 * ConversationList — Sidebar moderne
 *
 * Algorithme de tri :
 *   1. Pinned > non-pinned (priorité absolue)
 *   2. À pinned/non-pinned égal : tri par updatedAt desc
 *   Complexité : O(n log n) — Array.prototype.sort (TimSort)
 *
 * Algorithme de recherche :
 *   - Normalisation (lowercase + NFD strip d'accents)
 *   - Match sur title + tous usernames concaténés
 *   - Filtrage O(n) avant tri (réduit n)
 *
 * UX :
 *   - Header glass collant
 *   - Search avec ⌘K hint
 *   - User card en bas avec status + theme toggle
 */

'use client';

import { useState, useMemo } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  Search,
  Plus,
  Pin,
  LogOut,
  Settings,
  MessageSquarePlus,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';

interface Conversation {
  id: string;
  title: string | null;
  avatarUrl?: string | null;
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
}

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate?: () => void;
}

/* ─────────────────── Algorithmes utilitaires ─────────────────── */

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function formatLastMessageTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Hier';

  if (diff < 7 * 24 * 60 * 60 * 1000) {
    return date.toLocaleDateString('fr-FR', { weekday: 'short' });
  }

  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function getDisplayName(conv: Conversation, currentUserId: string): string {
  if (conv.isGroup) return conv.title || 'Groupe sans nom';
  const other = conv.members.find((m) => m.user.id !== currentUserId);
  return other?.user.username || 'Inconnu';
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('') || '?';
}

/* Avatar deterministic gradient based on string hash (FNV-1a 32-bit) */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const AVATAR_GRADIENTS = [
  'from-indigo-500 to-purple-500',
  'from-pink-500 to-rose-500',
  'from-amber-500 to-orange-500',
  'from-emerald-500 to-teal-500',
  'from-sky-500 to-blue-500',
  'from-violet-500 to-fuchsia-500',
  'from-cyan-500 to-blue-500',
  'from-red-500 to-pink-500',
];

function avatarGradient(seed: string): string {
  return AVATAR_GRADIENTS[fnv1a(seed) % AVATAR_GRADIENTS.length];
}

/* ─────────────────── Component ─────────────────── */

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  onCreate,
}: ConversationListProps) {
  const { data: session } = useSession();
  const [searchQuery, setSearchQuery] = useState('');
  const currentUserId = session?.user?.id ?? '';

  const filtered = useMemo(() => {
    const q = normalize(searchQuery.trim());
    const filteredList = q
      ? conversations.filter((conv) => {
          const title = normalize(conv.title || '');
          const members = conv.members
            .map((m) => normalize(m.user.username))
            .join(' ');
          return title.includes(q) || members.includes(q);
        })
      : conversations;

    return [...filteredList].sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [conversations, searchQuery]);

  return (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground">
      {/* === Header === */}
      <header className="px-4 pt-5 pb-3 border-b border-sidebar-border space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-gradient flex items-center justify-center shadow-sm">
              <MessageSquarePlus
                className="w-4 h-4 text-white"
                strokeWidth={2.5}
              />
            </div>
            <h2 className="text-base font-semibold tracking-tight">Cipher</h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg hover:bg-sidebar-accent"
            onClick={onCreate}
            aria-label="Nouvelle conversation"
          >
            <Plus className="w-4.5 h-4.5" />
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher une conversation…"
            className={cn(
              'pl-9 pr-12 h-10 bg-sidebar-accent/40 border-sidebar-border/50',
              'focus-visible:bg-sidebar-accent focus-visible:ring-1'
            )}
          />
          <kbd className="hidden sm:inline-flex absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground bg-muted rounded border border-border/60 pointer-events-none">
            ⌘K
          </kbd>
        </div>
      </header>

      {/* === List === */}
      <div className="flex-1 overflow-y-auto custom-scrollbar py-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center text-muted-foreground">
            <div className="w-12 h-12 rounded-full bg-sidebar-accent/50 flex items-center justify-center mb-3">
              <Search className="w-5 h-5" />
            </div>
            <p className="text-sm font-medium text-foreground">
              {searchQuery ? 'Aucun résultat' : 'Aucune conversation'}
            </p>
            <p className="text-xs mt-1">
              {searchQuery
                ? 'Essayez un autre terme de recherche'
                : 'Démarrez une nouvelle conversation'}
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {filtered.map((conv) => {
              const displayName = getDisplayName(conv, currentUserId);
              const isSelected = selectedId === conv.id;
              const seed = conv.id;
              return (
                <motion.button
                  key={conv.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  layout
                  onClick={() => onSelect(conv.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 mx-1 rounded-xl text-left',
                    'transition-all duration-200',
                    'hover:bg-sidebar-accent/60',
                    isSelected &&
                      'bg-sidebar-accent shadow-sm ring-1 ring-sidebar-border/60'
                  )}
                >
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    <div
                      className={cn(
                        'w-11 h-11 rounded-full flex items-center justify-center',
                        'text-white text-sm font-semibold shadow-sm',
                        'bg-gradient-to-br',
                        avatarGradient(seed)
                      )}
                    >
                      {getInitials(displayName)}
                    </div>
                    {!conv.isGroup && (
                      <span
                        className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-sidebar pulse-ring"
                        style={{ background: 'var(--success)' }}
                        aria-label="En ligne"
                      />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {conv.isPinned && (
                          <Pin className="w-3 h-3 text-warning fill-warning shrink-0" />
                        )}
                        <span
                          className={cn(
                            'truncate text-sm',
                            conv.unreadCount > 0
                              ? 'font-semibold'
                              : 'font-medium'
                          )}
                        >
                          {displayName}
                        </span>
                      </div>
                      {conv.lastMessage && (
                        <span
                          className={cn(
                            'text-[10px] shrink-0 tabular-nums',
                            conv.unreadCount > 0
                              ? 'text-primary font-medium'
                              : 'text-muted-foreground'
                          )}
                        >
                          {formatLastMessageTime(conv.lastMessage.createdAt)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p
                        className={cn(
                          'text-xs truncate',
                          conv.unreadCount > 0
                            ? 'text-foreground/80'
                            : 'text-muted-foreground'
                        )}
                      >
                        {conv.lastMessage
                          ? `${conv.lastMessage.sender.username}: ${conv.lastMessage.content}`
                          : 'Nouvelle conversation'}
                      </p>
                      {conv.unreadCount > 0 && (
                        <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center">
                          {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* === User card === */}
      <footer className="border-t border-sidebar-border p-3 space-y-3">
        <div className="flex items-center justify-center">
          <ThemeToggle />
        </div>

        <div className="flex items-center gap-3 p-2 rounded-xl bg-sidebar-accent/40">
          <div className="relative shrink-0">
            <div
              className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center',
                'text-white text-xs font-semibold shadow-sm',
                'bg-gradient-to-br',
                avatarGradient(session?.user?.email || 'me')
              )}
            >
              {getInitials(session?.user?.name || session?.user?.email || '?')}
            </div>
            <span
              className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-sidebar"
              style={{ background: 'var(--success)' }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">
              {session?.user?.name || session?.user?.email || 'Utilisateur'}
            </div>
            <div className="text-[10px] text-muted-foreground">En ligne</div>
          </div>
          <div className="flex gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 hover:bg-sidebar-accent"
              aria-label="Paramètres"
            >
              <Settings className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => signOut({ callbackUrl: '/login' })}
              aria-label="Déconnexion"
            >
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}
