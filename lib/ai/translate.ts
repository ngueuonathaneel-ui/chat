/**
 * Service de traduction — wrapper LibreTranslate self-hosted
 *
 * Usage côté serveur uniquement (jamais exposer la clé API au client).
 * En production : LIBRETRANSLATE_URL pointe vers un container interne.
 * Sans LibreTranslate configuré, renvoie le texte source inchangé pour
 * éviter de casser le pipeline appelant.
 */

export interface TranslateRequest {
  q: string;
  source?: string; // ISO 639-1 ou "auto"
  target: string;
}

export interface TranslateResult {
  translatedText: string;
  detectedLanguage?: string;
  cached: boolean;
}

const ENDPOINT = process.env.LIBRETRANSLATE_URL;
const API_KEY = process.env.LIBRETRANSLATE_API_KEY;

export async function translate(
  req: TranslateRequest
): Promise<TranslateResult> {
  if (!ENDPOINT) {
    return { translatedText: req.q, cached: false };
  }
  const body = {
    q: req.q,
    source: req.source ?? "auto",
    target: req.target,
    format: "text",
    ...(API_KEY ? { api_key: API_KEY } : {}),
  };

  const res = await fetch(`${ENDPOINT}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    throw new Error(`LibreTranslate failed: ${res.status}`);
  }
  const data = (await res.json()) as {
    translatedText: string;
    detectedLanguage?: { language: string };
  };
  return {
    translatedText: data.translatedText,
    detectedLanguage: data.detectedLanguage?.language,
    cached: false,
  };
}
