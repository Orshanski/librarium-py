import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";

import PageHeader from "../components/page-header";
import Combobox from "../components/combobox";
import { colors, fonts } from "../theme";
import { getTagCloud, listTagOptions } from "../api/endpoints/tags";
import type { CloudTag, DirectoryTag } from "../api/endpoints/tags";

const CLOUD_SIZE = 30;

// Stable shuffle based on name — so cloud doesn't jump on re-render
function shuffled<T extends { name: string }>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    let h = 0;
    for (let j = 0; j < copy[i].name.length; j++) h = ((h << 5) - h + copy[i].name.charCodeAt(j)) | 0;
    const j = Math.abs(h) % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function TagsPage() {
  const [search, setSearch] = useState("");
  const [cloudTags, setCloudTags] = useState<CloudTag[]>([]);
  const [allTags, setAllTags] = useState<DirectoryTag[]>([]);

  useEffect(() => {
    getTagCloud({ top: CLOUD_SIZE })
      .then((data) => setCloudTags(data.tags || []))
      .catch((err) => console.warn("Failed to fetch tag cloud:", err));
    listTagOptions()
      .then((data) => setAllTags(data.tags || []))
      .catch((err) => console.warn("Failed to fetch tag options:", err));
  }, []);

  const shuffledCloud = useMemo(() => shuffled(cloudTags), [cloudTags]);

  const maxCount = cloudTags[0]?.book_count || 1;
  const minCloudCount = cloudTags[cloudTags.length - 1]?.book_count || 1;

  function ratio(count: number): number {
    if (maxCount === minCloudCount) return 1;
    const logMin = Math.log(minCloudCount);
    const logMax = Math.log(maxCount);
    return (Math.log(count) - logMin) / (logMax - logMin);
  }

  function fontSize(count: number): number {
    return 13 + ratio(count) * 26;
  }

  function opacity(count: number): number {
    return 0.6 + ratio(count) * 0.4;
  }


  return (
    <>
      <PageHeader title="Жанры" showUpload />

      {/* Search */}
      <div style={{ marginBottom: 32, maxWidth: 400, margin: "0 auto 32px" }}>
        <Combobox
          value={search}
          onChange={(val) => {
            setSearch(val);
            const tag = allTags.find((t) => t.name === val);
            if (tag) {
              globalThis.location.href = `/tags/${tag.id}`;
            }
          }}
          options={allTags.map((t) => ({ value: t.name }))}
          placeholder="Найти жанр..."
        />
      </div>

      {/* Tag cloud */}
      <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            alignItems: "center",
            gap: "8px 16px",
            maxWidth: 800,
            margin: "0 auto",
            padding: "20px 0",
          }}
        >
          {shuffledCloud.map((t) => (
            <Link
              key={t.id}
              to={`/tags/${t.id}`}
              style={{
                fontSize: fontSize(t.book_count),
                fontFamily: fonts.display,
                color: colors.textSecondary,
                opacity: opacity(t.book_count),
                textDecoration: "none",
                transition: "color 0.15s, opacity 0.15s",
                padding: "2px 4px",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = colors.accent;
                e.currentTarget.style.opacity = "1";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = colors.textSecondary;
                e.currentTarget.style.opacity = String(opacity(t.book_count));
              }}
            >
              {t.name} <span style={{ fontSize: "0.65em", opacity: 0.6 }}>({t.book_count})</span>
            </Link>
          ))}
        </div>
    </>
  );
}
