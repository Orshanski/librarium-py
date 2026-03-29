export interface MetadataResult {
  title: string;
  authors: string;
  description: string;
  publisher: string;
  pubDate: string;
  isbn: string;
  tags: string;
  source: string;
  coverUrl: string;
}

export interface MetadataSearchViewProps {
  query: string;
  searching: boolean;
  results: MetadataResult[] | null;
  activeProviders: Set<string>;
  searchQuery: string;
  onClose: () => void;
  onSetSearchQuery: (value: string) => void;
  onSearch: () => void;
  onToggleProvider: (key: string) => void;
  onApply: (data: Partial<MetadataResult>) => void;
}
