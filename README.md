# 🔐 Real-Time Messenger

Application de messagerie temps réel sécurisée avec chiffrement End-to-End (E2E), 2FA, et design moderne.

[![Stack](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![Stack](https://img.shields.io/badge/React-19-blue)](https://react.dev)
[![Stack](https://img.shields.io/badge/TypeScript-5-blue)](https://typescriptlang.org)
[![Stack](https://img.shields.io/badge/Tailwind-4-cyan)](https://tailwindcss.com)
[![Stack](https://img.shields.io/badge/Prisma-5-green)](https://prisma.io)
[![Security](https://img.shields.io/badge/E2E-libsodium-purple)](https://libsodium.gitbook.io/doc/)

## ✨ Features

### 🔒 Sécurité

- **Chiffrement E2E** - Curve25519 + XSalsa20-Poly1305 (libsodium)
- **2FA TOTP** - Authentification à deux facteurs avec QR code
- **Session sécurisée** - JWT + Redis avec invalidation côté serveur
- **Headers sécurisés** - CSP, X-Frame-Options, HSTS

### ⚡ Real-time

- **Socket.IO** - WebSocket avec fallback polling
- **Typing indicators** - Throttle + Debounce hybride optimisé
- **Online presence** - Statuts temps réel (online/away/offline)
- **Redis Pub/Sub** - Scaling horizontal multi-instances

### 🎨 Design

- **Dark mode natif** - Switch automatique sans compromis
- **Micro-interactions** - Animations Framer Motion fluides
- **Responsive** - Mobile-first avec breakpoints xs → xl
- **Accessibility** - WCAG 2.1 AA, prefers-reduced-motion

### 🧠 Algorithmes avancés

- **Pagination cursor-based** - O(log n) avec index composite
- **Déduplication** - Hash SHA-256 + fenêtre temporelle
- **Full-Text Search** - PostgreSQL GIN + TF-IDF ranking
- **Rate limiting** - SLIDE window algorithm avec Redis Sorted Sets

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 16+
- Redis 7+
- pnpm (recommandé)

### Installation

```bash
# 1. Clone et installation
pnpm install

# 2. Configuration
cp .env.example .env
# Éditer .env avec vos valeurs

# 3. Database
pnpm prisma migrate dev
pnpm prisma generate

# 4. Développement
pnpm dev
```

### Docker (Production)

```bash
# Lancer l'infrastructure complète
docker-compose up -d

# Avec services IA optionnels
docker-compose --profile ai up -d
```

## 📁 Structure du Projet

```
chat/
├── app/
│   ├── (auth)/          # Routes auth (login, register)
│   ├── (chat)/          # Routes protégées (conversations)
│   └── api/             # API routes
├── components/
│   ├── chat/            # Composants métier (MessageBubble, Composer, etc.)
│   └── ui/              # Composants Shadcn/UI
├── hooks/               # Hooks custom (useSocket, useMessages, useTyping)
├── lib/                 # Utilities (crypto, redis, prisma)
├── server/              # Socket.IO server
├── types/               # Types TypeScript
└── docs/                # Documentation complète
```

## 🔐 Architecture E2E

```
Alice                           Bob
  │                              │
  │  1. Génère clés X25519      │
  │  (sk_A, pk_A)               │
  │                              │
  │  2. Échange pk via serveur  │
  │◄───────────────────────────►│
  │                              │
  │  3. Secret partagé:         │  Secret partagé:
  │     DH(sk_A, pk_B)          │     DH(sk_B, pk_A)
  │        = [ab]G              │        = [ab]G
  │                              │
  │  4. Chiffre avec XSalsa20   │  5. Déchiffre
  │     + Poly1305 MAC          │
```

**Mathématiques:** Curve25519 sur F(2^255 - 19), sécurité ~2^125 opérations

## 📊 Performance

| Métrique      | Valeur   | Optimisation                                    |
| ------------- | -------- | ----------------------------------------------- |
| Pagination    | O(log n) | Index composite (conversationId, createdAt, id) |
| Déduplication | O(1)     | Hash Set avec eviction LRU                      |
| Rate limiting | O(log n) | Redis ZSET SLIDE window                         |
| Reconnection  | <100ms   | Exponential backoff + sticky sessions           |

## 🧪 Tests

```bash
# Tests unitaires
pnpm test

# Tests E2E
pnpm test:e2e

# Linting
pnpm lint

# Type checking
pnpm tsc --noEmit
```

## 📚 Documentation

Voir le dossier [`docs/`](./docs) pour:

- [ARCHITECTURE.md](./docs/ARCHITECTURE.md) - C4 Model, flux de données
- [DESIGN.md](./docs/DESIGN.md) - Design system, tokens, animations
- [ALGORITHMS.md](./docs/ALGORITHMS.md) - Mathématiques et complexités
- [SECURITY.md](./docs/SECURITY.md) - Threat model, E2E protocol
- [API.md](./docs/API.md) - Events Socket.IO, REST endpoints

## 🤝 Contributing

1. Fork le projet
2. Créer une branche (`git checkout -b feature/amazing`)
3. Commit (`git commit -m 'feat: add amazing'`)
4. Push (`git push origin feature/amazing`)
5. Ouvrir une Pull Request

## 📄 License

MIT License - voir [LICENSE](./LICENSE) pour les détails.

---

<p align="center">
  Construit avec ❤️ et 🔒 chiffrement E2E
</p>
