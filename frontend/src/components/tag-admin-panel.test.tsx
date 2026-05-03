// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import { domainEvents } from "@/domain/events";
import TagAdminPanel from "./tag-admin-panel";

describe("TagAdminPanel", () => {
  it("renders panel with label and input", () => {
    server.use(
      http.get("/api/filter-options/tags", () =>
        HttpResponse.json({
          tags: [
            { id: 2, name: "Sci-Fi" },
            { id: 3, name: "Mystery" },
          ],
        }),
      ),
    );

    renderWithProviders(
      <TagAdminPanel
        tagId={1}
        currentName="Science Fiction"
        onMapped={() => {}}
      />,
    );

    expect(screen.getByText(/Сопоставить с/)).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/Введите название жанра/),
    ).toBeInTheDocument();
  });

  it("sends PUT /api/tags/:id/map and invokes onMapped after confirmation", async () => {
    domainEvents.clear();
    const user = userEvent.setup();
    const onMapped = vi.fn();
    let capturedUrl = "";
    let capturedBody: { name?: string } | null = null;
    const events: Array<{ tagId: number; targetId: number; name: string }> = [];
    domainEvents.subscribe("tagMapped", (payload) => events.push(payload));

    server.use(
      http.get("/api/filter-options/tags", () =>
        HttpResponse.json({
          tags: [
            { id: 2, name: "Sci-Fi" },
            { id: 3, name: "Mystery" },
          ],
        }),
      ),
      http.put("/api/tags/:id/map", async ({ request }) => {
        capturedUrl = request.url;
        capturedBody = (await request.json()) as { name?: string };
        return HttpResponse.json({ ok: true, targetId: 2 });
      }),
    );

    renderWithProviders(
      <TagAdminPanel
        tagId={1}
        currentName="Science Fiction"
        onMapped={onMapped}
      />,
    );

    // Wait for options to load.
    await waitFor(() =>
      expect(
        screen.getByPlaceholderText(/Введите название жанра/),
      ).toBeInTheDocument(),
    );

    await user.type(
      screen.getByPlaceholderText(/Введите название жанра/),
      "Sci-Fi",
    );

    // Submit — because "Sci-Fi" exists in options, confirmation appears first.
    await user.click(screen.getByRole("button", { name: /^Сопоставить$/ }));

    // Confirm dialog visible (alongside form button — same label). Use getAllByRole
    // and click the second one (dialog renders after the form).
    const confirmDialogText = await screen.findByText(
      /Все книги будут отнесены к жанру/,
    );
    expect(confirmDialogText).toBeInTheDocument();
    const submitBtns = screen.getAllByRole("button", { name: /^Сопоставить$/ });
    expect(submitBtns).toHaveLength(2);
    await user.click(submitBtns[1]);

    // Full wire exercised: PUT fired, onMapped called with backend's targetId.
    await waitFor(() => expect(onMapped).toHaveBeenCalledTimes(1));
    expect(onMapped).toHaveBeenCalledWith(2, "Sci-Fi");
    expect(capturedUrl).toContain("/api/tags/1/map");
    expect(capturedBody).toEqual({ name: "Sci-Fi" });
    expect(events).toEqual([{ tagId: 1, targetId: 2, name: "Sci-Fi" }]);
  });

  it("shows inline error when mapTag fails (not silent, not alert)", async () => {
    const user = userEvent.setup();
    const onMapped = vi.fn();

    server.use(
      http.get("/api/filter-options/tags", () =>
        HttpResponse.json({ tags: [] }),
      ),
      http.put("/api/tags/:id/map", () =>
        HttpResponse.json(
          {
            detail: [
              {
                loc: ["body", "name"],
                msg: "String should have at least 1 character",
                type: "string_too_short",
              },
            ],
          },
          { status: 422 },
        ),
      ),
    );

    renderWithProviders(
      <TagAdminPanel tagId={1} currentName="Old" onMapped={onMapped} />,
    );

    await user.type(
      screen.getByPlaceholderText(/Введите название жанра/),
      "New Name",
    );
    await user.click(screen.getByRole("button", { name: /Сопоставить/ }));

    // Inline error visible — aria role="alert".
    // 422 from backend → frontend raises ValidationError with default
    // message "Validation failed" (see api/errors.ts:45).
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/validation failed/i);
    expect(onMapped).not.toHaveBeenCalled();
  });

  it("disables submit button when input is empty", () => {
    server.use(
      http.get("/api/filter-options/tags", () =>
        HttpResponse.json({ tags: [] }),
      ),
    );

    renderWithProviders(
      <TagAdminPanel
        tagId={1}
        currentName="Science Fiction"
        onMapped={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", { name: /Сопоставить/ }),
    ).toBeDisabled();
  });

  it("disables submit button when input equals current name", async () => {
    const user = userEvent.setup();

    server.use(
      http.get("/api/filter-options/tags", () =>
        HttpResponse.json({ tags: [] }),
      ),
    );

    renderWithProviders(
      <TagAdminPanel
        tagId={1}
        currentName="Science Fiction"
        onMapped={() => {}}
      />,
    );

    await user.type(
      screen.getByPlaceholderText(/Введите название жанра/),
      "Science Fiction",
    );

    expect(
      screen.getByRole("button", { name: /Сопоставить/ }),
    ).toBeDisabled();
  });

  it("filters current tag from options combobox", async () => {
    const user = userEvent.setup();

    server.use(
      http.get("/api/filter-options/tags", () =>
        HttpResponse.json({
          tags: [
            { id: 1, name: "Science Fiction" },
            { id: 2, name: "Mystery" },
            { id: 3, name: "Fantasy" },
          ],
        }),
      ),
    );

    renderWithProviders(
      <TagAdminPanel
        tagId={1}
        currentName="Science Fiction"
        onMapped={() => {}}
      />,
    );

    // Open the combobox dropdown by focusing the input.
    await user.click(screen.getByPlaceholderText(/Введите название жанра/));

    // Two allowed options appear.
    await waitFor(() => {
      expect(screen.getByText("Mystery")).toBeInTheDocument();
      expect(screen.getByText("Fantasy")).toBeInTheDocument();
    });

    // Current tag is filtered out — NOT in dropdown options. The placeholder /
    // label mentions "Science Fiction", but no dropdown OPTION item should
    // exist with that text.
    const options = screen.queryAllByRole("option");
    expect(
      options.find((el) => el.textContent === "Science Fiction"),
    ).toBeUndefined();
  });
});
