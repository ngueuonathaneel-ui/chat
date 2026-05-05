# Algorithmes & Mathématiques

> Spécification mathématique et algorithmique des traitements critiques. Complexités, preuves d'invariants, et implémentations de référence. Ce document est la source de vérité pour la logique métier avancée.

---

## Table des matières

1. [Chiffrement E2E — Diffie-Hellman X25519](#1-chiffrement-e2e--diffie-hellman-x25519)
2. [Full-Text Search — TF-IDF & Ranking](#2-full-text-search--tf-idf--ranking)
3. [Déduplication de messages](#3-déduplication-de-messages)
4. [Détection de spam — fastText](#4-détection-de-spam--fasttext)
5. [Compression audio client-side](#5-compression-audio-client-side)
6. [Throttle / Debounce optimal](#6-throttle--debounce-optimal)

---

## 1. Chiffrement E2E — Diffie-Hellman X25519

### 1.1 Théorie mathématique

Le protocole **X25519** (Curve25519) est une variante optimisée de Diffie-Hellman sur les courbes elliptiques.

**Courbe :** $y^2 = x^3 + 486662x^2 + x$ sur $\mathbb{F}_{2^{255}-19}$

**Propriétés :**
- Ordre du sous-groupe : $q = 2^{252} + 27742317777372353535851937790883648493$
- Cofacteur : $h = 8$
- Clé publique : point $P = [s]G$ où $s$ est la clé privée, $G$ le générateur.

### 1.2 Échange de clés

```
Alice                           Bob
  │                               │
  │  Génère a ∈ [1, q-1]         │
  │  A = [a]G                    │
  │─────────────────────────────►│
  │              A (clé publique)│
  │                               │
  │                               │  Génère b ∈ [1, q-1]
  │                               │  B = [b]G
  │◄─────────────────────────────│
  │  B (clé publique)           │
  │                               │
  │  Secret = X25519(a, B)      │  Secret = X25519(b, A)
  │         = [a]B               │         = [b]A
  │         = [ab]G              │         = [ab]G
```

**Preuve d'égalité :**
$$[a]B = [a]([b]G) = [ab]G = [b]([a]G) = [b]A$$

**Sécurité :** résoudre $a$ à partir de $A$ et $G$ est le problème du logarithme discret (ECDLP), conjecturé en $O(\sqrt{q})$ ≈ $2^{125}$ opérations (infaisable).

### 1.3 Construction `crypto_box_easy`

libsodium combine :
1. **X25519** : dérivation de secret partagé.
2. **XSalsa20** : chiffrement stream (20 rounds).
3. **Poly1305** : MAC authentifié.

```typescript
// @/lib/crypto.ts — implémentation conceptuelle
async function cryptoBoxEasy(
  message: Uint8Array,
  nonce: Uint8Array,
  theirPublicKey: Uint8Array,
  myPrivateKey: Uint8Array,
): Promise<Uint8Array> {
  // 1. Clé partagée via X25519
  const sharedSecret = await deriveSharedSecret(myPrivateKey, theirPublicKey);
  
  // 2. Dérivation de clé via HSalsa20 (hash de la clé partagée)
  const key = hsalsa20(sharedSecret, nonce.slice(0, 16));
  
  // 3. Chiffrement XSalsa20 avec nonce complet
  const ciphertext = xsalsa20(message, key, nonce);
  
  // 4. MAC Poly1305 sur le ciphertext
  const mac = poly1305(ciphertext, derivePoly1305Key(key));
  
  // Format : mac (16 bytes) + ciphertext
  return concatenate(mac, ciphertext);
}
```

**Taille d'expansion :** 16 bytes (Poly1305 tag) + len(message).

---

## 2. Full-Text Search — TF-IDF & Ranking

### 2.1 Modèle mathématique

Pour un document $d$ et une requête $q$ :

$$\text{score}(d, q) = \sum_{t \in q} \text{tf}(t, d) \times \text{idf}(t)$$

Où :
- $\text{tf}(t, d) = \log(1 + f_{t,d})$ — fréquence du terme dans le document (logarithmique).
- $\text{idf}(t) = \log\left(\frac{N - n_t + 0.5}{n_t + 0.5}\right)$ — inverse document frequency.

Avec :
- $N$ = nombre total de documents.
- $n_t$ = nombre de documents contenant le terme $t$.
- $f_{t,d}$ = nombre d'occurrences de $t$ dans $d$.

### 2.2 Normalisation

PostgreSQL normalise par la longueur du document :

$$\text{rank} = \frac{\text{score}(d, q)}{1 + \text{length}(d)}$$

Cela évite que les documents longs ne soient systématiquement privilégiés.

### 2.3 Fonction de ranking PostgreSQL

```sql
-- ts_rank retourne un float entre 0 et 1
SELECT ts_rank(
  to_tsvector('french', 'Le projet urgent est en cours de développement'),
  plainto_tsquery('french', 'projet urgent')
);
-- Résultat : ~0.121 (dépend de la config)
```

### 2.4 Highlighting avec `ts_headline`

```sql
SELECT ts_headline(
  'french',
  'Le projet urgent est en cours. Ce projet est critique.',
  plainto_tsquery('french', 'projet urgent'),
  'MaxWords=15, MinWords=5, MaxFragments=2, StartSel=<mark>, StopSel=</mark>'
);
-- Résultat : "Le <mark>projet</mark> <mark>urgent</mark> est en cours. Ce <mark>projet</mark> est critique."
```

---

## 3. Déduplication de messages

### 3.1 Problème

Dans un système temps réel, un message peut être envoyé plusieurs fois à cause de :
- Retransmission TCP.
- Reconnexion Socket.IO.
- Double-click sur le bouton d'envoi.

### 3.2 Algorithme — Hash + Fenêtre temporelle

```typescript
// @/lib/dedup.ts
import { createHash } from 'crypto';

interface DedupEntry {
  hash: string;
  timestamp: number;
}

class MessageDeduplicator {
  private entries: Map<string, number> = new Map(); // hash -> timestamp
  private readonly windowMs: number;
  private readonly maxSize: number;

  constructor(windowMs: number = 30000, maxSize: number = 10000) {
    this.windowMs = windowMs;
    this.maxSize = maxSize;
  }

  /**
   * Calcule le hash déterministe d'un message.
   * Inclut le contenu chiffré, l'expéditeur et un arrondi temporel.
   */
  computeHash(cipher: string, senderId: string, createdAt: Date): string {
    const timeBucket = Math.floor(createdAt.getTime() / this.windowMs);
    const preimage = `${cipher}:${senderId}:${timeBucket}`;
    return createHash('sha256').update(preimage).digest('hex');
  }

  /**
   * Vérifie si le message est un doublon.
   * Retourne `true` si c'est un doublon, `false` sinon.
   * Complexité : O(1) amorti.
   */
  isDuplicate(hash: string): boolean {
    const now = Date.now();
    
    // Nettoyage des entrées expirées (lazy eviction)
    if (this.entries.size >= this.maxSize) {
      this.evictExpired(now);
    }
    
    if (this.entries.has(hash)) {
      return true;
    }
    
    this.entries.set(hash, now);
    return false;
  }

  private evictExpired(now: number): void {
    const cutoff = now - this.windowMs;
    for (const [hash, timestamp] of this.entries) {
      if (timestamp < cutoff) {
        this.entries.delete(hash);
      }
    }
  }
}
```

### 3.3 Preuve d'invariant

**Invariant :** `∀ e ∈ entries, e.timestamp ≥ now - windowMs`

**Preuve par induction :**
- **Initialisation :** `entries` est vide, invariant vérifié.
- **Conservation :** `isDuplicate` appelle `evictExpired` avant insertion. Toute entrée avec `timestamp < cutoff` est supprimée.
- **Terminaison :** pas de boucle infinie car `evictExpired` itère sur un ensemble fini.

### 3.4 Fenêtre temporelle

Le timestamp est arrondi à la fenêtre de 30 secondes. Cela signifie que deux messages identiques envoyés dans la même fenêtre de 30s auront le même hash. Si un utilisateur envoie volontairement le même message 3 minutes plus tard, il n'est PAS considéré comme doublon (comportement souhaité).

---

## 4. Détection de spam — fastText

### 4.1 Pipeline de prétraitement

```typescript
// @/domain/services/SpamDetectionService.ts
import { createFastTextModel } from 'fasttext.js';

class SpamDetectionService {
  private model: ReturnType<typeof createFastTextModel>;

  constructor(modelPath: string) {
    this.model = createFastTextModel(modelPath); // Modèle .bin pré-entraîné
  }

  /**
   * Pipeline complet : prétraitement + prédiction.
   */
  async detectSpam(text: string): Promise<{ isSpam: boolean; confidence: number }> {
    // 1. Normalisation
    const normalized = this.preprocess(text);
    
    // 2. Prédiction
    const prediction = await this.model.predict(normalized, 1);
    const label = prediction[0]?.label ?? '__unknown__';
    const confidence = prediction[0]?.probability ?? 0;
    
    return {
      isSpam: label === '__label__spam' && confidence > 0.85,
      confidence,
    };
  }

  /**
   * Prétraitement : minuscules, tokenisation, stemming, stopwords.
   */
  private preprocess(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Supprime les accents
      .replace(/[^\w\s]/g, ' ') // Supprime la ponctuation
      .split(/\s+/)
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
      .map((word) => this.stem(word))
      .join(' ');
  }

  /**
   * Stemming naïf français (suffix stripping).
   * En production : utiliser le stemmer Porter ou Snowball.
   */
  private stem(word: string): string {
    const suffixes = ['ement', 'ement', 'ation', 'ions', 'ez', 'er', 'é', 'ée'];
    for (const suffix of suffixes) {
      if (word.endsWith(suffix) && word.length - suffix.length >= 3) {
        return word.slice(0, -suffix.length);
      }
    }
    return word;
  }
}

const STOP_WORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'et', 'ou', 'mais', 'donc',
  'car', 'ni', 'que', 'qui', 'quoi', 'dont', 'ou', 'a', 'de', 'du',
  'en', 'par', 'pour', 'sur', 'avec', 'sans', 'sous',
]);
```

### 4.2 Entraînement du modèle fastText

```bash
# Préparation des données (format fastText : __label__<class> <text>)
# data/spam.train.txt
__label__spam GAGNEZ 10000€ MAINTENANT cliquez ici!!!
__label__ham Salut, tu viens ce soir ?
__label__spam Offre limitée viagra cialis pas cher
__label__ham Le projet est en cours de développement

# Entraînement supervisé
fasttext supervised -input data/spam.train.txt -output models/spam -dim 100 -epoch 50 -wordNgrams 2
```

**Hyperparamètres :**
- `dim=100` : vecteurs de 100 dimensions (compromis qualité/vitesse).
- `epoch=50` : 50 passes sur les données.
- `wordNgrams=2` : capture les bigrammes ("pas cher", "cliquez ici").

### 4.3 Intégration en temps réel

```typescript
// Dans le handler Socket.IO
socket.on('message:send', async (payload, ack) => {
  const spamResult = await spamService.detectSpam(payload.cipher);
  
  if (spamResult.isSpam && spamResult.confidence > 0.95) {
    // Bloque silencieusement (pas de feedback à l'attaquant)
    socket.emit('error', { code: 'MESSAGE_REJECTED' });
    return;
  }
  
  if (spamResult.isSpam) {
    // Marque comme suspect mais laisse passer
    payload.metadata = { ...payload.metadata, spamScore: spamResult.confidence };
  }
  
  // ... suite du traitement
});
```

---

## 5. Compression audio client-side

### 5.1 Théorie — Réduction de bitrate

Un signal audio numérique est échantillonné à une fréquence $f_s$ avec une résolution de $b$ bits.

**Débit brut :**
$$R = f_s \times b \times n_{channels}$$

Pour un signal vocal :
- CD quality : $44100 \times 16 \times 2 = 1411$ kbps
- Cible messagerie : $22050 \times 16 \times 1 = 352$ kbps → compressé Vorbis @ 64 kbps

**Taux de compression :**
$$\text{Taux} = \frac{R_{brut}}{R_{compressé}} = \frac{352}{64} \approx 5.5\times$$

### 5.2 Algorithme de resampling

```typescript
// @/lib/audio/resample.ts

/**
 * Resampling par interpolation linéaire.
 * Upsampling ou downsampling d'un signal discret.
 * 
 * Complexité : O(n) où n = nombre d'échantillons de sortie.
 */
function resampleLinear(
  input: Float32Array,
  inputRate: number,
  outputRate: number,
): Float32Array {
  const ratio = inputRate / outputRate;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outputLength);
  
  for (let i = 0; i < outputLength; i++) {
    const inputIndex = i * ratio;
    const indexFloor = Math.floor(inputIndex);
    const indexCeil = Math.min(indexFloor + 1, input.length - 1);
    const fraction = inputIndex - indexFloor;
    
    // Interpolation linéaire
    output[i] = input[indexFloor] * (1 - fraction) + input[indexCeil] * fraction;
  }
  
  return output;
}
```

### 5.3 Convertisseur mono

```typescript
function mixToMono(stereo: Float32Array): Float32Array {
  const mono = new Float32Array(stereo.length / 2);
  for (let i = 0; i < mono.length; i++) {
    mono[i] = (stereo[i * 2] + stereo[i * 2 + 1]) / 2;
  }
  return mono;
}
```

---

## 6. Throttle / Debounce optimal

### 6.1 Définitions formelles

**Debounce :** garantit qu'une fonction $f$ n'est exécutée qu'après un silence de $\Delta t$ millisecondes.

$$f_{debounced}(t) = f(t) \quad \text{ssi} \quad \forall t' \in [t-\Delta t, t), \neg trigger(t')$$

**Throttle :** garantit qu'au plus une exécution de $f$ a lieu par fenêtre de $\Delta t$.

$$\text{count}(f_{throttled}, [t_0, t_0+\Delta t)) \leq 1$$

### 6.2 Implémentation hybride (typing indicator)

```typescript
// @/lib/throttle.ts

interface HybridThrottleOptions {
  debounceMs: number;
  throttleMs: number;
}

/**
 * Throttle hybride : debounce local + throttle global.
 * 
 * - Debounce : attend `debounceMs` d'inactivité avant d'exécuter.
 * - Throttle : pas plus d'une exécution toutes les `throttleMs`.
 * 
 * Complexité : O(1) par appel.
 */
export function createHybridThrottle<T extends (...args: unknown[]) => void>(
  fn: T,
  options: HybridThrottleOptions,
): T {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastExecution = 0;
  
  return ((...args: unknown[]) => {
    const now = Date.now();
    
    // Annuler le debounce précédent
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    
    // Vérifier le throttle global
    if (now - lastExecution < options.throttleMs) {
      // On debounce à la fin de la fenêtre throttle
      const remaining = options.throttleMs - (now - lastExecution);
      debounceTimer = setTimeout(() => {
        lastExecution = Date.now();
        fn(...args);
      }, remaining + options.debounceMs);
      return;
    }
    
    // Debounce normal
    debounceTimer = setTimeout(() => {
      lastExecution = Date.now();
      fn(...args);
    }, options.debounceMs);
  }) as T;
}

// Usage pour le typing indicator
const sendTypingEvent = createHybridThrottle(
  () => socket.emit('typing', { conversationId }),
  { debounceMs: 300, throttleMs: 3000 },
);
```

### 6.3 Analyse de performance

| Scénario | Pure Debounce | Pure Throttle | Hybrid |
|----------|--------------|---------------|--------|
| Tape rapidement (100ms/keystroke) | 0 event (tant que ça tape) | 1 event / 3s | 1 event / 3s + 1 final après 300ms de silence |
| Tape lentement (1s/keystroke) | 1 event / keystroke + 300ms | 1 event / 3s | 1 event / keystroke |
| Arrêt brutal | 1 event après 300ms | peut être manqué | 1 event après 300ms |

**Conclusion :** le hybride combine les avantages des deux sans leurs inconvénients.
