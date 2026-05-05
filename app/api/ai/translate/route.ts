/**
 * /api/ai/translate
 * Wrapper authentifié au-dessus de LibreTranslate.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { translate } from "@/lib/ai/translate";
import { checkRateLimit } from "@/lib/redis";

const Schema = z.object({
  q: z.string().min(1).max(4000),
  source: z.string().length(2).optional(),
  target: z.string().length(2),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rl = await checkRateLimit(session.user.id, "translate", 60_000, 60);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation" }, { status: 400 });
  }
  try {
    const result = await translate(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[translate] error", err);
    return NextResponse.json({ error: "Translation failed" }, { status: 502 });
  }
}
