import { useIsMobile } from "../responsive";
import DesktopReaderToolbar from "./desktop/desktop-reader-toolbar";
import MobileReaderToolbar from "./mobile/mobile-reader-toolbar";
import type { ReaderToolbarProps } from "../types/reader-toolbar";

export default function ReaderToolbar(props: ReaderToolbarProps) {
  return useIsMobile() ? <MobileReaderToolbar {...props} /> : <DesktopReaderToolbar {...props} />;
}
