// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, delay } from "msw";
import { server } from "@/test/msw/server";
import SmartFilterBar from "./smart-filter-bar";

const mockAuthors = [
  { id: 1, name: "Author One" },
  { id: 2, name: "Author Two" },
];

const mockSeries = [
  { id: 1, name: "Series A" },
  { id: 2, name: "Series B" },
];

const mockTags = [
  { id: 1, name: "Fiction" },
  { id: 2, name: "Science" },
];

const mockLanguages = [{ name: "English" }, { name: "Russian" }];

// Global MSW server is already `listen`ing via src/test/setup.ts.
// server.resetHandlers() runs automatically in afterEach from that setup.
//
// Per-test handlers are registered via server.use(...).

describe("SmartFilterBar", () => {
  it("renders filter options from API", async () => {
    server.use(
      http.get("/api/filter-options/authors", () =>
        HttpResponse.json({ authors: mockAuthors }),
      ),
      http.get("/api/filter-options/series", () =>
        HttpResponse.json({ series: mockSeries }),
      ),
      http.get("/api/filter-options/tags", () =>
        HttpResponse.json({ tags: mockTags }),
      ),
      http.get("/api/filter-options/languages", () =>
        HttpResponse.json({ languages: mockLanguages }),
      ),
    );

    const user = userEvent.setup();
    render(
      <SmartFilterBar
        filterKeys={["authorIds", "seriesIds", "tagIds", "language"]}
        selected={{}}
        onSelectionChange={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Автор/ })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Автор/ }));
    await waitFor(() => {
      expect(screen.getByText("Author One")).toBeInTheDocument();
    });
  });

  it("rapid dependency changes: only latest response is rendered, stale is discarded", async () => {
    // First handler: slow — simulates an in-flight request that should be
    // aborted when props change. Returns "First Author".
    // We DO NOT wait for the slow fetch to resolve. Instead, we immediately
    // rerender with new props — the useEffect cleanup must call
    // controller.abort() on the first fetch. The fast handler registered
    // next returns "Second Author". If abort works, only "Second Author"
    // ever reaches state; "First Author" must never leak into the UI.
    server.use(
      http.get("/api/filter-options/authors", async () => {
        await delay(100);
        return HttpResponse.json({ authors: [{ id: 1, name: "First Author" }] });
      }),
    );

    const { rerender } = render(
      <SmartFilterBar
        filterKeys={["authorIds"]}
        selected={{}}
        onSelectionChange={() => {}}
      />,
    );

    // Swap handler to a fast one and rerender immediately — while the first
    // fetch is still sleeping, its AbortController should fire.
    server.use(
      http.get("/api/filter-options/authors", () =>
        HttpResponse.json({ authors: [{ id: 2, name: "Second Author" }] }),
      ),
    );

    rerender(
      <SmartFilterBar
        filterKeys={["authorIds"]}
        selected={{ authorIds: ["2"] }}
        onSelectionChange={() => {}}
      />,
    );

    // With `selected.authorIds = ["2"]`, the filter bar renders the selected
    // name as a chip after options load. Wait for the fast fetch to finish.
    await waitFor(() => {
      expect(screen.getByText("Second Author")).toBeInTheDocument();
    });

    // Give the slow handler's delay(100) a chance to elapse. If abort failed,
    // the stale response would now overwrite state and "First Author" would
    // appear. With abort working, it never will.
    await new Promise((r) => setTimeout(r, 150));

    expect(screen.queryByText("First Author")).not.toBeInTheDocument();
    expect(screen.getByText("Second Author")).toBeInTheDocument();
  });

  it("500 error: empty filter option, no crash, no error UI leaks", async () => {
    const user = userEvent.setup();

    server.use(
      http.get("/api/filter-options/authors", () =>
        HttpResponse.json({ detail: "Internal Server Error" }, { status: 500 }),
      ),
      http.get("/api/filter-options/series", () =>
        HttpResponse.json({ series: mockSeries }),
      ),
    );

    render(
      <SmartFilterBar
        filterKeys={["authorIds", "seriesIds"]}
        selected={{}}
        onSelectionChange={() => {}}
      />,
    );

    // Both filter buttons should still render (the failed dimension gets an
    // empty options list; UI does not crash).
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Автор/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Серия/ })).toBeInTheDocument();
    });

    // Error UI should NOT leak into the bar.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Internal Server Error|HTTP 500|ошибка/i),
    ).not.toBeInTheDocument();

    // Working dimension still loads its options.
    await user.click(screen.getByRole("button", { name: /Серия/ }));
    await waitFor(() => {
      expect(screen.getByText("Series A")).toBeInTheDocument();
    });
  });
});
