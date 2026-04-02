import { useIsMobile } from "../responsive";
import DesktopReaderPage from "./desktop/DesktopReaderPage";
import MobileReaderPage from "./mobile/MobileReaderPage";

export default function ReaderPage() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileReaderPage /> : <DesktopReaderPage />;
}
