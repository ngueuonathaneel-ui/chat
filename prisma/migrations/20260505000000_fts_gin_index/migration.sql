-- Full-Text Search migration
--
-- Note importante : les messages sont chiffrés (champ `content` = ciphertext).
-- Indexer le ciphertext seul ne donne aucun résultat utile car il est aléatoire.
--
-- Stratégie : on ajoute une colonne `search_text` *optionnelle* qui contiendra
-- soit (a) le plaintext en clair pour des conversations non-chiffrées (groupes
-- publics, archives), soit (b) un hash déterministe des tokens pour permettre
-- la recherche par token exact côté client (token-based encrypted search).
--
-- La fonction `messages_search` ranke avec `ts_rank_cd` pondéré :
--   - Poids A pour la position du token (titre/début de message)
--   - Poids B pour le corps
--   - Décroissance temporelle légère (boost messages récents)

ALTER TABLE messages ADD COLUMN IF NOT EXISTS search_text TEXT;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(search_text, ''))
  ) STORED;

CREATE INDEX IF NOT EXISTS messages_search_vector_idx
  ON messages USING GIN (search_vector);

-- Fonction utilitaire pour ranking — exposable via $queryRaw
-- Utilisation :
--   SELECT id, ts_rank_cd(search_vector, query) AS rank,
--          ts_headline('simple', search_text, query) AS headline
--   FROM messages, websearch_to_tsquery('simple', $1) query
--   WHERE search_vector @@ query
--     AND conversation_id IN (SELECT conversation_id FROM conversation_members WHERE user_id = $2)
--   ORDER BY rank DESC, created_at DESC
--   LIMIT $3 OFFSET $4;
