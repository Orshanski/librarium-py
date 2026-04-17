import { http, HttpResponse } from "msw";

// Default handlers — minimal, shared across all tests.
// Tests add per-case handlers via `server.use(...)`.
// Shape of /api/auth/me mirrors backend/app/routers/auth.py::me exactly.
export const defaultHandlers = [
  http.get("/api/auth/me", () =>
    HttpResponse.json({
      id: 1,
      username: "admin",
      displayName: "Test Admin",
      email: "admin@test.local",
      role: "admin",
    })
  ),
];
