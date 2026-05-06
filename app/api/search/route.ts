/**
 * /api/search?q=…&conversationId=…&limit=20&offset=0
 *
 * Algorithme :
 *   1. `websearch_to_tsquery('simple', q)` parse la requête (supporte
 *      "phrase exacte", -exclu, OR, parenthèses).
 *   2. Filtrage par appartenance utilisateur → empêche l'exfiltration
 *      via énumération de conversations.
 *   3. Ranking `ts_rank_cd` sur l'index GIN (vecteur tsvector pré-calculé,
 *      colonne générée → toujours à jour). Pondération via setweight si
 *      ajoutée plus tard.
 *   4. `ts_headline` génère le snippet HTML avec <mark>...</mark>.
 *
 * Complexité : O(log N + k) sur GIN, où k = nombre de matches.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface SearchRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_username: string;
  rank: number;
  headline: string;
  created_at: Date;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const conversationId = url.searchParams.get("conversationId") || null;
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") ?? "20"), 1),
    100,
  );
  const offset = Math.max(Number(url.searchParams.get("offset") ?? "0"), 0);

  if (q.length < 2) {
    return NextResponse.json({ results: [], total: 0 });
  }

  const convFilter = conversationId
    ? Prisma.sql`AND m.conversation_id = ${conversationId}::uuid`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<SearchRow[]>(Prisma.sql`
    SELECT
      m.id,
      m.conversation_id,
      m.sender_id,
      u.username AS sender_username,
      ts_rank_cd(m.search_vector, query) AS rank,
      ts_headline('simple', coalesce(m.search_text, ''), query,
        'StartSel=<mark>, StopSel=</mark>, MaxWords=20, MinWords=5'
      ) AS headline,
      m.created_at
    FROM messages m
    INNER JOIN users u ON u.id = m.sender_id
    INNER JOIN conversation_members cm
      ON cm.conversation_id = m.conversation_id
     AND cm.user_id = ${userId}::uuid
    , websearch_to_tsquery('simple', ${q}) query
    WHERE m.search_vector @@ query
      ${convFilter}
    ORDER BY rank DESC, m.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const total = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT count(*)::bigint AS count
    FROM messages m
    INNER JOIN conversation_members cm
      ON cm.conversation_id = m.conversation_id
     AND cm.user_id = ${userId}::uuid
    , websearch_to_tsquery('simple', ${q}) query
    WHERE m.search_vector @@ query
      ${convFilter}
  `);

  return NextResponse.json({
    results: rows.map((r) => ({
      id: r.id,
      conversationId: r.conversation_id,
      senderId: r.sender_id,
      sender: r.sender_username,
      rank: r.rank,
      headline: r.headline,
      createdAt: r.created_at,
    })),
    total: Number(total[0]?.count ?? 0),
  });
}
