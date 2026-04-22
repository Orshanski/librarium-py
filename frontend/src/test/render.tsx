import { render, type RenderOptions } from "@testing-library/react";
import { MemoryRouter, type InitialEntry } from "react-router-dom";
import { type ReactElement, type ReactNode } from "react";
import type { Queries } from "@testing-library/dom";
import { queries as defaultQueries } from "@testing-library/dom";
import { AuthProvider } from "@/auth";
import { ResponsiveProvider } from "@/responsive";

type TestRenderOptions<
  Q extends Queries = typeof defaultQueries,
  Container extends Element | DocumentFragment = HTMLElement,
  BaseElement extends Element | DocumentFragment = Container,
> = Omit<RenderOptions<Q, Container, BaseElement>, "wrapper"> & {
  initialEntries?: InitialEntry[];
};

function AllProviders({
  children,
  initialEntries,
}: {
  children: ReactNode;
  initialEntries?: InitialEntry[];
}) {
  return (
    <MemoryRouter initialEntries={initialEntries ?? ["/"]}>
      <AuthProvider>
        <ResponsiveProvider>{children}</ResponsiveProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

export function renderWithProviders<
  Q extends Queries = typeof defaultQueries,
  Container extends Element | DocumentFragment = HTMLElement,
  BaseElement extends Element | DocumentFragment = Container,
>(
  ui: ReactElement,
  options: TestRenderOptions<Q, Container, BaseElement> = {}
) {
  const { initialEntries, ...rest } = options;
  return render(ui, {
    wrapper: ({ children }) => (
      <AllProviders initialEntries={initialEntries}>{children}</AllProviders>
    ),
    ...rest,
  });
}
