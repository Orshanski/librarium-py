// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MobileFilterBar from "./mobile-filter-bar";
import type { FilterConfig } from "../filter-bar";

const filters: FilterConfig[] = [
  {
    key: "authorIds",
    label: "Автор",
    options: [
      { id: 1, name: "Асимов" },
      { id: 2, name: "Гомер" },
    ],
  },
  {
    key: "language",
    label: "Язык",
    options: [{ name: "ru" }, { name: "en" }],
  },
];

describe("MobileFilterBar", () => {
  it("renders chip per filter with label when nothing selected", () => {
    render(
      <MobileFilterBar
        filters={filters}
        selected={{}}
        onSelectionChange={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /Автор/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Язык/ })).toBeInTheDocument();
  });

  it("chip shows selected name when single value selected", () => {
    render(
      <MobileFilterBar
        filters={filters}
        selected={{ authorIds: ["1"] }}
        onSelectionChange={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /Асимов/ })).toBeInTheDocument();
  });

  it("chip shows '{n} выбрано' when 3+ values selected", () => {
    const filtersWithMany: FilterConfig[] = [{
      key: "authorIds",
      label: "Автор",
      options: [
        { id: 1, name: "A" },
        { id: 2, name: "B" },
        { id: 3, name: "C" },
      ],
    }];
    render(
      <MobileFilterBar
        filters={filtersWithMany}
        selected={{ authorIds: ["1", "2", "3"] }}
        onSelectionChange={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /3 выбрано/ })).toBeInTheDocument();
  });

  it("click chip opens dropdown with options", () => {
    render(
      <MobileFilterBar
        filters={filters}
        selected={{}}
        onSelectionChange={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Автор/ }));
    expect(screen.getByText("Асимов")).toBeInTheDocument();
    expect(screen.getByText("Гомер")).toBeInTheDocument();
  });

  it("checkbox click triggers onSelectionChange with new list", () => {
    const onChange = vi.fn();
    render(
      <MobileFilterBar
        filters={filters}
        selected={{}}
        onSelectionChange={onChange}
        onClearAll={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Автор/ }));
    const checkboxAsimov = screen.getByRole("checkbox", { name: /Асимов/ });
    fireEvent.click(checkboxAsimov);
    expect(onChange).toHaveBeenCalledWith("authorIds", ["1"]);
  });

  it("'Сбросить все' button visible only when something selected, calls onClearAll", () => {
    const onClearAll = vi.fn();
    const { rerender } = render(
      <MobileFilterBar
        filters={filters}
        selected={{}}
        onSelectionChange={vi.fn()}
        onClearAll={onClearAll}
      />,
    );
    expect(screen.queryByRole("button", { name: /Сбросить все/ })).toBeNull();

    rerender(
      <MobileFilterBar
        filters={filters}
        selected={{ authorIds: ["1"] }}
        onSelectionChange={vi.fn()}
        onClearAll={onClearAll}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Сбросить все/ }));
    expect(onClearAll).toHaveBeenCalled();
  });
});
