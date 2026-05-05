# Base de Données — Prisma + PostgreSQL

> Schéma de données complet, index GIN pour Full-Text Search, relations, stratégies de pagination, et optimisations de performance. Chaque décision est justifiée par un cas d'usage.

---

## Table des matières

1. [Schéma Prisma](#1-schéma-prisma)
2. [Relations & contraintes](#2-relations--contraintes)
3. [Index GIN Full-Text Search](#3-index-gin-full-text-search)
4. [Pagination cursor-based](#4-pagination-cursor-based)
5. [Migrations & sécurité](#5-migrations--sécurité)
6. [Requêtes optimisées](#6-requêtes-optimisées)

---

## 1. Schéma Prisma

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─────────────────────────────────────────────
// Modèle User
// ─────────────────────────────────────────────
model User {
  id        String   @id @default(uuid()) @db.Uuid
  email     String   @unique
  username  String   @unique
  password  String   // Hash argon2id
  avatarUrl String?
  
  // 2FA TOTP
  twoFactorSecret   String? // Base32 secret (encrypted at rest)
  twoFactorEnabled  Boolean @default(false)
  twoFactorVerified Boolean @default(false)
  
  // E2E Keys (public key only — private key reste côté client)
  publicKey String? @db.Text
  
  // Timestamps
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  // Relations
  sentMessages     Message[]
  conversations    ConversationMember[]
  reactions        Reaction[]
  
  @@index([email])
  @@index([username])
  @@map("users")
}

// ─────────────────────────────────────────────
// Modèle Conversation
// ─────────────────────────────────────────────
model Conversation {
  id          String    @id @default(uuid()) @db.Uuid
  title       String?
  isGroup     Boolean   @default(false)
  avatarUrl   String?
  
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  
  // Relations
  members     ConversationMember[]
  messages    Message[]
  
  @@index([updatedAt(sort: Desc)])
  @@map("conversations")
}

// ─────────────────────────────────────────────
// Modèle ConversationMember (junction table)
// ─────────────────────────────────────────────
model ConversationMember {
  id              String       @id @default(uuid()) @db.Uuid
  conversationId  String       @db.Uuid
  userId          String       @db.Uuid
  role            MemberRole   @default(MEMBER)
  joinedAt        DateTime     @default(now())
  lastReadAt      DateTime?
  
  // Relations
  conversation    Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  user            User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@unique([conversationId, userId])
  @@index([userId, joinedAt])
  @@map("conversation_members")
}

enum MemberRole {
  OWNER
  ADMIN
  MEMBER
}

// ─────────────────────────────────────────────
// Modèle Message
// ─────────────────────────────────────────────
model Message {
  id              String   @id @default(uuid()) @db.Uuid
  conversationId  String   @db.Uuid
  senderId        String   @db.Uuid
  
  // Contenu chiffré (ciphertext base64)
  content         String   @db.Text
  nonce           String   @db.Text
  
  // Métadonnées
  type            MessageType @default(TEXT)
  fileUrl         String?
  fileName        String?
  fileSize        Int?
  mimeType        String?
  duration        Int?     // Durée en secondes (messages vocaux)
  
  // Algorithmes
  dedupHash       String   @unique  // SHA-256 du cipher + senderId + window
  
  // Pin
  pinned          Boolean  @default(false)
  pinnedAt        DateTime?
  
  // Reply
  replyToId       String?  @db.Uuid
  
  // Timestamps
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  // Relations
  conversation    Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  sender          User         @relation(fields: [senderId], references: [id], onDelete: Cascade)
  reactions       Reaction[]
  replyTo         Message?     @relation("MessageReplies", fields: [replyToId], references: [id])
  replies         Message[]    @relation("MessageReplies")
  
  @@index([conversationId, createdAt(sort: Desc)])
  @@index([senderId, createdAt])
  @@index([dedupHash])
  @@index([pinned, pinnedAt])
  @@map("messages")
}

enum MessageType {
  TEXT
  VOICE
  FILE
  LINK_PREVIEW
}

// ─────────────────────────────────────────────
// Modèle Reaction
// ─────────────────────────────────────────────
model Reaction {
  id        String   @id @default(uuid()) @db.Uuid
  messageId String   @db.Uuid
  userId    String   @db.Uuid
  emoji     String   // Unicode emoji
  createdAt DateTime @default(now())
  
  // Relations
  message   Message  @relation(fields: [messageId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@unique([messageId, userId, emoji])
  @@index([messageId])
  @@map("reactions")
}
```

---

## 2. Relations & contraintes

```
User 1 ──────∞ ConversationMember
Conversation 1 ──────∞ ConversationMember
Conversation 1 ──────∞ Message
User 1 ──────∞ Message
Message 1 ──────∞ Reaction
User 1 ──────∞ Reaction
Message 1 ──────∞ Message (self-relation : replyTo)
```

### Contraintes d'intégrité

| Contrainte | Type | Description |
|------------|------|-------------|
| `ConversationMember.conversationId + userId` | UNIQUE | Un utilisateur ne peut être membre qu'une fois par conversation |
| `Reaction.messageId + userId + emoji` | UNIQUE | Pas de doublon de réaction par utilisateur |
| `Message.dedupHash` | UNIQUE | Pas de message dupliqué (même contenu chiffré) |
| `ON DELETE CASCADE` | FK | Suppression en cascade des messages/reactions si conversation supprimée |

---

## 3. Index GIN Full-Text Search

### 3.1 Création de l'index

```sql
-- Migration SQL (Prisma ne gère pas les index GIN natif pour tsvector)
-- À exécuter via `prisma migrate dev --create-only` puis éditer le fichier SQL

CREATE INDEX idx_message_content_fts
ON "Message"
USING GIN (to_tsvector('french', content));

-- Pour la recherche multi-langue, créer un index par langue :
CREATE INDEX idx_message_content_fts_english
ON "Message"
USING GIN (to_tsvector('english', content));
```

### 3.2 Requête de recherche avec ranking TF-IDF

```typescript
// @/persistence/repositories/MessageRepository.ts
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';

interface SearchResult {
  id: string;
  content: string;
  senderId: string;
  createdAt: Date;
  rank: number;
  headline: string;
}

export class MessageRepository {
  async search(
    query: string,
    conversationId: string | null,
    limit: number = 20,
    offset: number = 0,
  ): Promise<SearchResult[]> {
    // Normalisation : suppression des caractères spéciaux
    const safeQuery = query.replace(/[^\w\s]/g, ' ').trim();
    
    if (!safeQuery) {
      return [];
    }

    const tsQuery = `plainto_tsquery('french', ${Prisma.sql`\${safeQuery}`})`;
    
    const results = await prisma.$queryRaw<SearchResult[]>`
      SELECT
        m.id,
        m.content,
        m."senderId",
        m."createdAt",
        ts_rank(to_tsvector('french', m.content), ${tsQuery}) AS rank,
        ts_headline('french', m.content, ${tsQuery}, 'MaxWords=35,MinWords=15,MaxFragments=3') AS headline
      FROM "Message" m
      WHERE to_tsvector('french', m.content) @@ ${tsQuery}
        ${conversationId ? Prisma.sql`AND m."conversationId" = ${conversationId}::uuid` : Prisma.empty}
      ORDER BY rank DESC, m."createdAt" DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    return results;
  }
}
```

### 3.3 Explication de l'algorithme TF-IDF PostgreSQL

PostgreSQL utilise une variante du **Okapi BM25** pour le ranking des résultats full-text :

```
ts_rank(vector, query) =
  Σ [ log(1 + freq(term, document)) × idf(term) × normalization ]
```

Où :
- `freq(term, document)` : nombre d'occurrences du terme dans le document.
- `idf(term)` : inverse document frequency = log(N / n_term), où N = total documents, n_term = documents contenant le terme.
- `normalization` : pondération basée sur la longueur du document.

**Pourquoi GIN et pas GiST ?**
- **GIN** : O(k) pour la recherche (k = nombre de termes de la requête). Idéal pour lectures fréquentes.
- **GiST** : O(log n) mais moins performant pour la concurrence et les mises à jour.
- Choix : GIN car la table Message est majoritairement en lecture.

---

## 4. Pagination cursor-based

### 4.1 Principe

Au lieu d'utiliser `OFFSET` (qui devient O(n) à mesure que l'offset augmente), on encode un curseur composé de `(createdAt, id)` :

```
cursor = base64url( `${createdAt}::${id}` )
```

### 4.2 Implémentation

```typescript
// @/persistence/repositories/MessageRepository.ts

interface Cursor {
  createdAt: Date;
  id: string;
}

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(`${cursor.createdAt.toISOString()}::${cursor.id}`).toString('base64url');
}

function decodeCursor(cursor: string): Cursor {
  const decoded = Buffer.from(cursor, 'base64url').toString('utf-8');
  const [createdAt, id] = decoded.split('::');
  return { createdAt: new Date(createdAt), id };
}

export class MessageRepository {
  async findByConversation(
    conversationId: string,
    cursor?: string,
    limit: number = 30,
  ): Promise<{ messages: Message[]; nextCursor: string | null }> {
    const where: Prisma.MessageWhereInput = {
      conversationId,
    };

    if (cursor) {
      const { createdAt, id } = decodeCursor(cursor);
      where.OR = [
        { createdAt: { lt: createdAt } },
        { createdAt: { equals: createdAt }, id: { lt: id } },
      ];
    }

    const messages = await prisma.message.findMany({
      where,
      orderBy: [
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      take: limit + 1, // +1 pour détecter s'il y a une page suivante
      include: {
        sender: {
          select: { id: true, username: true, avatarUrl: true },
        },
        reactions: {
          select: { emoji: true, userId: true },
        },
      },
    });

    const hasMore = messages.length > limit;
    const sliced = hasMore ? messages.slice(0, limit) : messages;
    
    const nextCursor = hasMore && sliced.length > 0
      ? encodeCursor({
          createdAt: sliced[sliced.length - 1].createdAt,
          id: sliced[sliced.length - 1].id,
        })
      : null;

    return { messages: sliced, nextCursor };
  }
}
```

**Complexité :**
- `findMany` avec curseur : O(log n + limit) grâce à l'index composite `(conversationId, createdAt DESC, id DESC)`.
- Contrairement à `OFFSET` qui est O(n + limit).

---

## 5. Migrations & sécurité

### 5.1 Stratégie de migration

```bash
# Développement
npx prisma migrate dev --name add_message_dedup_hash

# Production (review avant application)
npx prisma migrate deploy
```

### 5.2 RLS (Row Level Security) — optionnel mais recommandé

```sql
-- Activer RLS sur les tables sensibles
ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;

-- Politique : un utilisateur ne peut voir que les messages des conversations où il est membre
CREATE POLICY message_select_policy ON "Message"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "ConversationMember" cm
      WHERE cm."conversationId" = "Message"."conversationId"
        AND cm."userId" = current_setting('app.current_user_id')::uuid
    )
  );
```

**Note :** RLS nécessite de passer l'userId via `SET app.current_user_id = '...'` à chaque requête. Prisma ne le fait pas nativement — implémentation via middleware Prisma.

---

## 6. Requêtes optimisées

### 6.1 Messages épinglés d'une conversation

```typescript
await prisma.message.findMany({
  where: {
    conversationId,
    pinned: true,
  },
  orderBy: { pinnedAt: 'desc' },
  take: 10,
});
```

Index utilisé : `idx_message_pinned_pinnedAt` (composite sur `pinned + pinnedAt DESC`).

### 6.2 Derniers messages par conversation (inbox)

```typescript
await prisma.conversation.findMany({
  where: {
    members: { some: { userId } },
  },
  include: {
    messages: {
      orderBy: { createdAt: 'desc' },
      take: 1,
      select: { content: true, createdAt: true, sender: { select: { username: true } } },
    },
    members: {
      where: { userId: { not: userId } },
      select: { user: { select: { username: true, avatarUrl: true } } },
    },
  },
  orderBy: { updatedAt: 'desc' },
});
```

### 6.3 Statistiques de spam (agrégation)

```typescript
await prisma.message.groupBy({
  by: ['senderId'],
  where: {
    createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
  },
  _count: { id: true },
  having: {
    id: { _count: { gte: 100 } }, // Plus de 100 messages / 24h
  },
});
```
