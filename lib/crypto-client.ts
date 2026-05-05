/**
 * Client-side Crypto Utilities
 *
 * Utilise Web Crypto API (disponible dans tous les navigateurs)
 * Compatible avec les composants React Client
 */

/**
 * Protection contre replay attacks
 * Stocke les nonces récents pour détection de duplication
 */
class ReplayProtection {
  private nonces = new Set<string>();
  private timestamps = new Map<string, number>();
  private readonly windowMs: number;

  constructor(windowMs: number = 5 * 60 * 1000) {
    this.windowMs = windowMs;
  }

  /**
   * Vérifie si un nonce a déjà été utilisé
   * @returns true si c'est un replay
   */
  isReplay(nonce: string, timestamp: number): boolean {
    const now = Date.now();

    // Message trop vieux
    if (now - timestamp > this.windowMs) {
      throw new Error("MESSAGE_TOO_OLD");
    }

    // Nettoyage des anciens nonces (lazy eviction)
    if (this.nonces.size > 10000) {
      this.evictOldNonces(now);
    }

    if (this.nonces.has(nonce)) {
      return true;
    }

    this.nonces.add(nonce);
    this.timestamps.set(nonce, timestamp);
    return false;
  }

  private evictOldNonces(now: number): void {
    const cutoff = now - this.windowMs;
    for (const [nonce, ts] of this.timestamps) {
      if (ts < cutoff) {
        this.nonces.delete(nonce);
        this.timestamps.delete(nonce);
      }
    }
  }
}

export const replayProtection = new ReplayProtection();

/**
 * Hash pour déduplication de messages
 * Algorithme: SHA-256(cipher + senderId + timeBucket)
 * timeBucket = floor(timestamp / 30000ms) - fenêtre de 30s
 *
 * Utilise Web Crypto API (SubtleCrypto)
 */
export async function computeDedupHash(
  cipher: string,
  senderId: string,
  timestamp: Date,
): Promise<string> {
  const timeBucket = Math.floor(timestamp.getTime() / 30000);
  const preimage = `${cipher}:${senderId}:${timeBucket}`;

  // Utilise Web Crypto API au lieu de libsodium
  const encoder = new TextEncoder();
  const data = encoder.encode(preimage);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);

  // Convert to base64
  const binary = String.fromCharCode(...hashArray);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// ============================================================================
// STUBS E2E - Implémentation complète avec libsodium-wrappers-sumo à venir
// Ces fonctions sont des placeholders pour permettre le build
// ============================================================================

export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface EncryptedPayload {
  cipher: string;
  nonce: string;
}

/** Stub - Génère une paire de clés X25519 */
export async function generateKeyPair(): Promise<KeyPair> {
  // TODO: Implémenter avec libsodium-wrappers-sumo
  // Pour l'instant, génère des clés aléatoires pour le build
  return {
    publicKey: crypto.getRandomValues(new Uint8Array(32)),
    privateKey: crypto.getRandomValues(new Uint8Array(32)),
  };
}

/** Stub - Exporte une clé publique en base64 */
export async function exportPublicKey(publicKey: Uint8Array): Promise<string> {
  const binary = String.fromCharCode(...publicKey);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/** Stub - Chiffre un message avec X25519+XSalsa20-Poly1305 */
export async function encryptMessage(
  plaintext: string,
  _theirPublicKey: Uint8Array,
  _myPrivateKey: Uint8Array,
): Promise<EncryptedPayload> {
  // TODO: Implémenter avec libsodium-wrappers-sumo
  // Pour l'instant, retourne un placeholder
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  const nonce = crypto.getRandomValues(new Uint8Array(24));

  // Mock encryption - just base64 encode
  const binary = String.fromCharCode(...new Uint8Array(data));
  return {
    cipher: btoa(binary),
    nonce: btoa(String.fromCharCode(...nonce))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, ""),
  };
}

/** Stub - Déchiffre un message */
export async function decryptMessage(
  cipherBase64: string,
  _nonceBase64: string,
  _theirPublicKey: Uint8Array,
  _myPrivateKey: Uint8Array,
): Promise<string> {
  // TODO: Implémenter avec libsodium-wrappers-sumo
  // Pour l'instant, décode le base64 (inverse du stub encryptMessage)
  try {
    const binary = atob(cipherBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const decoder = new TextDecoder();
    return decoder.decode(bytes);
  } catch {
    return "[Message chiffré - déchiffrement à implémenter]";
  }
}
