---
name: librarium-workflow
description: Use this skill when Alexey requests development work on librarium-py — implementing a feature, fixing a bug, refactoring code, or working on a beads task. Triggers on phrases like "реализуй X", "давай делать X", "фикс бага Y", "начнём фичу", "сделай задачу <bd-id>", "начни эпик", "сделай рефакторинг", "implement X", "fix bug Y". Activates the strict 16-step process from root CLAUDE.md: spec → review → plan → review → branch → TDD → impl → manual test → commit → code review → merge/push by explicit command. NOT for: config/hook/docs changes, trivial text edits, ad-hoc exploration, type-cleanup runs, or anything where Alexey already explicitly skipped the spec/plan step. Only for code changes in backend/app or frontend/src that warrant durable spec+plan artefacts.
---

# Librarium Development Workflow

Полный референс — в корневом `CLAUDE.md`, секция «Порядок разработки».
Этот скилл — actionable чек-лист поверх него.

## Announce при активации

Скажи Alexey одной строкой: «Использую librarium-workflow — иду по
шагам (1) спека → (2) ревью → … → (16) пуш».

## Pre-flight checks (перед стартом)

1. **Ветка.** `git branch --show-current`. Если `main` — **СТОП**.
   Создать feature branch ПЕРЕД любой правкой кода.
2. **Чистый ли main.** `git status --short`. Любые хвосты —
   закоммитить или спросить Alexey, прежде чем создавать ветку.
3. **Спека есть?** Если нет — `superpowers:brainstorming`, потом
   спека в `project_documentation/specs/YYYY-MM-DD-<topic>-design.md`.
4. **План есть?** Если нет — `superpowers:writing-plans`, файл в
   `project_documentation/plans/YYYY-MM-DD-<topic>.md`.

## Чек-лист (создать bd-задачу для тикета, если ещё нет)

Идти строго по порядку. После каждого артефакта — ревью, ВСЕ findings
показывать Alexey без фильтрации.

| # | Шаг | Кто |
|---|---|---|
| 1 | Спека (design-doc) | Claude |
| 2 | Ревью спеки → ВСЕ findings | Reviewer + Alexey |
| 3 | Фикс спеки + утверждение | Claude + Alexey |
| 4 | План (TDD-детализация) | Claude |
| 5 | Ревью плана → ВСЕ findings | Reviewer + Alexey |
| 6 | Фикс плана + утверждение | Claude + Alexey |
| 7 | Feature branch от main | Claude |
| 8 | Тесты ПЕРЕД реализацией | Claude (TDD) |
| 9 | Реализация → тесты green | Claude |
| 10 | Ручное тестирование | **Alexey** (ждать!) |
| 11 | Коммит **после** одобрения | Claude |
| 12 | Спек-ревью кода (соответствие коду) | Reviewer + Alexey |
| 13 | Код-ревью (качество кода) | Reviewer + Alexey |
| 14 | Фикс findings + пересдача тестов | Claude |
| 15 | Мерж — **только** по явной команде | Alexey говорит «мержи» |
| 16 | Пуш — **только** по явной команде | Alexey говорит «пуш» |

## Жёсткие запреты

- Работать в main.
- Прыгать на код без спеки/плана.
- Мерж без явной команды («окей», «ок», «продолжай» — **не команды**).
- Пуш без явной команды (мерж ≠ пуш, отдельные разрешения).
- Параллельный pytest/vitest — backend и frontend последовательно,
  по одному прогону за раз.
- Pre-existing findings из ревью «отложить» — фиксим в том же тикете.

## Когда отойти от скрипта

Если задача очевидно тривиальна (тайпо, ренейм одной переменной,
правка комментария) — спроси Alexey: «достаточно ли просто фикс +
коммит, без спеки/плана?». **Не решай сам.** Решение пропустить
шаги — за Alexey.
