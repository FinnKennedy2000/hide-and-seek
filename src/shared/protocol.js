// Wire protocol shared by the client and the Node server. No DOM, no THREE.
// Bumped whenever the message set changes. The client sends `hello {protocol}` first on every connection; the server answers
// a mismatch (or a client that never says hello, i.e. an older build) with `err 'Refresh to update'` and closes the socket.
// 4: binary delta snapshots, hello, ping/pong, reconnect token, fill bots.
export const PROTOCOL = 4;
export const REFRESH_MSG = 'Refresh to update';
export const SNAP_HZ = 15;           // snapshot rate
export const HIST_HZ = 30;           // lag-compensation history rate
export const HIST_SECS = 1;          // lag-compensation history length
export const MAX_REWIND = 0.25;      // s: shots never rewind further than this, whatever rtt a client has
export const RECONNECT_SECS = 30;
export const INTEREST_RANGE = 40;    // m: a hider further than this is never sent to a seeker (unless a sound was made)

// ----- binary snapshot: 12-byte header + 14 bytes per entry, little endian
//   header: u8 kind(1) | u8 flags | u16 tl (0.1s) | u8 hidersLeft | u8 n | u16 ack (last accepted `pos` seq of the receiver) | u32 server ms
//   entry : u16 id | i16 x (cm) | u16 y (cm) | i16 z (cm) | u16 yaw (2pi/65536) | i8 pitch (1.6/127) | u8 crouch (1/255) | u8 flags | u8 reserved
//   entry flags: GONE (no longer sent to you: drop it), SELF (the receiver's own authoritative state)
// Entries are deltas: a player whose quantised state did not change since the last snapshot sent to this receiver is omitted.
export const SNAP_KIND = 1, HEAD = 12, ENTRY = 14, F_GONE = 1, F_SELF = 2;
const TAU = Math.PI * 2;
const q16 = (v) => Math.max(-32768, Math.min(32767, Math.round(v * 100)));
const qyaw = (yaw) => Math.round((((yaw % TAU) + TAU) % TAU) * 65536 / TAU) & 0xffff;

// entry {id,x,y,z,yaw,pitch,c,flags} -> the 6 quantised ints (also what the server diffs against)
export function quantise(e, out = new Int32Array(6)) {
  out[0] = q16(e.x); out[1] = Math.max(0, Math.min(65535, Math.round(e.y * 100))); out[2] = q16(e.z);
  out[3] = qyaw(e.yaw); out[4] = Math.round(Math.max(-1.6, Math.min(1.6, e.pitch)) / 1.6 * 127); out[5] = Math.round(Math.max(0, Math.min(1, e.c)) * 255);
  return out;
}
// head {tl,hl,ack,st}; entries [{id, q:Int32Array(5+), flags}] already quantised
export function encodeSnap(head, entries) {
  const buf = new ArrayBuffer(HEAD + ENTRY * entries.length), v = new DataView(buf);
  v.setUint8(0, SNAP_KIND); v.setUint8(1, 0); v.setUint16(2, Math.min(65535, Math.round(head.tl * 10)), true);
  v.setUint8(4, Math.min(255, head.hl)); v.setUint8(5, entries.length); v.setUint16(6, head.ack & 0xffff, true); v.setUint32(8, head.st >>> 0, true);
  entries.forEach((e, i) => {
    const o = HEAD + i * ENTRY, q = e.q;
    v.setUint16(o, e.id, true); v.setInt16(o + 2, q[0], true); v.setUint16(o + 4, q[1], true); v.setInt16(o + 6, q[2], true);
    v.setUint16(o + 8, q[3], true); v.setInt8(o + 10, q[4]); v.setUint8(o + 11, q[5]); v.setUint8(o + 12, e.flags); v.setUint8(o + 13, 0);
  });
  return buf;
}
// -> { tl, hl, ack, st, p: [[id, x, y, z, yaw, pitch, c, flags], ...] } or null when it is not a snapshot
export function decodeSnap(data) {
  const ab = data instanceof ArrayBuffer ? data : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  if (ab.byteLength < HEAD) return null;
  const v = new DataView(ab);
  if (v.getUint8(0) !== SNAP_KIND) return null;
  const n = v.getUint8(5);
  if (ab.byteLength < HEAD + n * ENTRY) return null;
  const p = [];
  for (let i = 0; i < n; i++) {
    const o = HEAD + i * ENTRY;
    p.push([v.getUint16(o, true), v.getInt16(o + 2, true) / 100, v.getUint16(o + 4, true) / 100, v.getInt16(o + 6, true) / 100, v.getUint16(o + 8, true) * TAU / 65536, v.getInt8(o + 10) * 1.6 / 127, v.getUint8(o + 11) / 255, v.getUint8(o + 12)]);
  }
  return { tl: v.getUint16(2, true) / 10, hl: v.getUint8(4), ack: v.getUint16(6, true), st: v.getUint32(8, true), p };
}
