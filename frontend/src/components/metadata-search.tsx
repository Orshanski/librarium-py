import { useState } from "react";
import { useIsMobile } from "../responsive";
import DesktopMetadataSearch from "./desktop/desktop-metadata-search";
import MobileMetadataSearch from "./mobile/mobile-metadata-search";
import { MetadataResult } from "./metadata-search.types";

const providers = [
  { key: "litres", label: "Litres" },
  { key: "google", label: "Google Books" },
];

export default function MetadataSearch({
  query,
  onApply,
  onClose,
}: {
  query: string;
  onApply: (data: Partial<MetadataResult>) => void;
  onClose: () => void;
}) {
  const isMobile = useIsMobile();
  const [activeProviders, setActiveProviders] = useState<Set<string>>(new Set(["litres"]));
  const [searchQuery, setSearchQuery] = useState(query);
  const [results, setResults] = useState<MetadataResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  function fetchResults(providerKeys: Set<string>) {
    setSearching(true);
    fetch(`/api/metadata/search?q=${encodeURIComponent(searchQuery)}&providers=${Array.from(providerKeys).join(",")}`)
      .then((r) => r.json())
      .then((data) => {
        setResults(data.results || []);
        setSearching(false);
      })
      .catch(() => {
        setResults([]);
        setSearching(false);
      });
  }

  function toggleProvider(key: string) {
    const next = new Set(activeProviders);
    if (next.has(key)) {
      if (next.size > 1) next.delete(key);
    } else {
      next.add(key);
    }
    setActiveProviders(next);
    if (results !== null) fetchResults(next);
  }

  const viewProps = {
    query,
    searching,
    results,
    activeProviders,
    searchQuery,
    onClose,
    onSetSearchQuery: setSearchQuery,
    onSearch: () => fetchResults(activeProviders),
    onToggleProvider: toggleProvider,
    onApply,
  };

  return isMobile ? <MobileMetadataSearch {...viewProps} /> : <DesktopMetadataSearch {...viewProps} />;
}
