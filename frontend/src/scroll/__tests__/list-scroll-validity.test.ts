import { beforeEach, describe, expect, it } from "vitest";
import { domainEvents } from "@/domain/events";
import {
  readScrollEntries,
  registerScrollInvalidationHandlers,
  writeScrollEntries,
  type ScrollEntry,
} from "../list-scroll-validity";

describe("list scroll validity", () => {
  beforeEach(() => {
    sessionStorage.clear();
    domainEvents.clear();
  });

  it("preserves entries for patchable book update events", () => {
    const entries: ScrollEntry[] = [{
      url: "/",
      scrollTop: 500,
      version: 0,
      context: { kind: "book-list", key: "/", source: "catalog", sort: "addedDesc" },
    }];
    writeScrollEntries(entries);
    registerScrollInvalidationHandlers(domainEvents);

    domainEvents.publish("bookUpdated", { book: { id: 1 }, changedFields: ["description"] });

    expect(readScrollEntries()).toEqual(entries);
  });

  it("removes catalog entry for structural create", () => {
    writeScrollEntries([{
      url: "/",
      scrollTop: 500,
      version: 0,
      context: { kind: "book-list", key: "/", source: "catalog", sort: "addedDesc" },
    }]);
    registerScrollInvalidationHandlers(domainEvents);

    domainEvents.publish("bookCreated", { bookId: 2 });

    expect(readScrollEntries()).toEqual([]);
  });

  it("removes only affected shelf entry for shelf membership", () => {
    writeScrollEntries([
      {
        url: "/shelves/3",
        scrollTop: 300,
        version: 0,
        context: { kind: "book-list", key: "/shelves/3", source: "shelf-regular", shelfId: 3, sort: "addedDesc" },
      },
      {
        url: "/",
        scrollTop: 500,
        version: 0,
        context: { kind: "book-list", key: "/", source: "catalog", sort: "addedDesc" },
      },
    ]);
    registerScrollInvalidationHandlers(domainEvents);

    domainEvents.publish("shelfMembershipChanged", { shelfId: 3, bookId: 10, hasBook: false });

    expect(readScrollEntries()).toEqual([{
      url: "/",
      scrollTop: 500,
      version: 0,
      context: { kind: "book-list", key: "/", source: "catalog", sort: "addedDesc" },
    }]);
  });

  it("preserves reading-now scroll when progress position did not change", () => {
    const entries: ScrollEntry[] = [{
      url: "/shelves/reading-now",
      scrollTop: 420,
      version: 0,
      context: { kind: "book-list", key: "/shelves/reading-now", source: "shelf-reading-now", sort: "lastReadDesc" },
    }];
    writeScrollEntries(entries);
    registerScrollInvalidationHandlers(domainEvents);

    domainEvents.publish("readingProgressChanged", {
      bookId: 10,
      hadPosition: true,
      hasPosition: true,
      lastReadAtChanged: false,
    });

    expect(readScrollEntries()).toEqual(entries);
  });

  it("removes reading-now scroll when progress enters the shelf", () => {
    writeScrollEntries([{
      url: "/shelves/reading-now",
      scrollTop: 420,
      version: 0,
      context: { kind: "book-list", key: "/shelves/reading-now", source: "shelf-reading-now", sort: "lastReadDesc" },
    }]);
    registerScrollInvalidationHandlers(domainEvents);

    domainEvents.publish("readingProgressChanged", {
      bookId: 10,
      hadPosition: false,
      hasPosition: true,
      lastReadAtChanged: true,
    });

    expect(readScrollEntries()).toEqual([]);
  });

  it("invalidates search and author-sorted entries for author rename", () => {
    writeScrollEntries([
      {
        url: "/search?q=Old",
        scrollTop: 100,
        version: 0,
        context: { kind: "book-list", key: "/search?q=Old", source: "search", sort: "addedDesc", query: "Old" },
      },
      {
        url: "/",
        scrollTop: 200,
        version: 0,
        context: { kind: "book-list", key: "/", source: "catalog", sort: "authorAsc" },
      },
      {
        url: "/authors/1",
        scrollTop: 300,
        version: 0,
        context: { kind: "book-list", key: "/authors/1", source: "author-detail", authorId: 1, sort: "addedDesc" },
      },
    ]);
    registerScrollInvalidationHandlers(domainEvents);

    domainEvents.publish("authorRenamed", { authorId: 1, name: "New" });

    expect(readScrollEntries()).toEqual([{
      url: "/authors/1",
      scrollTop: 300,
      version: 0,
      context: { kind: "book-list", key: "/authors/1", source: "author-detail", authorId: 1, sort: "addedDesc" },
    }]);
  });

  it("invalidates filtered and sorted entries for destructive metadata events", () => {
    writeScrollEntries([
      {
        url: "/?authorIds=1",
        scrollTop: 100,
        version: 0,
        context: { kind: "book-list", key: "/?authorIds=1", source: "catalog", sort: "addedDesc", filters: { authorIds: [1] } },
      },
      {
        url: "/?sort=authorAsc",
        scrollTop: 200,
        version: 0,
        context: { kind: "book-list", key: "/?sort=authorAsc", source: "catalog", sort: "authorAsc" },
      },
      {
        url: "/?seriesIds=2",
        scrollTop: 300,
        version: 0,
        context: { kind: "book-list", key: "/?seriesIds=2", source: "catalog", sort: "addedDesc", filters: { seriesIds: [2] } },
      },
      {
        url: "/?tagIds=3",
        scrollTop: 400,
        version: 0,
        context: { kind: "book-list", key: "/?tagIds=3", source: "catalog", sort: "addedDesc", filters: { tagIds: [3] } },
      },
    ]);
    registerScrollInvalidationHandlers(domainEvents);

    domainEvents.publish("authorDeleted", { authorId: 1 });
    domainEvents.publish("seriesDeleted", { seriesId: 2 });
    domainEvents.publish("tagMapped", { tagId: 3, targetId: 9, name: "Mapped" });

    expect(readScrollEntries()).toEqual([]);
  });

  it("invalidates shelves entity-list scroll for shelf create and rename", () => {
    writeScrollEntries([{
      url: "/shelves",
      scrollTop: 120,
      version: 0,
      context: { kind: "entity-list", key: "/shelves", entity: "shelves" },
    }]);
    registerScrollInvalidationHandlers(domainEvents);

    domainEvents.publish("shelfCreated", { shelfId: 5, name: "New shelf" });

    expect(readScrollEntries()).toEqual([]);
  });

  it("clears malformed scroll state conservatively", () => {
    sessionStorage.setItem("librarium_scroll_state", "{bad json");

    expect(readScrollEntries()).toEqual([]);
    expect(sessionStorage.getItem("librarium_scroll_state")).toBeNull();
  });

  it("clears entries that do not match the current scroll stack schema", () => {
    sessionStorage.setItem("librarium_scroll_state", JSON.stringify([{ url: "/", scrollTop: 10 }]));

    expect(readScrollEntries()).toEqual([]);
    expect(sessionStorage.getItem("librarium_scroll_state")).toBeNull();
  });
});
