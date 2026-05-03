// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import { domainEvents } from "@/domain/events";
import { SidebarContent } from "./sidebar";

describe("SidebarContent — shelves list", () => {
  beforeEach(() => {
    domainEvents.clear();
  });

  it("renders shelf names as links", async () => {
    server.use(
      http.get("/api/shelves", () =>
        HttpResponse.json({
          shelves: [
            { id: 1, name: "Read", isSystem: true, systemCode: "reading_now" },
            { id: 2, name: "TBR", isSystem: false },
          ],
        })
      )
    );

    renderWithProviders(<SidebarContent />);

    await waitFor(() => {
      expect(screen.getByText("Read")).toBeInTheDocument();
    });

    expect(screen.getByText("TBR")).toBeInTheDocument();

    // Both shelves are rendered as links
    const readLink = screen.getByRole("link", { name: "Read" });
    // reading_now has no sort options → href without query string
    expect(readLink).toHaveAttribute("href", "/shelves/1");

    const tbrLink = screen.getByRole("link", { name: "TBR" });
    // regular shelf gets default sort appended
    expect(tbrLink.getAttribute("href")).toContain("/shelves/2");
  });

  it("publishes shelfCreated after creating shelf", async () => {
    const user = userEvent.setup();
    const events: Array<{ shelfId: number; name: string }> = [];
    domainEvents.subscribe("shelfCreated", (payload) => events.push(payload));

    server.use(
      http.get("/api/shelves", () => HttpResponse.json({ shelves: [] })),
      http.post("/api/shelves", () => HttpResponse.json({ id: 9, name: "TBR" })),
    );

    renderWithProviders(<SidebarContent />);

    await user.click(await screen.findByRole("button", { name: /\+ создать полку/i }));
    await user.type(screen.getByPlaceholderText("Название..."), "TBR{enter}");

    await waitFor(() => {
      expect(events).toEqual([{ shelfId: 9, name: "TBR" }]);
    });
  });
});
