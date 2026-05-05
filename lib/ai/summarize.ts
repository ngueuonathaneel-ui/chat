/**
 * Résumé de conversation — pipeline llama.cpp
 *
 * En production :
 *   - Container llama.cpp avec un modèle quantisé 4-bit (ex: Mistral-7B Q4_K_M)
 *   - Endpoint OpenAI-compatible (/v1/chat/completions)
 *   - LLAMA_CPP_URL pointe vers ce container.
 *
 * Fallback :
 *   - Si pas de URL configurée, on utilise un summarizer extractif
 *     basé sur TF-IDF (sélection des N phrases les plus représentatives).
 */

export interface SummarizeOptions {
  maxSentences?: number;
}

/**
 * TF-IDF extractif (pure-JS, déterministe) — fallback hors-ligne.
 *
 * Algorithme :
 *   1. Découpage en phrases sur ponctuation forte.
 *   2. Tokenisation lowercase + retrait stop-words.
 *   3. TF par phrase, IDF sur le document (la conversation).
 *   4. Score(phrase) = somme des TF·IDF de ses tokens / sqrt(longueur).
 *   5. Sélection top-K dans l'ordre d'apparition (préserve la chronologie).
 */
function extractiveSummary(
  text: string,
  maxSentences = 3
): string {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5);
  if (sentences.length <= maxSentences) return sentences.join(" ");

  const STOP = new Set([
    "le", "la", "les", "de", "des", "et", "ou", "est", "à",
    "the", "a", "an", "of", "and", "is", "to", "in", "for",
  ]);
  const tokenize = (s: string) =>
    s.toLowerCase().split(/[\W_]+/).filter((w) => w.length > 2 && !STOP.has(w));

  const tfs = sentences.map((s) => {
    const tokens = tokenize(s);
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    return { tokens, tf };
  });

  const df = new Map<string, number>();
  for (const { tokens } of tfs) {
    for (const t of new Set(tokens)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const N = sentences.length;

  const scored = tfs.map(({ tokens, tf }, i) => {
    let score = 0;
    for (const [tok, count] of tf) {
      const idf = Math.log(N / ((df.get(tok) ?? 0) + 1)) + 1;
      score += count * idf;
    }
    return {
      i,
      score: tokens.length === 0 ? 0 : score / Math.sqrt(tokens.length),
    };
  });

  const top = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => a.i - b.i)
    .map(({ i }) => sentences[i]);

  return top.join(" ");
}

const LLAMA_URL = process.env.LLAMA_CPP_URL;

export async function summarizeConversation(
  messages: string[],
  opts: SummarizeOptions = {}
): Promise<string> {
  const text = messages.join("\n");
  if (!text.trim()) return "";

  if (!LLAMA_URL) {
    return extractiveSummary(text, opts.maxSentences ?? 3);
  }

  const res = await fetch(`${LLAMA_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "local",
      messages: [
        {
          role: "system",
          content:
            "Résume la conversation en 2-3 phrases neutres et factuelles, dans la langue dominante de la conversation.",
        },
        { role: "user", content: text.slice(0, 8000) },
      ],
      temperature: 0.2,
      max_tokens: 200,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    return extractiveSummary(text, opts.maxSentences ?? 3);
  }
  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices[0]?.message.content?.trim() ?? "";
}
