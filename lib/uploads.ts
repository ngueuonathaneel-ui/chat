/**
 * lib/uploads — Validation MIME stricte + persistance disque
 *
 * Pourquoi pas Multer dans App Router ?
 *   Multer attend un IncomingMessage Node, alors que Next 16 utilise
 *   `Request` Web standard. Le middleware Multer reste utile dans un
 *   serveur Express dédié, mais pour l'API Next on traite le multipart
 *   via `request.formData()` (Web standard), avec validation équivalente.
 *
 * Sécurité :
 *   - Liste blanche MIME (pas de blacklist : trop facile à contourner).
 *   - Vérification du magic number en plus du MIME annoncé (defense-in-depth).
 *   - Renommage UUID — l'ancien nom n'est jamais persisté sur le FS.
 *   - Taille max 25 MB (RFC 7578 hard cap côté Next via runtime).
 */

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "video/webm",
  "video/mp4",
  "application/pdf",
  "text/plain",
]);

// Magic numbers pour vérification (signature des premiers bytes)
const MAGIC_NUMBERS: Array<{ mime: string; magic: number[] }> = [
  { mime: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
  { mime: "image/png", magic: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/gif", magic: [0x47, 0x49, 0x46, 0x38] },
  { mime: "image/webp", magic: [0x52, 0x49, 0x46, 0x46] }, // RIFF (also wav)
  { mime: "application/pdf", magic: [0x25, 0x50, 0x44, 0x46] },
];

function checkMagicNumber(buffer: Buffer, mime: string): boolean {
  const entry = MAGIC_NUMBERS.find((e) => e.mime === mime);
  if (!entry) return true; // Pas de signature connue → on fait confiance au MIME
  if (buffer.length < entry.magic.length) return false;
  return entry.magic.every((b, i) => buffer[i] === b);
}

export interface UploadResult {
  id: string;
  url: string;
  originalName: string;
  mimeType: string;
  size: number;
  diskPath: string;
}

export async function persistUploadedFile(
  file: File,
  userId: string
): Promise<UploadResult> {
  if (file.size === 0) {
    throw new Error("EMPTY_FILE");
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("PAYLOAD_TOO_LARGE");
  }
  if (!ALLOWED_MIME.has(file.type)) {
    throw new Error("UNSUPPORTED_TYPE");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!checkMagicNumber(buffer, file.type)) {
    throw new Error("MAGIC_NUMBER_MISMATCH");
  }

  const ext = path.extname(file.name).slice(0, 10).toLowerCase() || "";
  const id = `${randomUUID()}${ext}`;

  const baseDir = process.env.UPLOAD_DIR || "./uploads";
  const userDir = path.join(baseDir, userId);
  await mkdir(userDir, { recursive: true });
  const diskPath = path.join(userDir, id);
  await writeFile(diskPath, buffer);

  const cdn = process.env.CDN_BASE_URL || "/api/files";
  const url = `${cdn}/${userId}/${id}`;

  return {
    id,
    url,
    originalName: file.name,
    mimeType: file.type,
    size: file.size,
    diskPath,
  };
}
