import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useScrollRestore } from "../useScrollRestore";
import { domainEvents } from "@/domain/events";
import { registerScrollInvalidationHandlers } from "@/scroll/list-scroll-validity";
import type { ScrollContext } from "@/domain/read-models";

const STACK_KEY = "librarium_scroll_state";
const CATALOG_CONTEXT = { kind: "book-list" as const, key: "/catalog", source: "catalog" as const, sort: "addedDesc" as const };

function Harness({ ready = true, context = CATALOG_CONTEXT }: Readonly<{ ready?: boolean; context?: ScrollContext }>) {
  useScrollRestore(ready, context);
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
    domainEvents.clear();
    registerScrollInvalidationHandlers(domainEvents);
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
    expect(stack[0]).toMatchObject({ url: "/catalog", scrollTop: 0, version: 0, context: CATALOG_CONTEXT });
  });

  it("state=null на mount: стек ЗАМЕЩАЕТСЯ одной записью (wipe предыдущих)", () => {
    sessionStorage.setItem(
      STACK_KEY,
      JSON.stringify([
        { url: "/authors", scrollTop: 300, version: 0 },
        { url: "/authors/1", scrollTop: 150, version: 0 },
        { url: "/book/42", scrollTop: 0, version: 0 },
      ]),
    );
    render(
      <MemoryRouter initialEntries={["/catalog"]}>
        <Harness />
      </MemoryRouter>,
    );
    const stack = JSON.parse(sessionStorage.getItem(STACK_KEY) || "[]");
    expect(stack).toEqual([{ url: "/catalog", scrollTop: 0, context: CATALOG_CONTEXT, version: 0 }]);
  });

  it("state!=null, URL есть в стеке: trim до [0, i+1), scrollTop применяется", () => {
    sessionStorage.setItem(
      STACK_KEY,
      JSON.stringify([
        { url: "/authors", scrollTop: 300, version: 0 },
        { url: "/authors/1", scrollTop: 150, version: 0 },
        { url: "/book/42", scrollTop: 0, version: 0 },
      ]),
    );
    render(
      <MemoryRouter initialEntries={[{ pathname: "/authors", state: { crumb: true } }]}>
        <Harness />
      </MemoryRouter>,
    );
    const stack = JSON.parse(sessionStorage.getItem(STACK_KEY) || "[]");
    expect(stack).toHaveLength(1);
    expect(main.scrollTop).toBe(300);
  });

  it("state!=null, URL отсутствует в стеке: push, цепочка растёт", () => {
    sessionStorage.setItem(
      STACK_KEY,
      JSON.stringify([{ url: "/authors", scrollTop: 100, version: 0 }]),
    );
    render(
      <MemoryRouter initialEntries={[{ pathname: "/authors/1", state: { origin: { type: "author", url: "/authors", label: "Авторы" } } }]}>
        <Harness />
      </MemoryRouter>,
    );
    const stack = JSON.parse(sessionStorage.getItem(STACK_KEY) || "[]");
    expect(stack).toHaveLength(2);
    expect(stack[1]).toMatchObject({ url: "/authors/1", scrollTop: 0 });
  });

  it("click в <main>: обновляется scrollTop верхней записи стека", () => {
    render(
      <MemoryRouter initialEntries={["/catalog"]}>
        <Harness />
      </MemoryRouter>,
    );
    main.scrollTop = 420;
    fireEvent.click(main);
    const stack = JSON.parse(sessionStorage.getItem(STACK_KEY) || "[]");
    expect(stack[0].scrollTop).toBe(420);
    expect(stack[0].version).toBe(0);
    expect(stack[0].context).toEqual(CATALOG_CONTEXT);
  });

  it("click по элементу с data-breadcrumb='true': запись не обновляется", () => {
    const link = document.createElement("a");
    link.dataset.breadcrumb = "true";
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
    link.dataset.breadcrumb = "true";
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

  it("version больше не блокирует доменно-валидный scroll", () => {
    sessionStorage.setItem(
      STACK_KEY,
      JSON.stringify([{ url: "/catalog", scrollTop: 200, version: 1 }]),
    );
    render(
      <MemoryRouter initialEntries={[{ pathname: "/catalog", state: { crumb: true } }]}>
        <Harness />
      </MemoryRouter>,
    );
    expect(main.scrollTop).toBe(200);
  });

  it("preserves catalog scroll after patchable book update event", () => {
    sessionStorage.setItem(
      STACK_KEY,
      JSON.stringify([
        {
          url: "/catalog",
          scrollTop: 240,
          version: 0,
          context: CATALOG_CONTEXT,
        },
      ]),
    );

    domainEvents.publish("bookUpdated", {
      book: { id: 7, title: "Dune" },
      changedFields: ["description"],
    });

    render(
      <MemoryRouter initialEntries={[{ pathname: "/catalog", state: { crumb: true } }]}>
        <Harness />
      </MemoryRouter>,
    );

    expect(main.scrollTop).toBe(240);
  });

  it("resets catalog scroll after structural book create event", () => {
    sessionStorage.setItem(
      STACK_KEY,
      JSON.stringify([
        {
          url: "/catalog",
          scrollTop: 240,
          version: 0,
          context: CATALOG_CONTEXT,
        },
      ]),
    );

    domainEvents.publish("bookCreated", { bookId: 8, book: { id: 8, title: "New" } });

    render(
      <MemoryRouter initialEntries={[{ pathname: "/catalog", state: { crumb: true } }]}>
        <Harness />
      </MemoryRouter>,
    );

    expect(main.scrollTop).toBe(0);
  });

  it("does not overwrite previous stack entry when current page was invalidated by event", () => {
    const shelfContext = {
      kind: "book-list" as const,
      key: "/shelves/3",
      source: "shelf-regular" as const,
      sort: "addedDesc" as const,
      shelfId: 3,
    };
    sessionStorage.setItem(
      STACK_KEY,
      JSON.stringify([
        { url: "/", scrollTop: 500, version: 0, context: CATALOG_CONTEXT },
        { url: "/shelves/3", scrollTop: 240, version: 0, context: shelfContext },
      ]),
    );

    render(
      <MemoryRouter initialEntries={[{ pathname: "/shelves/3", state: { origin: { type: "shelf", url: "/", label: "Shelf" } } }]}>
        <Harness context={shelfContext} />
      </MemoryRouter>,
    );

    domainEvents.publish("shelfMembershipChanged", { shelfId: 3, bookId: 10, hasBook: false });
    main.scrollTop = 360;
    fireEvent.click(main);

    expect(JSON.parse(sessionStorage.getItem(STACK_KEY) || "[]")).toEqual([
      { url: "/", scrollTop: 500, version: 0, context: CATALOG_CONTEXT },
    ]);
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
    expect(stack).toEqual([{ url: "/catalog", scrollTop: 0, context: CATALOG_CONTEXT, version: 0 }]);
  });

  it("sidebar-подобный переход (navigate без state): стек wipe, catalog-cache НЕ трогается", () => {
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

    function SidebarTrigger() {
      const navigate = useNavigate();
      const [clicked, setClicked] = useState(false);
      return (
        <>
          <Harness />
          <button
            onClick={() => {
              navigate("/");
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
      <MemoryRouter initialEntries={[{ pathname: "/authors", state: { crumb: true } }]}>
        <SidebarTrigger />
      </MemoryRouter>,
    );
    fireEvent.click(getByText("go"));

    // sidebar-переход wipe стек:
    const stack = JSON.parse(sessionStorage.getItem(STACK_KEY) || "[]");
    expect(stack).toEqual([{ url: "/", scrollTop: 0, context: CATALOG_CONTEXT, version: 0 }]);
    // catalog-cache НЕ трогается (дорого):
    const cache = JSON.parse(sessionStorage.getItem("librarium_catalog_cache") || "{}");
    expect(cache["/"]).toBeDefined();
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
