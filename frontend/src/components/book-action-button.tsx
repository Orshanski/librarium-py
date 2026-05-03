import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import { colors } from "../theme";

type BookActionVariant = "accent" | "neutral" | "danger";

type BookActionButtonProps = (
  | { kind: "button"; onClick: () => void }
  | { kind: "link"; to: string; state?: unknown; onClick?: () => void }
  | { kind: "anchor"; href: string }
) & {
  variant: BookActionVariant;
  children: ReactNode;
  aside?: string;
  "aria-haspopup"?: boolean | "true";
  "aria-expanded"?: boolean;
  "aria-controls"?: string;
};

const BASE_STYLE: CSSProperties = {
  width: "100%",
  minHeight: 48,
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 600,
  fontFamily: "inherit",
  padding: "0 14px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  textDecoration: "none",
  cursor: "pointer",
  boxSizing: "border-box",
};

const ASIDE_STYLE: CSSProperties = {
  fontSize: 11,
  color: colors.textDim,
  marginLeft: 8,
};

function variantStyle(variant: BookActionVariant): CSSProperties {
  if (variant === "accent") {
    return {
      background: "rgba(249, 190, 3, 0.1)",
      border: "1px solid rgba(249, 190, 3, 0.3)",
      color: colors.accent,
    };
  }

  if (variant === "danger") {
    return {
      background: "transparent",
      border: "1px solid rgba(239, 68, 68, 0.3)",
      color: colors.danger,
    };
  }

  return {
    background: "rgba(255, 255, 255, 0.04)",
    border: `1px solid ${colors.border}`,
    color: colors.textSecondary,
  };
}

function renderContent(children: ReactNode, aside: string | undefined): ReactNode {
  if (aside === undefined) return children;
  return (
    <>
      <span>{children}</span>
      <span style={ASIDE_STYLE}>{aside}</span>
    </>
  );
}

export default function BookActionButton(props: Readonly<BookActionButtonProps>) {
  const style: CSSProperties = { ...BASE_STYLE, ...variantStyle(props.variant) };
  const content = renderContent(props.children, props.aside);

  if (props.kind === "button") {
    return (
      <button
        type="button"
        onClick={props.onClick}
        style={style}
        aria-haspopup={props["aria-haspopup"]}
        aria-expanded={props["aria-expanded"]}
        aria-controls={props["aria-controls"]}
      >
        {content}
      </button>
    );
  }

  if (props.kind === "link") {
    return (
      <Link to={props.to} state={props.state} onClick={props.onClick} style={style}>
        {content}
      </Link>
    );
  }

  return (
    <a href={props.href} style={style}>
      {content}
    </a>
  );
}
