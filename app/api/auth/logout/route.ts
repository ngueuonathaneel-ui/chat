/**
 * /api/auth/logout
 *
 * Invalide la session Redis associée au JWT courant.
 * NextAuth gère la suppression du cookie via `signOut()` côté client ;
 * cette route s'occupe seulement de l'invalidation server-side.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { invalidateSession, invalidateAllUserSessions } from "@/lib/redis";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const url = new URL(req.url);
  const all = url.searchParams.get("all") === "true";

  if (all) {
    await invalidateAllUserSessions(userId);
  } else if (session.accessToken) {
    await invalidateSession(userId, session.accessToken);
  }

  return NextResponse.json({ success: true });
}
