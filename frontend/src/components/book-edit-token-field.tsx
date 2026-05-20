import { colors } from "../theme";
import Combobox, { ComboboxOption } from "./combobox";

const tokenStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "4px 10px",
  fontSize: 12,
  borderRadius: 12,
  backgroundColor: "rgba(249, 190, 3, 0.12)",
  border: "1px solid rgba(249, 190, 3, 0.3)",
  color: colors.accent,
};

const removeButtonStyle: React.CSSProperties = {
  appearance: "none",
  background: "none",
  border: "none",
  color: "inherit",
  cursor: "pointer",
  font: "inherit",
  fontSize: 11,
  lineHeight: 1,
  marginLeft: 2,
  padding: 0,
};

export default function BookEditTokenField({
  id,
  values,
  searchValue,
  options,
  placeholder,
  testId,
  onSearchChange,
  onAdd,
  onRemove,
}: Readonly<{
  id?: string;
  values: string[];
  searchValue: string;
  options: ComboboxOption[];
  placeholder: string;
  testId: string;
  onSearchChange: (value: string) => void;
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
}>) {
  const selected = new Set(values);
  const availableOptions = options.filter((option) => !selected.has(option.value));

  return (
    <div data-testid={testId}>
      <Combobox
        id={id}
        value={searchValue}
        onChange={onSearchChange}
        onSelect={onAdd}
        options={availableOptions}
        placeholder={placeholder}
      />
      {values.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {values.map((value) => (
            <span key={value} style={tokenStyle}>
              {value}
              <button
                type="button"
                aria-label={`Удалить ${value}`}
                onClick={() => onRemove(value)}
                style={removeButtonStyle}
              >
                x
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
