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
    <div style={{ padding: 20, fontFamily: "monospace", fontSize: 13 }}>
      <h2>SSE Test (temp spike, bd ewg0)</h2>
      <div style={{ marginBottom: 10, color: "#888" }}>
        Broker-паттерн: глобальный counter тикает +1 каждые 5 мин (background task на сервере),
        keepalive ':ping' каждые 25 сек. Counter не сбрасывается при reload страницы — только при
        рестарте процесса (тогда server_started_at меняется и засчитывается Server restart).
      </div>
      <div>Page loaded at: {pageLoadedAt}</div>
      <div>
        Server started at:{" "}
        <b style={{ color: serverStartedAt ? "green" : "gray" }}>
          {serverStartedAt ?? "..."}
        </b>
      </div>
      <div>State: <b style={{ color: stateColor(state) }}>{state}</b></div>
      <div>Reconnects (transport): {reconnects}</div>
      <div style={{ color: serverRestarts > 0 ? "orange" : "inherit" }}>
        Server restarts (detected): {serverRestarts}
      </div>
      <div>Events received: {events.length}</div>
      <div>Latest n on server: {events[0]?.n ?? "-"}</div>

      <table style={{ marginTop: 16, borderCollapse: "collapse" }}>
        <thead>
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
              <td style={td}>{ev.ts}</td>
              <td style={td}>{ev.receivedAt}</td>
              <td style={td}>{ev.gapSec.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function stateColor(s: ConnState): string {
  if (s === "OPEN") return "green";
  if (s === "ERROR") return "red";
  if (s === "CONNECTING") return "orange";
  return "gray";
}

const th = { padding: "4px 10px", borderBottom: "1px solid #666" };
const td = { padding: "2px 10px" };
