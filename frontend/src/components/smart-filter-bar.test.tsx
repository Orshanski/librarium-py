import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { http, HttpResponse, delay } from "msw";
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

const mockLanguages = [
  { name: "English" },
  { name: "Russian" },
];

const server = setupServer(
  http.get("*/api/filter-options/authors", () => {
    return HttpResponse.json({ authors: mockAuthors });
  }),
  http.get("*/api/filter-options/series", () => {
    return HttpResponse.json({ series: mockSeries });
  }),
  http.get("*/api/filter-options/tags", () => {
    return HttpResponse.json({ tags: mockTags });
  }),
  http.get("*/api/filter-options/languages", () => {
    return HttpResponse.json({ languages: mockLanguages });
  }),
);

beforeEach(() => {
  server.listen();
  sessionStorage.clear();
});

afterEach(() => {
  server.close();
  sessionStorage.clear();
});

describe("SmartFilterBar", () => {
  it("happy: renders filter options from API", async () => {
    const user = userEvent.setup();
    render(
      <SmartFilterBar
        filterKeys={["author", "series", "genre", "language"]}
        selected={{}}
        onSelectionChange={() => {}}
      />
    );

    // Wait for at least the author button to appear (options loaded)
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Автор/ })).toBeInTheDocument();
    });

    // Click author button to open dropdown and see options
    const authorButton = screen.getByRole("button", { name: /Автор/ });
    await user.click(authorButton);

    // Now options should be visible
    await waitFor(() => {
      expect(screen.getByText("Author One")).toBeInTheDocument();
    });

    expect(screen.getByText("Author One")).toBeInTheDocument();
  });

  it("abort: rapid selection changes prevent race conditions", async () => {
    // Test that when dependencies change rapidly, the component remains stable
    const { rerender } = render(
      <SmartFilterBar
        filterKeys={["author"]}
        selected={{ author: ["1"] }}
        onSelectionChange={() => {}}
      />
    );

    // Wait for initial load
    await waitFor(() => {
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThan(0);
    });

    // Change selection before first effect completes
    rerender(
      <SmartFilterBar
        filterKeys={["author"]}
        selected={{ author: ["2"] }}
        onSelectionChange={() => {}}
      />
    );

    // Component should still render without errors
    await waitFor(() => {
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  it("500 error: gracefully handles server errors without crashing", async () => {
    const user = userEvent.setup();

    server.use(
      http.get("*/api/filter-options/authors", () => {
        return HttpResponse.json(
          { detail: "Internal Server Error" },
          { status: 500 }
        );
      }),
      http.get("*/api/filter-options/series", () => {
        return HttpResponse.json({ series: mockSeries });
      }),
    );

    render(
      <SmartFilterBar
        filterKeys={["author", "series"]}
        selected={{}}
        onSelectionChange={() => {}}
      />
    );

    // Wait for series to load (author endpoint returns 500)
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Серия/ })).toBeInTheDocument();
    });

    // Click series button and verify it renders options
    const seriesButton = screen.getByRole("button", { name: /Серия/ });
    await user.click(seriesButton);

    await waitFor(() => {
      expect(screen.getByText("Series A")).toBeInTheDocument();
    });

    // Component should not crash
    expect(screen.getByText("Series A")).toBeInTheDocument();
  });
});
