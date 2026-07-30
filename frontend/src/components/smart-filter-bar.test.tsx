// @vitest-environment jsdom
import { beforeEach, describe, it, expect, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, delay } from "msw";
import { server } from "@/test/msw/server";
import { ResponsiveProvider } from "@/responsive";
import { domainEvents } from "@/domain/events";
import { metadataCache } from "@/cache";
import { registerMetadataCacheHandlers } from "@/cache/handlers";
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

const mockLanguages = [{ name: "English" }, { name: "Russian" }];

// Global MSW server is already `listen`ing via src/test/setup.ts.
// server.resetHandlers() runs automatically in afterEach from that setup.
//
// Per-test handlers are registered via server.use(...).

describe("SmartFilterBar", () => {
  beforeEach(() => {
    sessionStorage.clear();
    domainEvents.clear();
    metadataCache.clear();
    registerMetadataCacheHandlers(metadataCache, domainEvents);
  });

  it("does not use the legacy librarium_filter_options sessionStorage cache", async () => {
    const user = userEvent.setup();
    sessionStorage.setItem("librarium_filter_options", JSON.stringify({
      key: "authorIds|",
      options: { authorIds: [{ id: 999, name: "Stale Author" }] },
    }));
    server.use(
      http.get("/api/filter-options/authors", () =>
        HttpResponse.json({ authors: mockAuthors }),
      ),
    );

    render(
      <SmartFilterBar
        filterKeys={["authorIds"]}
        selected={{}}
        onSelectionChange={vi.fn()}
        onClearAll={vi.fn()}
      />,
      { wrapper: ResponsiveProvider },
    );

    await screen.findByRole("button", { name: /Автор/ });
    await user.click(screen.getByRole("button", { name: /Автор/ }));

    expect(screen.queryByText("Stale Author")).not.toBeInTheDocument();
    expect(await screen.findByText("Author One")).toBeInTheDocument();
  });

  it("patches mounted options after author rename", async () => {
    const user = userEvent.setup();
    let call = 0;
    server.use(
      http.get("/api/filter-options/authors", () => {
        call += 1;
        return HttpResponse.json({
          authors: [{ id: 1, name: call === 1 ? "Old Author" : "New Author" }],
        });
      }),
    );

    render(
      <SmartFilterBar
        filterKeys={["authorIds"]}
        selected={{}}
        onSelectionChange={vi.fn()}
        onClearAll={vi.fn()}
      />,
      { wrapper: ResponsiveProvider },
    );

    await screen.findByRole("button", { name: /Автор/ });
    await user.click(screen.getByRole("button", { name: /Автор/ }));
    await screen.findByText("Old Author");

    domainEvents.publish("authorRenamed", { authorId: 1, name: "New Author" });

    await waitFor(() => expect(screen.queryByText("Old Author")).not.toBeInTheDocument());
    await screen.findByText("New Author");
    expect(call).toBe(1);
  });

  it("держит прежние варианты, пока грузятся суженные", async () => {
    // Выбор в соседнем фильтре меняет ключ кэша вариантов: до прихода ответа
    // options[key] === undefined, и чип, который рисуется только по загруженным
    // вариантам, размонтировался бы — панель моргает (o0ky).
    //
    // Чип берётся с выбранным значением: его подпись разрешается из списка вариантов
    // (filter-bar.chipLabel), поэтому «удержали прежний список» отличимо от «отрисовали
    // пустой чип» — при пустом списке на кнопке оказался бы сырой идентификатор «1».
    let calls = 0;
    server.use(
      http.get("/api/filter-options/tags", () => {
        calls += 1;
        return HttpResponse.json({ tags: mockTags });
      }),
    );

    const user = userEvent.setup();
    const { rerender } = render(
      <SmartFilterBar
        filterKeys={["tagIds"]}
        selected={{ tagIds: ["1"] }}
        onSelectionChange={() => {}}
        onClearAll={() => {}}
      />,
      { wrapper: ResponsiveProvider },
    );
    expect(await screen.findByRole("button", { name: /Fiction/ })).toBeInTheDocument();
    expect(calls).toBe(1);

    // Ответ по новому ключу не приходит вовсе — окно перезагрузки держится.
    server.use(
      http.get("/api/filter-options/tags", () => {
        calls += 1;
        return new Promise(() => {});
      }),
    );
    rerender(
      <SmartFilterBar
        filterKeys={["tagIds"]}
        selected={{ tagIds: ["1"], authorIds: ["7"] }}
        onSelectionChange={() => {}}
        onClearAll={() => {}}
      />,
    );

    // Чип на месте и подписан прежним вариантом, а не идентификатором.
    expect(screen.getByRole("button", { name: /Fiction/ })).toBeInTheDocument();

    // И сам список вариантов прежний, а не пустой.
    await user.click(screen.getByRole("button", { name: /Fiction/ }));
    expect(screen.getByText("Science")).toBeInTheDocument();

    // Запросов ровно столько же, сколько было бы без запаса: по одному на ключ кэша.
    expect(calls).toBe(2);
  });

  it("не показывает прежние варианты после сброса кэша: они уже устарели", async () => {
    // filter-options/* сбрасывается как раз тогда, когда варианты перестали быть
    // верными (книга удалена, автор слит, жанр удалён). Показать после этого прежний
    // список значило бы оставить удалённый вариант кликабельным.
    server.use(
      http.get("/api/filter-options/tags", () => HttpResponse.json({ tags: mockTags })),
    );

    render(
      <SmartFilterBar
        filterKeys={["tagIds"]}
        selected={{ tagIds: ["1"] }}
        onSelectionChange={() => {}}
        onClearAll={() => {}}
      />,
      { wrapper: ResponsiveProvider },
    );
    expect(await screen.findByRole("button", { name: /Fiction/ })).toBeInTheDocument();

    // Дальше ответы не приходят: если бы запас переживал сброс, чип остался бы.
    server.use(
      http.get("/api/filter-options/tags", () => new Promise(() => {})),
    );
    await act(async () => {
      domainEvents.publish("tagDeleted", { tagId: 1 });
    });

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Fiction/ })).toBeNull();
    });
  });

  it("renders filter options from API", async () => {
    server.use(
      http.get("/api/filter-options/authors", () =>
        HttpResponse.json({ authors: mockAuthors }),
      ),
      http.get("/api/filter-options/series", () =>
        HttpResponse.json({ series: mockSeries }),
      ),
      http.get("/api/filter-options/tags", () =>
        HttpResponse.json({ tags: mockTags }),
      ),
      http.get("/api/filter-options/languages", () =>
        HttpResponse.json({ languages: mockLanguages }),
      ),
    );

    const user = userEvent.setup();
    render(
      <SmartFilterBar
        filterKeys={["authorIds", "seriesIds", "tagIds", "language"]}
        selected={{}}
        onSelectionChange={() => {}}
        onClearAll={() => {}}
      />,
      { wrapper: ResponsiveProvider },
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Автор/ })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Автор/ }));
    await waitFor(() => {
      expect(screen.getByText("Author One")).toBeInTheDocument();
    });
  });

  it("rapid dependency changes: only latest response is rendered, stale is discarded", async () => {
    // First handler: slow — simulates an in-flight request that should be
    // aborted when props change. Returns "First Author".
    // We DO NOT wait for the slow fetch to resolve. Instead, we immediately
    // rerender with new props — the useEffect cleanup must call
    // controller.abort() on the first fetch. The fast handler registered
    // next returns "Second Author". If abort works, only "Second Author"
    // ever reaches state; "First Author" must never leak into the UI.
    server.use(
      http.get("/api/filter-options/authors", async () => {
        await delay(100);
        return HttpResponse.json({ authors: [{ id: 1, name: "First Author" }] });
      }),
    );

    const { rerender } = render(
      <SmartFilterBar
        filterKeys={["authorIds", "seriesIds"]}
        selected={{}}
        onSelectionChange={() => {}}
        onClearAll={() => {}}
      />,
      { wrapper: ResponsiveProvider },
    );

    // Swap handler to a fast one and rerender immediately — while the first
    // fetch is still sleeping, its AbortController should fire.
    server.use(
      http.get("/api/filter-options/authors", () =>
        HttpResponse.json({ authors: [{ id: 2, name: "Second Author" }] }),
      ),
    );

    rerender(
      <SmartFilterBar
        filterKeys={["authorIds", "seriesIds"]}
        selected={{ seriesIds: ["2"] }}
        onSelectionChange={() => {}}
        onClearAll={() => {}}
      />,
    );

    // Changing another dimension affects the author options request key. Wait
    // for the fast fetch to finish, then open the author dropdown.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Автор/ })).toBeInTheDocument();
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Автор/ }));
    expect(await screen.findByText("Second Author")).toBeInTheDocument();

    // Give the slow handler's delay(100) a chance to elapse. If abort failed,
    // the stale response would now overwrite state and "First Author" would
    // appear. With abort working, it never will.
    await new Promise((r) => setTimeout(r, 150));

    expect(screen.queryByText("First Author")).not.toBeInTheDocument();
    expect(screen.getByText("Second Author")).toBeInTheDocument();
  });

  it("500 error: empty filter option, no crash, no error UI leaks", async () => {
    const user = userEvent.setup();

    server.use(
      http.get("/api/filter-options/authors", () =>
        HttpResponse.json({ detail: "Internal Server Error" }, { status: 500 }),
      ),
      http.get("/api/filter-options/series", () =>
        HttpResponse.json({ series: mockSeries }),
      ),
    );

    render(
      <SmartFilterBar
        filterKeys={["authorIds", "seriesIds"]}
        selected={{}}
        onSelectionChange={() => {}}
        onClearAll={() => {}}
      />,
      { wrapper: ResponsiveProvider },
    );

    // Both filter buttons should still render (the failed dimension gets an
    // empty options list; UI does not crash).
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Автор/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Серия/ })).toBeInTheDocument();
    });

    // Error UI should NOT leak into the bar.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Internal Server Error|HTTP 500|ошибка/i),
    ).not.toBeInTheDocument();

    // Working dimension still loads its options.
    await user.click(screen.getByRole("button", { name: /Серия/ }));
    await waitFor(() => {
      expect(screen.getByText("Series A")).toBeInTheDocument();
    });
  });
});
