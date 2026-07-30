// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Routes, Route } from "react-router-dom";
import { LocationProbe } from "@/test/location-probe";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import { metadataCache } from "@/cache";
import TagsPage from "./TagsPage";

describe("TagsPage", () => {
  beforeEach(() => {
    // Clear sessionStorage between tests
    sessionStorage.clear();
    metadataCache.clear();
  });

  it("displays tag cloud and search options when both endpoints succeed", async () => {
    server.use(
      http.get("/api/tags/cloud", () =>
        HttpResponse.json({
          tags: [
            { id: 1, name: "Fiction", bookCount: 10 },
            { id: 2, name: "Science Fiction", bookCount: 8 },
            { id: 3, name: "Fantasy", bookCount: 5 },
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
            { id: 1, name: "Fiction", bookCount: 10 },
            { id: 2, name: "Mystery", bookCount: 6 },
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

  it("uses cached tag cloud and options on remount without refetch", async () => {
    let cloudRequestCount = 0;
    let optionsRequestCount = 0;
    server.use(
      http.get("/api/tags/cloud", () => {
        cloudRequestCount += 1;
        return HttpResponse.json({
          tags: [
            { id: 1, name: "Fiction", bookCount: 10 },
          ],
        });
      }),
      http.get("/api/filter-options/tags", () => {
        optionsRequestCount += 1;
        return HttpResponse.json({
          tags: [
            { id: 1, name: "Fiction" },
          ],
        });
      })
    );

    const first = renderWithProviders(<TagsPage />);
    await waitFor(() => expect(screen.getByRole("link", { name: /^Fiction \(10\)$/ })).toBeInTheDocument());
    first.unmount();

    renderWithProviders(<TagsPage />);

    expect(screen.getByRole("link", { name: /^Fiction \(10\)$/ })).toBeInTheDocument();
    expect(cloudRequestCount).toBe(1);
    expect(optionsRequestCount).toBe(1);
  });

  it("переход к жанру из поля поиска идёт роутером, без перезагрузки приложения", async () => {
    // Раньше здесь присваивался location.href: приложение поднималось заново — единственное
    // такое место в проекте, везде переходы мгновенные.
    server.use(
      http.get("/api/tags/cloud", () =>
        HttpResponse.json({ tags: [{ id: 2, name: "Фантастика", bookCount: 8 }] })
      ),
      http.get("/api/filter-options/tags", () =>
        HttpResponse.json({ tags: [{ id: 2, name: "Фантастика" }] })
      )
    );

    const user = userEvent.setup();
    renderWithProviders(
      <>
        <LocationProbe />
        <Routes>
          <Route path="/tags" element={<TagsPage />} />
          <Route path="/tags/:id" element={<div>страница жанра</div>} />
        </Routes>
      </>,
      { initialEntries: ["/tags"] },
    );

    await screen.findByRole("link", { name: /Фантастика/ });
    await user.type(screen.getByPlaceholderText("Найти жанр..."), "Фантастика");

    await waitFor(() => {
      expect(screen.getByTestId("loc").textContent).toBe("/tags/2");
    });
    expect(screen.getByText("страница жанра")).toBeInTheDocument();
  });

});
