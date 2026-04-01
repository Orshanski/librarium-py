#!/bin/bash
# Librarium backup → OneDrive:Books/Librarium/
set -euo pipefail

DATA_DIR="/opt/librarium/data"
REMOTE="onedrive:Books/Librarium"
TMP_DB="/tmp/librarium-db-backup.sqlite"
LOG="/opt/librarium/backup.log"

echo "$(date '+%Y-%m-%d %H:%M:%S') backup started" >> "$LOG"

# Safe SQLite backup (consistent snapshot of live DB)
sqlite3 "$DATA_DIR/db.sqlite" ".backup '$TMP_DB'"

# Sync library files
rclone sync "$DATA_DIR/library" "$REMOTE/library" \
  --log-file="$LOG" --log-level=ERROR

# Copy DB snapshot
rclone copyto "$TMP_DB" "$REMOTE/db.sqlite" \
  --log-file="$LOG" --log-level=ERROR

rm -f "$TMP_DB"

echo "$(date '+%Y-%m-%d %H:%M:%S') backup done" >> "$LOG"
