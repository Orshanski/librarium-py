import DOMPurify from "dompurify";

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["p", "br", "b", "i", "em", "strong", "a", "ul", "ol", "li", "blockquote", "span"],
    ALLOWED_ATTR: ["href"],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ["style", "script"],
    FORBID_ATTR: ["style", "onerror", "onclick", "onload"],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|\/)/i,
  });
}
