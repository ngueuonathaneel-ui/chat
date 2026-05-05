/**
 * Module de chiffrement End-to-End
 *
 * Algorithme: X25519 + XSalsa20-Poly1305 (crypto_box_easy libsodium)
 *
 * Théorie:
 * - Curve25519: y² = x³ + 486662x² + x sur F(2^255 - 19)
 * - Clé partagée = [a]B = [b]A = [ab]G (Diffie-Hellman)
 * - Sécurité: ECDLP ~ 2^125 opérations (infaisable)
 */

import sodium from "libsodium-wrappers";

let sodiumReady = false;

async function ensureSodium(): Promise<void> {
  if (!sodiumReady) {
    await sodium.ready;
    sodiumReady = true;
  }
}

export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface EncryptedPayload {
  cipher: string; // base64
  nonce: string; // base64
}

/**
 * Génère une paire de clés Curve25519
 * Complexité: O(1) - génération aléatoire
 */
export async function generateKeyPair(): Promise<KeyPair> {
  await ensureSodium();
  return sodium.crypto_box_keypair();
}

/**
 * Importe une clé publique depuis base64
 */
export async function importPublicKey(base64Key: string): Promise<Uint8Array> {
  await ensureSodium();
  return sodium.from_base64(base64Key);
}

/**
 * Exporte une clé publique vers base64
 */
export async function exportPublicKey(key: Uint8Array): Promise<string> {
  await ensureSodium();
  return sodium.to_base64(key);
}

/**
 * Chiffre un message avec crypto_box_easy
 *
 * Format sortie: Poly1305_tag(16 bytes) + ciphertext
 *
 * @param message - Message en clair
 * @param theirPublicKey - Clé publique du destinataire
 * @param myPrivateKey - Ma clé privée
 */
export async function encryptMessage(
  message: string,
  theirPublicKey: Uint8Array,
  myPrivateKey: Uint8Array,
): Promise<EncryptedPayload> {
  await ensureSodium();

  const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
  const messageBytes = sodium.from_string(message);

  const cipher = sodium.crypto_box_easy(
    messageBytes,
    nonce,
    theirPublicKey,
    myPrivateKey,
  );

  return {
    cipher: sodium.to_base64(cipher),
    nonce: sodium.to_base64(nonce),
  };
}

/**
 * Déchiffre un message
 *
 * @throws Error si le MAC est invalide (message corrompu)
 */
export async function decryptMessage(
  cipherBase64: string,
  nonceBase64: string,
  theirPublicKey: Uint8Array,
  myPrivateKey: Uint8Array,
): Promise<string> {
  await ensureSodium();

  const cipher = sodium.from_base64(cipherBase64);
  const nonce = sodium.from_base64(nonceBase64);

  const plain = sodium.crypto_box_open_easy(
    cipher,
    nonce,
    theirPublicKey,
    myPrivateKey,
  );

  return sodium.to_string(plain);
}

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
 */
export async function computeDedupHash(
  cipher: string,
  senderId: string,
  timestamp: Date,
): Promise<string> {
  await ensureSodium();
  const timeBucket = Math.floor(timestamp.getTime() / 30000);
  const preimage = `${cipher}:${senderId}:${timeBucket}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hash = (sodium as any).crypto_generichash(
    32,
    sodium.from_string(preimage),
  );
  return sodium.to_base64(hash);
}
