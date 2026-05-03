import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import BookMetaPillList from "../book-meta-pill-list";

const tokens = {
  pill: {
    padding: "5px 12px",
    fontSize: 12,
    borderRadius: 14,
    background: "rgba(255, 255, 255, 0.06)",
    border: "1px solid #333",
    color: "#eee",
  },
  gap: 6,
  marginBottom: 16,
};

describe("BookMetaPillList", () => {
  it("renders nothing for an empty list", () => {
    const { container } = render(<BookMetaPillList items={[]} tokens={tokens} />);

    expect(container.firstChild).toBeNull();
  });

  it("renders every item as a metadata pill", () => {
    render(<BookMetaPillList items={["Автор", "Тег"]} tokens={tokens} />);

    expect(screen.getByText("Автор")).toBeInTheDocument();
    expect(screen.getByText("Тег")).toBeInTheDocument();
  });

  it("renders duplicate labels without React key collisions", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    render(<BookMetaPillList items={["Автор", "Автор"]} tokens={tokens} />);

    expect(screen.getAllByText("Автор")).toHaveLength(2);
    expect(consoleError).not.toHaveBeenCalledWith(expect.stringContaining("Encountered two children with the same key"));
    consoleError.mockRestore();
  });
});
