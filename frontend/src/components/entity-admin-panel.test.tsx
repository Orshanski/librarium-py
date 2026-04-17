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

describe("EntityAdminPanel — author mode", () => {
  it("calls onRenamed after successful rename", async () => {
    setupDefaultHandlers();
    server.use(
      http.put("/api/authors/:id", () =>
        HttpResponse.json({ ok: true })
      )
    );

    const onRenamed = vi.fn();

    renderWithProviders(
      <EntityAdminPanel
        entityType="author"
        entityId={1}
        currentName="Frank Herbert"
        bookCount={6}
        onRenamed={onRenamed}
        onMerged={() => {}}
        onDeleted={() => {}}
      />
    );

    const input = screen.getByDisplayValue("Frank Herbert");
    fireEvent.change(input, { target: { value: "Frank P. Herbert" } });

    const saveBtn = screen.getByText("Сохранить");
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(onRenamed).toHaveBeenCalledWith("Frank P. Herbert");
    });
  });

  it("does not call onRenamed when rename request fails", async () => {
    setupDefaultHandlers();
    server.use(
      http.put("/api/authors/:id", () =>
        HttpResponse.json({ detail: "Server error" }, { status: 500 })
      )
    );

    const onRenamed = vi.fn();

    renderWithProviders(
      <EntityAdminPanel
        entityType="author"
        entityId={1}
        currentName="Frank Herbert"
        bookCount={6}
        onRenamed={onRenamed}
        onMerged={() => {}}
        onDeleted={() => {}}
      />
    );

    const input = screen.getByDisplayValue("Frank Herbert");
    fireEvent.change(input, { target: { value: "Frank P. Herbert" } });

    const saveBtn = screen.getByText("Сохранить");
    fireEvent.click(saveBtn);

    // Give it time to settle — onRenamed should NOT be called
    await waitFor(() => {
      expect(screen.getByText("Сохранить")).toBeInTheDocument();
    });
    expect(onRenamed).not.toHaveBeenCalled();
  });

  it("calls onMerged after successful author merge", async () => {
    setupDefaultHandlers();
    server.use(
      http.post("/api/authors/:id/merge", () =>
        HttpResponse.json({ ok: true })
      )
    );

    const onMerged = vi.fn();

    renderWithProviders(
      <EntityAdminPanel
        entityType="author"
        entityId={1}
        currentName="Frank Herbert"
        bookCount={6}
        onRenamed={() => {}}
        onMerged={onMerged}
        onDeleted={() => {}}
      />
    );

    // Wait for entity list to load
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Найти автора-дубликат...")).toBeInTheDocument();
    });

    // Search for a duplicate
    const searchInput = screen.getByPlaceholderText("Найти автора-дубликат...");
    fireEvent.change(searchInput, { target: { value: "Isaac" } });

    await waitFor(() => {
      expect(screen.getByText("Isaac Asimov")).toBeInTheDocument();
    });

    // Click merge button for found author
    const mergeBtn = screen.getByText("Присоединить");
    fireEvent.click(mergeBtn);

    // Confirm the dialog
    await waitFor(() => {
      const confirmBtn = screen.getAllByText("Присоединить");
      // The confirm dialog button
      expect(confirmBtn.length).toBeGreaterThan(0);
    });

    // Click confirm in the dialog — find the confirm button
    const confirmBtns = screen.getAllByText("Присоединить");
    const confirmBtn = confirmBtns[confirmBtns.length - 1];
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(onMerged).toHaveBeenCalled();
    });
  });

  it("calls onDeleted after successful author delete (no books)", async () => {
    setupDefaultHandlers();
    server.use(
      http.delete("/api/authors/:id", () =>
        HttpResponse.json({ ok: true })
      )
    );

    const onDeleted = vi.fn();

    renderWithProviders(
      <EntityAdminPanel
        entityType="author"
        entityId={1}
        currentName="Empty Author"
        bookCount={0}
        onRenamed={() => {}}
        onMerged={() => {}}
        onDeleted={onDeleted}
      />
    );

    const deleteBtn = screen.getByText("Удалить");
    fireEvent.click(deleteBtn);

    // Confirm dialog appears
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
});

