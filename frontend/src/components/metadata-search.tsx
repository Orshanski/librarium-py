import { useState, useRef, useEffect } from "react";
import { useIsMobile } from "../responsive";
import DesktopMetadataSearch from "./desktop/desktop-metadata-search";
import MobileMetadataSearch from "./mobile/mobile-metadata-search";
import { MetadataResult } from "./metadata-search.types";
import { searchMetadata } from "../api/endpoints/metadata";

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
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  function fetchResults(providerKeys: Set<string>) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSearching(true);
    setError(null);
    searchMetadata(searchQuery, Array.from(providerKeys), controller.signal)
      .then((data) => {
        setResults(data.results);
        setSearching(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setResults(null);
        setError("Ошибка поиска метаданных");
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
    error,
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
