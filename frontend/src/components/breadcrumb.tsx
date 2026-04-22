import { Link } from "react-router-dom";
import { colors } from "../theme";

export interface BreadcrumbProps {
  label: string;
  url: string;
}

export function Breadcrumb({ label, url }: BreadcrumbProps) {
  return (
    <Link
      to={url}
      data-breadcrumb="true"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        color: colors.textDim,
        textDecoration: "none",
        fontSize: 14,
        padding: "8px 0",
      }}
    >
      <span aria-hidden="true">←</span>
      <span>{label}</span>
    </Link>
  );
}
