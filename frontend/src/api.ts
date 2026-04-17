/**
 * Install credentials: "include" for all fetch calls.
 * Called once at app startup. Isolated from api() so direct fetch() calls
 * also get cookie auth without needing explicit credentials option.
 */
let _installed = false;
const CSRF_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function withDefaultHeaders(init?: RequestInit): RequestInit {
  const method = (init?.method ?? "GET").toUpperCase();
  const headers = new Headers(init?.headers);
  if (CSRF_METHODS.has(method) && !headers.has("X-Requested-With")) {
    headers.set("X-Requested-With", "XMLHttpRequest");
  }
  return { ...init, credentials: "include", headers };
}

export function installFetchCredentials() {
  if (_installed) return;
  _installed = true;
  const _origFetch = window.fetch;
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    return _origFetch.call(window, input, withDefaultHeaders(init));
  };
}

export async function api(url: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {};
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const mergedHeaders = new Headers(options.headers);
  for (const [key, value] of Object.entries(headers)) {
    if (!mergedHeaders.has(key)) {
      mergedHeaders.set(key, value);
    }
  }
  const res = await fetch(url, withDefaultHeaders({ ...options, headers: mergedHeaders }));

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `HTTP ${res.status}`);
  }

  return res.json();
}
