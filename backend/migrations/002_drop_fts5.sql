-- Migration: удалить неиспользуемую FTS5 таблицу и триггеры
-- Поиск работает через LIKE, FTS5 не используется

DROP TRIGGER IF EXISTS books_ai;
DROP TRIGGER IF EXISTS books_ad;
DROP TRIGGER IF EXISTS books_au;
DROP TABLE IF EXISTS books_fts;
