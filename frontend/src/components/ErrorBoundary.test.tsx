// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ErrorBoundary from "./ErrorBoundary";

function Bomb({ throwNow = true }: { throwNow?: boolean }): JSX.Element {
  if (throwNow) throw new Error("boom");
  return <div>ok</div>;
}

describe("ErrorBoundary", () => {
  it("renders children when no error thrown", () => {
    render(
      <ErrorBoundary>
        <Bomb throwNow={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("ok")).toBeInTheDocument();
  });

  it("renders default fallback UI with title and back button when child throws", () => {
    // React logs the error to console.error; test/setup silences it already.
    render(
      <ErrorBoundary title="Something broke" backLabel="Назад">
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Something broke")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Назад" })).toBeInTheDocument();
  });

  it("uses custom fallback when provided", () => {
    render(
      <ErrorBoundary fallback={<div>custom-fallback</div>}>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText("custom-fallback")).toBeInTheDocument();
  });

  it("click back calls onBack prop if provided", () => {
    const onBack = vi.fn();
    render(
      <ErrorBoundary onBack={onBack} backLabel="Back">
        <Bomb />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalled();
  });

  it("click back falls back to globalThis.history.back when no onBack prop", () => {
    const backSpy = vi.spyOn(globalThis.history, "back").mockImplementation(() => {});
    render(
      <ErrorBoundary backLabel="Back">
        <Bomb />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(backSpy).toHaveBeenCalled();
    backSpy.mockRestore();
  });
});
