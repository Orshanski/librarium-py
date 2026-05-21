#!/usr/bin/env python3
"""PreToolUse(Bash) hook: ловит `git push` и превращает его в точку рефлексии.

Парсинг через shlex — уважает кавычки и держит &&, ; как отдельные
токены. Ловит `cd dir && git push ...` без false-positive на тексте
в кавычках (`commit -m "... git push ..."`).

stdin: JSON tool-input от Claude Code.
stdout: либо пусто (пропуск), либо JSON hookSpecificOutput.
"""
import json
import shlex
import sys


def main() -> int:
    try:
        payload = json.load(sys.stdin)
        cmd = payload["tool_input"]["command"]
    except Exception:
        return 0

    try:
        tokens = shlex.split(cmd, posix=True)
    except ValueError:
        return 0

    hit = any(
        tokens[i] == "git" and tokens[i + 1] == "push"
        for i in range(len(tokens) - 1)
    )

    if not hit:
        return 0

    out = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "ask",
            "permissionDecisionReason": (
                "Push — момент рефлексии. Claude сейчас разберёт сессию и "
                "предложит обновления CLAUDE.md (если есть смысл). Прочитай "
                "предложение, потом одобри push."
            ),
            "additionalContext": (
                "Перед тем как реально пушить — выполни ОБЯЗАТЕЛЬНЫЙ шаг "
                "рефлексии:\n\n"
                "1. Перечисли 2-4 ключевых момента/урока ЭТОЙ сессии: новые "
                "правила, обнаруженные паттерны, замеченные дыры в workflow, "
                "важные решения, которые стоит зафиксировать.\n\n"
                "2. Предложи Alexey конкретные правки в CLAUDE.md (root, "
                "backend/CLAUDE.md или frontend/CLAUDE.md): добавить правило, "
                "удалить устаревшее, переформулировать. Каждая правка — с "
                "указанием файла и причины.\n\n"
                "3. ИЛИ явно скажи «нечего добавлять — push готов», если "
                "действительно нечего.\n\n"
                "После обсуждения с Alexey и применения правок (если будут) — "
                "повторяй git push, Alexey даст разрешение."
            ),
        }
    }
    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
