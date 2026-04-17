// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import MetadataSearch from "./metadata-search";

const mockResults = [
  {
    title: "Война и мир",
    authors: "Лев Толстой",
    description: "Великий роман",
    publisher: "Азбука",
    pubDate: "2020",
    isbn: "978-5-389-07482-5",
    tags: "классика, проза",
    source: "litres",
    coverUrl: "https://example.com/cover1.jpg",
  },
  {
    title: "Преступление и наказание",
    authors: "Фёдор Достоевский",
    description: "Психологический роман",
    publisher: "Эксмо",
    pubDate: "2019",
    isbn: "978-5-04-101234-0",
    tags: "классика",
    source: "litres",
    coverUrl: "",
  },
];

describe("MetadataSearch", () => {
  it("happy path: search returns 2 results — title and author are visible", async () => {
    const user = userEvent.setup();

    server.use(
      http.get("/api/metadata/search", () =>
        HttpResponse.json({ results: mockResults }),
      ),
    );

    renderWithProviders(
      <MetadataSearch
        query="Толстой"
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Поиск/i }));

    await waitFor(() => {
      expect(screen.getByText("Война и мир")).toBeInTheDocument();
    });
    expect(screen.getByText("Преступление и наказание")).toBeInTheDocument();
    expect(screen.getByText(/Лев Толстой/)).toBeInTheDocument();
  });

  it("HTTP 500 from /api/metadata/search → error message shown, no crash", async () => {
    const user = userEvent.setup();

    server.use(
      http.get("/api/metadata/search", () =>
        HttpResponse.json({ detail: "Internal Server Error" }, { status: 500 }),
      ),
    );

    renderWithProviders(
      <MetadataSearch
        query="test"
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Поиск/i }));

    await waitFor(() => {
      expect(screen.getByText("Ошибка поиска метаданных")).toBeInTheDocument();
    });

    // No result items visible
    expect(screen.queryByText("Война и мир")).not.toBeInTheDocument();
  });

  it("provider toggle: clicking a provider chip triggers refetch with updated providers= query", async () => {
    const user = userEvent.setup();
    const capturedUrls: string[] = [];

    server.use(
      http.get("/api/metadata/search", ({ request }) => {
        capturedUrls.push(request.url);
        return HttpResponse.json({ results: mockResults });
      }),
    );

    renderWithProviders(
      <MetadataSearch
        query="Толстой"
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    // Perform initial search
    await user.click(screen.getByRole("button", { name: /Поиск/i }));

    await waitFor(() => {
      expect(screen.getByText("Война и мир")).toBeInTheDocument();
    });

    // Click "Google Books" provider chip — triggers refetch with updated providers
    server.use(
      http.get("/api/metadata/search", ({ request }) => {
        capturedUrls.push(request.url);
        return HttpResponse.json({ results: [] });
      }),
    );

    await user.click(screen.getByRole("button", { name: /Google Books/i }));

    await waitFor(() => {
      // At least 2 requests captured (initial search + refetch after toggle)
      expect(capturedUrls.length).toBeGreaterThanOrEqual(2);
    });

    // The latest request should include "google" in the providers param
    const lastUrl = capturedUrls[capturedUrls.length - 1];
    expect(lastUrl).toContain("providers=");
    expect(lastUrl).toContain("google");
  });
});
