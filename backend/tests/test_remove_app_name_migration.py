import sqlite3
from pathlib import Path

from scripts.remove_app_name_setting import main


def _make_db(tmp_path: Path, seed_app_name: bool) -> Path:
    db_path = tmp_path / "t.sqlite"
    db = sqlite3.connect(str(db_path))
    db.execute("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)")
    if seed_app_name:
        db.execute("INSERT INTO settings (key, value) VALUES ('app_name', 'Librarium')")
    db.execute("INSERT INTO settings (key, value) VALUES ('smtp_host', 'h')")
    db.commit()
    db.close()
    return db_path


def _keys(db_path: Path) -> set[str]:
    db = sqlite3.connect(str(db_path))
    keys = {r[0] for r in db.execute("SELECT key FROM settings").fetchall()}
    db.close()
    return keys


def test_removes_app_name(tmp_path):
    db_path = _make_db(tmp_path, seed_app_name=True)
    assert main(str(db_path)) == 0
    assert _keys(db_path) == {"smtp_host"}


def test_idempotent_when_absent(tmp_path):
    db_path = _make_db(tmp_path, seed_app_name=False)
    assert main(str(db_path)) == 0
    assert _keys(db_path) == {"smtp_host"}
