// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { downloadBook } from "./book-download";
import * as booksApi from "@/api/endpoints/books";

// The util is a thin adapter over the typed client's `(percent, bytes)` stream.
// ReaderLoadingScreen consumes the same shape directly via {percent, bytes} —
// no legacy sentinel encoding. These tests pin the pass-through contract so a
// future refactor can't silently drop one of the two arguments.

describe("book-download util: progress pass-through", () => {
  it("forwards (percent, bytes) when Content-Length is known", async () => {
    const spy = vi
      .spyOn(booksApi, "downloadBook")
      .mockImplementation(async (_id, _fmt, opts) => {
        opts?.onProgress?.(42, 1000);
        return new Blob(["x"]);
      });

    const calls: Array<[number, number]> = [];
    await downloadBook("1", "fb2", (p, b) => calls.push([p, b]));

    expect(calls).toContainEqual([42, 1000]);
    spy.mockRestore();
  });

  it("forwards the -1 percent sentinel with real bytes when Content-Length is missing", async () => {
    const spy = vi
      .spyOn(booksApi, "downloadBook")
      .mockImplementation(async (_id, _fmt, opts) => {
        opts?.onProgress?.(-1, 2_500_000);
        return new Blob(["x"]);
      });

    const calls: Array<[number, number]> = [];
    await downloadBook("1", "fb2", (p, b) => calls.push([p, b]));

    // The -1 sentinel must reach the consumer untouched so ReaderLoadingScreen
    // renders `(2_500_000 / 1048576).toFixed(1)` ≈ "2.4 МБ" instead of "0.0 МБ".
    expect(calls).toContainEqual([-1, 2_500_000]);
    spy.mockRestore();
  });
});
