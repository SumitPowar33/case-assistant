-- Item 17: vectors of the pieces of a case file, made by the AI gateway's embedding model on the state's own server, kept
-- here so "Ask the case file" ranks by meaning as well as by words (hybrid). Derived data: a vector says nothing a reader can
-- use, the text stays in its own table, and a vector is looked up by the hash of the piece's text, so a changed piece has
-- no vector until it is embedded again. Stored as real[] and compared per case; pgvector is not needed for one case's few
-- hundred pieces (decision for Sumit in PROGRESS.md; a vector column is a later add for a search across cases).
CREATE TABLE case_passage_vector (
  fir_id     uuid        NOT NULL REFERENCES fir(id) ON DELETE CASCADE,
  model      text        NOT NULL CHECK (model ~ '^[A-Za-z0-9._/-]{1,80}$'),
  text_hash  text        NOT NULL CHECK (text_hash ~ '^[0-9a-f]{8,64}$'),
  vec        real[]      NOT NULL CHECK (cardinality(vec) BETWEEN 1 AND 1024),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fir_id, model, text_hash)
);
