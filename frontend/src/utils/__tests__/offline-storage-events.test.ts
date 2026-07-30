// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { domainEvents } from "@/domain/events";
import {
  saveOfflineBook,
  removeOfflineBook,
  removeBookFromLocalStorage,
  evictExpired,
  evictLRU,
  getOfflineBookIds,
} from "../offline-storage";
import type { Book } from "@/types";

const BOOK: Book = {
  id: 42,
  title: "Азазель",
  authors: [{ id: 1, name: "Акунин" }],
  tags: [],
  series: null,
  seriesNumber: null,
  coverPath: "",
  rating: null,
  isRead: false,
};

function save(book: Book = BOOK) {
  return saveOfflineBook(
    book,
    [{ format: "FB2", fileBlob: new Blob(["x"]), fileSize: 1 }],
    new Blob(["cover"]),
    true,
  );
}

describe("offline-storage публикует изменения офлайн-копий", () => {
  let events: Array<{ bookId: number; hasOffline: boolean }>;
  let unsubscribe: () => void;

  beforeEach(async () => {
    domainEvents.clear();
    events = [];
    unsubscribe = domainEvents.subscribe("offlineBookChanged", (payload) => {
      events.push(payload);
    });
    // Чистое хранилище: тесты в одном файле делят одну базу.
    for (const id of await getOfflineBookIds()) await removeOfflineBook(id);
    events.length = 0;
  });

  afterEach(() => {
    unsubscribe();
  });

  it("сохранение", async () => {
    await save();
    expect(events).toEqual([{ bookId: 42, hasOffline: true }]);
  });

  it("удаление кнопкой", async () => {
    await save();
    events.length = 0;

    await removeOfflineBook(42);

    expect(events).toEqual([{ bookId: 42, hasOffline: false }]);
  });

  it("снятие всех следов книги — путь отметки «прочитано» и удаления на сервере", async () => {
    // Именно этот путь оставался незакрытым, когда событие публиковала только кнопка:
    // отметил книгу прочитанной, офлайн-копия снялась, а бейдж в списке остался гореть.
    await save();
    events.length = 0;

    await removeBookFromLocalStorage(42);

    expect(events).toEqual([{ bookId: 42, hasOffline: false }]);
  });

  it("вытеснение по сроку", async () => {
    await save();
    events.length = 0;

    // Отрицательный ttl сдвигает границу в будущее, поэтому запись, сохранённая
    // мгновение назад, считается просроченной. С ttl = 0 граница равна «сейчас», а
    // сравнение строгое — запись бы уцелела.
    const removed = await evictExpired(-1);

    expect(removed).toBe(1);
    expect(events).toEqual([{ bookId: 42, hasOffline: false }]);
  });

  it("вытеснение по месту", async () => {
    // manuallyAdded=false — только такие книги вытесняются по месту.
    await saveOfflineBook(
      BOOK,
      [{ format: "FB2", fileBlob: new Blob(["x"]), fileSize: 1 }],
      new Blob(["cover"]),
      false,
    );
    events.length = 0;

    const evicted = await evictLRU();

    expect(evicted).toEqual([42]);
    expect(events).toEqual([{ bookId: 42, hasOffline: false }]);
  });
});
