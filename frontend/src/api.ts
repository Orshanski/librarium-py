/**
 * Install credentials: "include" for all fetch calls.
 * Called once at app startup. Isolated from api() so direct fetch() calls
 * also get cookie auth without needing explicit credentials option.
 */
let _installed = false;
export function installFetchCredentials() {
  if (_installed) return;
  _installed = true;
  const _origFetch = window.fetch;
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    return _origFetch.call(window, input, { credentials: "include", ...init });
  };
}

export async function api(url: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {};
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(url, {
    credentials: "include",
    headers: {
      ...headers,
      ...(options.headers as Record<string, string>),
    },
    ...options,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || data.error || `HTTP ${res.status}`);
  }

  return res.json();
}
