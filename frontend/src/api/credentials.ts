/**
 * Install credentials: "include" for all fetch calls.
 * Called once at app startup. Isolated from typed-API client so direct
 * fetch() calls also get cookie auth without needing an explicit
 * credentials option.
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
  const _origFetch = globalThis.fetch;
  globalThis.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    return _origFetch.call(window, input, withDefaultHeaders(init));
  };
}
