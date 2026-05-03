import sqlite3


def test_get_db_adds_token_epoch_to_existing_users_table(tmp_path, monkeypatch):
    """Existing DBs created before token_epoch should be upgraded at app startup."""
    from app import database

    db_path = tmp_path / "legacy.sqlite"
    db = sqlite3.connect(str(db_path))
    db.execute("""
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            display_name TEXT,
            email TEXT,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'reader',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    db.commit()
    db.close()

    database.reset_db()
    monkeypatch.setattr(database, "DB_PATH", db_path)

    migrated = database._get_db()
    columns = {row["name"] for row in migrated.execute("PRAGMA table_info(users)").fetchall()}
    assert "token_epoch" in columns

    database.reset_db()
