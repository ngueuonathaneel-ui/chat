/**
 * /api/auth/2fa/setup
 *
 * Génère un secret TOTP (RFC 6238) et un QR code à scanner.
 * Le secret n'est PAS encore activé — il faut un POST sur /api/auth/2fa/verify
 * pour confirmer que l'utilisateur a bien enregistré son authenticator.
 *
 * Sécurité :
 *   - Le secret est stocké chiffré at-rest dans la base
 *     (déjà géré ailleurs si MASTER_ENCRYPTION_KEY est configurée).
 *   - twoFactorEnabled reste false jusqu'à vérification.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
// @ts-expect-error - speakeasy n'a pas de types
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (user.twoFactorEnabled) {
    return NextResponse.json(
      { error: "2FA already enabled" },
      { status: 409 }
    );
  }

  const secret = speakeasy.generateSecret({
    name: `Cipher (${user.email})`,
    issuer: "Cipher",
    length: 32,
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorSecret: secret.base32, twoFactorVerified: false },
  });

  const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!, {
    margin: 1,
    width: 240,
  });

  return NextResponse.json({
    secret: secret.base32,
    otpauth: secret.otpauth_url,
    qrCode: qrCodeUrl,
  });
}
