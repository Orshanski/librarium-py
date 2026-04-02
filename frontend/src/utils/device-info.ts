export function getDeviceName(ua?: string): string {
  const s = ua || (typeof navigator !== "undefined" ? navigator.userAgent : "");
  if (!s) return "Browser";

  if (/iPhone/.test(s)) return "iPhone";
  if (/iPad/.test(s)) return "iPad";

  const android = s.match(/Android\s[\d.]+;\s*([^)]+)\)/);
  if (android) {
    const model = android[1].replace(/Build\/.*/, "").trim();
    return model || "Android";
  }

  const os = /Mac/.test(s) ? "macOS" : /Windows/.test(s) ? "Windows" : /Linux/.test(s) ? "Linux" : "";
  const browser = /Firefox/.test(s) ? "Firefox" : /Edg/.test(s) ? "Edge" : /Chrome/.test(s) ? "Chrome" : /Safari/.test(s) ? "Safari" : "";

  if (browser && os) return `${browser} on ${os}`;
  if (browser) return browser;
  return "Browser";
}

export function getDeviceType(screenWidth?: number): "desktop" | "tablet" | "mobile" {
  const w = screenWidth ?? (typeof window !== "undefined" ? window.innerWidth : 1440);
  if (w < 820) return "mobile";
  if (w < 1200) return "tablet";
  return "desktop";
}
