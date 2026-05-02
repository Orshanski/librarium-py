/**
 * @fileoverview Параметризованные describe-блоки для повторяющихся mobile-тестов
 * страниц-сущностей (Author / Series / Tag). Раньше каждая страница копировала
 * один и тот же сценарий с заменой только entity-специфичных значений
 * (label / route / fixture); Sonar справедливо ругался на дубликат.
 *
 * Сценарии:
 * - `describeMobileGearAbsent(c)` — на mobile в DOM нет admin-шестерёнки,
 *   заголовок страницы виден (Acceptance #2 спеки `2026-05-01-mobile-companion`).
 * - `describeAdminPanelVanishesOnResize(c)` — desktop→mobile resize с открытой
 *   админ-панелью убирает её из DOM (Acceptance #3 той же спеки).
 *
 * Каждый describe регистрирует свои `beforeEach` / `afterEach` (sessionStorage
 * + setup/teardown viewport), поэтому callsite просто вызывает функцию
 * с case-объектом и не дублирует подготовку.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ReactElement } from "react";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Routes, Route } from "react-router-dom";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import {
  setupDesktopViewport,
  setupMobileViewport,
  triggerMatchMediaChangeToMobile,
  teardownViewport,
} from "@/test/mobile-viewport";

export interface EntityPageMobileCase {
  /** Имя страницы для описания describe-блока, например "AuthorPage". */
  label: string;
  /** Русское существительное в дательном падеже для it-описания, например "автором". */
  entityNoun: string;
  /** aria-label admin-шестерёнки, например "Управление автором". */
  gearLabel: string;
  /** Имя admin-панели для it-описания resize-теста, например "EntityAdminPanel". */
  panelComponent: string;
  /** Регекс заголовка для positive-проверки h1, например /Isaac Asimov/. */
  titleRegex: RegExp;
  /** Текст внутри открытой admin-панели, например "Переименовать". */
  panelText: string;
  /** MSW-путь detail-fetch, например "/api/authors/:id". */
  detailPath: string;
  /** MSW-путь list-fetch (вызывается при mount админ-панели), например "/api/authors". */
  listPath: string;
  /** JSON-ответ для detail-handler. */
  detailResponse: Record<string, unknown>;
  /** JSON-ответ для list-handler. */
  listResponse: Record<string, unknown>;
  /** React-Router path-pattern, например "/authors/:id". */
  routePath: string;
  /** Стартовый URL для MemoryRouter, например "/authors/42". */
  initialEntry: string;
  /** JSX страницы для рендера на route, например <AuthorPage />. */
  pageElement: ReactElement;
}

export function describeMobileGearAbsent(c: EntityPageMobileCase): void {
  describe(`${c.label} — mobile`, () => {
    beforeEach(() => {
      sessionStorage.clear();
      setupMobileViewport();
    });
    afterEach(() => teardownViewport());

    it(`шестерёнки управления ${c.entityNoun} нет в DOM, заголовок страницы есть`, async () => {
      // Подменяем /api/auth/me и поднимаем флаг — даёт сигнал, что
      // AuthProvider успел поставить user=admin до негативной проверки.
      let authResolved = false;
      server.use(
        http.get("/api/auth/me", () => {
          authResolved = true;
          return HttpResponse.json({
            id: 1,
            username: "admin",
            displayName: "Test Admin",
            email: "admin@test.local",
            role: "admin",
          });
        }),
        http.get(c.detailPath, () => HttpResponse.json(c.detailResponse)),
      );

      renderWithProviders(
        <Routes>
          <Route path={c.routePath} element={c.pageElement} />
        </Routes>,
        { initialEntries: [c.initialEntry] },
      );

      // Ждём окончания загрузки и резолва auth.
      await waitFor(() => {
        expect(screen.queryByText("Загрузка...")).not.toBeInTheDocument();
        expect(authResolved).toBe(true);
      });

      // Позитивная проверка: страница отрисовалась через MobilePageHeader (h1).
      expect(screen.getByRole("heading", { level: 1, name: c.titleRegex })).toBeInTheDocument();
      // Негативная проверка ПОСЛЕ гарантированного резолва auth.
      expect(screen.queryByLabelText(c.gearLabel)).not.toBeInTheDocument();
    });
  });
}

export function describeAdminPanelVanishesOnResize(c: EntityPageMobileCase): void {
  describe(`${c.label} — resize desktop→mobile с открытой админ-панелью`, () => {
    beforeEach(() => {
      sessionStorage.clear();
      // Подменяем matchMedia ДО render — ResponsiveProvider зарегистрирует listener на нашем stub'е.
      setupDesktopViewport();
    });
    afterEach(() => teardownViewport());

    it(`после переключения в mobile ${c.panelComponent} уходит из DOM`, async () => {
      const user = userEvent.setup();

      server.use(
        http.get(c.detailPath, () => HttpResponse.json(c.detailResponse)),
        http.get(c.listPath, () => HttpResponse.json(c.listResponse)),
      );

      renderWithProviders(
        <Routes>
          <Route path={c.routePath} element={c.pageElement} />
        </Routes>,
        { initialEntries: [c.initialEntry] },
      );

      await waitFor(() => {
        expect(screen.queryByText("Загрузка...")).not.toBeInTheDocument();
      });

      // 2) На desktop кликаем шестерёнку → открывается admin-панель.
      const gear = await screen.findByLabelText(c.gearLabel);
      await user.click(gear);

      await waitFor(() => {
        expect(screen.getByText(c.panelText)).toBeInTheDocument();
      });

      // 3) Эмулируем переключение viewport в mobile через тот же stub.
      triggerMatchMediaChangeToMobile();

      // 4) Гард `!isMobile && showAdmin && <Panel/>` срабатывает —
      //    панель уходит из DOM.
      await waitFor(() => {
        expect(screen.queryByText(c.panelText)).not.toBeInTheDocument();
      });
    });
  });
}
