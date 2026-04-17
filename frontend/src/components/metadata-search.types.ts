import type { MetadataResult } from "@/api/endpoints/metadata";
export type { MetadataResult };

export const metadataProviders = [
  { key: "litres", label: "Litres" },
  { key: "google", label: "Google Books" },
] as const;

export interface MetadataSearchViewProps {
  query: string;
  searching: boolean;
  results: MetadataResult[] | null;
  error: string | null;
  activeProviders: Set<string>;
  searchQuery: string;
  onClose: () => void;
  onSetSearchQuery: (value: string) => void;
  onSearch: () => void;
  onToggleProvider: (key: string) => void;
  onApply: (data: Partial<MetadataResult>) => void;
}
