/**
 * API Route: POST /api/auth/register
 *
 * Features:
 * - Input validation (Zod)
 * - Password hashing (bcrypt)
 * - E2E key generation
 * - Duplicate check
 */

import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generateKeyPair, exportPublicKey } from "@/lib/crypto";

const registerSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be at most 20 characters")
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "Username can only contain letters, numbers, and underscores",
    ),
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(
      /[^A-Za-z0-9]/,
      "Password must contain at least one special character",
    ),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const result = registerSchema.safeParse(body);
    if (!result.success) {
      const firstError = result.error.issues[0]?.message || "Validation failed";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const { username, email, password } = result.data;

    // Check for existing user
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Email or username already exists" },
        { status: 409 },
      );
    }

    // Hash password
    const hashedPassword = await hash(password, 12);

    // Generate E2E keypair
    const keyPair = await generateKeyPair();
    const publicKeyBase64 = await exportPublicKey(keyPair.publicKey);

    // Store private key securely (in production, encrypt with user's password)
    // For now, we only store the public key on server
    // Private key should be stored client-side or encrypted

    // Create user
    const user = await prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        publicKey: publicKeyBase64,
      },
      select: {
        id: true,
        username: true,
        email: true,
        publicKey: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
