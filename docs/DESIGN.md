# Design System & UI/UX

> Spécification complète du design system. Tokens, typographie, espacement, dark mode, micro-interactions, et responsive mobile-first. Ce document est la source de vérité pour tout choix visuel.

---

## Table des matières

1. [Philosophie de design](#1-philosophie-de-design)
2. [Tokens de design](#2-tokens-de-design)
3. [Typographie](#3-typographie)
4. [Composants Shadcn/UI customisés](#4-composants-shadcnui-customisés)
5. [Dark mode](#5-dark-mode)
6. [Micro-interactions & animations](#6-micro-interactions--animations)
7. [Responsive & breakpoints](#7-responsive--breakpoints)
8. [Maquettes d'écran](#8-maquettes-décran)

---

## 1. Philosophie de design

**Principe directeur :** *Clarté sans froideur. Densité sans chaos.*

- **Mobile-first** : le layout est conçu pour 375px de large, puis étendu.
- **Hiérarchie par l'espace** : pas de bordures, la séparation se fait par le spacing.
- **Feedback immédiat** : chaque action produit une réponse visuelle en < 100ms.
- **Accessibilité** : contraste WCAG 2.1 AA minimum, focus rings visibles, réduction de mouvement respectée (`prefers-reduced-motion`).

---

## 2. Tokens de design

### 2.1 Couleurs

```css
/* tailwind.config.ts — thème étendu */
export default {
  theme: {
    extend: {
      colors: {
        /* Base neutres */
        background: {
          DEFAULT: '#ffffff',
          dark: '#0f0f11',
        },
        surface: {
          DEFAULT: '#f8f9fb',
          dark: '#18181b',
          elevated: '#ffffff',
          'elevated-dark': '#1f1f23',
        },
        /* Textes */
        foreground: {
          DEFAULT: '#09090b',
          dark: '#fafafa',
          muted: '#71717a',
          'muted-dark': '#a1a1aa',
        },
        /* Accent — indigo électrique */
        primary: {
          DEFAULT: '#4f46e5',
          dark: '#6366f1',
          hover: '#4338ca',
          'hover-dark': '#818cf8',
          subtle: '#e0e7ff',
          'subtle-dark': '#312e81',
        },
        /* Sémantique */
        success: '#22c55e',
        warning: '#f59e0b',
        danger: '#ef4444',
        info: '#3b82f6',
        /* Conversation */
        message: {
          self: '#4f46e5',
          selfText: '#ffffff',
          other: '#f4f4f5',
          otherText: '#18181b',
          otherDark: '#27272a',
          otherTextDark: '#fafafa',
        },
      },
    },
  },
};
```

### 2.2 Espacement

| Token | Valeur | Usage |
|-------|--------|-------|
| `space-1` | 4px | Gouttières internes icônes |
| `space-2` | 8px | Gap entre éléments liés |
| `space-3` | 12px | Padding boutons compact |
| `space-4` | 16px | Padding cartes, input par défaut |
| `space-5` | 20px | Séparation verticale sections |
| `space-6` | 24px | Marges de page mobile |
| `space-8` | 32px | Marges de page desktop |
| `space-12` | 48px | Hero spacing, blocs larges |

**Principe :** espacement basé sur une grille de 4px. Jamais de valeur arbitraire.

### 2.3 Ombres & élévation

```css
.shadow-elevation-1: 0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.08);
.shadow-elevation-2: 0 4px 6px rgba(0,0,0,0.04), 0 10px 15px rgba(0,0,0,0.06);
.shadow-elevation-3: 0 10px 25px rgba(0,0,0,0.06), 0 20px 48px rgba(0,0,0,0.08);
```

En dark mode, les ombres sont désaturées et légèrement bleutées pour conserver la profondeur.

### 2.4 Rayons de bordure

```css
.radius-sm: 6px;   /* Inputs, badges */
.radius-md: 10px;  /* Boutons, cartes petites */
.radius-lg: 16px;  /* Cartes messages, modales */
.radius-xl: 24px;  /* Conteneurs principaux */
.radius-full: 9999px; /* Avatars, indicateurs */
```

---

## 3. Typographie

| Rôle | Font | Size | Line-height | Weight | Letter-spacing |
|------|------|------|-------------|--------|----------------|
| Display | Inter | 32px | 1.1 | 700 | -0.02em |
| H1 | Inter | 24px | 1.2 | 600 | -0.01em |
| H2 | Inter | 20px | 1.3 | 600 | -0.005em |
| H3 | Inter | 16px | 1.4 | 600 | 0 |
| Body | Inter | 14px | 1.5 | 400 | 0 |
| Body-lg | Inter | 16px | 1.6 | 400 | 0 |
| Caption | Inter | 12px | 1.4 | 400 | 0.01em |
| Mono | JetBrains Mono | 13px | 1.5 | 400 | 0 |

**Règles :**
- Taille de base : `16px` (1rem) pour l'accessibilité.
- Pas plus de 3 niveaux de taille par écran.
- JetBrains Mono réservé aux timestamps, IDs techniques, et code inline.

---

## 4. Composants Shadcn/UI customisés

### 4.1 Message Bubble (le cœur de l'app)

```tsx
// @/components/chat/MessageBubble.tsx
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface MessageBubbleProps {
  content: string;
  isSelf: boolean;
  timestamp: Date;
  status: 'sending' | 'sent' | 'delivered' | 'read';
  reactions?: Reaction[];
  isPinned?: boolean;
  hasVoice?: boolean;
}

export function MessageBubble({
  content,
  isSelf,
  timestamp,
  status,
  reactions,
  isPinned,
  hasVoice,
}: MessageBubbleProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        type: 'spring',
        stiffness: 400,
        damping: 28,
        mass: 0.8,
      }}
      className={cn(
        'group relative max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-3',
        isSelf
          ? 'bg-primary text-primary-foreground self-end rounded-br-md'
          : 'bg-message-other dark:bg-message-otherDark text-message-otherText dark:text-message-otherTextDark self-start rounded-bl-md',
        isPinned && 'ring-2 ring-warning ring-offset-2 ring-offset-background',
      )}
    >
      {/* Contenu */}
      <div className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
        {hasVoice ? <VoicePlayer src={content} /> : content}
      </div>

      {/* Footer : timestamp + statut */}
      <div className="flex items-center justify-end gap-1.5 mt-1.5 opacity-60">
        <time className="text-[11px] font-mono tracking-tight">
          {formatTime(timestamp)}
        </time>
        <MessageStatusIcon status={status} />
      </div>

      {/* Réactions flottantes */}
      {reactions && reactions.length > 0 && (
        <div className="absolute -bottom-2.5 flex gap-0.5">
          <ReactionBar reactions={reactions} />
        </div>
      )}

      {/* Menu contextuel au survol (desktop) / long-press (mobile) */}
      <MessageActionsMenu isSelf={isSelf} isPinned={isPinned} />
    </motion.div>
  );
}
```

### 4.2 Skeleton de chargement (Infinite Scroll)

```tsx
// @/components/chat/MessageSkeleton.tsx
import { Skeleton } from '@/components/ui/skeleton';

export function MessageSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-4 px-4 py-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'flex gap-3',
            i % 2 === 0 ? 'flex-row' : 'flex-row-reverse',
          )}
        >
          <Skeleton className="h-9 w-9 rounded-full shrink-0" />
          <div className={cn('space-y-2 max-w-[70%]', i % 2 === 0 ? '' : 'items-end')}
            <Skeleton className="h-4 w-32 rounded-md" />
            <Skeleton className="h-16 w-56 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}
```

### 4.3 Input de composition

```tsx
// @/components/chat/Composer.tsx
export function Composer() {
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const { sendTyping, sendMessage } = useChatSocket();

  // Debounce intelligent : envoie typing seulement si l'utilisateur
  // fait une pause de 300ms ET s'il n'a pas déjà envoyé dans les 3s.
  const debouncedTyping = useDebounce(() => {
    sendTyping();
  }, 300);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    debouncedTyping();
  };

  return (
    <div className="sticky bottom-0 z-10 bg-background/80 backdrop-blur-xl border-t border-border px-4 py-3">
      <div className="flex items-end gap-2 max-w-3xl mx-auto">
        <button className="p-2 rounded-full hover:bg-muted transition-colors">
          <PaperclipIcon className="w-5 h-5 text-muted-foreground" />
        </button>

        <div className="flex-1 relative">
          <Textarea
            value={text}
            onChange={handleChange}
            placeholder="Écrivez un message..."
            className="min-h-[44px] max-h-[200px] rounded-xl bg-surface dark:bg-surface-dark resize-none pr-12 py-2.5"
            rows={1}
          />
          <EmojiPickerTrigger className="absolute right-2 bottom-2" />
        </div>

        {text.trim() ? (
          <button
            onClick={() => sendMessage(text)}
            className="p-3 rounded-full bg-primary text-primary-foreground hover:bg-primary-hover transition-all active:scale-95"
          >
            <SendIcon className="w-5 h-5" />
          </button>
        ) : (
          <VoiceRecorderButton
            isRecording={isRecording}
            onStart={() => setIsRecording(true)}
            onStop={(blob) => sendVoiceMessage(blob)}
          />
        )}
      </div>
    </div>
  );
}
```

---

## 5. Dark mode

### 5.1 Stratégie technique

```tsx
// @/components/providers/ThemeProvider.tsx
'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange={false}
    >
      {children}
    </NextThemesProvider>
  );
}
```

### 5.2 Règles de transformation dark

| Élément | Light | Dark | Raison |
|---------|-------|------|--------|
| Background | `#ffffff` | `#0f0f11` | Réduction de la luminosité globale |
| Surface | `#f8f9fb` | `#18181b` | Séparation des couches |
| Primary | `#4f46e5` | `#6366f1` | Augmentation de la saturation pour compenser le contraste réduit |
| Border | `#e4e4e7` | `#27272a` | Bordures presque invisibles mais structurantes |
| Message other | `#f4f4f5` | `#27272a` | Messages entrants en gris profond |
| Danger | `#ef4444` | `#f87171` | Alertes plus lumineuses en dark |

### 5.3 Transitions

```css
/* globals.css */
@layer base {
  html {
    color-scheme: light dark;
  }
  body {
    @apply bg-background text-foreground transition-colors duration-300;
  }
}
```

Tous les changements de thème sont animés en `300ms ease-out`. Les éléments avec `transition-colors` suivent automatiquement.

---

## 6. Micro-interactions & animations

### 6.1 Messages entrants

```tsx
// Framer Motion — spring physique
const messageAnimation = {
  initial: { opacity: 0, y: 12, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: {
    type: 'spring',
    stiffness: 400,
    damping: 28,
    mass: 0.8,
  },
};
```

**Raisonnement :** un spring (ressort) plutôt qu'un easing classique car il simule un objet physique. Le rebond subtil (damping=28) donne un sentiment de "matérialité" sans être distrayant.

### 6.2 Indicateur de saisie (typing)

```tsx
// @/components/chat/TypingIndicator.tsx
export function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-3 py-2 rounded-xl bg-message-other dark:bg-message-otherDark w-fit">
      <span className="text-xs text-muted-foreground">En train d'écrire</span>
      <div className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-muted-foreground"
            animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
            transition={{
              duration: 1.2,
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
```

### 6.3 Réactions (Emoji-mart)

```tsx
// @/components/chat/ReactionPicker.tsx
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';

export function ReactionPicker({
  messageId,
  onSelect,
}: {
  messageId: string;
  onSelect: (emoji: string) => void;
}) {
  return (
    <div className="absolute z-50 shadow-elevation-3 rounded-xl overflow-hidden">
      <Picker
        data={data}
        onEmojiSelect={(emoji: { native: string }) => onSelect(emoji.native)}
        theme="auto"
        previewPosition="none"
        maxFrequentRows={1}
      />
    </div>
  );
}
```

**Animation d'apparition d'une réaction :**
- Scale de 0.5 à 1.2 en 150ms, puis retour à 1.0 en 100ms (effet "pop").
- Couleur temporaire accentuée pendant 500ms.

### 6.4 Scroll et pagination infinie

```tsx
// @/hooks/useInfiniteMessages.ts
import { useInView } from 'react-intersection-observer';

export function useInfiniteMessages(conversationId: string) {
  const { ref, inView } = useInView({ threshold: 0, rootMargin: '200px' });

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ['messages', conversationId],
      queryFn: ({ pageParam }) =>
        fetchMessages(conversationId, { cursor: pageParam }),
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      initialPageParam: null as string | null,
    });

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage]);

  return { messages: flattenPages(data), sentinelRef: ref };
}
```

---

## 7. Responsive & breakpoints

| Nom | Largeur | Comportement |
|-----|---------|--------------|
| `xs` | < 480px | Sidebar masquée, pleine largeur messages, composer fixe en bas |
| `sm` | 480–767px | Sidebar rétractable (swipe), taille max messages 90% |
| `md` | 768–1023px | Sidebar visible (280px), zone conversation flexible |
| `lg` | 1024–1279px | Sidebar 320px, panneau d'info droite optionnel |
| `xl` | ≥ 1280px | Layout 3 colonnes : sidebar / conversation / détails |

### Layout mobile (xs)

```
┌─────────────────────┐
│  ◀  Conversations   │  ← Header compact
├─────────────────────┤
│                     │
│   Zone messages     │  ← Scrollable, padding-bottom pour composer
│                     │
├─────────────────────┤
│  [📎] [Écrire...] [🎙│  ← Composer sticky
└─────────────────────┘
```

### Layout desktop (xl)

```
┌────────┬──────────────────────────┬──────────┐
│        │                          │          │
│Sidebar │   Conversation           │ Détails  │
│ 280px  │   (flexible)             │ 300px    │
│        │                          │          │
│ Conv-1 │   ┌──────────────────┐   │ Membres  │
│ Conv-2 │   │ Message Bubble   │   │ Fichiers │
│ Conv-3 │   └──────────────────┘   │ Recherche│
│ ...    │                          │          │
│        │   Composer               │          │
└────────┴──────────────────────────┴──────────┘
```

---

## 8. Maquettes d'écran

### 8.1 Écran de connexion (2FA)

```
┌─────────────────────────────┐
│                             │
│      [Logo] Messenger       │
│                             │
│   ┌─────────────────────┐   │
│   │  email@example.com  │   │
│   └─────────────────────┘   │
│   ┌─────────────────────┐   │
│   │  ••••••••••••••    │   │
│   └─────────────────────┘   │
│                             │
│   [ ░░░░░░░░░░ ]  ← TOTP   │
│                             │
│   ┌─────────────────────┐   │
│   │    Se connecter     │   │
│   └─────────────────────┘   │
│                             │
│      Pas encore inscrit ?   │
│            Créer un compte  │
│                             │
└─────────────────────────────┘
```

### 8.2 Écran de conversation

```
┌──────────────────────────────────────────────────┐
│ [Avatar] Alice Martin        [📎] [🔍] [⋯]       │
│         En ligne — il y a 2 min                  │
├──────────────────────────────────────────────────┤
│                                                  │
│              Aujourd'hui 14:32                   │
│                                                  │
│   ┌────────────────────────┐                   │
│   │ Salut ! Tu as vu le    │  ← Other           │
│   │ nouveau design ?       │    rounded-bl-md   │
│   │              14:32 ✓✓  │                   │
│   └────────────────────────┘                   │
│                                                  │
│                    ┌────────────────────────┐    │
│                    │ Oui, il est magnifique ! │ ← Self
│                    │ J'adore les animations.  │   rounded-br-md
│                    │              14:33 ✓     │
│                    └────────────────────────┘    │
│                                                  │
│   ┌────────────────────────┐                   │
│   │ [🎙 0:42]              │  ← Voice message   │
│   │ ▶━━━━━━●──────  0:42   │                   │
│   │              14:35 ✓✓  │                   │
│   └────────────────────────┘                   │
│                                                  │
│   Alice est en train d'écrire...                 │
│   ● ● ●                                          │
├──────────────────────────────────────────────────┤
│ [📎] [ 😊 ]  Écrivez un message...      [🎙]/[➤]│
└──────────────────────────────────────────────────┘
```

---

## Checklist qualité visuelle

- [ ] Aucun texte n'est tronqué à moins de 2 lignes (line-clamp).
- [ ] Les états vides (empty state) ont une illustration et un CTA.
- [ ] Le focus clavier est visible sur tous les éléments interactifs.
- [ ] Les animations respectent `prefers-reduced-motion`.
- [ ] Le contrast ratio est ≥ 4.5:1 pour tout texte body.
