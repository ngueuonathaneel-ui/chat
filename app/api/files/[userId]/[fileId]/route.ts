/**
 * /api/files/[userId]/[fileId]
 *
 * Téléchargement authentifié — l'utilisateur doit partager au moins une
 * conversation avec le propriétaire du fichier (ownerId == userId param).
 * Empêche les énumérations d'UUID par des tiers.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { stat, readFile } from "node:fs/promises";
import path from "node:path";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const SAFE_ID = /^[a-zA-Z0-9._-]+$/;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string; fileId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = session.user.id;
  const { userId: ownerId, fileId } = await params;

  // Path traversal hard guard
  if (!SAFE_ID.test(fileId) || !SAFE_ID.test(ownerId)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  // Authorisation : self ou conversation partagée
  if (ownerId !== me) {
    const sharedConv = await prisma.conversationMember.findFirst({
      where: {
        userId: me,
        conversation: {
          members: { some: { userId: ownerId } },
        },
      },
    });
    if (!sharedConv) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const baseDir = path.resolve(process.env.UPLOAD_DIR || "./uploads");
  const filePath = path.resolve(path.join(baseDir, ownerId, fileId));

  // Sanity : le path résolu doit rester sous baseDir
  if (!filePath.startsWith(baseDir + path.sep) && filePath !== baseDir) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let st;
  try {
    st = await stat(filePath);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!st.isFile()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data = await readFile(filePath);
  // Buffer → ArrayBuffer pour Response.body
  const ab = data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength
  ) as ArrayBuffer;

  // Inférence MIME basique via extension
  const ext = path.extname(filePath).toLowerCase();
  const mime: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".webm": "video/webm",
    ".mp4": "video/mp4",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".txt": "text/plain",
  };
  const contentType = mime[ext] ?? "application/octet-stream";

  return new NextResponse(ab, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(st.size),
      "Cache-Control": "private, max-age=86400",
    },
  });
}
