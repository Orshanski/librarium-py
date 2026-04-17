// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import LoginPage from "./LoginPage";

describe("LoginPage — integration", () => {
  it("logs in with correct credentials", async () => {
    server.use(
      http.post("/api/auth/login", () =>
        HttpResponse.json({
          ok: true,
          user: {
            id: 1,
            username: "admin",
            displayName: "Admin",
            email: null,
            role: "admin",
          },
        })
      ),
      // After login, AuthProvider typically does getMe — mock it too.
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

    renderWithProviders(<LoginPage />, { initialEntries: ["/login"] });

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/Имя пользователя/), "admin");
    await user.type(screen.getByPlaceholderText(/Пароль/), "admin123");
    const submit = screen.getByRole("button", { name: /Войти/ });
    await user.click(submit);

    // Settle-gate: button is disabled during the in-flight request (loading=true)
    // and re-enabled once the provider returns. Without waiting for that
    // transition the "no error" assertion below would pass trivially at t=0.
    await waitFor(() => expect(submit).not.toBeDisabled());

    // Error message must NOT appear on happy path.
    expect(screen.queryByText(/неверн|invalid|ошибка/i)).not.toBeInTheDocument();
  });

  it("shows inline error on 401", async () => {
    server.use(
      http.post("/api/auth/login", () =>
        HttpResponse.json({ detail: "Invalid credentials" }, { status: 401 })
      )
    );

    renderWithProviders(<LoginPage />, { initialEntries: ["/login"] });

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/Имя пользователя/), "admin");
    await user.type(screen.getByPlaceholderText(/Пароль/), "wrong");
    await user.click(screen.getByRole("button", { name: /Войти/ }));

    // Inline error visible — не alert, не silent.
    await waitFor(() =>
      expect(screen.getByText(/неверн|invalid credentials/i)).toBeInTheDocument()
    );
  });
});
