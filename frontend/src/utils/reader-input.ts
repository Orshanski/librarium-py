import type { DesktopTapZones, TapAction, ReaderSettings } from "../types/reader-settings";

export type TapZoneResult = TapAction | "toolbar";

export type NormalizedReaderInput =
  | { kind: "tap"; x: number; y: number; target: Element | null }
  | { kind: "keyboard"; key: string };

export type ReaderAction =
  | { type: "prev" }
  | { type: "next" }
  | { type: "goLeft" }
  | { type: "goRight" }
  | { type: "toggleToolbar" }
  | { type: "followLink" }
  | { type: "dismissFootnote" }
  | { type: "noop" };

export interface ReaderLoadDetail {
  doc?: Document;
}

export interface ReaderTapDetail {
  screenX: number;
  screenY: number;
  target: Element | null;
}

export interface ReaderLinkDetail {
  a: Element;
  href: string;
}

export function resolveDesktopZone(xFrac: number, yFrac: number, zones: DesktopTapZones): TapZoneResult {
  if (xFrac < 0.33) {
    return yFrac < 0.5 ? zones.topLeft : zones.bottomLeft;
  }
  if (xFrac > 0.67) {
    return yFrac < 0.5 ? zones.topRight : zones.bottomRight;
  }
  if (yFrac < 0.33) return zones.topCenter;
  if (yFrac > 0.67) return zones.bottomCenter;
  return "toolbar";
}

// Estimate chars per page from font settings and container dimensions
export function estimateCharsPerPage(container: HTMLElement, settings: ReaderSettings): number {
  const rect = container.getBoundingClientRect();
  const avgCharWidth = settings.fontSize * 0.55;
  const lineHeight = settings.fontSize * settings.lineSpacing;
  const charsPerLine = Math.floor(rect.width * 0.85 / avgCharWidth);
  const linesPerPage = Math.floor(rect.height * 0.9 / lineHeight);
  return Math.max(Math.round(charsPerLine * linesPerPage / 2), 50);
}

export function addCustomEventListener<T>(
  target: EventTarget,
  type: string,
  listener: (event: CustomEvent<T>) => void,
): () => void {
  const wrapped = (event: Event) => listener(event as CustomEvent<T>);
  target.addEventListener(type, wrapped as EventListener);
  return () => target.removeEventListener(type, wrapped as EventListener);
}
