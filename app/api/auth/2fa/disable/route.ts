/**
 * /api/auth/2fa/disable
 *
 * Désactive le 2FA après vérification d'un code TOTP valide
 * (empêche un attaquant ayant le cookie de désactiver le 2FA sans le device).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
// @ts-expect-error - speakeasy n'a pas de types
import speakeasy from "speakeasy";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const DisableSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const parsed = DisableSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
    return NextResponse.json({ error: "2FA not enabled" }, { status: 400 });
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
  await prisma.user.update({
    where: { id: user.id },
    data: {
      twoFactorEnabled: false,
      twoFactorVerified: false,
      twoFactorSecret: null,
    },
  });
  return NextResponse.json({ success: true });
}
