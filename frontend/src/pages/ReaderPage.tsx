import { useParams } from "react-router-dom";
import { useIsMobile } from "../responsive";
import DesktopReaderPage from "./desktop/DesktopReaderPage";
import MobileReaderPage from "./mobile/MobileReaderPage";
import PdfReaderPage from "./PdfReaderPage";

export default function ReaderPage() {
  const { format } = useParams();
  const isMobile = useIsMobile();
  if (format?.toLowerCase() === "pdf") return <PdfReaderPage />;
  return isMobile ? <MobileReaderPage /> : <DesktopReaderPage />;
}
