export interface TocItem {
  label: string;
  href: string;
  subitems?: TocItem[];
}

export interface FlatTocItem {
  label: string;
  href: string;
  depth: number;
}
