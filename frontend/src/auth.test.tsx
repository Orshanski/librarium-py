// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { render, screen, waitFor } from "@testing-library/react";
import { server } from "./test/msw/server";
import { AuthProvider, useAuth } from "./auth";

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

  it("stale schema in localStorage → cached value ignored, falls back to anon when offline", async () => {
    // Write a legacy entry without schemaVersion (simulates old cached format)
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

  it("valid schema in localStorage → cached user restored when offline", async () => {
    // Write a valid versioned entry
    localStorage.setItem(
      AUTH_KEY,
      JSON.stringify({
        schemaVersion: 1,
        user: { id: 5, username: "cached_user", displayName: "Cached", email: null, role: "reader" },
      }),
    );

    // Simulate offline condition (network error, not just 401)
    server.use(
      http.get("/api/auth/me", () => {
        throw new Error("Network offline");
      }),
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
    expect(screen.getByTestId("user")).toHaveTextContent("Cached");

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
