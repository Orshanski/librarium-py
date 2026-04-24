// TEMP SPIKE: валидация SSE через Cloudflare (bd ewg0).
// Удалить после принятия решения по архитектуре.
import { useEffect, useRef, useState } from "react";

type Ev = {
  n: number;
  ts: string;
  serverStartedAt: string;
  receivedAt: string;
  gapSec: number;
};

type ConnState = "CONNECTING" | "OPEN" | "ERROR" | "CLOSED";

export default function SseTestPage() {
  const [events, setEvents] = useState<Ev[]>([]);
  const [state, setState] = useState<ConnState>("CONNECTING");
  const [reconnects, setReconnects] = useState(0);
  const [serverRestarts, setServerRestarts] = useState(0);
  const [pageLoadedAt] = useState(() => new Date().toISOString());
  const [serverStartedAt, setServerStartedAt] = useState<string | null>(null);
  const lastReceivedAtRef = useRef<number | null>(null);
  const lastServerStartedRef = useRef<string | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/_sse_ping");

    es.onopen = () => setState("OPEN");
    es.onerror = () => {
      setState("ERROR");
      setReconnects((r) => r + 1);
    };
    es.onmessage = (e) => {
      const data = JSON.parse(e.data) as { n: number; ts: string; server_started_at: string };
      const now = Date.now();
      const gapSec = lastReceivedAtRef.current ? (now - lastReceivedAtRef.current) / 1000 : 0;
      lastReceivedAtRef.current = now;

      // Если server_started_at изменился — backend рестартовал.
      if (lastServerStartedRef.current && lastServerStartedRef.current !== data.server_started_at) {
        setServerRestarts((r) => r + 1);
      }
      lastServerStartedRef.current = data.server_started_at;
      setServerStartedAt(data.server_started_at);
      setState("OPEN");

      setEvents((prev) => [
        {
          n: data.n,
          ts: data.ts,
          serverStartedAt: data.server_started_at,
          receivedAt: new Date(now).toISOString(),
          gapSec,
        },
        ...prev,
      ].slice(0, 200));
    };

    return () => es.close();
  }, []);

  return (
    <div style={{ padding: 12, fontFamily: "monospace", fontSize: 13, height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <h2 style={{ margin: "0 0 8px 0" }}>SSE Test (temp spike, bd ewg0)</h2>
      <div style={{ flexShrink: 0 }}>
        <div>Page loaded at: {fmt(pageLoadedAt)}</div>
        <div>
          Server started at:{" "}
          <b style={{ color: serverStartedAt ? "green" : "gray" }}>
            {serverStartedAt ? fmt(serverStartedAt) : "..."}
          </b>
        </div>
        <div>State: <b style={{ color: stateColor(state) }}>{state}</b></div>
        <div>Reconnects (transport): {reconnects}</div>
        <div style={{ color: serverRestarts > 0 ? "orange" : "inherit" }}>
          Server restarts (detected): {serverRestarts}
        </div>
        <div>Events received: {events.length}</div>
        <div>Latest n on server: {events[0]?.n ?? "-"}</div>
      </div>
      <div style={{ marginTop: 12, flex: 1, overflow: "auto", border: "1px solid #333" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead style={{ position: "sticky", top: 0, background: "#1e1e2e" }}>
            <tr style={{ textAlign: "left" }}>
              <th style={th}>n</th>
              <th style={th}>server ts</th>
              <th style={th}>received</th>
              <th style={th}>gap (s)</th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => (
              <tr
                key={ev.receivedAt}
                style={{ color: ev.gapSec > 330 ? "red" : "inherit" }}
              >
                <td style={td}>{ev.n}</td>
                <td style={td}>{fmt(ev.ts)}</td>
                <td style={td}>{fmt(ev.receivedAt)}</td>
                <td style={td}>{ev.gapSec.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function fmt(iso: string): string {
  // HH:MM:SS из ISO (UTC). Без микросекунд, без timezone.
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function stateColor(s: ConnState): string {
  if (s === "OPEN") return "green";
  if (s === "ERROR") return "red";
  if (s === "CONNECTING") return "orange";
  return "gray";
}

const th = { padding: "4px 10px", borderBottom: "1px solid #666" };
const td = { padding: "2px 10px" };
