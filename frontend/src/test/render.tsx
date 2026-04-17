import { render, type RenderOptions } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { type ReactElement, type ReactNode } from "react";
import { AuthProvider } from "@/auth";
import { ResponsiveProvider } from "@/responsive";

interface TestRenderOptions extends Omit<RenderOptions, "wrapper"> {
  initialEntries?: string[];
}

function AllProviders({
  children,
  initialEntries,
}: {
  children: ReactNode;
  initialEntries?: string[];
}) {
  return (
    <MemoryRouter initialEntries={initialEntries ?? ["/"]}>
      <AuthProvider>
        <ResponsiveProvider>{children}</ResponsiveProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

export function renderWithProviders(
  ui: ReactElement,
  options: TestRenderOptions = {}
) {
  const { initialEntries, ...rest } = options;
  return render(ui, {
    wrapper: ({ children }) => (
      <AllProviders initialEntries={initialEntries}>{children}</AllProviders>
    ),
    ...rest,
  });
}
