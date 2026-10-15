// WebSocket client. Messages are JSON objects: { t: 'type', ...fields }.
export const RAILWAY_HOST = 'hide-and-seek-production-21e1.up.railway.app';
export const RAILWAY_WS = `wss://${RAILWAY_HOST}/ws`;

// Same origin when served by the game server itself (Railway or localhost), otherwise Railway.
// `?server=wss://host/ws` overrides for testing.
export function wsUrl() {
  const h = location.hostname;
  // Override only on local/LAN pages, so a shared link can't point players at someone else's server.
  const local = h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(h);
  const override = local && new URLSearchParams(location.search).get('server');
  if (override) return override;
  if (h === RAILWAY_HOST || h === 'localhost' || h === '127.0.0.1' || h === '[::1]') {
    return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  }
  return RAILWAY_WS;
}

// Throws on an invalid URL. onclose fires for any close we did not request ourselves; onclose('timeout') if not open within 10s.
export function connect({ onopen, onmessage, onclose }) {
  const ws = new WebSocket(wsUrl());
  const to = setTimeout(() => { if (ws.readyState !== 1) { ws.onclose = null; ws.close(); onclose?.('timeout'); } }, 10000);
  ws.onopen = () => { clearTimeout(to); onopen?.(); };
  ws.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    if (m && typeof m.t === 'string') onmessage?.(m);
  };
  ws.onclose = () => { clearTimeout(to); onclose?.(); };
  ws.onerror = (e) => console.warn('websocket error', e); // a close event always follows
  return {
    send(t, data) { if (ws.readyState === 1) ws.send(JSON.stringify({ t, ...data })); },
    close() { clearTimeout(to); ws.onclose = null; ws.close(); },
  };
}
