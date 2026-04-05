#!/usr/bin/env python3
"""One-off: wrap existing reading_progress.position values into JSON {kind, value}.

Before: position is a raw CFI string (EPUB/FB2).
After: position is a JSON string {"kind": "cfi", "value": "<original>"}.

Rows already in JSON form (with a "kind" field) are skipped.
Rows with NULL or empty position are skipped.

Usage:
    python scripts/migrate_position_to_json.py                # dry-run
    python scripts/migrate_position_to_json.py --apply        # apply
    python scripts/migrate_position_to_json.py --apply DBPATH # custom DB path
"""
import json
import sqlite3
import sys
from pathlib import Path


def parse_position(raw: str) -> tuple[str, str]:
    """Classify position value.

    Returns ("already_json", raw) if already wrapped, ("cfi", raw) otherwise.
    """
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict) and "kind" in parsed:
            return ("already_json", raw)
    except (json.JSONDecodeError, ValueError):
        pass
    return ("cfi", raw)


def run(db_path: str, apply: bool):
    db = sqlite3.connect(db_path)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")

    rows = db.execute(
        "SELECT user_id, book_id, position FROM reading_progress "
        "WHERE position IS NOT NULL AND position != ''"
    ).fetchall()

    already = 0
    to_wrap: list[tuple[int, int, str, str]] = []  # (user_id, book_id, old, new)
    for row in rows:
        kind, raw = parse_position(row["position"])
        if kind == "already_json":
            already += 1
            continue
        new = json.dumps({"kind": "cfi", "value": raw}, ensure_ascii=False)
        to_wrap.append((row["user_id"], row["book_id"], raw, new))

    print(f"=== Position migration for {db_path} ===")
    print(f"Total rows with position: {len(rows)}")
    print(f"Already JSON: {already}")
    print(f"Will be wrapped: {len(to_wrap)}")
    print()

    if to_wrap:
        print("-- WRAP (first 5) --")
        for user_id, book_id, old, new in to_wrap[:5]:
            truncated_old = old if len(old) <= 60 else old[:60] + "..."
            print(f"  user={user_id} book={book_id}: {truncated_old!r} -> {new[:80]}...")
        if len(to_wrap) > 5:
            print(f"  ... and {len(to_wrap) - 5} more")
        print()

    if not apply:
        print("Dry-run mode. Use --apply to actually perform changes.")
        db.close()
        return

    if not to_wrap:
        print("Nothing to do.")
        db.close()
        return

    try:
        for user_id, book_id, _, new in to_wrap:
            db.execute(
                "UPDATE reading_progress SET position = :p "
                "WHERE user_id = :u AND book_id = :b",
                {"p": new, "u": user_id, "b": book_id},
            )
        db.commit()
        print(f"Applied: {len(to_wrap)} rows updated.")
    except Exception as e:
        db.rollback()
        print(f"Error, rolled back: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    args = sys.argv[1:]
    apply = "--apply" in args
    args = [a for a in args if a != "--apply"]
    if args:
        path = args[0]
    else:
        path = str(Path(__file__).parent.parent.parent / "data" / "db.sqlite")
    print(f"Database: {path}")
    run(path, apply)
