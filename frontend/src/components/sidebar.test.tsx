// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import { SidebarContent } from "./sidebar";

describe("SidebarContent — shelves list", () => {
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
});
