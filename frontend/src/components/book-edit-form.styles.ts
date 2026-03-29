import { colors } from "../theme";

export const sharedBookEditInputStyle: React.CSSProperties = {
  width: "100%",
  backgroundColor: "rgba(255, 255, 255, 0.06)",
  border: `1px solid ${colors.border}`,
  color: colors.text,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

export const sharedBookEditLabelStyle: React.CSSProperties = {
  color: colors.textDim,
  marginBottom: 4,
  display: "block",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

export const sharedBookEditButtonStyle: React.CSSProperties = {
  background: "none",
  border: `1px solid ${colors.border}`,
  color: colors.textSecondary,
  cursor: "pointer",
  fontFamily: "inherit",
};
