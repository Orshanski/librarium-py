// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import AdminPage from "./AdminPage";
import type { UpdateUserBody } from "../api/endpoints/admin";

const ADMIN_USER = {
  id: 1,
  username: "admin",
  display_name: "Test Admin",
  email: "admin@test.local",
  role: "admin" as const,
};

const READER_USER = {
  id: 2,
  username: "reader",
  display_name: "Test Reader",
  email: "reader@test.local",
  role: "reader" as const,
};

const DEFAULT_SETTINGS = {
  app_name: "Librarium",
  smtp_host: "",
  smtp_port: "587",
  smtp_user: "",
  smtp_pass: "",
};

function setupDefaultHandlers() {
  server.use(
    http.get("/api/admin/users", () =>
      HttpResponse.json({ users: [ADMIN_USER, READER_USER] })
    ),
    http.get("/api/admin/settings", () =>
      HttpResponse.json(DEFAULT_SETTINGS)
    )
  );
}

describe("AdminPage", () => {
  beforeEach(() => {
    vi.spyOn(window, "alert").mockImplementation(() => {});
  });

  describe("List users", () => {
    it("renders user list on mount", async () => {
      setupDefaultHandlers();
      renderWithProviders(<AdminPage />);

      await waitFor(() => {
        expect(screen.getAllByText("Test Admin").length).toBeGreaterThan(0);
        expect(screen.getByText("Test Reader")).toBeInTheDocument();
      });
    });

    it("shows admin role badge", async () => {
      setupDefaultHandlers();
      renderWithProviders(<AdminPage />);

      await waitFor(() => {
        expect(screen.getAllByText("admin").length).toBeGreaterThan(0);
      });
    });
  });

  describe("Create user", () => {
    it("adds new user to list on successful creation", async () => {
      setupDefaultHandlers();
      const user = userEvent.setup();

      server.use(
        http.post("/api/admin/users", () =>
          HttpResponse.json({ id: 3 })
        )
      );

      renderWithProviders(<AdminPage />);

      // Wait for page to load (reader user is only in the user list, not the header)
      await waitFor(() => screen.getByText("Test Reader"));

      // Open new user form
      await user.click(screen.getByText("+ Добавить пользователя"));

      // Fill in the form by placeholder
      const usernameInput = screen.getByPlaceholderText("username");
      const displayNameInput = screen.getByPlaceholderText("Как показывать");
      await user.type(usernameInput, "newuser");
      await user.type(displayNameInput, "New User");

      // Fill passwords (type=password inputs)
      const passwordInputs = document.querySelectorAll('input[type="password"]');
      await user.type(passwordInputs[0] as HTMLElement, "password123");
      await user.type(passwordInputs[1] as HTMLElement, "password123");

      // Click create button
      await user.click(screen.getByRole("button", { name: "Создать" }));

      await waitFor(() => {
        expect(screen.getByText("New User")).toBeInTheDocument();
      });
    });
  });

  describe("Delete user (self — 400 error)", () => {
    it("shows alert when trying to delete self, keeps user in list", async () => {
      // Simulate the session user being id=1. We render a list where id=1
      // is a reader (so the delete button is visible), and DELETE /api/admin/users/1
      // returns 400 "Нельзя удалить самого себя" — exactly what the backend
      // does when the session user tries to remove their own account.
      const SELF_USER = { id: 1, username: "admin", display_name: "Test Admin", email: "admin@test.local", role: "reader" as const };
      server.use(
        http.get("/api/admin/users", () =>
          HttpResponse.json({ users: [SELF_USER] })
        ),
        http.get("/api/admin/settings", () =>
          HttpResponse.json(DEFAULT_SETTINGS)
        ),
        http.delete("/api/admin/users/1", () =>
          HttpResponse.json(
            { detail: "Нельзя удалить самого себя" },
            { status: 400 }
          )
        )
      );

      const user = userEvent.setup();
      renderWithProviders(<AdminPage />);
      await waitFor(() => screen.getByRole("button", { name: "Удалить" }));

      // Click Delete on the self user (id=1)
      await user.click(screen.getByRole("button", { name: "Удалить" }));

      // Confirm dialog — click confirm
      await waitFor(() => screen.getByText("Удалить пользователя?"));
      await user.click(screen.getByTestId("confirm-dialog-submit"));

      // Alert should have been called with error message
      await waitFor(() => {
        expect(window.alert).toHaveBeenCalledWith("Нельзя удалить самого себя");
      });

      // User should still be in the list
      expect(screen.getAllByText("Test Admin").length).toBeGreaterThan(0);
    });

    it("removes user from list on successful delete", async () => {
      setupDefaultHandlers();
      const user = userEvent.setup();

      server.use(
        http.delete("/api/admin/users/2", () =>
          HttpResponse.json({ ok: true })
        )
      );

      renderWithProviders(<AdminPage />);
      await waitFor(() => screen.getByText("Test Reader"));

      await user.click(screen.getByRole("button", { name: "Удалить" }));
      await waitFor(() => screen.getByText("Удалить пользователя?"));
      await user.click(screen.getByTestId("confirm-dialog-submit"));

      await waitFor(() => {
        expect(screen.queryByText("Test Reader")).not.toBeInTheDocument();
      });
    });
  });

  describe("Update user", () => {
    it("updateUser: PUT body has correct shape when display name is saved", async () => {
      setupDefaultHandlers();
      const user = userEvent.setup();
      let capturedBody: UpdateUserBody | null = null;

      server.use(
        http.put("/api/admin/users/:id", async ({ request }) => {
          capturedBody = await request.json() as UpdateUserBody;
          return HttpResponse.json({ ok: true });
        })
      );

      renderWithProviders(<AdminPage />);
      await waitFor(() => screen.getByText("Test Reader"));

      // Open name edit for the reader user (only reader has "Имя" button visible alongside "Удалить")
      const nameButtons = screen.getAllByRole("button", { name: "Имя" });
      await user.click(nameButtons[nameButtons.length - 1]);

      // The edit panel opens — clear the field and type a new name
      await waitFor(() => screen.getByDisplayValue("Test Reader"));
      const nameInput = screen.getByDisplayValue("Test Reader");
      await user.clear(nameInput);
      await user.type(nameInput, "New Name");

      await user.click(screen.getByRole("button", { name: "Сохранить" }));

      await waitFor(() => {
        expect(capturedBody).toEqual({ displayName: "New Name" });
      });
    });
  });

  describe("Settings save", () => {
    it("calls PUT /api/admin/settings with updated app_name", async () => {
      setupDefaultHandlers();
      const user = userEvent.setup();
      let capturedBody: unknown = null;

      server.use(
        http.put("/api/admin/settings", async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({ ok: true });
        })
      );

      renderWithProviders(<AdminPage />);
      await waitFor(() => screen.getByText("Настройки"));

      // Wait for settings to load (app_name field to have value)
      await waitFor(() => {
        const input = screen.getByDisplayValue("Librarium");
        expect(input).toBeInTheDocument();
      });

      // Clear and type new app name
      const appNameInput = screen.getByDisplayValue("Librarium");
      await user.clear(appNameInput);
      await user.type(appNameInput, "My Library");

      await user.click(screen.getByRole("button", { name: /Сохранить настройки/ }));

      await waitFor(() => {
        expect(capturedBody).toMatchObject({ app_name: "My Library" });
      });
    });
  });

  describe("SMTP test", () => {
    it("happy path: saves settings then calls smtp-test, shows ok status", async () => {
      setupDefaultHandlers();
      const user = userEvent.setup();

      server.use(
        http.put("/api/admin/settings", () => HttpResponse.json({ ok: true })),
        http.post("/api/admin/smtp-test", () => HttpResponse.json({ ok: true }))
      );

      renderWithProviders(<AdminPage />);
      await waitFor(() => screen.getByText("Проверить подключение"));

      await user.click(screen.getByRole("button", { name: "Проверить подключение" }));

      await waitFor(() => {
        expect(screen.getByText("Подключено")).toBeInTheDocument();
      });
    });

    it("error path: smtp-test 502 shows error message", async () => {
      setupDefaultHandlers();
      const user = userEvent.setup();

      server.use(
        http.put("/api/admin/settings", () => HttpResponse.json({ ok: true })),
        http.post("/api/admin/smtp-test", () =>
          HttpResponse.json(
            { detail: "Не удалось отправить тестовое письмо" },
            { status: 502 }
          )
        )
      );

      renderWithProviders(<AdminPage />);
      await waitFor(() => screen.getByText("Проверить подключение"));

      await user.click(screen.getByRole("button", { name: "Проверить подключение" }));

      await waitFor(() => {
        expect(
          screen.getByText("Не удалось отправить тестовое письмо")
        ).toBeInTheDocument();
      });
    });
  });
});
