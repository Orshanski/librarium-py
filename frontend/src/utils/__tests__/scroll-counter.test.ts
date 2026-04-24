import { beforeEach, describe, expect, it } from "vitest";
import { getScrollCounter, bumpScrollCounter } from "../scroll-counter";

describe("scroll-counter", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("getScrollCounter возвращает 0 для отсутствующего ключа", () => {
    expect(getScrollCounter()).toBe(0);
  });

  it("bumpScrollCounter увеличивает счётчик на 1 и пишет в sessionStorage", () => {
    bumpScrollCounter();
    expect(sessionStorage.getItem("librarium_scroll_counter")).toBe("1");
    expect(getScrollCounter()).toBe(1);
  });

  it("последовательные вызовы bumpScrollCounter дают монотонно растущую последовательность", () => {
    bumpScrollCounter();
    bumpScrollCounter();
    bumpScrollCounter();
    expect(getScrollCounter()).toBe(3);
  });

  it("нечисловое значение в ключе читается как 0", () => {
    sessionStorage.setItem("librarium_scroll_counter", "not-a-number");
    expect(getScrollCounter()).toBe(0);
  });

  it("getScrollCounter не хранит значение в памяти модуля", () => {
    sessionStorage.setItem("librarium_scroll_counter", "7");
    expect(getScrollCounter()).toBe(7);
    sessionStorage.setItem("librarium_scroll_counter", "42");
    expect(getScrollCounter()).toBe(42);
  });
});
