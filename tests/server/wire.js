// Shared by the server test scripts: the hello handshake and the binary snapshot decoder (src/shared/protocol.js is an ES module).
let P = null;
exports.ready = import('../../src/shared/protocol.js').then((m) => { P = m; exports.P = m; });
exports.hello = (ws, protocol) => ws.send(JSON.stringify({ t: 'hello', protocol: protocol ?? P.PROTOCOL }));
// a ws 'message' -> the JSON object, or for a binary snapshot { t: 'snap', tl, hl, ack, st, p: [[id,x,y,z,yaw,pitch,c,flags], ...] }; null when undecodable
exports.parse = (d, isBinary) => {
  if (!isBinary) return JSON.parse(d);
  const s = P.decodeSnap(d);
  return s && { t: 'snap', ...s };
};
