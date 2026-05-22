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
    ]);
    registerScrollInvalidationHandlers(domainEvents);

    domainEvents.publish("authorDeleted", { authorId: 1 });
    domainEvents.publish("seriesDeleted", { seriesId: 2 });

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

  it("invalidates book-list scroll entries on hidden-state changes", () => {
    writeScrollEntries([
      {
        url: "/",
        scrollTop: 240,
        version: 1,
        context: { kind: "book-list", key: "catalog", source: "catalog", sort: "addedDesc" },
      },
      {
        url: "/authors",
        scrollTop: 80,
        version: 1,
        context: { kind: "entity-list", key: "authors", entity: "authors" },
      },
    ]);

    registerScrollInvalidationHandlers(domainEvents);
    domainEvents.publish("bookHiddenChanged", { bookId: 7, isHidden: true });

    expect(readScrollEntries()).toEqual([
      {
        url: "/authors",
        scrollTop: 80,
        version: 1,
        context: { kind: "entity-list", key: "authors", entity: "authors" },
      },
    ]);
  });
});

describe("scroll invalidation: tagRenamed", () => {
  beforeEach(() => {
    sessionStorage.clear();
    domainEvents.clear();
  });

  it("invalidates search entries", () => {
    writeScrollEntries([{
      url: "/search",
      scrollTop: 100,
      version: 1,
      context: { kind: "book-list", source: "search", sort: "addedDesc", key: "/search", query: "x" },
    }]);
    registerScrollInvalidationHandlers(domainEvents);
    domainEvents.publish("tagRenamed", { tagId: 1, name: "X" });
    expect(readScrollEntries()).toHaveLength(0);
  });

  it("keeps tag-detail entries for the renamed tag", () => {
    writeScrollEntries([{
      url: "/tags/1",
      scrollTop: 100,
      version: 1,
      context: { kind: "book-list", source: "tag-detail", sort: "addedDesc", key: "/tags/1", tagId: 1 },
    }]);
    registerScrollInvalidationHandlers(domainEvents);
    domainEvents.publish("tagRenamed", { tagId: 1, name: "X" });
    expect(readScrollEntries()).toHaveLength(1);
  });
});

describe("scroll invalidation: tagMerged", () => {
  beforeEach(() => {
    sessionStorage.clear();
    domainEvents.clear();
  });

  it("invalidates entries where context.tagId is source or target", () => {
    writeScrollEntries([
      { url: "/tags/1", scrollTop: 1, version: 1, context: { kind: "book-list", source: "tag-detail", sort: "addedDesc", key: "/tags/1", tagId: 1 } },
      { url: "/tags/2", scrollTop: 2, version: 1, context: { kind: "book-list", source: "tag-detail", sort: "addedDesc", key: "/tags/2", tagId: 2 } },
    ]);
    registerScrollInvalidationHandlers(domainEvents);
    domainEvents.publish("tagMerged", { targetId: 2, sourceId: 1 });
    expect(readScrollEntries()).toHaveLength(0);
  });

  it("invalidates entries with tagIds filter including merged ids", () => {
    writeScrollEntries([{
      url: "/",
      scrollTop: 1,
      version: 1,
      context: { kind: "book-list", source: "catalog", sort: "addedDesc", key: "/", filters: { tagIds: [1] } },
    }]);
    registerScrollInvalidationHandlers(domainEvents);
    domainEvents.publish("tagMerged", { targetId: 2, sourceId: 1 });
    expect(readScrollEntries()).toHaveLength(0);
  });
});

describe("scroll invalidation: tagDeleted", () => {
  beforeEach(() => {
    sessionStorage.clear();
    domainEvents.clear();
  });

  it("invalidates entries where context.tagId equals deleted id", () => {
    writeScrollEntries([{
      url: "/tags/5",
      scrollTop: 1,
      version: 1,
      context: { kind: "book-list", source: "tag-detail", sort: "addedDesc", key: "/tags/5", tagId: 5 },
    }]);
    registerScrollInvalidationHandlers(domainEvents);
    domainEvents.publish("tagDeleted", { tagId: 5 });
    expect(readScrollEntries()).toHaveLength(0);
  });
});
