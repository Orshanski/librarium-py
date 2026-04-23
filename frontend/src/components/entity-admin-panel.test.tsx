// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import EntityAdminPanel from "./entity-admin-panel";

// Default /api/auth/me returns admin (from defaultHandlers in handlers.ts)
// Default /api/authors and /api/series for entity list
const defaultAuthorsList = [
  { id: 1, name: "Frank Herbert", sort_name: "Herbert, Frank", book_count: 6, tags: null },
  { id: 2, name: "Isaac Asimov", sort_name: "Asimov, Isaac", book_count: 15, tags: null },
];

const defaultSeriesList = [
  { id: 1, name: "Dune", authors: "Frank Herbert", book_count: 6 },
  { id: 2, name: "Foundation", authors: "Isaac Asimov", book_count: 7 },
];

function setupDefaultHandlers() {
  server.use(
    http.get("/api/authors", () =>
      HttpResponse.json({ authors: defaultAuthorsList, tags: [], languages: [] })
    ),
    http.get("/api/series", () =>
      HttpResponse.json({ series: defaultSeriesList, authors: [], tags: [], languages: [] })
    )
  );
}

interface EntityCase {
  entityType: "author" | "series";
  apiPath: string;
  searchPlaceholder: string;
  rename: { from: string; to: string };
  merge: { searchTerm: string; foundName: string };
  emptyName: string;
}

const CASES: EntityCase[] = [
  {
    entityType: "author",
    apiPath: "/api/authors",
    searchPlaceholder: "Найти автора-дубликат...",
    rename: { from: "Frank Herbert", to: "Frank P. Herbert" },
    merge: { searchTerm: "Isaac", foundName: "Isaac Asimov" },
    emptyName: "Empty Author",
  },
  {
    entityType: "series",
    apiPath: "/api/series",
    searchPlaceholder: "Найти серию-дубликат...",
    rename: { from: "Dune", to: "Dune Chronicles" },
    merge: { searchTerm: "Foundation", foundName: "Foundation" },
    emptyName: "Empty Series",
  },
];

describe.each(CASES)(
  "EntityAdminPanel — $entityType mode",
  ({ entityType, apiPath, searchPlaceholder, rename, merge, emptyName }) => {
    it("calls onRenamed after successful rename", async () => {
      setupDefaultHandlers();
      server.use(
        http.put(`${apiPath}/:id`, () => HttpResponse.json({ ok: true }))
      );

      const onRenamed = vi.fn();

      renderWithProviders(
        <EntityAdminPanel
          entityType={entityType}
          entityId={1}
          currentName={rename.from}
          bookCount={6}
          onRenamed={onRenamed}
          onMerged={() => {}}
          onDeleted={() => {}}
        />
      );

      const input = screen.getByDisplayValue(rename.from);
      fireEvent.change(input, { target: { value: rename.to } });

      const saveBtn = screen.getByText("Сохранить");
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(onRenamed).toHaveBeenCalledWith(rename.to);
      });
    });

    it("does not call onRenamed when rename request fails", async () => {
      setupDefaultHandlers();
      server.use(
        http.put(`${apiPath}/:id`, () =>
          HttpResponse.json({ detail: "Server error" }, { status: 500 })
        )
      );

      const onRenamed = vi.fn();

      renderWithProviders(
        <EntityAdminPanel
          entityType={entityType}
          entityId={1}
          currentName={rename.from}
          bookCount={6}
          onRenamed={onRenamed}
          onMerged={() => {}}
          onDeleted={() => {}}
        />
      );

      const input = screen.getByDisplayValue(rename.from);
      fireEvent.change(input, { target: { value: rename.to } });

      const saveBtn = screen.getByText("Сохранить");
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(screen.getByText("Сохранить")).toBeInTheDocument();
      });
      expect(onRenamed).not.toHaveBeenCalled();
    });

    it("calls onMerged after successful merge", async () => {
      setupDefaultHandlers();
      server.use(
        http.post(`${apiPath}/:id/merge`, () => HttpResponse.json({ ok: true }))
      );

      const onMerged = vi.fn();

      renderWithProviders(
        <EntityAdminPanel
          entityType={entityType}
          entityId={1}
          currentName={rename.from}
          bookCount={6}
          onRenamed={() => {}}
          onMerged={onMerged}
          onDeleted={() => {}}
        />
      );

      await waitFor(() => {
        expect(screen.getByPlaceholderText(searchPlaceholder)).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(searchPlaceholder);
      fireEvent.change(searchInput, { target: { value: merge.searchTerm } });

      await waitFor(() => {
        expect(screen.getByText(merge.foundName)).toBeInTheDocument();
      });

      const mergeBtn = screen.getByText("Присоединить");
      fireEvent.click(mergeBtn);

      await waitFor(() => {
        expect(screen.getAllByText("Присоединить").length).toBeGreaterThan(0);
      });

      const confirmBtns = screen.getAllByText("Присоединить");
      const confirmBtn = confirmBtns[confirmBtns.length - 1];
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(onMerged).toHaveBeenCalled();
      });
    });

    it("calls onDeleted after successful delete (no books)", async () => {
      setupDefaultHandlers();
      server.use(
        http.delete(`${apiPath}/:id`, () => HttpResponse.json({ ok: true }))
      );

      const onDeleted = vi.fn();

      renderWithProviders(
        <EntityAdminPanel
          entityType={entityType}
          entityId={1}
          currentName={emptyName}
          bookCount={0}
          onRenamed={() => {}}
          onMerged={() => {}}
          onDeleted={onDeleted}
        />
      );

      const deleteBtn = screen.getByText("Удалить");
      fireEvent.click(deleteBtn);

      await waitFor(() => {
        expect(screen.getAllByText("Удалить").length).toBeGreaterThan(0);
      });

      const deleteBtns = screen.getAllByText("Удалить");
      const confirmDeleteBtn = deleteBtns[deleteBtns.length - 1];
      fireEvent.click(confirmDeleteBtn);

      await waitFor(() => {
        expect(onDeleted).toHaveBeenCalled();
      });
    });
  }
);
