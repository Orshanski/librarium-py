#!/usr/bin/env bash
INPUT=$(cat)
[ "$(echo "$INPUT" | jq -r '.stop_hook_active // false')" = "true" ] && exit 0
TRANSCRIPT=$(echo "$INPUT" | jq -r '.transcript_path // empty')
[ -f "$TRANSCRIPT" ] || exit 0
LAST=$(jq -rs 'map(select(.type=="assistant")) | last | (.message.content[]? | select(.type=="text") | .text) // empty' "$TRANSCRIPT")
if echo "$LAST" | grep -iEq 'pre[ -]existing'; then
  echo '{"decision":"block","reason":"Любой увиденный finding — fix-коммит сейчас. Без отговорок «не моё», «отложу», «не задача». Возвращайся и фикси."}'
fi
