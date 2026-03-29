import DesktopShell from "./desktop/desktop-shell";
import MobileShell from "./mobile/mobile-shell";
import { ResponsiveProvider, useIsMobile } from "../responsive";

function ShellLayout({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return <MobileShell>{children}</MobileShell>;
  }

  return <DesktopShell>{children}</DesktopShell>;
}

export default function Shell({ children }: { children: React.ReactNode }) {
  return (
    <ResponsiveProvider>
      <ShellLayout>{children}</ShellLayout>
    </ResponsiveProvider>
  );
}
