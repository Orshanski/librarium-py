import type { HttpMethod } from "./client";

type Rule = { regex: RegExp; methods: Set<HttpMethod> };

const MUTATING: HttpMethod[] = ["POST", "PUT", "PATCH", "DELETE"];

const RULES: Rule[] = [
  { regex: /^\/api\/auth\//, methods: new Set<HttpMethod>(MUTATING) },
  { regex: /^\/api\/admin\//, methods: new Set<HttpMethod>(MUTATING) },
  { regex: /^\/api\/reader\//, methods: new Set<HttpMethod>(MUTATING) },
  { regex: /^\/api\/uploads\/[^/]+$/, methods: new Set<HttpMethod>(["DELETE"]) },
  { regex: /^\/api\/books\/\d+\/cover$/, methods: new Set<HttpMethod>(["POST", "DELETE"]) },
];

export function shouldSkipScrollBump(method: HttpMethod, path: string): boolean {
  for (const rule of RULES) {
    if (rule.regex.test(path) && rule.methods.has(method)) return true;
  }
  return false;
}
