// Fake "work" screen used as the pause menu / boss key: a plausible BI dashboard for a fictional company
// (Halcyon Ledger). Swaps the tab title and favicon while shown. Resume / Quit / Leave live in the avatar dropdown.
const TITLE = 'Q3 Revenue Dashboard – Halcyon Analytics';
const ICON = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#1f5fbf"/><path d="M6 24V14h4v10zm8 0V8h4v16zm8 0v-7h4v7z" fill="#fff"/></svg>');
const CSS = `
#boss{position:fixed;inset:0;z-index:100;background:#f3f5f9;color:#1d2433;font:14px/1.4 system-ui,"Segoe UI",Roboto,sans-serif;display:flex;flex-direction:column;user-select:none;cursor:default}
#boss.hidden{display:none}
#boss *{box-sizing:border-box}
#boss header{height:52px;background:#fff;border-bottom:1px solid #dfe3ec;display:flex;align-items:center;gap:18px;padding:0 20px}
#boss .logo{font-weight:800;color:#1f5fbf;letter-spacing:.02em}
#boss .search{flex:1;max-width:420px;height:32px;border:1px solid #dfe3ec;border-radius:6px;padding:6px 10px;color:#8a93a6;background:#f7f8fb}
#boss .sp{flex:1}
#boss .av{position:relative}
#boss .av>button{all:unset;cursor:pointer;width:32px;height:32px;border-radius:50%;background:#5b6b8c;color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center}
#boss .menu{position:absolute;right:0;top:40px;background:#fff;border:1px solid #dfe3ec;border-radius:8px;box-shadow:0 8px 24px rgba(20,30,60,.15);min-width:170px;padding:6px;display:none}
#boss .menu.open{display:block}
#boss .menu button{all:unset;display:block;width:100%;padding:8px 12px;border-radius:6px;cursor:pointer}
#boss .menu button:hover{background:#eef2fa}
#boss .body{flex:1;display:flex;min-height:0}
#boss nav{width:200px;background:#fff;border-right:1px solid #dfe3ec;padding:14px 0}
#boss nav div{padding:9px 22px;color:#4a5570}
#boss nav div.on{background:#e8f0fd;color:#1f5fbf;font-weight:600;border-left:3px solid #1f5fbf}
#boss main{flex:1;padding:22px 28px;overflow:hidden}
#boss h1{font-size:22px;margin:0 0 2px;letter-spacing:0;text-shadow:none}
#boss .sub{color:#7b869c;margin:0 0 16px;letter-spacing:0;opacity:1}
#boss .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:16px}
#boss .card{background:#fff;border:1px solid #dfe3ec;border-radius:8px;padding:14px 16px;max-width:none;max-height:none;overflow:visible;box-shadow:none;backdrop-filter:none;text-align:left}
#boss .kpi b{display:block;font-size:26px;margin-top:4px;font-variant-numeric:tabular-nums}
#boss .up{color:#1a9d5c;font-size:12px}#boss .dn{color:#d33f4a;font-size:12px}
#boss .charts{display:grid;grid-template-columns:2fr 1fr;gap:14px;margin-bottom:16px}
#boss canvas{position:static;inset:auto;width:100%;height:170px;display:block}
#boss table{width:100%;border-collapse:collapse;font-size:13px}
#boss th{text-align:left;color:#7b869c;font-weight:600;padding:6px 8px;border-bottom:1px solid #dfe3ec;letter-spacing:0;opacity:1;font-size:13px}
#boss td{padding:6px 8px;border-bottom:1px solid #eef0f5;font-weight:400}
#boss footer{height:28px;display:flex;align-items:center;justify-content:space-between;padding:0 20px;color:#a3abbb;font-size:11px;background:#fff;border-top:1px solid #dfe3ec}
#boss footer button{all:unset;cursor:pointer;color:#b7bdca}
`;
const ROWS = [['Brightwater Foods', 'EMEA', 412000, 'Negotiation', 'M. Okafor'], ['Lumen Freight', 'NA', 388500, 'Proposal', 'D. Reyes'], ['Corvane Systems', 'APAC', 295200, 'Closed won', 'S. Tanaka'], ['Ostrava Health', 'EMEA', 251750, 'Discovery', 'L. Novak'], ['Pinecrest Retail', 'NA', 233400, 'Negotiation', 'A. Brooks'], ['Meridian Labs', 'NA', 198900, 'Closed won', 'J. Patel'], ['Tidewell Energy', 'LATAM', 176300, 'Proposal', 'C. Duarte'], ['Quillon Media', 'APAC', 151200, 'Discovery', 'H. Lim']];
const REGIONS = ['NA', 'EMEA', 'APAC', 'LATAM', 'ANZ', 'MEA'];

let el = null, on = false, cbs = {}, timer = 0, raf = 0, saved = null, link = null;
let line = Array.from({ length: 30 }, (_, i) => 52 + i * 0.9 + Math.sin(i / 3) * 4), bars = [70, 55, 40, 28, 18, 12], kpi = [4.82, 3.4, 312, 1.2];
export const bossOn = () => on;

