// WebSocket client. Messages are JSON objects: { t: 'type', ...fields }.
export const RAILWAY_HOST = 'hide-and-seek-production-21e1.up.railway.app';
export const RAILWAY_WS = `wss://${RAILWAY_HOST}/ws`;

// Same origin when served by the game server itself (Railway or localhost), otherwise Railway.
// `?server=wss://host/ws` overrides for testing.
export function wsUrl() {
  const override = new URLSearchParams(location.search).get('server');
  if (override) return override;
  const h = location.hostname;
  if (h === RAILWAY_HOST || h === 'localhost' || h === '127.0.0.1' || h === '[::1]') {
    return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  }
  return RAILWAY_WS;
}

// Throws on an invalid URL. onclose fires for any close we did not request ourselves.
export function connect({ onopen, onmessage, onclose }) {
  const ws = new WebSocket(wsUrl());
  ws.onopen = () => onopen?.();
  ws.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    if (m && typeof m.t === 'string') onmessage?.(m);
  };
  ws.onclose = () => onclose?.();
  ws.onerror = () => {}; // a close event always follows
  return {
    send(t, data) { if (ws.readyState === 1) ws.send(JSON.stringify({ t, ...data })); },
    close() { ws.onclose = null; ws.close(); },
  };
}
