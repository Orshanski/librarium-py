#!/usr/bin/env bash
# PreToolUse(Bash) hook: ловит `git push` и превращает его в точку рефлексии.
#
# Поведение:
#   - Не git push → молча пропускает (exit 0, без JSON)
#   - git push → возвращает hookSpecificOutput с:
#       * permissionDecision: ask     — Alexey увидит permission prompt
#       * permissionDecisionReason    — что увидит Alexey
#       * additionalContext           — инструкция Claude'у: сделать review сессии,
#                                       предложить правки CLAUDE.md
#
# stdin: JSON tool-input от Claude Code. Читаем .tool_input.command.

set -euo pipefail

cmd=$(jq -re '.tool_input.command' 2>/dev/null) || exit 0

case "$cmd" in
  *"git push"*)
    jq -n '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: "Push — момент рефлексии. Claude сейчас разберёт сессию и предложит обновления CLAUDE.md (если есть смысл). Прочитай предложение, потом одобри push.",
        additionalContext: "Перед тем как реально пушить — выполни ОБЯЗАТЕЛЬНЫЙ шаг рефлексии:\n\n1. Перечисли 2-4 ключевых момента/урока ЭТОЙ сессии: новые правила, обнаруженные паттерны, замеченные дыры в workflow, важные решения, которые стоит зафиксировать.\n\n2. Предложи Alexey конкретные правки в CLAUDE.md (root, backend/CLAUDE.md или frontend/CLAUDE.md): добавить правило, удалить устаревшее, переформулировать. Каждая правка — с указанием файла и причины.\n\n3. ИЛИ явно скажи «нечего добавлять — push готов», если действительно нечего.\n\nПосле обсуждения с Alexey и применения правок (если будут) — повторяй git push, Alexey даст разрешение."
      }
    }'
    exit 0
    ;;
  *)
    exit 0
    ;;
esac
