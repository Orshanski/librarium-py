import { http, HttpResponse } from "msw";

// Default handlers — minimal, shared across all tests.
// Tests add per-case handlers via `server.use(...)`.
//
// SmartFilterBar mounts on many pages (TagPage / AuthorPage / SeriesPage /
// ShelfPage / CatalogPage) and eagerly fetches /api/filter-options/{authors,
// series, tags, languages} + /api/publishers. To avoid forcing every page
// test to mock all five endpoints, we return empty arrays by default. Tests
// that care about filter options override via `server.use(...)`.
export const defaultHandlers = [
  http.get("/api/auth/me", () =>
    HttpResponse.json({
      id: 1,
      username: "admin",
      displayName: "Test Admin",
      email: "admin@test.local",
      role: "admin",
    })
  ),
  http.get("/api/filter-options/authors", () =>
    HttpResponse.json({ authors: [] }),
  ),
  http.get("/api/filter-options/series", () =>
    HttpResponse.json({ series: [] }),
  ),
  http.get("/api/filter-options/tags", () =>
    HttpResponse.json({ tags: [] }),
  ),
  http.get("/api/filter-options/languages", () =>
    HttpResponse.json({ languages: [] }),
  ),
  http.get("/api/publishers", () =>
    HttpResponse.json({ publishers: [] }),
  ),
];
