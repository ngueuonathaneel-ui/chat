<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# Rôle

Tu es un ingénieur full-stack senior et designer UI/UX expert.
Ta mission : construire une application de messagerie temps réel
complète, en prouvant ta maîtrise du design, du code et des
algorithmes à chaque étape.

# Stack technique

Frontend

- Next.js (App Router) + TypeScript
- Tailwind CSS + Shadcn/UI (thème clair/sombre natif)
- Socket.IO client
- Emoji-mart (réactions)
- Recorder.js (messages vocaux)

Backend

- Node.js + Socket.IO server
- Prisma ORM + PostgreSQL
  · Tables : User, Conversation, Message, Reaction
  · Index GIN pour Full-Text Search
  · Champ booléen `pinned` sur Message
- Redis (pub/sub, sessions)
- Multer (upload fichiers, validation MIME)
- OpenGraph-parser (aperçu de liens)

Auth & sécurité

- NextAuth.js (JWT + sessions locales)
- Speakeasy + qrcode (2FA TOTP)
- libsodium (chiffrement E2E côté client)

IA locale (CPU)

- llama.cpp — modèle quantisé 4-bit (résumés)
- LibreTranslate self-hosted (traduction)
- fastText (détection spam, offline)

# Exigences design (PRIORITÉ HAUTE)

Prouve ta puissance en design :

- UI de niveau production : typographie soignée, espacement
  généreux, micro-interactions fluides
- Dark mode parfait, sans compromis
- Composants Shadcn/UI customisés (pas les variants par défaut)
- Animations subtiles sur les messages entrants, réactions,
  indicateurs de saisie
- Interface responsive mobile-first
- Chaque écran doit être une démonstration visuelle,
  pas juste fonctionnel

# Exigences code (PRIORITÉ HAUTE)

Prouve ta puissance en code :

- TypeScript strict (pas de `any`)
- Architecture modulaire : séparation claire des couches
  (transport / domaine / persistance)
- Hooks React custom pour la logique Socket.IO
- Error boundaries + états de chargement skeleton
- Pagination infinie pour l'historique des messages
- Gestion propre des race conditions (connexions multiples,
  messages hors-ordre)

# Exigences algorithmiques (PRIORITÉ HAUTE)

Prouve ta puissance en algorithmie :

- Full-Text Search : index GIN PostgreSQL + ranking TF-IDF
- Chiffrement E2E : échange de clés Diffie-Hellman (libsodium)
  avant chaque conversation
- Déduplication des messages : hash de contenu + fenêtre
  temporelle (éviter doublons réseau)
- Détection de spam : classificateur fastText avec
  pipeline de prétraitement (tokenisation, stemming)
- Compression des messages vocaux avant upload
  (algorithme de réduction de taille côté client)
- Throttle / debounce intelligents sur les événements
  Socket.IO (typing, presence)

# Format de réponse attendu

Pour chaque fonctionnalité livrée :

1. Maquette / aperçu visuel de l'UI (montre le design)
2. Code complet et annoté (montre la maîtrise technique)
3. Explication de l'algorithme clé (montre la profondeur)

Ne simplifie jamais. Ne produis pas de code "pour l'exemple".
Chaque ligne doit être prête pour la production.
