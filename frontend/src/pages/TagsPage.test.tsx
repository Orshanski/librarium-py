// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import TagsPage from "./TagsPage";

describe("TagsPage", () => {
  beforeEach(() => {
    // Clear sessionStorage between tests
    sessionStorage.clear();
  });

  it("displays tag cloud and search options when both endpoints succeed", async () => {
    server.use(
      http.get("/api/tags/cloud", () =>
        HttpResponse.json({
          tags: [
            { id: 1, name: "Fiction", book_count: 10 },
            { id: 2, name: "Science Fiction", book_count: 8 },
            { id: 3, name: "Fantasy", book_count: 5 },
          ],
        })
      ),
      http.get("/api/filter-options/tags", () =>
        HttpResponse.json({
          tags: [
            { id: 1, name: "Fiction" },
            { id: 2, name: "Science Fiction" },
            { id: 3, name: "Fantasy" },
          ],
        })
      )
    );

    renderWithProviders(<TagsPage />);

    // Wait for cloud to render - look for exact link text
    await waitFor(() => {
      const link = screen.getByRole("link", { name: /^Fiction \(10\)$/ });
      expect(link).toBeInTheDocument();
    });

    // Both tags should be visible
    expect(screen.getByRole("link", { name: /Science Fiction/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Fantasy/ })).toBeInTheDocument();
  });

  it("displays tag cloud even if tag options endpoint fails", async () => {
    server.use(
      http.get("/api/tags/cloud", () =>
        HttpResponse.json({
          tags: [
            { id: 1, name: "Fiction", book_count: 10 },
            { id: 2, name: "Mystery", book_count: 6 },
          ],
        })
      ),
      http.get("/api/filter-options/tags", () =>
        HttpResponse.error()
      )
    );

    renderWithProviders(<TagsPage />);

    // Cloud should still render even if options fail
    await waitFor(() => {
      const link = screen.getByRole("link", { name: /^Fiction \(10\)$/ });
      expect(link).toBeInTheDocument();
    });

    expect(screen.getByRole("link", { name: /Mystery/ })).toBeInTheDocument();
  });

});
