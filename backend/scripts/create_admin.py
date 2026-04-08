#!/usr/bin/env python3
"""Create initial admin user.

Usage:
    python scripts/create_admin.py [username] [password]

Defaults: admin / admin
"""

import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import _get_db
from app.dal.users import create_user, get_user_by_username


def main():
    username = sys.argv[1] if len(sys.argv) > 1 else "admin"
    password = sys.argv[2] if len(sys.argv) > 2 else "admin"

    db = _get_db()

    if get_user_by_username(db, username):
        print(f"User '{username}' already exists.")
        sys.exit(1)

    user_id = create_user(db, username, password, role="admin")
    db.commit()
    print(f"Admin user '{username}' created (id={user_id}).")


if __name__ == "__main__":
    main()
