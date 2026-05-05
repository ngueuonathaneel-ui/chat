/**
 * Détection de spam — pipeline simulant fastText
 *
 * Stratégie production :
 *   - Modèle fastText pré-entraîné (~600 KB quantisé) chargé via WASM
 *     ou via un microservice gRPC interne.
 *   - Pour le développement / fallback : heuristiques déterministes
 *     basées sur les features les plus discriminantes du dataset SMS Spam.
 *
 * Pipeline :
 *   1. Normalisation Unicode (NFKC) + lowercase
 *   2. Tokenisation simple sur \W+
 *   3. Stop-words FR/EN retirés (taille fixe, lookup O(1) dans Set)
 *   4. Stemming Porter approché sur suffixes communs
 *   5. Score = combinaison pondérée :
 *        - bag-of-features lexicale
 *        - features structurelles (caps ratio, URLs, chiffres, ponctuation)
 *
 * Renvoie { isSpam, score ∈ [0,1], features } pour audit / explainability.
 */

const STOP_WORDS = new Set([
  // FR
  "le", "la", "les", "un", "une", "des", "du", "de", "à", "et", "est", "en",
  "dans", "pour", "que", "qui", "ce", "cette", "ces", "il", "elle", "on",
  // EN
  "the", "a", "an", "and", "or", "is", "are", "was", "were", "to", "of", "in",
  "for", "with", "on", "at", "by", "this", "that", "be", "have", "has",
]);

const SPAM_TOKENS = new Map<string, number>([
  ["gagn", 0.85], ["gratuit", 0.7], ["urgent", 0.6], ["clique", 0.65],
  ["promo", 0.7], ["bitcoin", 0.55], ["crypto", 0.4], ["loan", 0.7],
  ["viagra", 0.95], ["winner", 0.9], ["congratul", 0.75], ["claim", 0.65],
  ["prize", 0.85], ["lottery", 0.9], ["million", 0.5], ["nigeri", 0.8],
  ["heritag", 0.8], ["transfer", 0.45], ["password", 0.55], ["verify", 0.5],
  ["account", 0.4], ["suspend", 0.6], ["bank", 0.45], ["paypal", 0.55],
]);

function porterStem(token: string): string {
  // Approximation : retire les suffixes les plus fréquents FR/EN
  return token
    .replace(/(ations?|ements?|ingly|edly)$/, "")
    .replace(/(tion|sion|ment|ness|ity|ing|er|ed|es|s)$/, "")
    .replace(/(é|er|ez|ent|ons|ais|ait|ions|iez|aient)$/, "")
    .slice(0, 12);
}

function tokenize(input: string): string[] {
  return input
    .normalize("NFKC")
    .toLowerCase()
    .split(/[\W_]+/)
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t))
    .map(porterStem);
}

function structuralFeatures(text: string) {
  const len = text.length || 1;
  const caps = text.replace(/[^A-Z]/g, "").length;
  const urls = (text.match(/https?:\/\/\S+/g) ?? []).length;
  const exclam = (text.match(/!/g) ?? []).length;
  const digits = text.replace(/\D/g, "").length;

  return {
    capsRatio: caps / len,
    urlCount: urls,
    exclamCount: exclam,
    digitsRatio: digits / len,
  };
}

export interface SpamResult {
  isSpam: boolean;
  score: number;
  features: {
    lexicalScore: number;
    structuralScore: number;
    matchedTokens: string[];
  };
}

export function detectSpam(text: string): SpamResult {
  if (!text || text.length < 3) {
    return {
      isSpam: false,
      score: 0,
      features: { lexicalScore: 0, structuralScore: 0, matchedTokens: [] },
    };
  }

  const tokens = tokenize(text);
  let lex = 0;
  const matched: string[] = [];
  for (const t of tokens) {
    for (const [k, w] of SPAM_TOKENS) {
      if (t.startsWith(k)) {
        lex += w;
        matched.push(t);
        break;
      }
    }
  }
  // Normalisation logarithmique (un seul mot ne déclenche pas le verdict)
  const lexicalScore = 1 - Math.exp(-lex / 1.5);

  const f = structuralFeatures(text);
  const structuralScore = Math.min(
    1,
    f.capsRatio * 1.2 + f.urlCount * 0.15 + (f.exclamCount > 3 ? 0.3 : 0)
  );

  const score = 0.7 * lexicalScore + 0.3 * structuralScore;
  return {
    isSpam: score >= 0.55,
    score,
    features: { lexicalScore, structuralScore, matchedTokens: matched },
  };
}
