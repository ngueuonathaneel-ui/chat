# Sécurité

> Spécification complète de la sécurité : authentification, autorisation, chiffrement E2E, 2FA TOTP, gestion des sessions, et menaces identifiées (threat model). Chaque décision est justifiée par une analyse de risque.

---

## Table des matières

1. [Threat Model](#1-threat-model)
2. [Authentification NextAuth.js](#2-authentification-nextauthjs)
3. [2FA TOTP (Speakeasy)](#3-2fa-totp-speakeasy)
4. [Chiffrement End-to-End](#4-chiffrement-end-to-end)
5. [Gestion des sessions](#5-gestion-des-sessions)
6. [Protection contre les attaques courantes](#6-protection-contre-les-attaques-courantes)
7. [Sécurité des fichiers uploadés](#7-sécurité-des-fichiers-uploadés)

---

## 1. Threat Model

| Menace | Impact | Probabilité | Mitigation |
|--------|--------|-------------|------------|
| **MITM** (interception messages) | Élevé | Moyenne | E2E libsodium, TLS 1.3 |
| **XSS** (injection script) | Élevé | Moyenne | CSP strict, sanitization, React XSS-safe |
| **CSRF** (action non voulue) | Moyen | Faible | SameSite cookies, tokens CSRF |
| **Brute force auth** | Moyen | Élevée | Rate limiting, argon2id lent |
| **Session hijacking** | Élevé | Moyenne | HTTPOnly cookies, TTL courts, invalidation Redis |
| **Injection SQL** | Critique | Faible | Prisma ORM (paramétré) |
| **File upload malicious** | Élevé | Moyenne | Validation MIME, size limit, scan antivirus |
| **Spam / flooding** | Moyen | Élevée | Rate limiting, fastText classification |
| **Data leak serveur** | Critique | Faible | E2E : serveur ne voit que ciphertexts |

---

## 2. Authentification NextAuth.js

### 2.1 Configuration

```typescript
// @/app/api/auth/[...nextauth]/route.ts
import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { compare } from 'bcrypt';
import { prisma } from '@/persistence/prisma/client';

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        totpCode: { label: '2FA Code', type: 'text', optional: true },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user) {
          return null;
        }

        const validPassword = await compare(credentials.password, user.password);
        if (!validPassword) {
          return null;
        }

        // Vérification 2FA si activé
        if (user.twoFactorEnabled) {
          if (!credentials.totpCode) {
            throw new Error('2FA_REQUIRED');
          }
          
          const verified = verifyTOTP(user.twoFactorSecret!, credentials.totpCode);
          if (!verified) {
            throw new Error('INVALID_2FA');
          }
        }

        return {
          id: user.id,
          email: user.email,
          username: user.username,
          twoFactorEnabled: user.twoFactorEnabled,
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24h
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.email = user.email;
        token.username = user.username;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.sub!;
      session.user.email = token.email!;
      session.user.username = token.username as string;
      return session;
    },
  },
  cookies: {
    sessionToken: {
      name: `__session`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
});

export { handler as GET, handler as POST };
```

### 2.2 Hachage des mots de passe

```typescript
// @/domain/services/AuthService.ts
import { hash } from 'bcrypt';

const SALT_ROUNDS = 12; // ~250ms par hash (CPU-bound, résistant au brute force)

export async function hashPassword(plainPassword: string): Promise<string> {
  return hash(plainPassword, SALT_ROUNDS);
}
```

**Pourquoi bcrypt et pas argon2id directement ?**
- bcrypt est intégré nativement dans Node.js.
- argon2id est théoriquement supérieur (résistance GPU/ASIC), mais nécessite `argon2` npm qui dépend de bindings natifs.
- Compromis pratique : bcrypt avec cost élevé (12).

---

## 3. 2FA TOTP (Speakeasy)

### 3.1 Génération du secret

```typescript
// @/domain/services/TwoFactorService.ts
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

export interface TOTPSetup {
  secret: string;
  otpauthUrl: string;
  qrCodeUrl: string;
}

export class TwoFactorService {
  /**
   * Génère un secret TOTP pour un utilisateur.
   * Le secret est chiffré avant stockage en base (AES-256-GCM avec clé serveur).
   */
  async generateSecret(userId: string): Promise<TOTPSetup> {
    const secret = speakeasy.generateSecret({
      name: 'Messenger',
      length: 32,
      issuer: 'MessengerApp',
    });

    const otpauthUrl = speakeasy.otpauthURL({
      secret: secret.ascii,
      label: `Messenger:${userId}`,
      issuer: 'MessengerApp',
      encoding: 'ascii',
    });

    const qrCodeUrl = await QRCode.toDataURL(otpauthUrl);

    // Chiffrer le secret avant stockage
    const encryptedSecret = encryptAtRest(secret.base32);
    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: encryptedSecret },
    });

    return {
      secret: secret.base32, // Affiché une seule fois à l'utilisateur
      otpauthUrl,
      qrCodeUrl,
    };
  }

  /**
   * Vérifie un code TOTP avec une fenêtre de tolérance.
   * window=1 : accepte le code précédent et le suivant (30s de drift max).
   */
  verifyTOTP(encryptedSecret: string, token: string): boolean {
    const secret = decryptAtRest(encryptedSecret);
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 1,
      step: 30,
    });
  }
}
```

### 3.2 Chiffrement at rest du secret

```typescript
// @/lib/encryption.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.MASTER_ENCRYPTION_KEY!, 'hex'); // 32 bytes

function encryptAtRest(plaintext: string): string {
  const iv = randomBytes(16);
  const authTagLength = 16;
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf-8'),
    cipher.final(),
  ]);
  
  const authTag = cipher.getAuthTag();
  
  // Format: iv:authTag:ciphertext (base64)
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptAtRest(ciphertext: string): string {
  const [ivB64, authTagB64, encryptedB64] = ciphertext.split(':');
  
  const decipher = createDecipheriv(
    ALGORITHM,
    KEY,
    Buffer.from(ivB64, 'base64'),
  );
  
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
  
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedB64, 'base64')),
    decipher.final(),
  ]);
  
  return decrypted.toString('utf-8');
}
```

---

## 4. Chiffrement End-to-End

### 4.1 Protocole de sécurité

Le serveur **ne possède jamais** les clés privées. Il ne stocke que :
- `User.publicKey` (Curve25519) — utilisée pour dériver les secrets partagés.
- Les messages chiffrés (`cipher`, `nonce`) — illisibles sans la clé privée.

### 4.2 Séquence complète

```
Phase 1 : Échange de clés (une seule fois par conversation)
┌──────────────┐                          ┌──────────────┐
│   Alice      │                          │     Bob      │
│  sk_A, pk_A  │  1. POST /keys {pk_A}   │  sk_B, pk_B  │
│              │◄────────────────────────►│              │
│              │  2. GET /keys/bob -> pk_B│              │
│              │◄─────────────────────────│              │
│  Clé partagée│                          │ Clé partagée │
│  = DH(sk_A,  │                          │ = DH(sk_B,   │
│    pk_B)     │                          │   pk_A)      │
└──────────────┘                          └──────────────┘

Phase 2 : Envoi de messages (pour chaque message)
┌──────────────┐                          ┌──────────────┐
│   Alice      │  3. cipher =             │     Bob      │
│              │     crypto_box_easy(       │              │
│              │       msg, nonce, pk_B,    │              │
│              │       sk_A)                │              │
│              │  4. POST /messages         │              │
│              │───────────────────────────►│              │
│              │     {cipher, nonce}          │  5. Déchiffre│
│              │                            │     avec sk_B│
└──────────────┘                            └──────────────┘
```

### 4.3 Protection contre la répétition (replay)

```typescript
// @/lib/crypto.ts
const usedNonces = new Set<string>();
const NONCE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function isReplayAttack(nonce: string, timestamp: number): boolean {
  const now = Date.now();
  if (now - timestamp > NONCE_WINDOW_MS) {
    throw new Error('MESSAGE_TOO_OLD');
  }
  if (usedNonces.has(nonce)) {
    throw new Error('REPLAY_ATTACK_DETECTED');
  }
  usedNonces.add(nonce);
  
  // Nettoyage périodique des nonces expirés
  if (usedNonces.size > 10000) {
    usedNonces.clear(); // Simplifié ; en prod : eviction LRU
  }
  
  return false;
}
```

---

## 5. Gestion des sessions

### 5.1 Invalidation côté serveur

```typescript
// @/infrastructure/redis/session.ts
import { redis } from './client';

const SESSION_PREFIX = 'session:';
const SESSION_TTL = 24 * 60 * 60; // 24h

export async function createSession(userId: string, token: string): Promise<void> {
  await redis.setex(`${SESSION_PREFIX}${userId}:${token}`, SESSION_TTL, 'valid');
}

export async function invalidateSession(userId: string, token: string): Promise<void> {
  await redis.del(`${SESSION_PREFIX}${userId}:${token}`);
}

export async function invalidateAllSessions(userId: string): Promise<void> {
  const keys = await redis.keys(`${SESSION_PREFIX}${userId}:*`);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

export async function isSessionValid(userId: string, token: string): Promise<boolean> {
  const exists = await redis.exists(`${SESSION_PREFIX}${userId}:${token}`);
  return exists === 1;
}
```

### 5.2 Déconnexion globale

Quand un utilisateur change son mot de passe ou active/désactive le 2FA, toutes ses sessions sont invalidées via Redis.

---

## 6. Protection contre les attaques courantes

### 6.1 CSP (Content Security Policy)

```typescript
// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' blob: data: https:",
              "font-src 'self'",
              "connect-src 'self' wss: https:",
              "media-src 'self' blob:",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
```

### 6.2 Rate limiting HTTP

```typescript
// @/transport/http/middleware/rate-limit.middleware.ts
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redis } from '@/infrastructure/redis/client';

export const authRateLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args: string[]) => redis.sendCommand(args),
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 tentatives par fenêtre
  skipSuccessfulRequests: true,
  handler: (_req, res) => {
    res.status(429).json({
      error: 'Too many login attempts. Please try again later.',
    });
  },
});
```

---

## 7. Sécurité des fichiers uploadés

### 7.1 Validation stricte

```typescript
// @/transport/http/middleware/upload.middleware.ts
import { fileTypeFromBuffer } from 'file-type';

export async function validateFileType(
  file: Express.Multer.File,
): Promise<boolean> {
  // Validation MIME par magic numbers (pas seulement l'extension)
  const fileType = await fileTypeFromBuffer(file.buffer);
  
  if (!fileType) {
    return false;
  }
  
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'audio/webm', 'audio/ogg'];
  return allowedTypes.includes(fileType.mime);
}
```

### 7.2 Stockage sécurisé

- Les fichiers sont renommés avec UUID (pas de nom original exposé).
- Stockage hors webroot (`/var/uploads/`, pas dans `public/`).
- Accès via proxy API qui vérifie l'appartenance à la conversation.

```typescript
// @/transport/http/controllers/file.controller.ts
export async function serveFile(req: Request, res: Response) {
  const { fileId } = req.params;
  const userId = req.user!.id;
  
  // Vérifier que l'utilisateur a le droit de voir ce fichier
  const message = await prisma.message.findFirst({
    where: {
      OR: [
        { fileUrl: { endsWith: fileId } },
        { content: { contains: fileId } },
      ],
      conversation: {
        members: { some: { userId } },
      },
    },
  });
  
  if (!message) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  const filePath = path.join(process.env.UPLOAD_DIR!, fileId);
  res.sendFile(filePath);
}
```
