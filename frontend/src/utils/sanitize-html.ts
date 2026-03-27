const ALLOWED_TAGS = new Set(["p", "br", "b", "i", "em", "strong", "a", "ul", "ol", "li", "blockquote", "span"]);
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href"]),
};

export function sanitizeHtml(html: string): string {
  // Remove script tags and their content
  let clean = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");

  // Remove event handlers (onclick, onerror, etc.)
  clean = clean.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, "");
  clean = clean.replace(/\s+on\w+\s*=\s*[^\s>]*/gi, "");

  // Remove style attributes (can be used for data exfiltration)
  clean = clean.replace(/\s+style\s*=\s*["'][^"']*["']/gi, "");

  // Remove tags not in allowlist (keep their content)
  clean = clean.replace(/<\/?(\w+)(\s[^>]*)?\/?>/g, (match, tag, attrs) => {
    const lower = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(lower)) return "";

    // Filter attributes
    const allowedAttrs = ALLOWED_ATTRS[lower];
    if (!attrs || !allowedAttrs) {
      return match.startsWith("</") ? `</${lower}>` : `<${lower}>`;
    }

    const cleanAttrs = (attrs as string).match(/\s+\w+\s*=\s*["'][^"']*["']/g) || [];
    const filtered = cleanAttrs.filter((attr) => {
      const name = attr.trim().split("=")[0].trim().toLowerCase();
      return allowedAttrs.has(name);
    });

    return `<${lower}${filtered.join("")}>`;
  });

  return clean;
}
