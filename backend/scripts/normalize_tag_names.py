#!/usr/bin/env python3
"""One-off: normalize existing tag names to new capitalization rules.

Rules (matching app.dal.tags._capitalize_tag):
- Capitalize first letter
- If tag is ALL-CAPS and longer than 4 chars — lowercase rest
- Acronyms up to 4 chars (AI, SQL, HTTP) — preserved

Usage:
    python scripts/normalize_tag_names.py                    # dry-run (shows what would change)
    python scripts/normalize_tag_names.py --apply            # actually rename/merge
    python scripts/normalize_tag_names.py --apply DBPATH     # custom DB path
"""
import sqlite3
import sys
from pathlib import Path


def normalize(name: str) -> str:
    s = name.strip()
    if not s:
        return s
    if len(s) > 4 and s == s.upper() and any(c.isalpha() for c in s):
        return s[0] + s[1:].lower()
    return s[0].upper() + s[1:]


def run(db_path: str, apply: bool):
    db = sqlite3.connect(db_path)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")

    rows = db.execute("SELECT id, name FROM tags ORDER BY id").fetchall()
    renames: list[tuple[int, str, str]] = []   # (id, old, new) — no collision, simple rename
    merges: list[tuple[int, str, int, str]] = []  # (src_id, src_name, dst_id, dst_name) — collision

    # Plan: find what needs changing
    for row in rows:
        old = row["name"]
        new = normalize(old)
        if new == old:
            continue
        collision = db.execute(
            "SELECT id, name FROM tags WHERE name = :n AND id != :id COLLATE NOCASE",
            {"n": new, "id": row["id"]},
        ).fetchone()
        if collision:
            merges.append((row["id"], old, collision["id"], collision["name"]))
        else:
            renames.append((row["id"], old, new))

    # Report
    print(f"=== Normalization plan for {db_path} ===")
    print(f"Total tags: {len(rows)}")
    print(f"Simple renames: {len(renames)}")
    print(f"Merges (collisions): {len(merges)}")
    print()

    if renames:
        print("-- RENAMES --")
        for _, old, new in renames:
            print(f"  {old!r} -> {new!r}")
        print()

    if merges:
        print("-- MERGES (source will be deleted, books relinked to target) --")
        for src_id, src_name, dst_id, dst_name in merges:
            print(f"  #{src_id} {src_name!r} -> #{dst_id} {dst_name!r}")
        print()

    if not apply:
        print("Dry-run mode. Use --apply to actually perform changes.")
        db.close()
        return

    if not renames and not merges:
        print("Nothing to do.")
        db.close()
        return

    # Apply
    try:
        for tag_id, _, new_name in renames:
            db.execute("UPDATE tags SET name = :n WHERE id = :id",
                       {"n": new_name, "id": tag_id})

        for src_id, _, dst_id, _ in merges:
            # Relink book_tags: source rows without target — move, rest delete
            db.execute("""
                INSERT OR IGNORE INTO book_tags (book_id, tag_id)
                SELECT book_id, :dst FROM book_tags WHERE tag_id = :src
            """, {"dst": dst_id, "src": src_id})
            db.execute("DELETE FROM book_tags WHERE tag_id = :src", {"src": src_id})
            # Relink tag_mappings
            db.execute("UPDATE tag_mappings SET tag_id = :dst WHERE tag_id = :src",
                       {"dst": dst_id, "src": src_id})
            # Delete source tag
            db.execute("DELETE FROM tags WHERE id = :src", {"src": src_id})

        db.commit()
        print("Applied successfully.")
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
