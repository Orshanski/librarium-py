// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BookEditTokenField from "../book-edit-token-field";

describe("BookEditTokenField", () => {
  it("renders selected values as removable chips and filters selected options", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const onRemove = vi.fn();
    const onSearchChange = vi.fn();
    function Harness() {
      const [search, setSearch] = useState("");
      return (
        <BookEditTokenField
          values={["Автор Тестов"]}
          searchValue={search}
          options={[{ value: "Автор Тестов" }, { value: "Новый Автор" }]}
          placeholder="Найти или добавить автора..."
          testId="book-edit-token-field-authors"
          onSearchChange={(value) => {
            onSearchChange(value);
            setSearch(value);
          }}
          onAdd={onAdd}
          onRemove={onRemove}
        />
      );
    }

    render(<Harness />);

    const field = screen.getByTestId("book-edit-token-field-authors");
    expect(within(field).getByText("Автор Тестов")).toBeInTheDocument();

    await user.click(within(field).getByRole("button", { name: "Удалить Автор Тестов" }));
    expect(onRemove).toHaveBeenCalledWith("Автор Тестов");

    const input = within(field).getByPlaceholderText("Найти или добавить автора...");
    await user.type(input, "Новый");
    expect(onSearchChange).toHaveBeenLastCalledWith("Новый");

    expect(screen.getAllByText("Автор Тестов")).toHaveLength(1);
    await user.click(screen.getByText("Новый Автор"));
    expect(onAdd).toHaveBeenCalledWith("Новый Автор");
  });
});
