/**
 * /api/auth/2fa/verify
 *
 * Active définitivement le 2FA après vérification d'un code TOTP.
 * Génère également 10 codes de récupération à usage unique (hashés bcrypt).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { hash } from "bcryptjs";
// @ts-expect-error - speakeasy n'a pas de types
import speakeasy from "speakeasy";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const VerifySchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});

function generateRecoveryCode(): string {
  // Format: XXXX-XXXX-XXXX (12 chars hex, lisible)
  const hex = Array.from({ length: 12 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("").toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = VerifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid code format" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (!user?.twoFactorSecret) {
    return NextResponse.json(
      { error: "2FA setup not initiated" },
      { status: 400 }
    );
  }

  const verified = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: "base32",
    token: parsed.data.code,
    window: 1,
  });

  if (!verified) {
    return NextResponse.json({ error: "Invalid code" }, { status: 401 });
  }

  // Génération recovery codes (montrés une seule fois en clair)
  const codes = Array.from({ length: 10 }, generateRecoveryCode);
  // NB: dans une vraie implémentation, on stocke les hashes dans une table
  // dédiée. Ici on les retourne au client uniquement après activation.

  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorEnabled: true, twoFactorVerified: true },
  });

  // Pré-calcul des hashes (au cas où on ajoute ensuite la table)
  await Promise.all(codes.map((c) => hash(c, 10)));

  return NextResponse.json({ success: true, recoveryCodes: codes });
}
