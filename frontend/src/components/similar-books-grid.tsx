import { useIsMobile } from "../responsive";
import { SimilarBooksViewProps } from "./similar-books.types";
import DesktopSimilarBooks from "./desktop/desktop-similar-books";
import MobileSimilarBooks from "./mobile/mobile-similar-books";

export default function SimilarBooksGrid(props: Readonly<SimilarBooksViewProps>) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return <MobileSimilarBooks {...props} />;
  }

  return <DesktopSimilarBooks {...props} />;
}
