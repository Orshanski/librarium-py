// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import { domainEvents } from "@/domain/events";
import EntityAdminPanel from "./entity-admin-panel";

// Default /api/auth/me returns admin (from defaultHandlers in handlers.ts)
// Default /api/authors and /api/series for entity list
const defaultAuthorsList = [
  { id: 1, name: "Frank Herbert", sortName: "Herbert, Frank", bookCount: 6, tags: [] },
  { id: 2, name: "Isaac Asimov", sortName: "Asimov, Isaac", bookCount: 15, tags: [] },
];

const defaultSeriesList = [
  { id: 1, name: "Dune", authors: [{ id: 1, name: "Frank Herbert" }], bookCount: 6 },
  { id: 2, name: "Foundation", authors: [{ id: 2, name: "Isaac Asimov" }], bookCount: 7 },
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

const defaultTagsList = [
  { id: 1, name: "Фэнтези" },
  { id: 2, name: "Детектив" },
];

function setupDefaultTagHandlers() {
  server.use(
    http.get("/api/filter-options/tags", () =>
      HttpResponse.json({ tags: defaultTagsList })
    )
  );
}

describe("EntityAdminPanel — tag mode", () => {
  it("uses 'жанр' / 'Жанр' localization (not 'тег')", async () => {
    setupDefaultTagHandlers();
    renderWithProviders(
      <EntityAdminPanel
        entityType="tag"
        entityId={1}
        currentName="Фэнтези"
        bookCount={5}
        onRenamed={vi.fn()}
        onMerged={vi.fn()}
        onDeleted={vi.fn()}
      />
    );
    // Should use "жанр"/"Жанр", not "тег"/"Тег"
    expect(screen.queryByText(/тег|Тег/)).toBeNull();
    expect(screen.getByText(/жанр|Жанр/i)).toBeTruthy();
  });

  it("renames tag: calls renameTag and publishes tagRenamed event", async () => {
    domainEvents.clear();
    const events: unknown[] = [];
    domainEvents.subscribe("tagRenamed", (payload) => events.push(payload));
    setupDefaultTagHandlers();
    server.use(
      http.put("/api/tags/:id", () => HttpResponse.json({ ok: true }))
    );

    const onRenamed = vi.fn();

    renderWithProviders(
      <EntityAdminPanel
        entityType="tag"
        entityId={1}
        currentName="Фэнтези"
        bookCount={5}
        onRenamed={onRenamed}
        onMerged={vi.fn()}
        onDeleted={vi.fn()}
      />
    );

    const input = screen.getByDisplayValue("Фэнтези");
    fireEvent.change(input, { target: { value: "Фантастика" } });
    fireEvent.click(screen.getByText("Сохранить"));

    await waitFor(() => {
      expect(onRenamed).toHaveBeenCalledWith("Фантастика");
      expect(events).toEqual([{ tagId: 1, name: "Фантастика" }]);
    });
  });

  it("delete button is disabled when bookCount > 0", () => {
    setupDefaultTagHandlers();
    renderWithProviders(
      <EntityAdminPanel
        entityType="tag"
        entityId={1}
        currentName="Фэнтези"
        bookCount={5}
        onRenamed={vi.fn()}
        onMerged={vi.fn()}
        onDeleted={vi.fn()}
      />
    );

    expect(screen.getByText("Удалить")).toBeDisabled();
  });

  it("delete button is enabled when bookCount === 0", () => {
    setupDefaultTagHandlers();
    renderWithProviders(
      <EntityAdminPanel
        entityType="tag"
        entityId={1}
        currentName="Фэнтези"
        bookCount={0}
        onRenamed={vi.fn()}
        onMerged={vi.fn()}
        onDeleted={vi.fn()}
      />
    );
    expect(screen.getByText("Удалить")).not.toBeDisabled();
  });

  it("deletes tag: calls deleteTag and publishes tagDeleted event", async () => {
    domainEvents.clear();
    const events: unknown[] = [];
    domainEvents.subscribe("tagDeleted", (payload) => events.push(payload));
    setupDefaultTagHandlers();
    server.use(
      http.delete("/api/tags/:id", () => HttpResponse.json({ ok: true }))
    );

    const onDeleted = vi.fn();

    renderWithProviders(
      <EntityAdminPanel
        entityType="tag"
        entityId={1}
        currentName="Фэнтези"
        bookCount={0}
        onRenamed={vi.fn()}
        onMerged={vi.fn()}
        onDeleted={onDeleted}
      />
    );

    fireEvent.click(screen.getByText("Удалить"));

    await waitFor(() => {
      expect(screen.getAllByText("Удалить").length).toBeGreaterThan(0);
    });

    const deleteBtns = screen.getAllByText("Удалить");
    fireEvent.click(deleteBtns[deleteBtns.length - 1]);

    await waitFor(() => {
      expect(onDeleted).toHaveBeenCalled();
      expect(events).toEqual([{ tagId: 1 }]);
    });
  });

  it("merges tag: calls mergeTag and publishes tagMerged event", async () => {
    domainEvents.clear();
    const events: unknown[] = [];
    domainEvents.subscribe("tagMerged", (payload) => events.push(payload));
    // defaultTagsList has {id:1, "Фэнтези"} and {id:2, "Детектив"}.
    // entityId=1 is filtered out, so "Детектив" (id=2) is the merge candidate.
    setupDefaultTagHandlers();
    server.use(
      http.post("/api/tags/:id/merge", () => HttpResponse.json({ ok: true }))
    );

    const onMerged = vi.fn();

    renderWithProviders(
      <EntityAdminPanel
        entityType="tag"
        entityId={1}
        currentName="Фэнтези"
        bookCount={5}
        onRenamed={vi.fn()}
        onMerged={onMerged}
        onDeleted={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Найти жанр-дубликат...")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText("Найти жанр-дубликат...");
    fireEvent.change(searchInput, { target: { value: "Дет" } });

    await waitFor(() => {
      expect(screen.getByText("Детектив")).toBeInTheDocument();
    });

    const mergeBtn = screen.getByText("Присоединить");
    fireEvent.click(mergeBtn);

    await waitFor(() => {
      expect(screen.getAllByText("Присоединить").length).toBeGreaterThan(0);
    });

    const confirmBtns = screen.getAllByText("Присоединить");
    fireEvent.click(confirmBtns[confirmBtns.length - 1]);

    await waitFor(() => {
      expect(onMerged).toHaveBeenCalled();
      expect(events).toEqual([{ targetId: 1, sourceId: 2 }]);
    });
  });
});

describe.each(CASES)(
  "EntityAdminPanel — $entityType mode",
  ({ entityType, apiPath, searchPlaceholder, rename, merge, emptyName }) => {
    it("calls onRenamed after successful rename", async () => {
      domainEvents.clear();
      const events: unknown[] = [];
      const eventName = entityType === "author" ? "authorRenamed" : "seriesRenamed";
      domainEvents.subscribe(eventName, (payload) => events.push(payload));
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
        expect(events).toEqual([
          entityType === "author"
            ? { authorId: 1, name: rename.to }
            : { seriesId: 1, name: rename.to },
        ]);
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
      domainEvents.clear();
      const events: unknown[] = [];
      const eventName = entityType === "author" ? "authorMerged" : "seriesMerged";
      domainEvents.subscribe(eventName, (payload) => events.push(payload));
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
        expect(events).toEqual([{ targetId: 1, sourceId: 2 }]);
      });
    });

    it("calls onDeleted after successful delete (no books)", async () => {
      domainEvents.clear();
      const events: unknown[] = [];
      const eventName = entityType === "author" ? "authorDeleted" : "seriesDeleted";
      domainEvents.subscribe(eventName, (payload) => events.push(payload));
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
        expect(events).toEqual([
          entityType === "author" ? { authorId: 1 } : { seriesId: 1 },
        ]);
      });
    });
  }
);
