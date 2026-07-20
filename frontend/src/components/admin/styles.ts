import { colors, fonts } from "../../theme";

// ─── Styles ─────────────────────────────────────────
export const inputStyle: React.CSSProperties = {
  width: "100%",
  backgroundColor: "rgba(255, 255, 255, 0.06)",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  borderRadius: 6,
  padding: "9px 12px",
  fontSize: 14,
  color: colors.text,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

export const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: colors.textDim,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: 6,
  display: "block",
};

export const sectionTitleStyle: React.CSSProperties = {
  fontFamily: fonts.display,
  fontSize: 22,
  fontWeight: 600,
  color: colors.text,
  marginBottom: 20,
  paddingBottom: 8,
  borderBottom: `1px solid ${colors.border}`,
};

export const btnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "7px 14px",
  fontSize: 13,
  fontFamily: "inherit",
  borderRadius: 6,
  cursor: "pointer",
  border: `1px solid ${colors.border}`,
  background: "none",
  color: colors.textSecondary,
  transition: "all 0.15s",
};

export const btnSmStyle: React.CSSProperties = { ...btnStyle, padding: "5px 10px", fontSize: 12 };
export const btnAccentStyle: React.CSSProperties = { ...btnStyle, background: colors.accent, color: colors.sidebar, borderColor: colors.accent, fontWeight: 600 };
export const btnSmAccentStyle: React.CSSProperties = { ...btnSmStyle, background: colors.accent, color: colors.sidebar, borderColor: colors.accent, fontWeight: 600 };
export const btnDangerStyle: React.CSSProperties = { ...btnSmStyle, borderColor: "rgba(239,68,68,0.3)", color: colors.danger };
export const btnOutlineAccentStyle: React.CSSProperties = { ...btnStyle, borderColor: "rgba(249,190,3,0.3)", color: colors.accent };

export const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: "none",
  WebkitAppearance: "none",
  paddingRight: 32,
  cursor: "pointer",
  backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23888'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 12px center",
};

export const selectOptionStyle: React.CSSProperties = { background: "#16162a", color: "#ccc" };
