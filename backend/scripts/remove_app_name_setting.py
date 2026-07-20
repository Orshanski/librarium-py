"""Idempotent removal of the obsolete app_name setting.

Запуск:
    python backend/scripts/remove_app_name_setting.py [path/to/db.sqlite]

Без аргумента — берёт DB_PATH из app.config (data/db.sqlite).
Безопасно прогонять много раз: DELETE отсутствующей строки — no-op.
"""
import sqlite3
import sys
from pathlib import Path


def main(db_path: str) -> int:
    path = Path(db_path)
    if not path.exists():
        print(f"ERROR: DB file not found: {path}", file=sys.stderr)
        return 1
    db = sqlite3.connect(str(path))
    try:
        cur = db.execute("DELETE FROM settings WHERE key = 'app_name'")
        db.commit()
        if cur.rowcount > 0:
            print(f"OK: removed app_name from settings in {path}.")
        else:
            print(f"OK: app_name absent in {path} — nothing to do.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) > 1:
        sys.exit(main(sys.argv[1]))
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from app.config import DB_PATH  # type: ignore[import-not-found]
    sys.exit(main(str(DB_PATH)))
