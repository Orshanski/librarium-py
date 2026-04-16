export type ReaderTheme = "dark" | "warm" | "light";

export type TapAction = "prev" | "next" | "zoom_in" | "zoom_out";

export interface DesktopTapZones {
  topLeft: TapAction;
  bottomLeft: TapAction;
  topCenter: TapAction;
  bottomCenter: TapAction;
  topRight: TapAction;
  bottomRight: TapAction;
}

export interface ReaderSettings {
  fontSize: number;
  lineSpacing: number;
  fontFamily: string;
  flow: "paginated" | "scrolled";
  theme: ReaderTheme;
  hyphenate: boolean;
  justify: boolean;
  desktopTapZones: DesktopTapZones;
  pdfTapZones: DesktopTapZones;
}
