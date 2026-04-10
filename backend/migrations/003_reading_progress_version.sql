-- Migration: add version counter to reading_progress for CAS sync
-- Paired with feat: version-based CAS sync for reading_progress
--
-- The feature adds a version column so the server can do compare-and-swap
-- conflict resolution instead of blind last-writer-wins. Fresh installs get
-- the column via schema.sql's CREATE TABLE; existing DBs need this migration.
--
-- The UPDATE is the tricky part: after ALTER adds the column with DEFAULT 0,
-- every pre-existing row has version=0. A freshly-installed client joining
-- later will not adopt these rows on mount (its own IDB has serverVersion=0
-- too, and the reconcile rule `server.version > local.serverVersion` is
-- `0 > 0` = false). Result: the user opens a book and sees it from the
-- start, having to navigate manually via TOC.
--
-- The UPDATE bumps every row with real data to version=1 so the adopt rule
-- fires on first mount of a fresh client. Rows with NULL position (opened
-- but never read) stay at v=0 — nothing to adopt there.

ALTER TABLE reading_progress ADD COLUMN version INTEGER NOT NULL DEFAULT 0;

UPDATE reading_progress SET version = 1 WHERE position IS NOT NULL AND version = 0;
