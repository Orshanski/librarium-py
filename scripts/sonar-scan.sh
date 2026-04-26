#!/usr/bin/env bash
# Run sonar-scanner against librarium-py with the right env and cwd.
#
# Why this wrapper exists:
# - $SONAR_TOKEN is exported from ~/.zshrc, but Claude Code's Bash tool
#   does not inherit interactive-zsh env. A naive `sonar-scanner -Dsonar.token=$SONAR_TOKEN`
#   sends an empty token and uploads garbage analysis to SonarCloud.
# - sonar-project.properties lives at repo root; running from anywhere else
#   trips "mandatory properties" failure and again wastes a SonarCloud upload.
#
# Usage: ./scripts/sonar-scan.sh [extra sonar-scanner args...]

set -euo pipefail

# Resolve repo root (the directory holding this script's parent).
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Pull SONAR_TOKEN (and friends) from interactive shell config if not already set.
if [ -z "${SONAR_TOKEN:-}" ]; then
  if [ -f "$HOME/.zshrc" ]; then
    # shellcheck disable=SC1091
    source "$HOME/.zshrc" >/dev/null 2>&1 || true
  fi
fi

if [ -z "${SONAR_TOKEN:-}" ]; then
  echo "ERROR: SONAR_TOKEN is empty. Set it in ~/.zshrc as 'export SONAR_TOKEN=...' or pass it inline." >&2
  exit 1
fi

cd "$REPO_ROOT"
exec sonar-scanner -Dsonar.token="$SONAR_TOKEN" "$@"
