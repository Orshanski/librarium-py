# CLAUDE.md

## Project Overview

**Librarium** — personal family web library, self-hosted Calibre-Web replacement.
Python (FastAPI) + React (TypeScript) + SQLite.

Stack-специфичные инструкции — в `backend/CLAUDE.md` и `frontend/CLAUDE.md` (грузятся
автоматически, когда работа идёт в соответствующей подпапке).

## Architecture

- **Backend:** FastAPI, Uvicorn, SQLite (WAL), JWT auth (bcrypt + PyJWT)
- **Frontend:** React 19, TypeScript, Vite, React Router 7, inline CSS
- **Pattern:** React SPA → fetch /api/* → FastAPI routers → DAL → SQLite
- **Auth:** JWT in HTTP-only cookie, roles: admin / reader

### Data Flow

```
Browser → React SPA (:5173 dev) → fetch /api/* → FastAPI (:8000) → DAL → SQLite
                                                                    → filesystem (data/)
```

`data/` — SQLite DB, library files, thumbs, uploads (gitignored).

## Development Process

### Порядок разработки (ОБЯЗАТЕЛЬНЫЙ)

**Правило: после любого артефакта — ревью.** Артефакт = спека, план, код. Код-ревью
дополнительно запускается после коммита (проверка кода относительно спеки + findings).

1. **Спека.** Написать design-doc в `project_documentation/specs/YYYY-MM-DD-<topic>-design.md` (директория в gitignore — не коммитится).
2. **Ревью спеки.** Запустить ревьюера, показать Alexey ВСЕ findings.
3. **Фикс спеки.** Исправить по findings + утверждение Alexey.
4. **План.** `superpowers:writing-plans` — детальный, поэтапный, TDD. Файл: `project_documentation/plans/YYYY-MM-DD-<topic>.md`.
5. **Ревью плана.** Запустить ревьюера, показать Alexey ВСЕ findings.
6. **Фикс плана.** Исправить + утверждение Alexey.
7. **Ветка.** Создать feature branch от main.
8. **Тесты.** Написать тесты ПЕРЕД реализацией (TDD).
9. **Реализация.** Код, прогон тестов.
10. **Ручное тестирование.** Alexey проверяет руками. Ждать результат.
11. **Коммит.** Только после одобрения Alexey.
12. **Спек-ревью кода.** Запустить ревьюера на соответствие кода спеке, показать ВСЕ findings. **После каждого атомарного коммита кода**, не только в финале. Дополнительно — финальный sweep-ревью всей ветки перед мержем (шаг 15).
13. **Код-ревью.** Запустить ревьюера на качество кода, показать ВСЕ findings. **После каждого атомарного коммита кода**, не только в финале. Финальный sweep-ревью всей ветки — отдельный проход перед мержем.
14. **Фикс findings.** **Любой** finding из ревью (Critical / Important / Minor / Issue / Note / Concern — любая серьёзность) — fix-коммит в этой же задаче ПЕРЕД переходом к следующей задаче. Закрывается только ✅ Approved без issues. «Approved с Minor» = НЕ approved, fixим Minor. Архитектурные вопросы (изменение существующего поведения, scope, контракт API, выбор между несколькими валидными подходами, спор с планом) — поднимаются Alexey'ю по одному (см. правило «Findings — по одному»). Stylistic / явные ошибки (type violation в фикстуре, missing assertion, misleading docstring, dead code, field ordering, redundant fallback) — fix-коммит молча, отчёт постфактум. Fix-коммит тоже проходит CR (см. шаги 12–13).
15. **Мерж.** ТОЛЬКО по явной команде Alexey ("мержи", "мерж", "да").
16. **Пуш.** ТОЛЬКО по явной команде Alexey. Мерж ≠ пуш, разрешение на каждое действие отдельно.

### Правила

- **НЕ СПОРИТЬ с Alexey.** Если Alexey говорит что что-то не работает/сломано — СНАЧАЛА проверить, потом отвечать. Не доверять своим предположениям, доверять фактам. Не говорить "нет, это работает" без проверки.
- **Показывать ВСЕ findings из код-ревью.** Не фильтровать, не предлагать "отложить". Решение о приоритете — только за Alexey.
- **НИКОГДА не мержить/пушить без явного разрешения.** При любой двусмысленности — переспросить.
- **Never work in main.** Always create a feature branch.
- **TDD:** tests first, then implementation.
- CI/CD triggers only on push to `main` on GitHub. Local branch work does not deploy.
- **НИКОГДА не запускать тесты параллельно.** Backend pytest и frontend vitest — строго последовательно, по одному прогону за раз. Несколько pytest одновременно — запрещено. Параллельный запуск даёт ложные failures из-за общего state (SQLite, temp-файлы, auth-кэш) и делает coverage недостоверным: упавшие из-за гонок тесты не покрывают свои code paths. Если в выводе видны db-locks, shutil-races или рандомные 401 — первое подозрение всегда «опять запустил параллельно».
- **Pre-existing findings из ревью фиксим в том же тикете.** Если ревьюер нашёл проблему, которая уже была в коде до твоих правок — фиксим её **сейчас**, в той же ветке, той же задаче. Открытие нового beads для отложения — только если фикс требует **архитектурного дизайна** (отдельная спека, обсуждение scope на несколько модулей/страниц/слоёв). Узкий копипаст-fix (тот же паттерн, что только что сделали для другого entity; одна-две строки + регрессионный тест) — фиксим, не откладываем. Критерий «нужна архитектура» = «придётся писать спеку с brainstorming'ом, чтобы выбрать подход». Если в голове крутится «отложу в beads, потом разберусь» — это сигнал что ты подгоняешь под отсрочку, а не оцениваешь scope честно.
- **Findings — по одному.** Когда ревьюер вернул список findings, не вываливать его одним длинным сообщением. Идти: один finding → одно сообщение Alexey'ю → его решение → следующий. Для каждого включить серьёзность, источник (file:line), мою рекомендацию по фиксу. Stylistic findings, у которых единственный очевидный fix — НЕ выносить на согласование, fix-коммит молча, отчёт постфактум. Архитектурные — обязательно через Alexey. Это правило усиливает «Фикс findings»: гарантия дисциплины + защита от «закрыл оптом и пропустил».
- **Diagnostic в IDE ≠ кэш по умолчанию.** При появлении type-diagnostic'а в IDE (✘ ошибки, ★ warnings/hints) НЕ объявлять его «cache» автоматически. Обязательная тройная проверка перед вердиктом: (1) CLI прогон — `cd frontend && npx tsc --noEmit` или `pyright <path>` от корня репо; (2) LSP-инспекция затронутого символа — `documentSymbol` / `hover` / `findReferences`; (3) проверить `include` chain в `tsconfig.json` / `pyrightconfig.json` — если файл исключён из CLI scope (как `tests/` исключены из backend pyright), но IDE его проверяет шире, diagnostic **реальный**, не кэш, и подлежит fix'у наравне с CLI-error'ами. «Cache» как вердикт допустим только когда все три проверки подтверждают чистое состояние И есть наблюдаемое расхождение между IDE и CLI на одном и том же символе.
- **Verify-prompt-claims.** Перед тем как написать в prompt'е implementer/reviewer-subagent'у утверждение типа «runtime identical», «безопасный refactor», «совместимо», «одно и то же поведение» — провести верификацию через LSP/Read того конфига или типа, который обосновывает утверждение. Implementer выполняет prompt буквально; если ставишь ложную предпосылку, либо implementer прокурит инструкцию (правильно), либо сломает поведение (хуже). Конкретный кейс: «UpdateBookBody принимает snake_case kwargs» требует проверки `BODY_CONFIG.populate_by_name` ДО prompt'a, не после.
- **Использовать LSP для семантической верификации, не grep.** Когда нужно подтвердить наличие/отсутствие символа, использования функции, контракта API — использовать LSP-операции через инструмент `LSP`, а не текстовый grep. LSP смотрит на AST/индекс — видит реальный экспорт/импорт/вызов, не текстовое совпадение в комментариях, import-именах или строках тестов. Grep остаётся только для проверки **отсутствия** конкретного текстового шаблона в одном файле, где LSP не даёт прямого ответа. Read — для инспекции тела функции или дифф-сверки. Правило применяется и в финальной верификации планов («соответствует ли результат критериям готовности?»), и в ad-hoc проверках («где используется X?», «существует ли символ Y?»). **Конкретные LSP-операции и language servers — в stack-специфичных файлах: `frontend/CLAUDE.md` (TypeScript) и `backend/CLAUDE.md` (Python).**
- **Не запускать тесты «на baseline» перед началом работы.** Прогон полного тест-сьюта перед стартом задачи (feature, рефакторинг, баг) — пустая трата времени: main коммитит зелёным (CI блокирует красный), а первая же реальная правка по TDD-циклу даст текущее состояние. «Baseline-прогон» добавляет минуты, не открывая никакой информации, которой не было до него. Тесты гоняются: (а) внутри TDD-цикла — после написания red-теста (ожидание FAIL) и после реализации (ожидание PASS); (б) перед коммитом фичи — финальный прогон всего сьюта для регрессий; (в) если есть **конкретное подозрение**, что main красный (например, после bumb'а зависимостей, миграции конфигов или непонятной ошибки сборки). Никакого «прогоним сначала на всякий случай».
- **В Telegram-режиме отчёт после каждого этапа.** Если Alexey переключил коммуникацию в Telegram (явной фразой вроде «продолжаем в Telegram» или работа явно ведётся через Telegram), каждый завершённый этап/коммит сопровождается коротким отчётом в Telegram: что сделано, какие тесты прошли, какой commit-id, что дальше. Молчание после нескольких этапов = нарушение workflow: Alexey теряет видимость прогресса и не может скорректировать курс. Принцип «один этап — один отчёт» работает и для CR — анонсировать запуск и показывать findings сразу же. Это правило усиливает существующее [feedback_notify_review_runs_telegram] до универсального: не только ревью, но и каждый этап работы.
- **Push в origin — только поведенческие изменения.** Push в `origin/main` инициируется, когда в local main есть бизнес-функционал, заслуживающий деплоя: фича, fix, рефакторинг кода приложения. Чистые правки `CLAUDE.md`, frontend/backend конвенций, скриптов harness'а, hooks-конфигов — **не повод для push'а сами по себе**. Они накапливаются локально и едут в origin вместе с ближайшим feature/fix мержем (CI всё равно триггерится только бизнесом — лишний push на чистом CLAUDE.md гонит pipeline впустую). Не предлагать «push?» после коммита, который трогает только инфраструктуру/процессы. Исключение — критичные harness-правки, которые сразу нужны на другом устройстве: в этом случае push осознанный, по явной команде Alexey, с обоснованием.

## Project Hooks (`.claude/`)

Активные hooks (см. `.claude/settings.json`):

- **`SessionStart` → `.claude/hooks/lsp-rule.sh`** — впрыскивает в session context таблицу LSP-операций (hover/goToDefinition/findReferences/documentSymbol/workspaceSymbol/prepareCallHierarchy) и список language servers (pyright + tsserver). Гарантирует что инструмент по умолчанию для работы с кодом — LSP, не grep, с первого хода новой сессии.
- **`SessionStart` → `bd prime`** — загружает beads workflow context.
- **`Stop` → `.claude/hooks/forbid-skip-excuse.sh`** — блокирует завершение turn'а, если в последнем assistant-сообщении встречается фраза-маркер отмазочного пропуска finding'а (regex `pre[ -]existing`). Reason: «возвращайся и фикси». Hook — defence-in-depth поверх правил «Фикс findings» и «Findings — по одному»: правила определяют поведение, hook делает невидимую при словесном следовании отмазку механически невозможной. **Не отключать без явной команды Alexey** — это пуленепробиваемая часть workflow.
- **`PreToolUse` (Bash) → guards для sonar-scanner и push-reflection** — см. settings.json.
- **`PreCompact` → `bd prime`** — освежает beads context перед compaction.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Do NOT use `bd remember` as general/project memory; beads are only for task tracking
- Store assistant preferences, workflow rules, and reusable knowledge via Hermes memory/skills instead
- Run `bd prime` for detailed command reference

## Session Completion

**When ending a work session**, complete these steps:

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **bd dolt push** - Push beads data to remote
5. **Hand off** - Provide context for next session
6. **Мерж/пуш** - ТОЛЬКО по явной команде Alexey (см. "Порядок разработки" выше)
<!-- END BEADS INTEGRATION -->
