import { beforeEach, describe, expect, it } from "vitest";
import { domainEvents } from "@/domain/events";
import { metadataCache } from "../index";
import { installMetadataCacheHandlersForApp } from "../bootstrap";

describe("installMetadataCacheHandlersForApp", () => {
  beforeEach(() => {
    sessionStorage.clear();
    domainEvents.clear();
    metadataCache.clear();
  });

  it("installs metadata cache handlers exactly once", () => {
    installMetadataCacheHandlersForApp();
    installMetadataCacheHandlersForApp();
    metadataCache.set("publishers", "all", { publishers: ["Old"] });
    metadataCache.set("books", "catalog", { books: [{ id: 1, authors: [{ id: 2, name: "Old" }] }], hasMore: false }, {
      context: { kind: "book-list", key: "catalog", source: "catalog", sort: "addedDesc" },
    });
    let bookNotifications = 0;
    metadataCache.subscribe("books", () => {
      bookNotifications += 1;
    });

    domainEvents.publish("bookUpdated", {
      book: { id: 1, title: "Book" },
      changedFields: ["publisher"],
    });
    domainEvents.publish("authorRenamed", { authorId: 2, name: "New" });

    expect(metadataCache.get("publishers", "all")).toBeUndefined();
    expect(bookNotifications).toBe(2);
  });
});
