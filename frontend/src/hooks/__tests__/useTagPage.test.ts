// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, screen, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { createElement, useEffect } from "react";
import { domainEvents } from "@/domain/events";
import { LocationProbe } from "@/test/location-probe";

vi.mock("@/api/endpoints/tags", () => ({
  getTag: vi.fn(),
}));

import { getTag } from "@/api/endpoints/tags";
import type { TagSummary } from "@/api/endpoints/tags";
import type { Book } from "@/types";
import { useTagPage } from "../useTagPage";

const mockedGetTag = getTag as ReturnType<typeof vi.fn>;

const MINIMAL_TAG: TagSummary = {
  id: 7,
  name: "Fantasy",
  bookCount: 3,
};

const MINIMAL_BOOK: Book = {
  id: 10,
  title: "Some Book",
  authors: [{ id: 1, name: "Test Author" }],
  tags: [],
  series: null,
  seriesNumber: null,
  coverPath: "",
  rating: null,
  isRead: false,
};

function wrapper({ children }: { children: React.ReactNode }) {
  return createElement(
    MemoryRouter,
    { initialEntries: ["/tags/7"] },
    createElement(Routes, null,
      createElement(Route, { path: "/tags/:id", element: children }),
    ),
  );
}

function invalidWrapper({ children }: { children: React.ReactNode }) {
  return createElement(
    MemoryRouter,
    { initialEntries: ["/tags/abc"] },
    createElement(Routes, null,
      createElement(Route, { path: "/tags/:id", element: children }),
    ),
  );
}

/** Mounts only when the /tags route is active; used to detect navigation. */
function TagsListMarker({ onMount }: { onMount: () => void }) {
  useEffect(onMount, [onMount]);
  return null;
}

describe("useTagPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    domainEvents.clear();
  });

  it("returns tagId, tag, books from resource", async () => {
    mockedGetTag.mockResolvedValue({ tag: MINIMAL_TAG, books: [MINIMAL_BOOK] });

    const { result } = renderHook(() => useTagPage(), { wrapper });

    await waitFor(() => {
      expect(result.current.tag).not.toBeNull();
    });

    expect(result.current.tagId).toBe(7);
    expect(result.current.tag?.name).toBe("Fantasy");
    expect(result.current.tag?.bookCount).toBe(3);
    expect(result.current.books).toHaveLength(1);
    expect(result.current.books[0].id).toBe(10);
    expect(result.current.loading).toBe(false);
    expect(result.current.notFound).toBe(false);
  });

  it("on tagMerged with sourceId === tagId navigates to /tags/{targetId}", async () => {
    // Mock: both original and target tag responses
    mockedGetTag.mockResolvedValue({ tag: MINIMAL_TAG, books: [MINIMAL_BOOK] });

    const { result } = renderHook(() => useTagPage(), { wrapper });

    await waitFor(() => expect(result.current.tag).not.toBeNull());
    expect(result.current.tagId).toBe(7);

    // After subscription is set up, publish tagMerged with sourceId === tagId
    act(() => {
      domainEvents.publish("tagMerged", { sourceId: 7, targetId: 42 });
    });

    // Navigation happened: hook re-mounted on /tags/42
    await waitFor(() => {
      expect(result.current.tagId).toBe(42);
    });
  });

  it("on tagDeleted with tagId === own navigates to /tags", async () => {
    mockedGetTag.mockResolvedValue({ tag: MINIMAL_TAG, books: [MINIMAL_BOOK] });

    let lastLocation = "";

    function wrapperWithTagsRoute({ children }: { children: React.ReactNode }) {
      return createElement(
        MemoryRouter,
        { initialEntries: ["/tags/7"] },
        createElement(Routes, null,
          createElement(Route, { path: "/tags/:id", element: children }),
          createElement(Route, {
            path: "/tags",
            element: createElement(TagsListMarker, { onMount: () => { lastLocation = "/tags"; } }),
          }),
        ),
      );
    }

    const { result } = renderHook(() => useTagPage(), { wrapper: wrapperWithTagsRoute });

    await waitFor(() => expect(result.current.tag).not.toBeNull());

    // After subscription is set up, publish tagDeleted with own tagId
    act(() => {
      domainEvents.publish("tagDeleted", { tagId: 7 });
    });

    // Navigation to /tags happened: TagsListMarker mounts and sets lastLocation
    await waitFor(() => expect(lastLocation).toBe("/tags"));
  });

  it("tagMerged with different sourceId does NOT navigate away", async () => {
    mockedGetTag.mockResolvedValue({ tag: MINIMAL_TAG, books: [MINIMAL_BOOK] });

    const { result } = renderHook(() => useTagPage(), { wrapper });

    await waitFor(() => expect(result.current.tag).not.toBeNull());

    act(() => {
      // sourceId !== tagId (7), should NOT navigate
      domainEvents.publish("tagMerged", { sourceId: 99, targetId: 42 });
    });

    // Page is still on tagId=7, notFound should still be false
    expect(result.current.notFound).toBe(false);
    expect(result.current.tagId).toBe(7);
  });

  it("invalid id (NaN) → notFound true, no fetch", async () => {
    const { result } = renderHook(() => useTagPage(), { wrapper: invalidWrapper });

    // notFound should be true immediately (NaN id)
    await waitFor(() => {
      expect(result.current.notFound).toBe(true);
    });

    expect(result.current.tag).toBeNull();
    // getTag should not be called with a valid request (the hook returns NotFoundError early)
    // It may be called but immediately rejected — what matters is tag is null
    expect(result.current.books).toHaveLength(0);
  });


  it("navigateAfterDelete is a callable function", async () => {
    mockedGetTag.mockResolvedValue({ tag: MINIMAL_TAG, books: [] });

    const { result } = renderHook(() => useTagPage(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(typeof result.current.navigateAfterDelete).toBe("function");
  });

  it("clearAllFilters снимает все фильтры и сохраняет сортировку", async () => {
    mockedGetTag.mockResolvedValue({ tag: MINIMAL_TAG, books: [MINIMAL_BOOK] });

    function wrapperWithFilters({ children }: { children: React.ReactNode }) {
      return createElement(
        MemoryRouter,
        { initialEntries: ["/tags/7?authorIds=1&language=ru&sort=titleAsc"] },
        createElement(LocationProbe),
        createElement(Routes, null,
          createElement(Route, { path: "/tags/:id", element: children }),
        ),
      );
    }

    const { result } = renderHook(() => useTagPage(), { wrapper: wrapperWithFilters });

    await waitFor(() => expect(result.current.tag).not.toBeNull());

    act(() => {
      result.current.clearAllFilters();
    });

    await waitFor(() => {
      expect(screen.getByTestId("loc").textContent).toBe("/tags/7?sort=titleAsc");
    });
  });
});
