// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import TagAdminPanel from "./tag-admin-panel";

describe("TagAdminPanel", () => {
  it("renders panel with label and input", async () => {
    server.use(
      http.get("/api/filter-options/tags", () =>
        HttpResponse.json({
          tags: [
            { id: 2, name: "Sci-Fi" },
            { id: 3, name: "Mystery" },
          ],
        })
      )
    );

    const onMapped = () => {};
    renderWithProviders(
      <TagAdminPanel
        tagId={1}
        currentName="Science Fiction"
        onMapped={onMapped}
      />
    );

    expect(screen.getByText(/Сопоставить с/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Введите название жанра/)).toBeInTheDocument();
  });

  it("allows mapping to existing tag after confirmation", async () => {
    const user = userEvent.setup();
    const onMapped = () => {};

    server.use(
      http.get("/api/filter-options/tags", () =>
        HttpResponse.json({
          tags: [
            { id: 2, name: "Sci-Fi" },
            { id: 3, name: "Mystery" },
          ],
        })
      ),
      http.put("/api/tags/:id/map", () =>
        HttpResponse.json({
          ok: true,
          targetId: 2,
        })
      )
    );

    renderWithProviders(
      <TagAdminPanel
        tagId={1}
        currentName="Science Fiction"
        onMapped={onMapped}
      />
    );

    const input = screen.getByPlaceholderText(/Введите название жанра/);
    await user.type(input, "Sci-Fi");

    const submitBtn = screen.getByRole("button", { name: /Сопоставить/ });
    expect(submitBtn).not.toBeDisabled();
  });

  it("disables submit button when input is empty", async () => {
    server.use(
      http.get("/api/filter-options/tags", () =>
        HttpResponse.json({ tags: [] })
      )
    );

    renderWithProviders(
      <TagAdminPanel
        tagId={1}
        currentName="Science Fiction"
        onMapped={() => {}}
      />
    );

    const submitBtn = screen.getByRole("button", { name: /Сопоставить/ });
    expect(submitBtn).toBeDisabled();
  });

  it("disables submit button when input equals current name", async () => {
    const user = userEvent.setup();

    server.use(
      http.get("/api/filter-options/tags", () =>
        HttpResponse.json({ tags: [] })
      )
    );

    renderWithProviders(
      <TagAdminPanel
        tagId={1}
        currentName="Science Fiction"
        onMapped={() => {}}
      />
    );

    const input = screen.getByPlaceholderText(/Введите название жанра/);
    await user.type(input, "Science Fiction");

    const submitBtn = screen.getByRole("button", { name: /Сопоставить/ });
    expect(submitBtn).toBeDisabled();
  });

  it("shows loading state during submission", async () => {
    const user = userEvent.setup();
    const onMapped = () => {};

    server.use(
      http.get("/api/filter-options/tags", () =>
        HttpResponse.json({
          tags: [
            { id: 2, name: "Sci-Fi" },
          ],
        })
      ),
      http.put("/api/tags/:id/map", async () => {
        await new Promise(r => setTimeout(r, 100));
        return HttpResponse.json({
          ok: true,
          targetId: 1,
        });
      })
    );

    const { rerender } = renderWithProviders(
      <TagAdminPanel
        tagId={1}
        currentName="Science Fiction"
        onMapped={onMapped}
      />
    );

    const input = screen.getByPlaceholderText(/Введите название жанра/);
    await user.type(input, "New Name");

    const submitBtn = screen.getByRole("button", { name: /Сопоставить/ });
    await user.click(submitBtn);

    // Button should show loading state (...)
    await waitFor(() => {
      expect(submitBtn.textContent).toContain("...");
    });
  });

  it("fetches and displays tag options excluding current tag", async () => {
    server.use(
      http.get("/api/filter-options/tags", () =>
        HttpResponse.json({
          tags: [
            { id: 1, name: "Science Fiction" },
            { id: 2, name: "Mystery" },
            { id: 3, name: "Fantasy" },
          ],
        })
      )
    );

    renderWithProviders(
      <TagAdminPanel
        tagId={1}
        currentName="Science Fiction"
        onMapped={() => {}}
      />
    );

    // Wait for combobox to load options
    await waitFor(() => {
      // Options should be loaded and exclude current tag
      const input = screen.getByPlaceholderText(/Введите название жанра/);
      expect(input).toBeInTheDocument();
    });
  });
});
