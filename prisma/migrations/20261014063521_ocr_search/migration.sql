-- AlterEnum
ALTER TYPE "ocr_status" ADD VALUE 'skipped';

-- Full-text search index (PostgreSQL tsvector)
CREATE INDEX IF NOT EXISTS "document_versions_search_vector_idx"
  ON "document_versions" USING GIN ("search_vector");

