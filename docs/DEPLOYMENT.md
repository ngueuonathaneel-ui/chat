# Déploiement & Infrastructure

> Guide de déploiement complet : Docker, variables d'environnement, scaling horizontal, monitoring, et checklist de mise en production.

---

## Table des matières

1. [Architecture d'infrastructure](#1-architecture-dinfrastructure)
2. [Docker Compose (développement)](#2-docker-compose-développement)
3. [Variables d'environnement](#3-variables-denvironnement)
4. [Scaling horizontal](#4-scaling-horizontal)
5. [Monitoring & logging](#5-monitoring--logging)
6. [Checklist production](#6-checklist-production)

---

## 1. Architecture d'infrastructure

```
Internet
    │
    ▼
┌─────────────┐
│   Nginx     │  ← SSL termination, rate limiting, static cache
│   (LB)      │
└──────┬──────┘
       │
   ┌───┴───┐
   ▼       ▼
┌──────┐ ┌──────┐
│ Web-1│ │ Web-2│  ← Next.js (3000)
│      │ │      │
└──┬───┘ └──┬───┘
   │        │
   └───┬────┘
       │
   ┌───┴───┐
   ▼       ▼
┌──────┐ ┌──────┐
│ API-1│ │ API-2│  ← Socket.IO (4000)
│      │ │      │
└──┬───┘ └──┬───┘
   │        │
   └───┬────┘
       │
   ┌───┴───┐
   ▼       ▼
┌──────┐ ┌──────┐
│Redis │ │Postgre│
│PubSub│ │SQL   │
└──────┘ └──────┘

IA Services (optionnel, same-host)
┌──────────┐ ┌──────────────┐
│ llama.cpp│ │ LibreTrans-  │
│  :8080   │ │   late :5000 │
└──────────┘ └──────────────┘
```

---

## 2. Docker Compose (développement)

```yaml
# docker-compose.yml
version: '3.8'

services:
  web:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_SOCKET_URL=http://localhost:4000
      - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/messenger
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      - postgres
      - redis

  api:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "4000:4000"
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/messenger
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET}
      - MASTER_ENCRYPTION_KEY=${MASTER_ENCRYPTION_KEY}
      - UPLOAD_DIR=/uploads
      - FRONTEND_URL=http://localhost:3000
      - LLAMA_API_URL=http://llama:8080
      - LIBRETRANSLATE_URL=http://libretranslate:5000
    volumes:
      - uploads:/uploads
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=messenger
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  llama:
    image: ghcr.io/ggml-org/llama.cpp:server
    command: >
      -m /models/llama-3-8b-Q4_K_M.gguf
      -c 4096
      --host 0.0.0.0
      --port 8080
    volumes:
      - ./models:/models:ro
    ports:
      - "8080:8080"

  libretranslate:
    image: libretranslate/libretranslate:latest
    ports:
      - "5000:5000"
    volumes:
      - libretranslate_data:/home/libretranslate/.local

volumes:
  postgres_data:
  redis_data:
  uploads:
  libretranslate_data:
```

---

## 3. Variables d'environnement

### 3.1 Frontend (`web`)

| Variable | Obligatoire | Description | Exemple |
|----------|-------------|-------------|---------|
| `NEXT_PUBLIC_SOCKET_URL` | Oui | URL du serveur Socket.IO | `wss://api.example.com` |
| `NEXTAUTH_URL` | Oui | URL de l'app Next.js | `https://app.example.com` |
| `NEXTAUTH_SECRET` | Oui | Secret pour JWT NextAuth | `openssl rand -base64 32` |

### 3.2 Backend (`api`)

| Variable | Obligatoire | Description | Exemple |
|----------|-------------|-------------|---------|
| `DATABASE_URL` | Oui | Connection string PostgreSQL | `postgresql://user:pass@host:5432/db` |
| `REDIS_URL` | Oui | Connection string Redis | `redis://host:6379` |
| `JWT_SECRET` | Oui | Secret de signature JWT | `openssl rand -hex 32` |
| `MASTER_ENCRYPTION_KEY` | Oui | Clé AES-256 pour secrets 2FA | `openssl rand -hex 32` |
| `FRONTEND_URL` | Oui | Origine CORS autorisée | `https://app.example.com` |
| `UPLOAD_DIR` | Oui | Répertoire de stockage fichiers | `/var/uploads` |
| `CDN_BASE_URL` | Non | URL publique des fichiers | `https://cdn.example.com` |
| `LLAMA_API_URL` | Non | URL du service llama.cpp | `http://localhost:8080` |
| `LIBRETRANSLATE_URL` | Non | URL LibreTranslate | `http://localhost:5000` |

### 3.3 Génération des secrets

```bash
# Générer tous les secrets nécessaires
JWT_SECRET=$(openssl rand -hex 32)
MASTER_KEY=$(openssl rand -hex 32)
NEXTAUTH_SECRET=$(openssl rand -base64 32)

cat > .env <<EOF
JWT_SECRET=$JWT_SECRET
MASTER_ENCRYPTION_KEY=$MASTER_KEY
NEXTAUTH_SECRET=$NEXTAUTH_SECRET
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/messenger
REDIS_URL=redis://localhost:6379
FRONTEND_URL=http://localhost:3000
EOF
```

---

## 4. Scaling horizontal

### 4.1 Socket.IO avec Redis Adapter

Quand `API-1` et `API-2` tournent sur des machines différentes :

```typescript
import { createAdapter } from '@socket.io/redis-adapter';

const pubClient = new Redis(process.env.REDIS_URL!);
const subClient = pubClient.duplicate();

io.adapter(createAdapter(pubClient, subClient));
```

**Sticky sessions :** Nginx doit router les WebSocket du même utilisateur vers la même instance. Alternative : pas nécessaire avec Socket.IO + Redis Adapter car les rooms sont synchronisées.

### 4.2 Nginx configuration

```nginx
upstream socket_backend {
    ip_hash;  # Sticky sessions pour Socket.IO
    server api-1:4000;
    server api-2:4000;
}

server {
    listen 443 ssl http2;
    server_name api.example.com;

    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    location / {
        proxy_pass http://socket_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }
}
```

---

## 5. Monitoring & logging

### 5.1 Métriques clés

| Métrique | Seuil d'alerte |
|----------|---------------|
| Latence WebSocket (p99) | > 200ms |
| Taux d'erreur HTTP 5xx | > 0.5% |
| Connexions Socket.IO actives | Anomalie brutale (±50%) |
| Utilisation Redis mémoire | > 80% |
| Latence PostgreSQL (p99) | > 50ms |
| File d'attente uploads | > 100 |

### 5.2 Logging structuré

```typescript
// @/lib/logger.ts
import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  defaultMeta: { service: 'messenger-api' },
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

// Usage
logger.info('Message sent', {
  messageId,
  conversationId,
  senderId,
  latencyMs: Date.now() - startTime,
});
```

---

## 6. Checklist production

### 6.1 Sécurité

- [ ] `NODE_ENV=production`
- [ ] HTTPS partout (TLS 1.3)
- [ ] Cookies `secure`, `httpOnly`, `SameSite=lax`
- [ ] `MASTER_ENCRYPTION_KEY` ≠ `JWT_SECRET`
- [ ] Rate limiting activé (Redis)
- [ ] CSP headers configurés
- [ ] Upload directory hors webroot
- [ ] Clés SSH/DB rotées

### 6.2 Performance

- [ ] Index GIN créés en production
- [ ] Redis persistence configurée (AOF ou RDB)
- [ ] Prisma connection pool limité (max 20)
- [ ] Static assets servis via CDN
- [ ] Compression gzip/brotli activée (Nginx)

### 6.3 Fiabilité

- [ ] Backups PostgreSQL automatisées (daily)
- [ ] Healthchecks Docker (`/health`)
- [ ] Logs centralisés (ou fichiers rotatifs)
- [ ] Alertes sur erreurs 5xx
- [ ] Runbook pour incident E2E key compromise

### 6.4 Commandes de vérification

```bash
# Vérifier la connectivité Redis
redis-cli ping

# Vérifier les migrations Prisma
npx prisma migrate status

# Tester le endpoint de santé
curl -f http://localhost:4000/health || echo "API DOWN"

# Vérifier les listeners Socket.IO
redis-cli pubsub channels

# Tester le chiffrement E2E (sanity check)
node -e "require('./lib/crypto').generateKeyPair().then(() => console.log('OK'))"
```
