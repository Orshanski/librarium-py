-- Migration: добавить ON DELETE CASCADE для shelves.user_id и user_books.user_id
-- Запускать: sqlite3 data/db.sqlite < backend/migrations/001_user_cascade.sql

PRAGMA foreign_keys=OFF;

BEGIN TRANSACTION;

CREATE TABLE shelves_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_system BOOLEAN NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO shelves_new (id, name, user_id, is_system, created_at)
SELECT id, name, user_id, is_system, created_at
FROM shelves;

DROP TABLE shelves;
ALTER TABLE shelves_new RENAME TO shelves;

CREATE TABLE user_books_new (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    is_read BOOLEAN DEFAULT 0,
    is_hidden BOOLEAN DEFAULT 0,
    rating INTEGER,
    PRIMARY KEY (user_id, book_id)
);

INSERT INTO user_books_new (user_id, book_id, is_read, is_hidden, rating)
SELECT user_id, book_id, is_read, is_hidden, rating
FROM user_books;

DROP TABLE user_books;
ALTER TABLE user_books_new RENAME TO user_books;

-- Восстановить индексы
CREATE INDEX IF NOT EXISTS idx_shelf_books_book ON shelf_books(book_id);
CREATE INDEX IF NOT EXISTS idx_user_books_book ON user_books(book_id);

COMMIT;

PRAGMA foreign_keys=ON;
