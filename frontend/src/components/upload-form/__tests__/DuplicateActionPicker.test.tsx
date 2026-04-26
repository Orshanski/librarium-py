// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DuplicateActionPicker from "../DuplicateActionPicker";
import type { UploadDuplicate } from "@/api/endpoints/upload";

const dup: UploadDuplicate = {
  id: 42, title: "Existing Book",
  authors: [{ id: 1, name: "Author One" }, { id: 2, name: "Author Two" }],
};

describe("DuplicateActionPicker", () => {
  it("shows duplicate book title and joined authors", () => {
    render(<DuplicateActionPicker duplicate={dup} duplicateAction={null} onAction={() => {}} />);
    expect(screen.getByText(/Existing Book/)).toBeInTheDocument();
    expect(screen.getByText(/Author One, Author Two/)).toBeInTheDocument();
  });

  it("duplicateAction=null → both buttons transparent", () => {
    render(<DuplicateActionPicker duplicate={dup} duplicateAction={null} onAction={() => {}} />);
    const addFmt = screen.getByRole("button", { name: /Добавить как формат/ });
    const newBook = screen.getByRole("button", { name: /Сохранить как отдельную/ });
    expect(addFmt.style.background).toBe("transparent");
    expect(newBook.style.background).toBe("transparent");
  });

  it("duplicateAction=add-format → that button highlighted", () => {
    render(<DuplicateActionPicker duplicate={dup} duplicateAction="add-format" onAction={() => {}} />);
    const addFmt = screen.getByRole("button", { name: /Добавить как формат/ });
    const newBook = screen.getByRole("button", { name: /Сохранить как отдельную/ });
    expect(addFmt.style.background).not.toBe("transparent");
    expect(newBook.style.background).toBe("transparent");
  });

  it("click «Добавить как формат» → onAction('add-format')", async () => {
    const onAction = vi.fn();
    render(<DuplicateActionPicker duplicate={dup} duplicateAction={null} onAction={onAction} />);
    await userEvent.click(screen.getByRole("button", { name: /Добавить как формат/ }));
    expect(onAction).toHaveBeenCalledWith("add-format");
  });

  it("click «Сохранить как отдельную» → onAction('new-book')", async () => {
    const onAction = vi.fn();
    render(<DuplicateActionPicker duplicate={dup} duplicateAction={null} onAction={onAction} />);
    await userEvent.click(screen.getByRole("button", { name: /Сохранить как отдельную/ }));
    expect(onAction).toHaveBeenCalledWith("new-book");
  });
});
