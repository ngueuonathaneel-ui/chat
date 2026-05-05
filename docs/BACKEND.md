# Backend — Node.js + Socket.IO

> Spécification du serveur backend : architecture en couches, gestion des connexions WebSocket, Redis pub/sub, upload de fichiers avec Multer, et intégration des services IA locaux. TypeScript strict, pas de `any`.

---

## Table des matières

1. [Architecture en couches](#1-architecture-en-couches)
2. [Socket.IO Server](#2-socketio-server)
3. [Redis Pub/Sub](#3-redis-pubsub)
4. [Upload de fichiers](#4-upload-de-fichiers)
5. [Services IA locaux](#5-services-ia-locaux)
6. [Rate Limiting & Middleware](#6-rate-limiting--middleware)
7. [Gestion des erreurs](#7-gestion-des-erreurs)

---

## 1. Architecture en couches

```
backend/
├── src/
│   ├── transport/
│   │   ├── socket/
│   │   │   ├── handlers/
│   │   │   │   ├── message.handler.ts
│   │   │   │   ├── typing.handler.ts
│   │   │   │   └── presence.handler.ts
│   │   │   ├── middleware/
│   │   │   │   └── auth.middleware.ts
│   │   │   └── socket.server.ts
│   │   └── http/
│   │       ├── controllers/
│   │       │   ├── upload.controller.ts
│   │       │   └── conversation.controller.ts
│   │       ├── routes/
│   │       │   └── index.ts
│   │       └── server.ts
│   ├── domain/
│   │   ├── entities/
│   │   │   ├── User.ts
│   │   │   ├── Message.ts
│   │   │   └── Conversation.ts
│   │   ├── dto/
│   │   │   ├── CreateMessageDto.ts
│   │   │   └── UpdatePresenceDto.ts
│   │   └── services/
│   │       ├── MessageService.ts
│   │       ├── ConversationService.ts
│   │       └── SpamDetectionService.ts
│   ├── persistence/
│   │   ├── prisma/
│   │   │   └── client.ts
│   │   └── repositories/
│   │       ├── MessageRepository.ts
│   │       └── UserRepository.ts
│   ├── infrastructure/
│   │   ├── redis/
│   │   │   └── client.ts
│   │   ├── llama/
│   │   │   └── client.ts
│   │   └── libretranslate/
│   │       └── client.ts
│   └── index.ts
├── prisma/
│   └── schema.prisma
└── package.json
```

### Règles de dépendance

```typescript
// Couche externe → couche interne : OK via interface
// Couche interne → couche externe : INTERDIT

// ✅ Correct : Transport appelle Domain via interface
import { MessageService } from '@/domain/services/MessageService';

// ❌ Incorrect : Domain ne doit pas importer Prisma
import { PrismaClient } from '@prisma/client'; // dans un fichier domain/
```

---

## 2. Socket.IO Server

### 2.1 Initialisation

```typescript
// @/transport/socket/socket.server.ts
import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { registerMessageHandlers } from './handlers/message.handler';
import { registerTypingHandlers } from './handlers/typing.handler';
import { socketAuthMiddleware } from './middleware/auth.middleware';
import { createAdapter } from '@socket.io/redis-adapter';
import { pubClient, subClient } from '@/infrastructure/redis/client';

export function createSocketServer(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL!,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 30000,
    pingInterval: 10000,
  });

  // Adapter Redis pour le scaling horizontal
  io.adapter(createAdapter(pubClient, subClient));

  // Middleware d'authentification JWT
  io.use(socketAuthMiddleware);

  // Handlers par namespace / room
  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}, user: ${socket.data.userId}`);

    // Rejoindre les rooms de conversations de l'utilisateur
    joinUserConversations(socket);

    registerMessageHandlers(io, socket);
    registerTypingHandlers(io, socket);
    registerPresenceHandlers(io, socket);

    socket.on('disconnect', (reason) => {
      console.log(`Socket disconnected: ${socket.id}, reason: ${reason}`);
      broadcastPresence(io, socket.data.userId, 'offline');
    });
  });

  return io;
}
```

### 2.2 Handler de messages

```typescript
// @/transport/socket/handlers/message.handler.ts
import { Socket, Server } from 'socket.io';
import { z } from 'zod';
import { MessageService } from '@/domain/services/MessageService';
import { MessageRepository } from '@/persistence/repositories/MessageRepository';
import { RedisPubSub } from '@/infrastructure/redis/pubsub';

const SendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  cipher: z.string().min(1),
  nonce: z.string().min(1),
  tempId: z.string().optional(),
  type: z.enum(['text', 'voice', 'file']).default('text'),
  fileUrl: z.string().optional(),
  replyToId: z.string().uuid().optional(),
});

export function registerMessageHandlers(io: Server, socket: Socket) {
  const messageService = new MessageService(new MessageRepository());

  socket.on('message:send', async (payload: unknown, ack?: Function) => {
    try {
      const data = SendMessageSchema.parse(payload);
      const senderId = socket.data.userId as string;

      // Vérifier l'appartenance à la conversation
      const isMember = await messageService.verifyMembership(data.conversationId, senderId);
      if (!isMember) {
        socket.emit('error', { code: 'FORBIDDEN', message: 'Non membre de la conversation' });
        return;
      }

      // Calculer le hash de déduplication
      const dedupHash = computeDedupHash(data.cipher, senderId);

      const message = await messageService.create({
        ...data,
        senderId,
        dedupHash,
      });

      // Publication Redis pour cross-node broadcast
      await RedisPubSub.publish(`conversation:${data.conversationId}`, {
        type: 'NEW_MESSAGE',
        payload: {
          id: message.id,
          conversationId: data.conversationId,
          cipher: data.cipher,
          nonce: data.nonce,
          senderId,
          createdAt: message.createdAt,
          hash: dedupHash,
          type: data.type,
        },
      });

      // Broadcast aux membres de la room
      io.to(`conversation:${data.conversationId}`).emit('message:receive', {
        id: message.id,
        conversationId: data.conversationId,
        cipher: data.cipher,
        nonce: data.nonce,
        senderId,
        createdAt: message.createdAt,
        hash: dedupHash,
        type: data.type,
      });

      // Acknowledge au sender
      if (ack) {
        ack({ success: true, id: message.id, tempId: data.tempId });
      }

      socket.emit('message:sent', { id: message.id, tempId: data.tempId, status: 'delivered' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        socket.emit('error', { code: 'VALIDATION', errors: error.issues });
      } else {
        console.error('Message send error:', error);
        socket.emit('error', { code: 'INTERNAL', message: 'Erreur interne' });
      }
    }
  });
}
```

### 2.3 Middleware d'authentification

```typescript
// @/transport/socket/middleware/auth.middleware.ts
import { Socket } from 'socket.io';
import { verify } from 'jsonwebtoken';
import { ExtendedError } from 'socket.io/dist/namespace';

interface TokenPayload {
  sub: string;    // userId
  iat: number;
  exp: number;
}

export function socketAuthMiddleware(
  socket: Socket,
  next: (err?: ExtendedError) => void,
) {
  const token = socket.handshake.auth.token as string | undefined;

  if (!token) {
    return next(new Error('AUTH_REQUIRED'));
  }

  try {
    const decoded = verify(token, process.env.JWT_SECRET!) as TokenPayload;

    // Vérifier la session Redis (invalidation côté serveur possible)
    const sessionExists = await checkRedisSession(decoded.sub, token);
    if (!sessionExists) {
      return next(new Error('SESSION_EXPIRED'));
    }

    socket.data.userId = decoded.sub;
    next();
  } catch {
    next(new Error('INVALID_TOKEN'));
  }
}
```

---

## 3. Redis Pub/Sub

### 3.1 Client Redis

```typescript
// @/infrastructure/redis/client.ts
import { createClient } from 'redis';

export const pubClient = createClient({
  url: process.env.REDIS_URL!,
});

export const subClient = pubClient.duplicate();

export async function connectRedis(): Promise<void> {
  await pubClient.connect();
  await subClient.connect();
}
```

### 3.2 Service Pub/Sub

```typescript
// @/infrastructure/redis/pubsub.ts
import { pubClient } from './client';

export class RedisPubSub {
  static async publish(channel: string, message: unknown): Promise<void> {
    await pubClient.publish(channel, JSON.stringify(message));
  }

  static async subscribe(
    channel: string,
    handler: (message: unknown) => void,
  ): Promise<void> {
    const subscriber = pubClient.duplicate();
    await subscriber.connect();
    await subscriber.subscribe(channel, (rawMessage) => {
      try {
        const parsed = JSON.parse(rawMessage);
        handler(parsed);
      } catch {
        console.error('Failed to parse Redis message:', rawMessage);
      }
    });
  }
}
```

**Pourquoi Redis ?**
- **Sessions** : stockage des JWT côté serveur avec TTL (24h).
- **Pub/Sub** : diffusion cross-node quand plusieurs instances Socket.IO sont derrière un load balancer.
- **Rate limiting** : compteurs par IP / userId avec fenêtre glissante (SLIDE window).

---

## 4. Upload de fichiers

### 4.1 Multer configuration

```typescript
// @/transport/http/middleware/upload.middleware.ts
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const ALLOWED_MIMES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'audio/webm',
  'audio/ogg',
  'audio/mpeg',
  'video/mp4',
  'application/pdf',
];

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, process.env.UPLOAD_DIR!);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safeName = `${uuidv4()}${ext}`;
    cb(null, safeName);
  },
});

