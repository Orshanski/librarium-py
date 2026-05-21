# Frontend — CLAUDE.md

React 19 + TypeScript + Vite. Конвенции, специфичные для `frontend/`.
Общие правила проекта — в корневом `CLAUDE.md`.

## Commands

```bash
cd frontend
npm run dev                # Dev server :5173 (proxy /api → :8000)
npm run build              # Production build → dist/
npm test                   # vitest — ВСЕГДА последовательно, не параллельно
npx tsc --noEmit           # Type check
```

## Key Directories

- `src/pages/` — page components
- `src/components/` — shared components (logic + types)
- `src/components/desktop/` — desktop layout components
- `src/components/mobile/` — mobile layout components
- `src/responsive.ts` — ResponsiveProvider, `useIsMobile()` (breakpoint в `theme.ts:layout.mobileBreakpoint`)
- `src/cache/` — `useCachedResource` hook + metadata cache store
- `src/hooks/` — общие hooks
- `src/theme.ts` — токены темы: `colors`, `fonts`, `layout`

## Code Rules

- **No `any` in TypeScript.** Never use `as any` or `any` type. Extend interfaces,
  add optional fields, or create union types instead.
- **Inline CSS objects.** Стили — inline-объектами, не CSS-файлами. Токены через
  `theme.ts`.
- **Responsive.** Mobile vs desktop через `useIsMobile()` из `responsive.ts`,
  не CSS media queries напрямую в компонентах.

## Vendored Code

- **`src/vendor/foliate-js/` — полный форк, не upstream vendor copy.** Upstream
  больше не тянется, апдейты от оригинального maintainer'а не забираются.
  Код под `vendor/foliate-js/` — такой же owned code, как и всё остальное во
  frontend. Править можно наравне с остальным проектным кодом. Не воспринимать
  как third-party или "untouchable vendor".
