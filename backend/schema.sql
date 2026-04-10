PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- Книги
CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    sort_title TEXT,
    description TEXT,
    language TEXT,
    publisher TEXT,
    pub_date TEXT,
    series_id INTEGER REFERENCES series(id),
    series_number REAL,
    cover_path TEXT,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Авторы
CREATE TABLE IF NOT EXISTS authors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    sort_name TEXT
);

-- Серии
CREATE TABLE IF NOT EXISTS series (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    sort_name TEXT
);

-- Жанры/теги
CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    code TEXT
);

-- Маппинг сырых жанров → теги
CREATE TABLE IF NOT EXISTS tag_mappings (
    raw_tag TEXT PRIMARY KEY,
    tag_id INTEGER NOT NULL REFERENCES tags(id)
);

-- Файлы книг
CREATE TABLE IF NOT EXISTS book_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    format TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    file_hash TEXT,
    UNIQUE(book_id, format)
);

-- Идентификаторы (ISBN, Litres ID, Amazon ID и др.)
CREATE TABLE IF NOT EXISTS book_identifiers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    value TEXT NOT NULL
);

-- Пользователи
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT,
    email TEXT,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'reader',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Полки
CREATE TABLE IF NOT EXISTS shelves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_system BOOLEAN NOT NULL DEFAULT 0,
    system_code TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Настройки (key/value)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

-- Link tables
CREATE TABLE IF NOT EXISTS book_authors (
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    author_id INTEGER NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
    PRIMARY KEY (book_id, author_id)
);

CREATE TABLE IF NOT EXISTS book_tags (
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (book_id, tag_id)
);

CREATE TABLE IF NOT EXISTS shelf_books (
    shelf_id INTEGER NOT NULL REFERENCES shelves(id) ON DELETE CASCADE,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (shelf_id, book_id)
);

CREATE TABLE IF NOT EXISTS user_books (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    is_read BOOLEAN DEFAULT 0,
    is_hidden BOOLEAN DEFAULT 0,
    rating INTEGER,
    PRIMARY KEY (user_id, book_id)
);

-- Настройки ридера (per user + device type)
CREATE TABLE IF NOT EXISTS reader_settings (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_type TEXT NOT NULL,
    settings TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY (user_id, device_type)
);

-- Прогресс чтения (per user + book)
CREATE TABLE IF NOT EXISTS reading_progress (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    position TEXT,
    last_device TEXT,
    last_format TEXT,
    fraction REAL,
    last_read_at DATETIME,
    version INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, book_id)
);

CREATE INDEX IF NOT EXISTS idx_reading_progress_book ON reading_progress(book_id);

-- Default settings
INSERT OR IGNORE INTO settings (key, value) VALUES ('app_name', 'Librarium');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_books_series ON books(series_id);
CREATE INDEX IF NOT EXISTS idx_books_added ON books(added_at DESC);
CREATE INDEX IF NOT EXISTS idx_books_sort_title ON books(sort_title);
CREATE INDEX IF NOT EXISTS idx_book_authors_author ON book_authors(author_id);
CREATE INDEX IF NOT EXISTS idx_book_tags_tag ON book_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_tag_mappings_tag ON tag_mappings(tag_id);
CREATE INDEX IF NOT EXISTS idx_book_files_book ON book_files(book_id);
CREATE INDEX IF NOT EXISTS idx_book_identifiers_book ON book_identifiers(book_id);
CREATE INDEX IF NOT EXISTS idx_book_identifiers_type_value ON book_identifiers(type, value);
CREATE INDEX IF NOT EXISTS idx_shelf_books_book ON shelf_books(book_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_shelves_system_code ON shelves(user_id, system_code) WHERE system_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_books_book ON user_books(book_id);
CREATE INDEX IF NOT EXISTS idx_authors_sort ON authors(sort_name);
CREATE INDEX IF NOT EXISTS idx_series_sort ON series(sort_name);
