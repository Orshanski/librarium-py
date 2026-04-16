export interface ReaderLoadDetail {
  doc?: Document;
}

export interface ReaderTapDetail {
  screenX: number;
  screenY: number;
  target: Element | null;
}

export interface ReaderLinkDetail {
  a: Element;
  href: string;
}
