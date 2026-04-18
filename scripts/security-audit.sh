#!/bin/bash
# Git pre-push hook: audit and auto-fix security vulnerabilities.
# Blocks push if high-severity vulnerabilities remain after auto-fix.
#
# Install (для новых клонов репо):
#   ln -sf ../../scripts/security-audit.sh .git/hooks/pre-push

REPO=$(git rev-parse --show-toplevel)
FAILED=0

# ── Python ──
PIP_AUDIT="$REPO/backend/venv/bin/pip-audit"
if [ -f "$PIP_AUDIT" ]; then
    if ! "$PIP_AUDIT" -r "$REPO/backend/requirements.txt" 2>/dev/null; then
        echo "⚠️  Python vulnerabilities found, attempting auto-fix..." >&2
        "$PIP_AUDIT" -r "$REPO/backend/requirements.txt" --fix 2>/dev/null || true
        if ! "$PIP_AUDIT" -r "$REPO/backend/requirements.txt" 2>/dev/null; then
            FAILED=1
        fi
    fi
fi

# ── npm ──
if [ -f "$REPO/frontend/package.json" ]; then
    if ! npm audit --prefix "$REPO/frontend" --audit-level=high 2>/dev/null; then
        echo "⚠️  npm vulnerabilities found, attempting auto-fix..." >&2
        npm audit fix --prefix "$REPO/frontend" 2>/dev/null || true
        if ! npm audit --prefix "$REPO/frontend" --audit-level=high 2>/dev/null; then
            FAILED=1
        fi
    fi
fi

if [ "$FAILED" -ne 0 ]; then
    echo "❌ Unfixable security vulnerabilities found. Fix them before pushing." >&2
    exit 1
fi

exit 0
