-- Durable SSE publication log for the current production SQLite database.
-- Run manually on the single production DB before deploying code that appends
-- to sse_publications. Application startup intentionally does not run this
-- migration; backend/schema.sql covers fresh and test databases.

CREATE TABLE IF NOT EXISTS sse_publications (
    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope_kind TEXT NOT NULL CHECK (scope_kind IN ('library', 'user')),
    user_id INTEGER,
    event_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    envelope_json TEXT NOT NULL,
    published_at TEXT NOT NULL,
    CHECK ((scope_kind = 'library' AND user_id IS NULL) OR (scope_kind = 'user' AND user_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_sse_publications_scope_event ON sse_publications(scope_kind, user_id, event_id);