describe("EntityAdminPanel — series mode", () => {
  it("calls onRenamed after successful series rename", async () => {
    setupDefaultHandlers();
    server.use(
      http.put("/api/series/:id", () =>
        HttpResponse.json({ ok: true })
      )
    );

    const onRenamed = vi.fn();

    renderWithProviders(
      <EntityAdminPanel
        entityType="series"
        entityId={1}
        currentName="Dune"
        bookCount={6}
        onRenamed={onRenamed}
        onMerged={() => {}}
        onDeleted={() => {}}
      />
    );

    const input = screen.getByDisplayValue("Dune");
    fireEvent.change(input, { target: { value: "Dune Chronicles" } });

    const saveBtn = screen.getByText("Сохранить");
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(onRenamed).toHaveBeenCalledWith("Dune Chronicles");
    });
  });

  it("does not call onRenamed when series rename request fails", async () => {
    setupDefaultHandlers();
    server.use(
      http.put("/api/series/:id", () =>
        HttpResponse.json({ detail: "Server error" }, { status: 500 })
      )
    );

    const onRenamed = vi.fn();

    renderWithProviders(
      <EntityAdminPanel
        entityType="series"
        entityId={1}
        currentName="Dune"
        bookCount={6}
        onRenamed={onRenamed}
        onMerged={() => {}}
        onDeleted={() => {}}
      />
    );

    const input = screen.getByDisplayValue("Dune");
    fireEvent.change(input, { target: { value: "Dune Chronicles" } });

    const saveBtn = screen.getByText("Сохранить");
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText("Сохранить")).toBeInTheDocument();
    });
    expect(onRenamed).not.toHaveBeenCalled();
  });

  it("calls onMerged after successful series merge", async () => {
    setupDefaultHandlers();
    server.use(
      http.post("/api/series/:id/merge", () =>
        HttpResponse.json({ ok: true })
      )
    );

    const onMerged = vi.fn();

    renderWithProviders(
      <EntityAdminPanel
        entityType="series"
        entityId={1}
        currentName="Dune"
        bookCount={6}
        onRenamed={() => {}}
        onMerged={onMerged}
        onDeleted={() => {}}
      />
    );

    // Wait for series list to load
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Найти серию-дубликат...")).toBeInTheDocument();
    });

    // Search for a duplicate
    const searchInput = screen.getByPlaceholderText("Найти серию-дубликат...");
    fireEvent.change(searchInput, { target: { value: "Foundation" } });

    await waitFor(() => {
      expect(screen.getByText("Foundation")).toBeInTheDocument();
    });

    // Click merge button for found series
    const mergeBtn = screen.getByText("Присоединить");
    fireEvent.click(mergeBtn);

    // Confirm the dialog
    await waitFor(() => {
      const confirmBtns = screen.getAllByText("Присоединить");
      expect(confirmBtns.length).toBeGreaterThan(0);
    });

    const confirmBtns = screen.getAllByText("Присоединить");
    const confirmBtn = confirmBtns[confirmBtns.length - 1];
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(onMerged).toHaveBeenCalled();
    });
  });

  it("calls onDeleted after successful series delete (no books)", async () => {
    setupDefaultHandlers();
    server.use(
      http.delete("/api/series/:id", () =>
        HttpResponse.json({ ok: true })
      )
    );

    const onDeleted = vi.fn();

    renderWithProviders(
      <EntityAdminPanel
        entityType="series"
        entityId={1}
        currentName="Empty Series"
        bookCount={0}
        onRenamed={() => {}}
        onMerged={() => {}}
        onDeleted={onDeleted}
      />
    );

    const deleteBtn = screen.getByText("Удалить");
    fireEvent.click(deleteBtn);

    // Confirm dialog appears
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
});
