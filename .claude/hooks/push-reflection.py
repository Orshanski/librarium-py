#!/usr/bin/env python3
"""PreToolUse(Bash) hook: ловит `git push` и превращает его в точку рефлексии.

Парсинг через shlex — уважает кавычки и держит &&, ; как отдельные
токены. Ловит `cd dir && git push ...` без false-positive на тексте
в кавычках (`commit -m "... git push ..."`).

Распознаёт push и в форме `git -C <path> push`, `git --git-dir=... push`
и т.п. — для каждого вхождения `git` находит первый «не-флаг» токен
после него (subcommand) и сравнивает его с `push`.

stdin: JSON tool-input от Claude Code.
stdout: либо пусто (пропуск), либо JSON hookSpecificOutput.
"""
import json
import shlex
import sys

# git-уровневые опции, требующие отдельный аргумент-значение (когда без `=`).
GIT_OPTS_WITH_SEPARATE_ARG = {
    "-C",
    "-c",
    "--git-dir",
    "--work-tree",
    "--exec-path",
    "--namespace",
    "--super-prefix",
    "--list-cmds",
}


def find_subcommand(tokens: list[str], git_idx: int) -> str | None:
    """Вернуть subcommand (первый не-флаг токен после `git` на git_idx)."""
    i = git_idx + 1
    while i < len(tokens):
        t = tokens[i]
        if not t.startswith("-"):
            return t
        # `--foo=bar` — значение приклеено, отдельный аргумент не нужен.
        if "=" in t:
            i += 1
            continue
        # Опция с отдельным аргументом — пропустить два токена.
        if t in GIT_OPTS_WITH_SEPARATE_ARG:
            i += 2
            continue
        # Boolean-флаг — пропустить один.
        i += 1
    return None


def is_push_command(tokens: list[str]) -> bool:
    return any(
        t == "git" and find_subcommand(tokens, i) == "push"
        for i, t in enumerate(tokens)
    )


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

    hit = is_push_command(tokens)

    if not hit:
        return 0

    out = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "ask",
            "permissionDecisionReason": (
                "Push — точка рефлексии. После пуша Claude разберёт сессию и "
                "предложит обновления CLAUDE.md (если есть смысл)."
            ),
            "additionalContext": (
                "Push — обязательная точка рефлексии. Сразу после того как "
                "пуш прошёл, выполни этот шаг:\n\n"
                "1. Перечисли 2-4 ключевых момента/урока ЭТОЙ сессии: новые "
                "правила, обнаруженные паттерны, замеченные дыры в workflow, "
                "важные решения, которые стоит зафиксировать.\n\n"
                "2. Предложи Alexey конкретные правки в CLAUDE.md (root, "
                "backend/CLAUDE.md или frontend/CLAUDE.md): добавить правило, "
                "удалить устаревшее, переформулировать. Каждая правка — с "
                "указанием файла и причины.\n\n"
                "3. ИЛИ явно скажи «нечего добавлять», если действительно "
                "нечего.\n\n"
                "Это не предусловие пуша — рефлексия идёт следом, не до него. "
                "Обсуди правки с Alexey и применяй одобренные."
            ),
        }
    }
    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
