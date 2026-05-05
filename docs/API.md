# API — Socket.IO Events & REST Endpoints

> Référence complète des interfaces de communication. Types TypeScript stricts, payloads, codes d'erreur, et exemples de requêtes/réponses.

---

## Table des matières

1. [Typage des événements Socket.IO](#1-typage-des-événements-socketio)
2. [Événements Client → Serveur](#2-événements-client--serveur)
3. [Événements Serveur → Client](#3-événements-serveur--client)
4. [REST Endpoints](#4-rest-endpoints)
5. [Codes d'erreur](#5-codes-derreur)

---

## 1. Typage des événements Socket.IO

```typescript
// @/types/socket.ts

export interface ClientToServerEvents {
  'message:send': (payload: SendMessagePayload, ack?: (result: SendMessageAck) => void) => void;
  'message:read': (payload: ReadMessagePayload) => void;
  'message:react': (payload: ReactMessagePayload) => void;
  'message:pin': (payload: PinMessagePayload) => void;
  'typing': (payload: TypingPayload) => void;
  'presence:update': (payload: PresencePayload) => void;
  'conversation:join': (payload: JoinConversationPayload) => void;
  'conversation:leave': (payload: LeaveConversationPayload) => void;
}

export interface ServerToClientEvents {
  'message:receive': (payload: MessagePayload) => void;
  'message:sent': (payload: MessageSentPayload) => void;
  'message:read': (payload: MessageReadPayload) => void;
  'message:reacted': (payload: MessageReactedPayload) => void;
  'typing': (payload: TypingEventPayload) => void;
  'presence:update': (payload: PresenceUpdatePayload) => void;
  'error': (payload: SocketErrorPayload) => void;
}

export interface SendMessagePayload {
  conversationId: string;
  cipher: string;
  nonce: string;
  tempId?: string;
  type: 'text' | 'voice' | 'file';
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  duration?: number;
  replyToId?: string;
}

export interface SendMessageAck {
  success: boolean;
  id?: string;
  tempId?: string;
  error?: { code: string; message: string };
}

export interface MessagePayload {
  id: string;
  conversationId: string;
  senderId: string;
  cipher: string;
  nonce: string;
  type: 'text' | 'voice' | 'file';
  fileUrl?: string;
  duration?: number;
  replyToId?: string;
  createdAt: string;
  hash: string;
}

export interface MessageSentPayload {
  id: string;
  tempId?: string;
  status: 'sent' | 'delivered' | 'read';
}

export interface ReadMessagePayload {
  messageId: string;
  conversationId: string;
}

export interface MessageReadPayload {
  messageId: string;
  userId: string;
  readAt: string;
}

export interface ReactMessagePayload {
  messageId: string;
  emoji: string;
}

export interface MessageReactedPayload {
  messageId: string;
  userId: string;
  emoji: string;
  added: boolean;
}

export interface PinMessagePayload {
  messageId: string;
  conversationId: string;
  pinned: boolean;
}

export interface TypingPayload {
  conversationId: string;
}

export interface TypingEventPayload {
  conversationId: string;
  userId: string;
  username: string;
}

export interface PresencePayload {
  status: 'online' | 'away' | 'offline' | 'dnd';
}

export interface PresenceUpdatePayload {
  userId: string;
  status: 'online' | 'away' | 'offline' | 'dnd';
  lastSeen?: string;
}

export interface JoinConversationPayload {
  conversationId: string;
}

export interface LeaveConversationPayload {
  conversationId: string;
}

export interface SocketErrorPayload {
  code: string;
  message: string;
  retryAfter?: number;
}
```

---

## 2. Événements Client → Serveur

### 2.1 `message:send`

Envoie un message chiffré à une conversation.

```typescript
socket.emit('message:send', {
  conversationId: '550e8400-e29b-41d4-a716-446655440000',
  cipher: 'base64_ciphertext...',
  nonce: 'base64_nonce...',
  tempId: 'temp_123456',
  type: 'text',
}, (ack) => {
  if (ack?.success) {
    console.log('Message envoyé:', ack.id);
  } else {
    console.error('Erreur:', ack?.error);
  }
});
```

**Validation serveur :**
- `conversationId` : UUID valide.
- `cipher` : non vide, ≤ 10 MB.
- `nonce` : non vide.
- Membre de la conversation.
- Rate limit : 30 msg / 10s.

### 2.2 `typing`

```typescript
socket.emit('typing', {
  conversationId: '550e8400-e29b-41d4-a716-446655440000',
});
```

Serveur broadcast aux autres membres. Auto-expire après 5s.

### 2.3 `message:read`

```typescript
socket.emit('message:read', {
  messageId: '...',
  conversationId: '...',
});
```

---

## 3. Événements Serveur → Client

### 3.1 `message:receive`

```typescript
socket.on('message:receive', async (payload) => {
  if (messageStore.seenHashes.has(payload.hash)) return;
  const plain = await decryptMessage(payload.cipher, payload.nonce, theirPk, mySk);
  messageStore.addMessage({ ...payload, decryptedContent: plain });
});
```

### 3.2 `presence:update`

```typescript
socket.on('presence:update', ({ userId, status, lastSeen }) => {
  userStore.updatePresence(userId, status, lastSeen);
});
```

---

## 4. REST Endpoints

### 4.1 Authentification

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `POST` | `/api/auth/register` | Création de compte |
| `POST` | `/api/auth/login` | Connexion JWT + session |
| `POST` | `/api/auth/logout` | Déconnexion (invalidation Redis) |
| `POST` | `/api/auth/2fa/setup` | Génère secret TOTP + QR code |
| `POST` | `/api/auth/2fa/verify` | Active le 2FA |
| `POST` | `/api/auth/2fa/disable` | Désactive le 2FA |

#### `POST /api/auth/register`

**Request :**
```json
{
  "email": "alice@example.com",
  "username": "alice",
  "password": "SecurePass123!"
}
```

**Response 201 :**
```json
{
  "success": true,
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "alice@example.com",
    "username": "alice"
  }
}
```

### 4.2 Conversations

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/api/conversations` | Liste des conversations |
| `POST` | `/api/conversations` | Crée une conversation |
| `GET` | `/api/conversations/:id` | Détail |
| `GET` | `/api/conversations/:id/messages` | Messages paginés |
| `POST` | `/api/conversations/:id/members` | Ajoute un membre |
| `DELETE` | `/api/conversations/:id/members/:userId` | Retire un membre |

#### `GET /api/conversations/:id/messages`

**Query :** `?cursor=base64url&limit=30`

**Response 200 :**
```json
{
  "messages": [
    {
      "id": "...",
      "conversationId": "...",
      "senderId": "...",
      "content": "base64_ciphertext...",
      "nonce": "base64_nonce...",
      "type": "text",
      "createdAt": "2026-05-04T14:32:00.000Z",
      "hash": "sha256...",
      "pinned": false,
      "sender": { "id": "...", "username": "alice", "avatarUrl": "https://..." },
      "reactions": [{ "emoji": "👍", "userIds": ["..."] }]
    }
  ],
  "nextCursor": "base64url...",
  "hasMore": true
}
```

### 4.3 Upload

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `POST` | `/api/upload` | Upload multipart/form-data |
| `GET` | `/api/files/:fileId` | Téléchargement (auth requise) |

#### `POST /api/upload`

**Request :** `multipart/form-data` avec `file`, `conversationId`.

**Response 201 :**
```json
{
  "id": "uuid.jpg",
  "url": "https://cdn.example.com/uploads/uuid.jpg",
  "originalName": "photo.jpg",
  "mimeType": "image/jpeg",
  "size": 245760
}
```

### 4.4 Recherche

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/api/search` | Full-text search |

**Query :** `?q=projet+urgent&conversationId=...&limit=20&offset=0`

**Response 200 :**
```json
{
  "results": [
    {
      "id": "...",
      "headline": "Le <mark>projet</mark> <mark>urgent</mark> est en cours.",
      "rank": 0.123,
      "sender": "alice",
      "createdAt": "2026-05-04T10:00:00.000Z",
      "conversationId": "..."
    }
  ],
  "total": 42
}
```

---

## 5. Codes d'erreur

### 5.1 Socket.IO Errors

| Code | Description | Action client |
|------|-------------|---------------|
| `AUTH_REQUIRED` | Token manquant | Rediriger vers login |
| `SESSION_EXPIRED` | Session invalide | Rafraîchir token ou re-login |
| `INVALID_TOKEN` | JWT malformé | Re-login |
| `FORBIDDEN` | Non membre de la conversation | Ignorer / afficher erreur |
| `VALIDATION` | Payload invalide (Zod) | Afficher erreurs de validation |
| `RATE_LIMITED` | Trop de requêtes | Attendre `retryAfter` secondes |
| `MESSAGE_TOO_OLD` | Replay détecté | Ignorer |
| `INTERNAL` | Erreur serveur | Retry avec backoff exponentiel |

### 5.2 HTTP Errors

| Code | Description |
|------|-------------|
| `400` | Requête invalide (validation Zod) |
| `401` | Non authentifié |
| `403` | Authentifié mais non autorisé |
| `404` | Ressource introuvable |
| `409` | Conflit (ex: email déjà utilisé) |
| `413` | Payload trop grand (fichier > 25 MB) |
| `415` | Type MIME non supporté |
| `429` | Rate limit dépassé |
| `500` | Erreur interne |