function build() {
  const st = document.createElement('style'); st.textContent = CSS; document.head.append(st);
  el = document.createElement('div'); el.id = 'boss'; el.className = 'hidden';
  el.innerHTML = `<header><span class="logo">Halcyon Ledger</span><div class="search">Search reports, accounts, owners</div><span class="sp"></span><span style="color:#7b869c">Last refreshed just now</span>
    <div class="av"><button id="bossAv">JM</button><div class="menu"><button data-a="resume">Resume</button><button data-a="quit">Quit to menu</button><button data-a="leave">Leave room</button></div></div></header>
    <div class="body"><nav><div class="on">Overview</div><div>Revenue</div><div>Pipeline</div><div>Customers</div><div>Forecast</div><div>Reports</div><div>Settings</div></nav>
    <main><h1>Q3 Revenue Dashboard</h1><p class="sub">Jul 1 – Sep 30 · All regions · USD</p>
    <div class="kpis">${['Total revenue', 'MRR growth', 'New accounts', 'Churn rate'].map((t, i) => `<div class="card kpi">${t}<b data-k="${i}"></b><span class="${i === 3 ? 'dn' : 'up'}">${i === 3 ? '▼ 0.2 pts' : '▲ vs last quarter'}</span></div>`).join('')}</div>
    <div class="charts"><div class="card">Weekly revenue ($k)<canvas id="bossLine" width="640" height="170"></canvas></div><div class="card">Revenue by region ($k)<canvas id="bossBars" width="320" height="170"></canvas></div></div>
    <div class="card"><table><tr><th>Account</th><th>Region</th><th>ARR</th><th>Stage</th><th>Owner</th></tr>${ROWS.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>$${r[2].toLocaleString()}</td><td>${r[3]}</td><td>${r[4]}</td></tr>`).join('')}</table></div></main></div>
    <footer><span>© Halcyon Ledger Ltd. Internal use only.</span><button data-a="resume">resume</button></footer>`;
  document.body.append(el);
  const menu = el.querySelector('.menu');
  el.querySelector('#bossAv').onclick = (e) => { e.stopPropagation(); menu.classList.toggle('open'); };
  el.addEventListener('click', (e) => { if (!e.target.closest('.av')) menu.classList.remove('open'); const a = e.target.dataset?.a; if (a === 'resume') cbs.onResume?.(); else if (a === 'quit') cbs.onQuit?.(); else if (a === 'leave') cbs.onLeave?.(); });
  el.addEventListener('mousedown', (e) => e.stopPropagation());
}

function draw() {
  const lc = el.querySelector('#bossLine'), g = lc.getContext('2d'), w = lc.width, h = lc.height;
  g.clearRect(0, 0, w, h); g.strokeStyle = '#eef0f5'; g.lineWidth = 1;
  for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(0, (h * i) / 5); g.lineTo(w, (h * i) / 5); g.stroke(); }
  const lo = Math.min(...line) - 5, hi = Math.max(...line) + 5, xy = (v, i) => [(i / (line.length - 1)) * w, h - ((v - lo) / (hi - lo)) * h];
  g.beginPath(); line.forEach((v, i) => g[i ? 'lineTo' : 'moveTo'](...xy(v, i))); g.strokeStyle = '#1f5fbf'; g.lineWidth = 2.5; g.stroke();
  g.lineTo(w, h); g.lineTo(0, h); g.fillStyle = 'rgba(31,95,191,.10)'; g.fill();
  const bc = el.querySelector('#bossBars'), b = bc.getContext('2d'), bw = bc.width, bh = bc.height;
  b.clearRect(0, 0, bw, bh); b.font = '11px system-ui'; b.fillStyle = '#7b869c';
  bars.forEach((v, i) => { const x = 10 + i * ((bw - 20) / bars.length), bwid = (bw - 20) / bars.length - 10, bhh = (v / 100) * (bh - 24); b.fillStyle = '#4c8bf0'; b.fillRect(x, bh - 16 - bhh, bwid, bhh); b.fillStyle = '#7b869c'; b.fillText(REGIONS[i], x, bh - 3); });
  raf = requestAnimationFrame(draw);
}
function tick() { // gently moving numbers so the page looks alive
  line.shift(); line.push(Math.max(40, line[line.length - 1] + (Math.random() - 0.42) * 5));
  bars = bars.map((v) => Math.max(8, Math.min(95, v + (Math.random() - 0.5) * 4)));
  kpi = [kpi[0] + Math.random() * 0.01, 3.4 + (Math.random() - 0.5) * 0.1, kpi[2] + (Math.random() < 0.4 ? 1 : 0), 1.2 + (Math.random() - 0.5) * 0.04];
  paintKpi();
}
const paintKpi = () => { const t = [`$${kpi[0].toFixed(2)}M`, `+${kpi[1].toFixed(1)}%`, String(kpi[2]), `${kpi[3].toFixed(2)}%`]; el.querySelectorAll('[data-k]').forEach((n) => { n.textContent = t[n.dataset.k]; }); };

// cbs: { onResume, onQuit, onLeave|null }
export function showBoss(c) {
  if (!el) build();
  cbs = c; on = true;
  el.querySelector('[data-a="leave"]').style.display = c.onLeave ? '' : 'none';
  el.querySelector('.menu').classList.remove('open');
  el.classList.remove('hidden');
  if (!saved) { saved = document.title; link = document.createElement('link'); link.rel = 'icon'; link.href = ICON; document.head.append(link); }
  document.title = TITLE;
  paintKpi(); cancelAnimationFrame(raf); clearInterval(timer); draw(); timer = setInterval(tick, 1200);
}
export function hideBoss() {
  if (!on) return;
  on = false; el.classList.add('hidden'); cancelAnimationFrame(raf); clearInterval(timer);
  if (saved !== null) { document.title = saved; saved = null; link?.remove(); link = null; }
}
