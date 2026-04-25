import { colors } from "../theme";
import { Shelf } from "./book-detail.types";

export default function ShelfDropdownMenu({
  shelves,
  selectedIds,
  onToggleShelf,
  compact = false,
}: Readonly<{
  shelves: Shelf[];
  selectedIds: Set<number>;
  onToggleShelf: (shelfId: number) => void | Promise<void>;
  compact?: boolean;
}>) {
  const visibleShelves = shelves.filter((shelf) => !shelf.isSystem);

  return (
    <>
      {visibleShelves.map((shelf) => (
        <label
          key={shelf.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: compact ? "8px 12px" : "6px 12px",
            fontSize: 13,
            color: colors.textSecondary,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={selectedIds.has(shelf.id)}
            onChange={() => {
              void onToggleShelf(shelf.id);
            }}
            style={{ accentColor: colors.accent }}
          />
          {shelf.name}
        </label>
      ))}
      {visibleShelves.length === 0 && (
        <div style={{ padding: "8px 12px", fontSize: 12, color: colors.textDim }}>
          Нет полок
        </div>
      )}
    </>
  );
}
