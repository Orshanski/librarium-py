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
