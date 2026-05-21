#!/usr/bin/env python3
"""Unit-тесты для push-reflection hook.

Запуск: `python3 .claude/hooks/test_push_reflection.py` (без зависимостей).
Падает с ненулевым кодом и описанием при первом несовпадении.

Имя файла `push-reflection.py` содержит дефис — обычный import невозможен,
загружаем через importlib.
"""
import importlib.util
import shlex
import sys
from pathlib import Path

HOOK_PATH = Path(__file__).resolve().parent / "push-reflection.py"

spec = importlib.util.spec_from_file_location("push_reflection", HOOK_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError(f"failed to load module spec for {HOOK_PATH}")
push_reflection = importlib.util.module_from_spec(spec)
spec.loader.exec_module(push_reflection)
is_push_command = push_reflection.is_push_command  # type: ignore[attr-defined]


CASES: list[tuple[str, bool]] = [
    # bare form
    ("git push", True),
    ("git push origin main", True),
    # с глобальными опциями git
    ("git -C /tmp/repo push origin main", True),
    ("git -C /tmp/repo push", True),
    ("git --git-dir=/tmp/.git push", True),
    ("git --git-dir /tmp/.git push", True),
    ("git --work-tree=/tmp push", True),
    ("git --no-pager push", True),
    ("git -c user.name=Foo push", True),
    ("git --no-pager -C /tmp push origin main", True),
    # compound commands
    ("cd /tmp && git push", True),
    ("git status && git push", True),
    # не push
    ("git status", False),
    ("git -C /tmp status", False),
    ("git commit -m 'msg'", False),
    # false-positive guards (push в кавычках)
    ("git commit -m 'fix git push regression'", False),
    ("echo 'we will git push later'", False),
    # force push (тоже push — должен ловиться)
    ("git push --force", True),
    ("git push -f origin main", True),
    ("git -C /tmp push --force-with-lease", True),
]


def main() -> int:
    failures = []
    for cmd, expected in CASES:
        try:
            tokens = shlex.split(cmd, posix=True)
        except ValueError as exc:
            failures.append(f"shlex failed on {cmd!r}: {exc}")
            continue
        got = is_push_command(tokens)
        if got != expected:
            failures.append(
                f"expected {expected} for {cmd!r}, got {got} (tokens={tokens})"
            )

    if failures:
        print(f"FAIL: {len(failures)} case(s) failed:", file=sys.stderr)
        for f in failures:
            print(f"  - {f}", file=sys.stderr)
        return 1

    print(f"OK: {len(CASES)} cases passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
