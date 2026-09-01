// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { render, screen, waitFor } from "@testing-library/react";
import { server } from "./test/msw/server";
import { AuthProvider, useAuth } from "./auth";
import "fake-indexeddb/auto";
import userEvent from "@testing-library/user-event";
import { initDB, _resetDB, saveProgress, getProgress } from "./utils/offline-storage";
import { metadataCache } from "./cache";
import { STORAGE_PREFIX } from "./cache/storage/persistence";

// Consumer renders the `loading` state explicitly so tests can distinguish
// "initial render before fetch completes" from "fetch done, anon result".
// Without this sentinel, `waitFor("anon")` would pass trivially before MSW
// ever sees the request (since user starts as null on first paint).
function Consumer() {
  const { user, loading } = useAuth();
  if (loading) return <div data-testid="user">loading</div>;
  return (
    <div data-testid="user">
      {user ? user.displayName ?? user.username : "anon"}
    </div>
  );
}

function renderAuth() {
  return render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>
  );
}

const AUTH_KEY = "librarium_user";

describe("auth provider — localStorage schema invalidation (jrx.17)", () => {
  // localStorage is stubbed globally per-test in src/test/setup.ts with a
  // fresh in-memory fake, so no local beforeEach is needed.

  it("stale schema in localStorage → stored value ignored, falls back to anon when offline", async () => {
    // Write a legacy entry without schemaVersion (simulates old stored format)
    localStorage.setItem(
      AUTH_KEY,
      JSON.stringify({ id: 99, username: "stale_user", displayName: "Stale", email: null, role: "reader" }),
    );

    // Simulate offline + 401
    server.use(http.get("/api/auth/me", () => new HttpResponse(null, { status: 401 })));

    // Patch navigator.onLine to false for this test
    Object.defineProperty(navigator, "onLine", { value: false, writable: true, configurable: true });

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    // Should NOT restore stale user — schema mismatch → anon
    await waitFor(() =>
      expect(screen.getByTestId("user")).not.toHaveTextContent("loading"),
    );
    expect(screen.getByTestId("user")).toHaveTextContent("anon");

    // Restore navigator.onLine
    Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
  });

  it("valid schema in localStorage → stored user restored when offline", async () => {
    // Write a valid versioned entry
    localStorage.setItem(
      AUTH_KEY,
      JSON.stringify({
        schemaVersion: 1,
        user: { id: 5, username: "stored_user", displayName: "Stored", email: null, role: "reader" },
      }),
    );

    // Simulate offline condition (network error, not just 401). MSW v2: use
    // HttpResponse.error() — throwing inside a handler triggers an
    // "unhandled exception during handler lookup" warning in the test log.
    server.use(
      http.get("/api/auth/me", () => HttpResponse.error()),
    );

    Object.defineProperty(navigator, "onLine", { value: false, writable: true, configurable: true });

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId("user")).not.toHaveTextContent("loading"),
    );
    expect(screen.getByTestId("user")).toHaveTextContent("Stored");

    Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
  });
});

describe("auth provider — /api/auth/me", () => {
  it("sets user on 200", async () => {
    server.use(
      http.get("/api/auth/me", () =>
        HttpResponse.json({
          id: 1,
          username: "admin",
          displayName: "Admin",
          email: null,
          role: "admin",
        })
      )
    );
    renderAuth();
    // Starts as "loading", then transitions to user name.
    expect(screen.getByTestId("user")).toHaveTextContent("loading");
    await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("Admin"));
  });

  it("stays anon on 401", async () => {
    server.use(http.get("/api/auth/me", () => new HttpResponse(null, { status: 401 })));
    renderAuth();
    // Starts as "loading"; transitions to "anon" only after MSW 401 is observed.
    expect(screen.getByTestId("user")).toHaveTextContent("loading");
    await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("anon"));
  });

  it("uses username when displayName is null", async () => {
    server.use(
      http.get("/api/auth/me", () =>
        HttpResponse.json({
          id: 2,
          username: "reader42",
          displayName: null,
          email: null,
          role: "reader",
        })
      )
    );
    renderAuth();
    await waitFor(() =>
      expect(screen.getByTestId("user")).toHaveTextContent("reader42"),
    );
  });
});

// Кнопка выхода нужна тестам выхода: базовый Consumer только показывает, кто вошёл.
function LogoutConsumer() {
  const { user, loading, logout } = useAuth();
  if (loading) return <div data-testid="user">loading</div>;
  return (
    <div>
      <div data-testid="user">{user ? user.username : "anon"}</div>
      <button onClick={() => void logout()}>Выйти</button>
    </div>
  );
}

describe("auth provider — выход забывает локальные позиции чтения (wzjm)", () => {
  beforeEach(async () => {
    await initDB();
    await _resetDB();
    await initDB();
  });

  it("после выхода локальная позиция чтения удалена", async () => {
    server.use(http.post("/api/auth/logout", () => HttpResponse.json({ ok: true })));
    await saveProgress(7, { position: "epubcfi(/6/2)", fraction: 0.4, lastFormat: "epub", lastReadAt: 1 });

    render(
      <AuthProvider>
        <LogoutConsumer />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("admin"));
    await userEvent.click(screen.getByRole("button", { name: "Выйти" }));
    await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("anon"));

    await waitFor(async () => expect(await getProgress(7)).toBeNull());
  });

  it("выход при недоступном сервере тоже удаляет локальную позицию", async () => {
    server.use(http.post("/api/auth/logout", () => HttpResponse.error()));
    await saveProgress(7, { position: "epubcfi(/6/2)", fraction: 0.4, lastFormat: "epub", lastReadAt: 1 });

    render(
      <AuthProvider>
        <LogoutConsumer />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("admin"));
    await userEvent.click(screen.getByRole("button", { name: "Выйти" }));
    await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("anon"));

    await waitFor(async () => expect(await getProgress(7)).toBeNull());
  });
});

describe("auth provider — выход забывает кэш метаданных (q4fg)", () => {
  it("после выхода кэш пуст и в памяти, и в sessionStorage", async () => {
    server.use(http.post("/api/auth/logout", () => HttpResponse.json({ ok: true })));
    metadataCache.set("books", "/api/books?sort=addedDesc", { books: [{ id: 1, isRead: true, rating: 5 }] });
    // Снимок пространства, ещё не поднятый в память: чистка обязана снести и его.
    sessionStorage.setItem(STORAGE_PREFIX + "shelves", JSON.stringify({ k: { value: [], cachedAt: 1 } }));

    render(
      <AuthProvider>
        <LogoutConsumer />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("admin"));
    await userEvent.click(screen.getByRole("button", { name: "Выйти" }));
    await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("anon"));

    expect(metadataCache.get("books", "/api/books?sort=addedDesc")).toBeUndefined();
    expect(sessionStorage.getItem(STORAGE_PREFIX + "shelves")).toBeNull();
  });
});
