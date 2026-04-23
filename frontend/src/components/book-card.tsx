import { useIsMobile } from "../responsive";
import { BookCardProps } from "./book-card.types";
import DesktopBookCard from "./desktop/desktop-book-card";
import MobileBookCard from "./mobile/mobile-book-card";

export default function BookCard(props: Readonly<BookCardProps>) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return <MobileBookCard {...props} />;
  }

  return <DesktopBookCard {...props} />;
}
