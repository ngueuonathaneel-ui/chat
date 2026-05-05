/**
 * NextAuth Configuration - Shared
 *
 * Exporte authOptions pour être utilisé dans :
 * - Route API (/api/auth/[...nextauth])
 * - Server Components (getServerSession)
 */

import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import jwt from "jsonwebtoken";
// @ts-expect-error - speakeasy n'a pas de types
import speakeasy from "speakeasy";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/redis";

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        totpCode: { label: "2FA Code", type: "text", optional: true },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user) {
          return null;
        }

        const validPassword = await compare(
          credentials.password,
          user.password,
        );
        if (!validPassword) {
          return null;
        }

        // 2FA verification if enabled
        if (user.twoFactorEnabled) {
          if (!credentials.totpCode) {
            throw new Error("2FA_REQUIRED");
          }

          const verified = speakeasy.totp.verify({
            secret: user.twoFactorSecret!,
            encoding: "base32",
            token: credentials.totpCode,
            window: 1,
          });

          if (!verified) {
            throw new Error("INVALID_2FA");
          }
        }

        // Sign a JWT for Socket.IO authentication.
        // - sub = user id (matches NextAuth standard claim)
        // - jti = unique session id stored in Redis (allows server-side invalidation)
        const jwtSecret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET;
        if (!jwtSecret) throw new Error("JWT_SECRET not configured");
        const jti = `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
        const accessToken = jwt.sign(
          {
            sub: user.id,
            email: user.email,
            name: user.username,
            jti,
          },
          jwtSecret,
          { expiresIn: "24h" },
        );
        await createSession(user.id, accessToken);

        return {
          id: user.id,
          email: user.email,
          name: user.username,
          image: user.avatarUrl,
          accessToken,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt" as const,
    maxAge: 24 * 60 * 60, // 24 hours
  },
  jwt: {
    maxAge: 24 * 60 * 60,
  },
  callbacks: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async jwt({ token, user }: any) {
      if (user) {
        token.sub = user.id;
        token.email = user.email;
        token.name = user.name;
        token.picture = user.image;
        token.accessToken = user.accessToken;
      }
      return token;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async session({ session, token }: any) {
      if (token) {
        session.user.id = token.sub;
        session.user.email = token.email;
        session.user.name = token.name;
        session.user.image = token.picture;
        session.accessToken = token.accessToken;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
};

// Handler pour la route API
const handler = NextAuth(authOptions);
export { handler };
