"""Idempotent ALTER for users.token_epoch column.

Запуск:
    python backend/scripts/add_token_epoch_column.py [path/to/db.sqlite]

Без аргумента — берёт DB_PATH из app.config (data/db.sqlite).
Безопасно прогонять много раз: проверяет существование колонки перед ALTER.
"""
import sqlite3
import sys
from pathlib import Path


def column_exists(db: sqlite3.Connection, table: str, column: str) -> bool:
    cur = db.execute(f"PRAGMA table_info({table})")
    return any(row[1] == column for row in cur.fetchall())


def main(db_path: str) -> int:
    path = Path(db_path)
    if not path.exists():
        print(f"ERROR: DB file not found: {path}", file=sys.stderr)
        return 1

    db = sqlite3.connect(str(path))
    try:
        if column_exists(db, "users", "token_epoch"):
            print(f"OK: users.token_epoch already exists in {path} — nothing to do.")
            return 0
        db.execute("ALTER TABLE users ADD COLUMN token_epoch INTEGER NOT NULL DEFAULT 0")
        db.commit()
        print(f"OK: added users.token_epoch to {path}.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) > 1:
        sys.exit(main(sys.argv[1]))
    # Default: resolve via app.config DB_PATH.
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from app.config import DB_PATH  # type: ignore[import-not-found]
    sys.exit(main(str(DB_PATH)))
