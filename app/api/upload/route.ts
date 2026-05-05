/**
 * /api/upload
 *
 * Upload multipart/form-data — un seul fichier par requête.
 * Champs attendus : `file` (File), `conversationId` (UUID).
 *
 * Réponse 201 : { id, url, originalName, mimeType, size }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { persistUploadedFile, MAX_FILE_SIZE } from "@/lib/uploads";
import { checkRateLimit } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // Rate limit : 10 uploads / minute
  const rl = await checkRateLimit(userId, "upload", 60_000, 10);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: "Rate limited",
        retryAfter: Math.ceil((rl.resetTime - Date.now()) / 1000),
      },
      { status: 429 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid multipart data" },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  const conversationId = formData.get("conversationId");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (typeof conversationId !== "string") {
    return NextResponse.json(
      { error: "Missing conversationId" },
      { status: 400 }
    );
  }

  // Vérifier appartenance à la conversation
  const member = await prisma.conversationMember.findFirst({
    where: { conversationId, userId },
  });
  if (!member) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await persistUploadedFile(file, userId);
    return NextResponse.json(
      {
        id: result.id,
        url: result.url,
        originalName: result.originalName,
        mimeType: result.mimeType,
        size: result.size,
      },
      { status: 201 }
    );
  } catch (err) {
    const code = (err as Error).message;
    if (code === "PAYLOAD_TOO_LARGE") {
      return NextResponse.json(
        { error: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024} MB` },
        { status: 413 }
      );
    }
    if (code === "UNSUPPORTED_TYPE" || code === "MAGIC_NUMBER_MISMATCH") {
      return NextResponse.json(
        { error: "Unsupported file type" },
        { status: 415 }
      );
    }
    if (code === "EMPTY_FILE") {
      return NextResponse.json({ error: "Empty file" }, { status: 400 });
    }
    console.error("[upload] error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
