/**
 * Next.js Proxy (ex-Middleware en Next 16) - Protection des routes et auth
 *
 * Architecture:
 * - Routes publiques: /login, /register, /api/auth/*
 * - Routes protégées: toutes les autres
 * - Redirection automatique vers /login si non authentifié
 * - Redirection vers /conversations si déjà authentifié sur les pages auth
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const PUBLIC_ROUTES = [
  "/login",
  "/register",
  "/forgot-password",
  "/api/auth",
  "/_next",
  "/static",
  "/favicon.ico",
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Socket.IO transport — laisser passer (le serveur Socket.IO gère l'auth)
  if (pathname.startsWith("/api/socket")) {
    return NextResponse.next();
  }

  const isPublic = PUBLIC_ROUTES.some(
    (r) =>
      pathname === r || pathname.startsWith(r + "/") || pathname.startsWith(r),
  );
  if (isPublic) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    // API → 401 JSON, pas de redirection
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public).*)"],
};
