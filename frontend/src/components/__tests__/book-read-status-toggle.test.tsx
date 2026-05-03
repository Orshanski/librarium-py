import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import BookReadStatusToggle from "../book-read-status-toggle";

describe("BookReadStatusToggle", () => {
  it("renders unread state", () => {
    render(<BookReadStatusToggle isRead={false} onToggle={() => {}} />);

    expect(screen.getByRole("button", { name: /не прочитано/i })).toBeInTheDocument();
  });

  it("renders read state", () => {
    render(<BookReadStatusToggle isRead={true} onToggle={() => {}} />);

    expect(screen.getByRole("button", { name: /прочитано/i })).toHaveTextContent("✓ Прочитано");
  });

  it("exposes pressed state to assistive tech", () => {
    render(<BookReadStatusToggle isRead={true} onToggle={() => {}} />);

    expect(screen.getByRole("button", { name: /прочитано/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("triggers onToggle on click", () => {
    const onToggle = vi.fn();
    render(<BookReadStatusToggle isRead={false} onToggle={onToggle} />);

    fireEvent.click(screen.getByRole("button", { name: /не прочитано/i }));
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
