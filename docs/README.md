# Documentation — Real-Time Messenger

> Documentation technique complète de l'application de messagerie temps réel.
> Chaque document est rédigé pour un niveau **production-grade** : architecture, algorithmes, sécurité et design sont traités avec la même rigueur que le code source.

---

## Sommaire

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Vue d'ensemble du système, diagrammes C4, flux de données, topologie réseau |
| [DESIGN.md](./DESIGN.md) | Design system, tokens visuels, dark mode, micro-interactions, responsive |
| [FRONTEND.md](./FRONTEND.md) | Next.js App Router, hooks Socket.IO, state management, error boundaries, skeletons |
| [BACKEND.md](./BACKEND.md) | Node.js + Socket.IO, architecture en couches, Redis pub/sub, Multer |
| [DATABASE.md](./DATABASE.md) | Schema Prisma, index GIN Full-Text Search, relations, migrations |
| [SECURITY.md](./SECURITY.md) | Authentification NextAuth.js, 2FA TOTP, chiffrement E2E avec libsodium |
| [ALGORITHMS.md](./ALGORITHMS.md) | E2E Diffie-Hellman, TF-IDF ranking, déduplication, spam fastText, compression audio |
| [API.md](./API.md) | Events Socket.IO, payloads typés, REST endpoints, codes d'erreur |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Infrastructure, Docker, variables d'environnement, scaling horizontal |

---

## Philosophie documentaire

1. **Un seul niveau d'abstraction par fichier.** Pas de mélange entre "comment ça marche" et "comment l'utiliser".
2. **Code exécutable.** Tous les extraits de code sont issus du codebase ou représentatifs de ce qui est en production.
3. **Algorithmes prouvés.** Complexité temporelle et spatiale explicitée, invariants documentés.
4. **Sécurité par défaut.** Chaque décision de sécurité est justifiée par une menace (threat model).

---

## Commencer rapidement

```bash
# Lecture recommandée pour les nouveaux contributeurs
1. ARCHITECTURE.md   → comprendre le système
2. DATABASE.md       → comprendre le modèle de données
3. FRONTEND.md       → comprendre l'UI
4. ALGORITHMS.md     → comprendre les traitements critiques
```

---

*Dernière mise à jour : 2026-05-04*
