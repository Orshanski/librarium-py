// TEMP SPIKE: валидация SSE через Cloudflare (bd ewg0).
// Удалить после принятия решения по архитектуре.
import { useEffect, useRef, useState } from "react";

type Ev = {
  n: number;
  ts: string;
  receivedAt: string;
  gapSec: number;
};

type ConnState = "CONNECTING" | "OPEN" | "ERROR" | "CLOSED";

export default function SseTestPage() {
  const [events, setEvents] = useState<Ev[]>([]);
  const [state, setState] = useState<ConnState>("CONNECTING");
  const [reconnects, setReconnects] = useState(0);
  const [startedAt] = useState(() => new Date().toISOString());
  const lastReceivedAtRef = useRef<number | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/_sse_ping");

    es.onopen = () => setState("OPEN");
    es.onerror = () => {
      setState("ERROR");
      setReconnects((r) => r + 1);
    };
    es.onmessage = (e) => {
      const data = JSON.parse(e.data) as { n: number; ts: string };
      const now = Date.now();
      const gapSec = lastReceivedAtRef.current ? (now - lastReceivedAtRef.current) / 1000 : 0;
      lastReceivedAtRef.current = now;
      setState("OPEN");
      setEvents((prev) => [
        { n: data.n, ts: data.ts, receivedAt: new Date(now).toISOString(), gapSec },
        ...prev,
      ].slice(0, 200));
    };

    return () => es.close();
  }, []);

  const missing = computeMissingSequences(events);

  return (
    <div style={{ padding: 20, fontFamily: "monospace", fontSize: 13 }}>
      <h2>SSE Test (temp spike, bd ewg0)</h2>
      <div>Started: {startedAt}</div>
      <div>State: <b style={{ color: stateColor(state) }}>{state}</b></div>
      <div>Reconnects: {reconnects}</div>
      <div>Events received: {events.length}</div>
      <div>Latest n on server: {events[0]?.n ?? "-"}</div>
      <div style={{ color: missing.length ? "red" : "inherit" }}>
        Missing sequences: {missing.length === 0 ? "none" : missing.join(", ")}
      </div>
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
            <tr key={ev.n} style={{ color: ev.gapSec > 3.5 ? "red" : "inherit" }}>
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

function computeMissingSequences(events: Ev[]): number[] {
  if (events.length < 2) return [];
  const ns = events.map((e) => e.n).sort((a, b) => a - b);
  const missing: number[] = [];
  for (let i = ns[0]; i < ns[ns.length - 1]; i++) {
    if (!ns.includes(i)) missing.push(i);
  }
  return missing.slice(0, 20);
}

function stateColor(s: ConnState): string {
  if (s === "OPEN") return "green";
  if (s === "ERROR") return "red";
  if (s === "CONNECTING") return "orange";
  return "gray";
}

const th = { padding: "4px 10px", borderBottom: "1px solid #666" };
const td = { padding: "2px 10px" };
