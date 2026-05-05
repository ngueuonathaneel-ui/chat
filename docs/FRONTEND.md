# Frontend — Next.js App Router

> Spécification complète du frontend : structure des dossiers, routes App Router, hooks React custom, gestion d'état, error boundaries, et gestion du chargement avec skeletons. TypeScript strict, zéro `any`.

---

## Table des matières

1. [Structure du projet](#1-structure-du-projet)
2. [App Router — Routes](#2-app-router--routes)
3. [Hooks Socket.IO custom](#3-hooks-socketio-custom)
4. [Gestion d'état (Zustand)](#4-gestion-détat-zustand)
5. [Error Boundaries](#5-error-boundaries)
6. [Pagination infinie](#6-pagination-infinie)
7. [Chiffrement E2E côté client](#7-chiffrement-e2e-côté-client)
8. [Compression audio client-side](#8-compression-audio-client-side)

---

## 1. Structure du projet

```
frontend/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── register/
│   │   │   └── page.tsx
│   │   ├── two-factor/
│   │   │   └── page.tsx
│   │   └── layout.tsx          ← Layout sans sidebar
│   ├── (chat)/
│   │   ├── conversations/
│   │   │   └── [id]/
│   │   │       └── page.tsx
│   │   ├── settings/
│   │   │   └── page.tsx
│   │   └── layout.tsx          ← Layout avec sidebar + composer
│   ├── api/
│   │   └── auth/[...nextauth]/route.ts
│   ├── globals.css
│   └── layout.tsx
├── components/
│   ├── ui/                     ← Shadcn/UI (généré)
│   ├── chat/
│   │   ├── MessageBubble.tsx
│   │   ├── MessageList.tsx
│   │   ├── Composer.tsx
│   │   ├── ConversationList.tsx
│   │   ├── TypingIndicator.tsx
│   │   ├── VoicePlayer.tsx
│   │   ├── ReactionBar.tsx
│   │   └── MessageSkeleton.tsx
│   ├── providers/
│   │   ├── ThemeProvider.tsx
│   │   ├── QueryProvider.tsx
│   │   └── SocketProvider.tsx
│   └── modals/
│       ├── CreateConversationModal.tsx
│       └── UserProfileModal.tsx
├── hooks/
│   ├── useSocket.ts
│   ├── useTyping.ts
│   ├── useVoiceRecorder.ts
│   ├── useE2E.ts
│   ├── useInfiniteMessages.ts
│   └── useDebounce.ts
├── lib/
│   ├── utils.ts
│   ├── socket-client.ts
│   ├── crypto.ts               ← Wrappers libsodium
│   └── api.ts                  ← Fetchers typés
├── stores/
│   ├── conversationStore.ts
│   ├── messageStore.ts
│   └── uiStore.ts
├── types/
│   ├── index.ts                ← DTOs partagés
│   └── socket.ts               ← Events Socket.IO typés
└── public/
```

---

## 2. App Router — Routes

### 2.1 Route groups

```tsx
// app/(chat)/layout.tsx
export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <SocketProvider>
      <div className="flex h-screen bg-background">
        <Sidebar className="w-80 shrink-0 hidden md:block" />
        <main className="flex-1 flex flex-col min-w-0">
          {children}
        </main>
      </div>
    </SocketProvider>
  );
}
```

### 2.2 Page conversation (Server Component)

```tsx
// app/(chat)/conversations/[id]/page.tsx
import { notFound } from 'next/navigation';
import { MessageList } from '@/components/chat/MessageList';
import { ConversationHeader } from '@/components/chat/ConversationHeader';
import { Composer } from '@/components/chat/Composer';
import { fetchConversation } from '@/lib/api';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ConversationPage({ params }: PageProps) {
  const { id } = await params;
  const conversation = await fetchConversation(id);

  if (!conversation) {
    notFound();
  }

  return (
    <div className="flex flex-col h-full">
      <ConversationHeader conversation={conversation} />
      <MessageList conversationId={id} />
      <Composer conversationId={id} />
    </div>
  );
}
```

**Pourquoi Server Component ?**
- Le header (titre, avatar, statut) est récupéré côté serveur pour un premier rendu instantané.
- La liste des messages reste Client Component à cause de Socket.IO et du scroll infini.

---

## 3. Hooks Socket.IO custom

### 3.1 `useSocket` — connexion typée

```tsx
// @/hooks/useSocket.ts
'use client';

import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useSession } from 'next-auth/react';
import type { ClientToServerEvents, ServerToClientEvents } from '@/types/socket';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function useSocket() {
  const { data: session } = useSession();
  const socketRef = useRef<TypedSocket | null>(null);

  useEffect(() => {
    if (!session?.accessToken) return;

    const socket: TypedSocket = io(process.env.NEXT_PUBLIC_SOCKET_URL!, {
      transports: ['websocket', 'polling'],
      auth: { token: session.accessToken },
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [session?.accessToken]);

  const emit = useCallback(
    <K extends keyof ClientToServerEvents>(
      event: K,
      ...args: Parameters<ClientToServerEvents[K]>
    ) => {
      socketRef.current?.emit(event, ...args);
    },
    [],
  );

  const on = useCallback(
    <K extends keyof ServerToClientEvents>(
      event: K,
      handler: ServerToClientEvents[K],
    ) => {
      socketRef.current?.on(event, handler as never);
      return () => {
        socketRef.current?.off(event, handler as never);
      };
    },
    [],
  );

  return { socket: socketRef.current, emit, on, isConnected: !!socketRef.current?.connected };
}
```

### 3.2 `useTyping` — throttle intelligent

```tsx
// @/hooks/useTyping.ts
'use client';

import { useRef, useCallback } from 'react';
import { useSocket } from './useSocket';

const TYPING_COOLDOWN_MS = 3000;
const TYPING_DEBOUNCE_MS = 300;

export function useTyping(conversationId: string) {
  const { emit } = useSocket();
  const lastSentAt = useRef<number>(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const sendTyping = useCallback(() => {
    const now = Date.now();

    // Throttle : pas plus d'un event toutes les 3s
    if (now - lastSentAt.current < TYPING_COOLDOWN_MS) {
      return;
    }

    // Debounce : attendre 300ms d'inactivité
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      emit('typing', { conversationId });
      lastSentAt.current = Date.now();
    }, TYPING_DEBOUNCE_MS);
  }, [emit, conversationId]);

  return { sendTyping };
}
```

**Raisonnement algorithmique :**
- **Debounce** (300ms) : évite d'envoyer un event à chaque keystroke.
- **Throttle** (3s) : évite le flood si l'utilisateur tape lentement mais continuellement.
- **Race condition** : le `clearTimeout` annule l'event précédent si une nouvelle touche est pressée avant les 300ms.

---

## 4. Gestion d'état (Zustand)

### 4.1 Message Store

```tsx
// @/stores/messageStore.ts
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { devtools } from 'zustand/middleware';

interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;         // ciphertext (base64)
  nonce: string;
  decryptedContent?: string;
  hash: string;
  createdAt: string;
  status: 'sending' | 'sent' | 'delivered' | 'read';
  reactions: Record<string, string[]>; // emoji -> userIds
  isPinned: boolean;
  hasVoice: boolean;
}

interface MessageState {
  messagesByConv: Map<string, Message[]>;
  pendingMessages: Map<string, Message>; // tempId -> Message
  seenHashes: Set<string>;
  addMessage: (message: Message) => void;
  updateMessageStatus: (id: string, status: Message['status']) => void;
  deduplicate: (hash: string) => boolean;
  pinMessage: (id: string, isPinned: boolean) => void;
}

export const useMessageStore = create<MessageState>()(
  devtools(
    immer((set) => ({
      messagesByConv: new Map(),
      pendingMessages: new Map(),
      seenHashes: new Set(),

      addMessage: (message) =>
        set((state) => {
          const list = state.messagesByConv.get(message.conversationId) ?? [];
          // Insertion ordonnée par createdAt (O(n) mais n petit par fenêtre)
          const insertIndex = list.findIndex(
            (m) => m.createdAt > message.createdAt,
          );
          if (insertIndex === -1) {
            list.push(message);
          } else {
            list.splice(insertIndex, 0, message);
          }
          state.messagesByConv.set(message.conversationId, list);
          state.seenHashes.add(message.hash);
        }),

      updateMessageStatus: (id, status) =>
        set((state) => {
          for (const list of state.messagesByConv.values()) {
            const msg = list.find((m) => m.id === id);
            if (msg) {
              msg.status = status;
              break;
            }
          }
        }),

      deduplicate: (hash) => {
        let exists = false;
        set((state) => {
          exists = state.seenHashes.has(hash);
          if (!exists) state.seenHashes.add(hash);
        });
        return exists;
      },

      pinMessage: (id, isPinned) =>
        set((state) => {
          for (const list of state.messagesByConv.values()) {
            const msg = list.find((m) => m.id === id);
            if (msg) {
              msg.isPinned = isPinned;
              break;
            }
          }
        }),
    })),
    { name: 'message-store' },
  ),
);
```

**Pourquoi Zustand + Immer ?**
- Zustand : store minimal, pas de Provider wrapping.
- Immer : mutations immutables avec syntaxe mutable (lisibilité).
- `Map` plutôt que `Record` : meilleure perf pour les clés dynamiques et itération.

---

## 5. Error Boundaries

### 5.1 Global Error Boundary

```tsx
// app/global-error.tsx
'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Envoi à Sentry / LogRocket
    console.error('Global error caught:', error);
  }, [error]);

  return (
    <html>
      <body className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-4xl font-bold text-destructive">Oups !</h1>
          <p className="text-muted-foreground">
            Une erreur critique est survenue. Notre équipe a été notifiée.
          </p>
          <button
            onClick={reset}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary-hover"
          >
            Réessayer
          </button>
        </div>
      </body>
    </html>
  );
}
```

### 5.2 Chat Error Boundary

```tsx
// @/components/error/ChatErrorBoundary.tsx
'use client';

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ChatErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Chat boundary error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
            <p>Impossible de charger la conversation.</p>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="text-primary hover:underline"
            >
              Recharger
            </button>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
```

---

## 6. Pagination infinie

```tsx
// @/hooks/useInfiniteMessages.ts
'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import { useEffect } from 'react';
import { fetchMessages } from '@/lib/api';

const PAGE_SIZE = 30;

interface Cursor {
  timestamp: string;
  id: string;
}

function encodeCursor(cursor: Cursor): string {
  return btoa(`${cursor.timestamp}::${cursor.id}`);
}

function decodeCursor(cursor: string): Cursor {
  const [timestamp, id] = atob(cursor).split('::');
  return { timestamp, id };
}

export function useInfiniteMessages(conversationId: string) {
  const { ref, inView } = useInView({
    threshold: 0,
    rootMargin: '400px',
  });

  const query = useInfiniteQuery({
    queryKey: ['messages', conversationId],
    queryFn: async ({ pageParam }) => {
      const cursor = pageParam ? decodeCursor(pageParam as string) : undefined;
      const response = await fetchMessages(conversationId, { cursor, limit: PAGE_SIZE });
      return response;
    },
    getNextPageParam: (lastPage) =>
      lastPage.hasMore && lastPage.messages.length > 0
        ? encodeCursor({
            timestamp: lastPage.messages[lastPage.messages.length - 1].createdAt,
            id: lastPage.messages[lastPage.messages.length - 1].id,
          })
        : undefined,
    initialPageParam: null as string | null,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  useEffect(() => {
    if (inView && query.hasNextPage && !query.isFetchingNextPage) {
      query.fetchNextPage();
    }
  }, [inView, query.hasNextPage, query.isFetchingNextPage]);

  const allMessages = query.data?.pages.flatMap((page) => page.messages) ?? [];

  return {
    messages: allMessages,
    sentinelRef: ref,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
  };
}
```

**Complexité :**
- Chaque page : O(PAGE_SIZE) pour le fetch.
- Fusion des pages : O(n) où n = total des messages chargés.
- Le `flatMap` est O(n) et réalloue. Optimisation possible avec un `Map` pour l'insertion ordonnée si > 1000 messages.

---

## 7. Chiffrement E2E côté client

```tsx
// @/lib/crypto.ts
import sodium from 'libsodium-wrappers';

interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

interface EncryptedMessage {
  cipher: Uint8Array;
  nonce: Uint8Array;
}

let sodiumReady = false;

async function ensureSodium(): Promise<void> {
  if (!sodiumReady) {
    await sodium.ready;
    sodiumReady = true;
  }
}

/**
 * Génère une paire de clés Curve25519 pour Diffie-Hellman.
 * Appelée une seule fois par conversation, avant le premier message.
 */
export async function generateKeyPair(): Promise<KeyPair> {
  await ensureSodium();
  return sodium.crypto_box_keypair();
}

/**
 * Dérive une clé partagée via X25519.
 * myPrivateKey (local) + theirPublicKey (remote) -> shared secret.
 */
export async function deriveSharedSecret(
  myPrivateKey: Uint8Array,
  theirPublicKey: Uint8Array,
): Promise<Uint8Array> {
  await ensureSodium();
  return sodium.crypto_scalarmult(myPrivateKey, theirPublicKey);
}

/**
 * Chiffre un message avec crypto_box_easy (Curve25519 + XSalsa20-Poly1305).
 * Le nonce est aléatoire et unique par message.
 */
export async function encryptMessage(
  message: string,
  theirPublicKey: Uint8Array,
  myPrivateKey: Uint8Array,
): Promise<{ cipher: string; nonce: string }> {
  await ensureSodium();
  const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
  const cipher = sodium.crypto_box_easy(
    sodium.from_string(message),
    nonce,
    theirPublicKey,
    myPrivateKey,
  );
  return {
    cipher: sodium.to_base64(cipher),
    nonce: sodium.to_base64(nonce),
  };
}

/**
 * Déchiffre un message.
 */
export async function decryptMessage(
  cipher: string,
  nonce: string,
  theirPublicKey: Uint8Array,
  myPrivateKey: Uint8Array,
): Promise<string> {
  await ensureSodium();
  const plain = sodium.crypto_box_open_easy(
    sodium.from_base64(cipher),
    sodium.from_base64(nonce),
    theirPublicKey,
    myPrivateKey,
  );
  return sodium.to_string(plain);
}
```

**Protocole d'échange de clés (simplifié) :**

```
Alice                          Serveur (relay)                          Bob
  │                                │                                      │
  │  1. Génère (pk_A, sk_A)        │                                      │
  │  2. POST /keys {pk_A}          │                                      │
  │───────────────────────────────►│                                      │
  │                                │  3. Stocke pk_A                      │
  │                                │                                      │
  │                                │  4. GET /keys/alice                  │
  │                                │◄─────────────────────────────────────│
  │                                │                                      │
  │                                │  5. pk_A -> Bob                      │
  │                                │                                      │
  │  6. pk_B <- GET /keys/bob      │                                      │
  │◄───────────────────────────────│  7. POST /keys {pk_B}                │
  │                                │◄─────────────────────────────────────│
  │                                │                                      │
  │  8. Clé partagée = DH(sk_A, pk_B)                                   │
  │  9. Clé partagée = DH(sk_B, pk_A)                                   │
  │                                                                (symétrique)
  │ 10. Chiffre avec clé partagée  │                                      │
  │ 11. POST /message {cipher}     │                                      │
  │───────────────────────────────►│                                      │
  │                                │ 12. Relay cipher à Bob               │
  │                                │─────────────────────────────────────►│
  │                                │                                      │
  │                                │                                      │ 13. Déchiffre
```

**Note :** `crypto_box_easy` encapsule déjà l'éphémère X25519 + XSalsa20-Poly1305. La clé partagée est dérivée automatiquement à l'intérieur. Nous passons `theirPublicKey` et `myPrivateKey` directement.

---

## 8. Compression audio client-side

```tsx
// @/lib/audioCompression.ts

/**
 * Compresse un Blob audio WebM/OGG en réduisant le bitrate via AudioContext.
 * Algorithme : décode -> resample (optionnel) -> ré-encode à bitrate cible.
 */
export async function compressAudio(
  blob: Blob,
  targetBitrateKbps: number = 64,
): Promise<Blob> {
  const audioContext = new AudioContext();
  const arrayBuffer = await blob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  // Resample à 22050 Hz si source > 44100 Hz (réduction de 50% des données)
  const targetSampleRate = Math.min(audioBuffer.sampleRate, 22050);
  const offlineContext = new OfflineAudioContext(
    1, // mono
    Math.ceil(audioBuffer.duration * targetSampleRate),
    targetSampleRate,
  );

  const source = offlineContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineContext.destination);
  source.start();

  const renderedBuffer = await offlineContext.startRendering();

  // Encodage en Ogg Vorbis via MediaRecorder avec bitrate contraint
  const stream = renderedBufferToStream(renderedBuffer);
  const mediaRecorder = new MediaRecorder(stream, {
    mimeType: 'audio/ogg;codecs=vorbis',
    audioBitsPerSecond: targetBitrateKbps * 1000,
  });

  const chunks: Blob[] = [];
  mediaRecorder.ondataavailable = (e) => chunks.push(e.data);

  return new Promise((resolve) => {
    mediaRecorder.onstop = () => {
      const compressed = new Blob(chunks, { type: 'audio/ogg' });
      resolve(compressed);
    };
    mediaRecorder.start();
    setTimeout(() => mediaRecorder.stop(), renderedBuffer.duration * 1000 + 100);
  });
}

function renderedBufferToStream(buffer: AudioBuffer): MediaStream {
  const ctx = new AudioContext();
  const dest = ctx.createMediaStreamDestination();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(dest);
  source.start();
  return dest.stream;
}
```

**Gains typiques :**
- Audio natif WebM @ 128 kbps stéréo → compressé Ogg @ 64 kbps mono.
- Réduction : ~65–75% du poids final.
- Qualité vocale : parfaitement acceptable pour la parole (bande passante vocale : 300–3400 Hz).
