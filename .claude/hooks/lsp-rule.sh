#!/usr/bin/env bash
# Injects LSP-default-mode reminder into librarium-py session context.
# Fires at SessionStart; stdout is delivered to the assistant as system context.
cat <<'EOF'

=== LSP — основной инструмент работы с кодом в librarium-py ===

Загрузить первым шагом сессии: `ToolSearch select:LSP`.

Использовать постоянно, при любой работе с кодом:

| Операция                                        | Когда применять                                                                                  |
|-------------------------------------------------|--------------------------------------------------------------------------------------------------|
| `hover`                                         | Перед использованием функции/типа — посмотреть сигнатуру и docstring, не угадывать аргументы.    |
| `goToDefinition`                                | При чтении незнакомого кода или импорта — сразу в тело, не Read 500 строк файла.                 |
| `findReferences`                                | Перед rename/refactor/удалением — видеть ВСЕ call sites, не открывать сюрпризы после правки.     |
| `documentSymbol`                                | Ориентация в файле >100 строк — структура (functions/classes) без полного Read.                  |
| `workspaceSymbol`                               | Поиск «где определён символ X» по всему проекту — мгновенный ответ.                              |
| `prepareCallHierarchy` → `incomingCalls`/`outgoingCalls` | Анализ зависимостей: кто звонит этой функции / кому звонит она.                          |
| `goToImplementation`                            | Для interfaces / abstract methods (на backend — Protocol).                                       |

Language servers (см. backend/CLAUDE.md, frontend/CLAUDE.md):
- Python: pyright (через `pyrightconfig.json` в корне).
- TypeScript: tsserver на .ts/.tsx файлах.

В Agent-prompt'ах для reviewer'ов / CR-subagent'ов — обязательный блок
с этой таблицей.

Текстовый поиск (grep, Read+match) применим к: SQL-файлам, markdown,
json/yaml configs, env vars и маркер-комментам — там, где LSP не
индексирует содержимое.

EOF