export const uploadMiddleware = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Type MIME non autorisé: ${file.mimetype}`));
    }
  },
});
```

### 4.2 Controller d'upload

```typescript
// @/transport/http/controllers/upload.controller.ts
import { Request, Response } from 'express';
import { uploadMiddleware } from '../middleware/upload.middleware';
import { OpenGraphParser } from 'open-graph-parser';

interface UploadRequest extends Request {
  file?: Express.Multer.File;
}

export async function handleUpload(req: UploadRequest, res: Response) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    const fileUrl = `${process.env.CDN_BASE_URL}/uploads/${req.file.filename}`;

    // Si c'est un lien, parser l'OpenGraph
    let ogData: Record<string, string> | undefined;
    if (req.body.url) {
      ogData = await OpenGraphParser.parse(req.body.url);
    }

    return res.status(201).json({
      id: req.file.filename,
      url: fileUrl,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      openGraph: ogData,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: 'Erreur lors de l\'upload' });
  }
}
```

---

## 5. Services IA locaux

### 5.1 llama.cpp — Résumés

```typescript
// @/infrastructure/llama/client.ts
import { spawn } from 'child_process';

interface SummaryOptions {
  maxLength?: number;
  language?: string;
}

export class LlamaClient {
  private readonly apiUrl: string;

  constructor() {
    this.apiUrl = process.env.LLAMA_API_URL!;
  }

  async summarize(messages: string[], options: SummaryOptions = {}): Promise<string> {
    const prompt = this.buildSummaryPrompt(messages, options.language ?? 'fr');

    const response = await fetch(`${this.apiUrl}/completion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        n_predict: options.maxLength ?? 150,
        temperature: 0.3,
        stop: ['\n###', '</s>'],
      }),
    });

    if (!response.ok) {
      throw new Error(`Llama API error: ${response.status}`);
    }

    const data = await response.json() as { content: string };
    return data.content.trim();
  }

  private buildSummaryPrompt(messages: string[], language: string): string {
    const joined = messages.slice(-50).join('\n'); // Derniers 50 messages max
    return `### Instruction:\nRésume la conversation suivante en ${language} de manière concise.\n\n### Input:\n${joined}\n\n### Response:\n`;
  }
}
```

### 5.2 LibreTranslate

```typescript
// @/infrastructure/libretranslate/client.ts

