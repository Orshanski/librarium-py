import type { CSSProperties } from "react";

interface CoverRemoveButtonTokens {
  size: number;
  top: number;
  left: number;
  fontSize: number;
  withHoverFade: boolean;
  transform?: string;
  background?: string;
}

interface CoverRemoveButtonProps {
  onClick: () => void;
  tokens: CoverRemoveButtonTokens;
}

export default function CoverRemoveButton({ onClick, tokens }: Readonly<CoverRemoveButtonProps>) {
  const startingOpacity = tokens.withHoverFade ? 0.7 : 1;
  const style: CSSProperties = {
    position: "absolute",
    top: tokens.top,
    left: tokens.left,
    width: tokens.size,
    height: tokens.size,
    borderRadius: "50%",
    border: "none",
    backgroundColor: tokens.background ?? "rgba(0,0,0,0.6)",
    color: "#fff",
    fontSize: tokens.fontSize,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    opacity: startingOpacity,
    transition: tokens.withHoverFade ? "opacity 0.15s" : undefined,
    transform: tokens.transform,
  };

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  }

  function handleMouseEnter(e: React.MouseEvent<HTMLButtonElement>) {
    e.currentTarget.style.opacity = "1";
  }

  function handleMouseLeave(e: React.MouseEvent<HTMLButtonElement>) {
    e.currentTarget.style.opacity = "0.7";
  }

  const hoverProps = tokens.withHoverFade
    ? { onMouseEnter: handleMouseEnter, onMouseLeave: handleMouseLeave }
    : {};

  return (
    <button type="button" onClick={handleClick} style={style} {...hoverProps}>
      ✕
    </button>
  );
}
