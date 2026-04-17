// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { render, screen, waitFor } from "@testing-library/react";
import { server } from "./test/msw/server";
import { AuthProvider, useAuth } from "./auth";

function Consumer() {
  const { user } = useAuth();
  return <div data-testid="user">{user ? user.displayName ?? user.username : "anon"}</div>;
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
    await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("Admin"));
  });

  it("stays anon on 401", async () => {
    server.use(http.get("/api/auth/me", () => new HttpResponse(null, { status: 401 })));
    renderAuth();
    // Give AuthProvider a tick to complete its mount request; then assert anon.
    await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("anon"));
  });
});
