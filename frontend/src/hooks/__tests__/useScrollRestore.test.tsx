import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useScrollRestore } from "../useScrollRestore";
import { invalidateCache } from "../../utils/cache-invalidation";

const STACK_KEY = "librarium_scroll_state";

function Harness({ ready = true }: { ready?: boolean }) {
  useScrollRestore(ready);
  return <div data-testid="harness">harness</div>;
}

function setupMain(): HTMLElement {
  const main = document.createElement("main");
  document.body.appendChild(main);
  return main;
}

describe("useScrollRestore", () => {
  let main: HTMLElement;

  beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = "";
    main = setupMain();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("первый mount, пустой стек: push записи текущего URL со scrollTop 0", () => {
    render(
      <MemoryRouter initialEntries={["/catalog"]}>
        <Harness />
      </MemoryRouter>,
    );
    const stack = JSON.parse(sessionStorage.getItem(STACK_KEY) || "[]");
    expect(stack).toHaveLength(1);
    expect(stack[0]).toMatchObject({ url: "/catalog", scrollTop: 0, version: 0 });
  });

  it("первый mount, стек содержит текущий URL: применяется сохранённый scrollTop", () => {
    sessionStorage.setItem(
      STACK_KEY,
      JSON.stringify([{ url: "/catalog", scrollTop: 300, version: 0 }]),
    );
    render(
      <MemoryRouter initialEntries={["/catalog"]}>
        <Harness />
      </MemoryRouter>,
    );
    expect(main.scrollTop).toBe(300);
    const stack = JSON.parse(sessionStorage.getItem(STACK_KEY) || "[]");
    expect(stack).toHaveLength(1);
  });

  it("возврат на URL из стека на позиции i: trim до [0, i+1), scrollTop применяется", () => {
    sessionStorage.setItem(
      STACK_KEY,
      JSON.stringify([
        { url: "/authors", scrollTop: 300, version: 0 },
        { url: "/authors/1", scrollTop: 150, version: 0 },
        { url: "/book/42", scrollTop: 0, version: 0 },
      ]),
    );
    render(
      <MemoryRouter initialEntries={["/authors"]}>
        <Harness />
      </MemoryRouter>,
    );
    const stack = JSON.parse(sessionStorage.getItem(STACK_KEY) || "[]");
    expect(stack).toHaveLength(1);
    expect(main.scrollTop).toBe(300);
  });

  it("cross-section (URL отсутствует в стеке): push, стек растёт", () => {
    sessionStorage.setItem(
      STACK_KEY,
      JSON.stringify([{ url: "/authors", scrollTop: 100, version: 0 }]),
    );
    render(
      <MemoryRouter initialEntries={["/series"]}>
        <Harness />
      </MemoryRouter>,
    );
    const stack = JSON.parse(sessionStorage.getItem(STACK_KEY) || "[]");
    expect(stack).toHaveLength(2);
    expect(stack[1]).toMatchObject({ url: "/series", scrollTop: 0 });
  });

  it("click в <main>: обновляется scrollTop и version верхней записи стека", () => {
    invalidateCache(); // version = 1
    render(
      <MemoryRouter initialEntries={["/catalog"]}>
        <Harness />
      </MemoryRouter>,
    );
    main.scrollTop = 420;
    fireEvent.click(main);
    const stack = JSON.parse(sessionStorage.getItem(STACK_KEY) || "[]");
    expect(stack[0].scrollTop).toBe(420);
    expect(stack[0].version).toBe(1);
  });

  it("click по элементу с data-breadcrumb='true': запись не обновляется", () => {
    const link = document.createElement("a");
    link.setAttribute("data-breadcrumb", "true");
    main.appendChild(link);
    render(
      <MemoryRouter initialEntries={["/catalog"]}>
        <Harness />
      </MemoryRouter>,
    );
    main.scrollTop = 420;
    fireEvent.click(link);
    const stack = JSON.parse(sessionStorage.getItem(STACK_KEY) || "[]");
    expect(stack[0].scrollTop).toBe(0);
  });

  it("click по потомку data-breadcrumb='true': тоже не обновляется (closest)", () => {
    const link = document.createElement("a");
    link.setAttribute("data-breadcrumb", "true");
    const child = document.createElement("span");
    link.appendChild(child);
    main.appendChild(link);
    render(
      <MemoryRouter initialEntries={["/catalog"]}>
        <Harness />
      </MemoryRouter>,
    );
    main.scrollTop = 420;
    fireEvent.click(child);
    const stack = JSON.parse(sessionStorage.getItem(STACK_KEY) || "[]");
    expect(stack[0].scrollTop).toBe(0);
  });

  it("ready=false: сохранённый scrollTop не применяется (не перезаписывает пользовательскую позицию)", () => {
    sessionStorage.setItem(
      STACK_KEY,
      JSON.stringify([{ url: "/catalog", scrollTop: 200, version: 0 }]),
    );
    main.scrollTop = 50;
    render(
      <MemoryRouter initialEntries={["/catalog"]}>
        <Harness ready={false} />
      </MemoryRouter>,
    );
    expect(main.scrollTop).toBe(50);
  });

  it("stale version: scroll не применяется", () => {
    for (let i = 0; i < 5; i++) invalidateCache();
    sessionStorage.setItem(
      STACK_KEY,
      JSON.stringify([{ url: "/catalog", scrollTop: 200, version: 1 }]),
    );
    render(
      <MemoryRouter initialEntries={["/catalog"]}>
        <Harness />
      </MemoryRouter>,
    );
    expect(main.scrollTop).toBe(0);
  });

  it.each([
    ["невалидный JSON", "{ not json"],
    ["валидный JSON, не массив", '{"not":"array"}'],
    ["массив без version", '[{"url":"/x","scrollTop":10}]'],
    ["элемент с неверными типами", '[{"url":42,"scrollTop":"10","version":"0"}]'],
  ])("битая схема (%s): стек сбрасывается, push со scrollTop 0", (_, raw) => {
    sessionStorage.setItem(STACK_KEY, raw);
    render(
      <MemoryRouter initialEntries={["/catalog"]}>
        <Harness />
      </MemoryRouter>,
    );
    const stack = JSON.parse(sessionStorage.getItem(STACK_KEY) || "[]");
    expect(stack).toEqual([{ url: "/catalog", scrollTop: 0, version: 0 }]);
  });

  it("fresh-переход: стек заменяется, main.scrollTop=0, cache-запись удаляется", () => {
    sessionStorage.setItem(
      STACK_KEY,
      JSON.stringify([
        { url: "/", scrollTop: 300, version: 0 },
        { url: "/authors", scrollTop: 100, version: 0 },
      ]),
    );
    sessionStorage.setItem(
      "librarium_catalog_cache",
      JSON.stringify({ "/": { books: [], hasMore: false, cursor: 0, version: 0 } }),
    );
    main.scrollTop = 100;

    function FreshTrigger() {
      const navigate = useNavigate();
      const [clicked, setClicked] = useState(false);
      return (
        <>
          <Harness />
          <button
            onClick={() => {
              navigate("/", { state: { fresh: true } });
              setClicked(true);
            }}
          >
            go
          </button>
          <span>{clicked ? "clicked" : ""}</span>
        </>
      );
    }

    const { getByText } = render(
      <MemoryRouter initialEntries={["/authors"]}>
        <FreshTrigger />
      </MemoryRouter>,
    );
    fireEvent.click(getByText("go"));

    const stack = JSON.parse(sessionStorage.getItem(STACK_KEY) || "[]");
    expect(stack).toEqual([{ url: "/", scrollTop: 0, version: 0 }]);
    expect(main.scrollTop).toBe(0);
    const cache = JSON.parse(sessionStorage.getItem("librarium_catalog_cache") || "{}");
    expect(cache["/"]).toBeUndefined();
  });

  it("unmount: removeEventListener вызывается с capture=true", () => {
    const removeSpy = vi.spyOn(main, "removeEventListener");
    const { unmount } = render(
      <MemoryRouter initialEntries={["/catalog"]}>
        <Harness />
      </MemoryRouter>,
    );
    unmount();
    const call = removeSpy.mock.calls.find(([evt]) => evt === "click");
    expect(call).toBeTruthy();
    expect(call?.[2]).toBe(true);
  });

  it("click по потомку с stopPropagation: всё равно обновляет запись (capture-фаза)", () => {
    const button = document.createElement("button");
    button.addEventListener("click", (e) => e.stopPropagation());
    main.appendChild(button);
    render(
      <MemoryRouter initialEntries={["/catalog"]}>
        <Harness />
      </MemoryRouter>,
    );
    main.scrollTop = 420;
    fireEvent.click(button);
    const stack = JSON.parse(sessionStorage.getItem(STACK_KEY) || "[]");
    expect(stack[0].scrollTop).toBe(420);
  });
});
