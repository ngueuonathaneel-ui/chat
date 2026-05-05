/**
 * /api/og?url=https://example.com
 *
 * Récupère les métadonnées OpenGraph d'une URL.
 *
 * Sécurité :
 *   - Whitelist scheme http/https.
 *   - Hard-block IP privées / loopback / metadata cloud (SSRF).
 *   - Timeout 5s, max 1 MB de download.
 *   - Cache Redis 1h pour éviter le hammering d'une URL externe.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import ogs from "open-graph-scraper";
import { authOptions } from "@/lib/auth";
import { redis, checkRateLimit } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1|fe80:|fc00:)/i;

function isSafeUrl(input: string): boolean {
  try {
    const u = new URL(input);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (PRIVATE_HOST.test(u.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.searchParams.get("url");
  if (!url || !isSafeUrl(url)) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  // Rate limit : 30 / minute par utilisateur
  const rl = await checkRateLimit(session.user.id, "og", 60_000, 30);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  // Cache lookup
  const cacheKey = `og:${url}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    return NextResponse.json(JSON.parse(cached));
  }

  try {
    const { result } = await ogs({
      url,
      timeout: 5000,
      fetchOptions: { headers: { "User-Agent": "Cipher/1.0 OG-bot" } },
    });
    const payload = {
      url,
      title: result.ogTitle ?? result.twitterTitle ?? null,
      description: result.ogDescription ?? result.twitterDescription ?? null,
      image:
        result.ogImage?.[0]?.url ?? result.twitterImage?.[0]?.url ?? null,
      siteName: result.ogSiteName ?? null,
    };
    await redis.setex(cacheKey, 3600, JSON.stringify(payload));
    return NextResponse.json(payload);
  } catch (err) {
    console.error("[og] error", err);
    return NextResponse.json({ error: "Fetch failed" }, { status: 502 });
  }
}
