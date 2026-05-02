// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import DesktopPageHeader from "./desktop-page-header";

describe("DesktopPageHeader — Upload button visibility", () => {
  it("renders Upload button for admin when showUpload is true", async () => {
    // /api/auth/me default mock returns { id: 1, role: "admin" } — see handlers.ts
    renderWithProviders(<DesktopPageHeader title="Test" showUpload />);
    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Загрузить" })).toBeInTheDocument();
    });
  });

  it("hides Upload button for reader even when showUpload is true", async () => {
    server.use(
      http.get("/api/auth/me", () =>
        HttpResponse.json({ id: 2, username: "reader", displayName: "Reader", email: null, role: "reader" })
      )
    );
    renderWithProviders(<DesktopPageHeader title="Test" showUpload />);
    await waitFor(() => {
      expect(screen.queryByRole("link", { name: "Загрузить" })).not.toBeInTheDocument();
    });
  });
});
