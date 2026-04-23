const OS_MATCHERS: [RegExp, string][] = [
  [/Mac/, "macOS"],
  [/Windows/, "Windows"],
  [/Linux/, "Linux"],
];

const BROWSER_MATCHERS: [RegExp, string][] = [
  [/Firefox/, "Firefox"],
  [/Edg/, "Edge"],
  [/Chrome/, "Chrome"],
  [/Safari/, "Safari"],
];

function matchFirst(matchers: [RegExp, string][], s: string): string {
  for (const [re, label] of matchers) {
    if (re.test(s)) return label;
  }
  return "";
}

export function getDeviceName(ua?: string): string {
  const s = ua || globalThis.navigator?.userAgent || "";
  if (!s) return "Browser";

  if (/iPhone/.test(s)) return "iPhone";
  if (/iPad/.test(s)) return "iPad";

  const android = s.match(/Android\s[\d.]+;\s*([^)]+)\)/);
  if (android) {
    const model = android[1].replace(/Build\/.*/, "").trim();
    return model || "Android";
  }

  const os = matchFirst(OS_MATCHERS, s);
  const browser = matchFirst(BROWSER_MATCHERS, s);

  if (browser && os) return `${browser} on ${os}`;
  if (browser) return browser;
  return "Browser";
}

export function getDeviceType(screenWidth?: number): "desktop" | "tablet" | "mobile" {
  const w = screenWidth ?? globalThis.innerWidth;
  if (w < 820) return "mobile";
  if (w < 1200) return "tablet";
  return "desktop";
}
