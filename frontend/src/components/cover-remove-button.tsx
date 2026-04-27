import type { CSSProperties, MouseEvent } from "react";

interface CoverRemoveButtonTokens {
  size: number;
  top: number | string;
  left: number | string;
  fontSize: number;
  withHoverFade: boolean;
  transform?: string;
  background?: string;
}

interface CoverRemoveButtonProps {
  onClick: () => void;
  tokens: CoverRemoveButtonTokens;
}

function handleMouseEnter(e: MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.opacity = "1";
}

function handleMouseLeave(e: MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.opacity = "0.7";
}

interface HoverStyling {
  startingOpacity: number;
  transition?: string;
  hoverProps: { onMouseEnter?: typeof handleMouseEnter; onMouseLeave?: typeof handleMouseLeave };
}

function getHoverStyling(withFade: boolean): HoverStyling {
  if (withFade) {
    return {
      startingOpacity: 0.7,
      transition: "opacity 0.15s",
      hoverProps: { onMouseEnter: handleMouseEnter, onMouseLeave: handleMouseLeave },
    };
  }
  return { startingOpacity: 1, hoverProps: {} };
}

export default function CoverRemoveButton({ onClick, tokens }: Readonly<CoverRemoveButtonProps>) {
  const hoverStyling = getHoverStyling(tokens.withHoverFade);
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
    opacity: hoverStyling.startingOpacity,
    transition: hoverStyling.transition,
    transform: tokens.transform,
  };

  function handleClick(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  }

  return (
    <button type="button" onClick={handleClick} style={style} {...hoverStyling.hoverProps}>
      ✕
    </button>
  );
}