export class LibreTranslateClient {
  private readonly apiUrl: string;

  constructor() {
    this.apiUrl = process.env.LIBRETRANSLATE_URL!;
  }

  async translate(text: string, source: string, target: string): Promise<string> {
    const response = await fetch(`${this.apiUrl}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: text,
        source,
        target,
        format: 'text',
      }),
    });

    const data = await response.json() as { translatedText: string };
    return data.translatedText;
  }

  async detectLanguage(text: string): Promise<string> {
    const response = await fetch(`${this.apiUrl}/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text }),
    });

    const data = await response.json() as Array<{ language: string; confidence: number }>;
    return data[0]?.language ?? 'auto';
  }
}
```

---

## 6. Rate Limiting & Middleware

### 6.1 Rate limiter par IP (Socket.IO)

```typescript
// @/transport/socket/middleware/rate-limit.middleware.ts
import { Socket } from 'socket.io';
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export function createRateLimiter(config: RateLimitConfig) {
  return async (socket: Socket, eventName: string): Promise<boolean> => {
    const key = `ratelimit:${socket.data.userId ?? socket.handshake.address}:${eventName}`;
    const now = Date.now();
    const windowStart = now - config.windowMs;

    // SLIDE window avec Sorted Set Redis
    await redis.zremrangebyscore(key, 0, windowStart);
    const currentCount = await redis.zcard(key);

    if (currentCount >= config.maxRequests) {
      return false;
    }

    await redis.zadd(key, now, `${now}-${Math.random()}`);
    await redis.pexpire(key, config.windowMs);
    return true;
  };
}

// Usage dans un handler
const messageLimiter = createRateLimiter({ windowMs: 10000, maxRequests: 30 });

socket.on('message:send', async (payload, ack) => {
  const allowed = await messageLimiter(socket, 'message:send');
  if (!allowed) {
    socket.emit('error', { code: 'RATE_LIMITED', retryAfter: 10 });
    return;
  }
  // ... traitement
});
```

**Complexité :**
- `zremrangebyscore` : O(log n + m) où m = nombre d'éléments supprimés.
- `zcard` : O(1).
- `zadd` : O(log n).
- Très efficace même sous forte charge.

---

## 7. Gestion des erreurs

### 7.1 Central error handler

```typescript
// @/transport/http/middleware/error.middleware.ts
import { Request, Response, NextFunction } from 'express';

interface AppError extends Error {
  statusCode?: number;
  code?: string;
  isOperational?: boolean;
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = err.statusCode ?? 500;
  const code = err.code ?? 'INTERNAL_ERROR';

  // Log structuré
  console.error(JSON.stringify({
    level: statusCode >= 500 ? 'error' : 'warn',
    code,
    statusCode,
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  }));

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message: err.isOperational ? err.message : 'Une erreur est survenue',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
}
```

### 7.2 Classes d'erreur métier

```typescript
// @/domain/errors/AppError.ts
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL',
    isOperational: boolean = true,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public readonly details: unknown[]) {
    super(message, 400, 'VALIDATION_ERROR', true);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Non authentifié') {
    super(message, 401, 'AUTHENTICATION_ERROR', true);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Accès interdit') {
    super(message, 403, 'FORBIDDEN', true);
  }
}
```
