import { NightSummary } from '../types';
import { nightLeaders, joinNames } from './nightStats';

const W = 1080;
const H = 1350;
const NAVY = '#0E1A33';
const ORANGE = '#FF7A1A';
const AMBER = '#F5B301';
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const dayOf = (ts: number | null) =>
  new Date(ts ?? Date.now()).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

const fitText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number, weight: string, size: number, min = 28) => {
  let s = size;
  ctx.font = `${weight} ${s}px ${FONT}`;
  while (ctx.measureText(text).width > maxWidth && s > min) {
    s -= 2;
    ctx.font = `${weight} ${s}px ${FONT}`;
  }
  return s;
};

const drawBall = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) => {
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
  g.addColorStop(0, '#FF9A3D'); g.addColorStop(0.55, '#F26B0F'); g.addColorStop(1, '#C94E00');
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
  ctx.clip();
  ctx.strokeStyle = '#1B2430'; ctx.lineWidth = r * 0.1; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - r * 0.6, cy - r * 0.8); ctx.bezierCurveTo(cx - r * 0.2, cy - r * 0.4, cx - r * 0.2, cy + r * 0.4, cx - r * 0.6, cy + r * 0.8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + r * 0.6, cy - r * 0.8); ctx.bezierCurveTo(cx + r * 0.2, cy - r * 0.4, cx + r * 0.2, cy + r * 0.4, cx + r * 0.6, cy + r * 0.8); ctx.stroke();
  ctx.restore();
};

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
};

// Draws the group-chat recap card for one night and returns it as a PNG
export const drawRecapCard = (night: NightSummary): Promise<Blob | null> => {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);

  // Background with a faint half-court
  ctx.fillStyle = NAVY; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(150, 0, 50, 150, 0, 900);
  glow.addColorStop(0, 'rgba(232,90,0,0.28)'); glow.addColorStop(1, 'rgba(232,90,0,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(W / 2, H + 120, 560, Math.PI, 2 * Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.arc(W / 2, H + 120, 230, Math.PI, 2 * Math.PI); ctx.stroke();

  const pad = 80;
  drawBall(ctx, pad + 34, 118, 34);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = `800 30px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText('PICKUP BASKETBALL MANAGER', pad + 88, 120);

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff';
  fitText(ctx, dayOf(night.startedAt), W - pad * 2, 'italic 900', 96);
  ctx.fillText(dayOf(night.startedAt), pad, 285);
  ctx.fillStyle = ORANGE;
  ctx.font = `800 40px ${FONT}`;
  ctx.fillText("Tonight's run", pad, 345);

  // Two big numbers
  const tileY = 400, tileH = 230, gap = 30, tileW = (W - pad * 2 - gap) / 2;
  [[String(night.gamesPlayed), night.gamesPlayed === 1 ? 'game played' : 'games played'],
   [String(night.playersTonight.length), 'players']].forEach(([num, label], i) => {
    const x = pad + i * (tileW + gap);
    ctx.fillStyle = 'rgba(255,255,255,0.07)'; roundRect(ctx, x, tileY, tileW, tileH, 28); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `900 120px ${FONT}`; ctx.fillText(num, x + 40, tileY + 140);
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = `700 38px ${FONT}`; ctx.fillText(label, x + 40, tileY + 195);
  });

  // Highlights
  const { mostWins, mostGames } = nightLeaders(night.games);
  const rows: [string, string, string][] = [];
  if (night.bestStreak && night.bestStreak.count >= 2) rows.push(['Longest streak', `${night.bestStreak.count} straight wins`, joinNames(night.bestStreak.names, 5)]);
  if (mostWins) rows.push(['Most wins', `${mostWins.count} ${mostWins.count === 1 ? 'win' : 'wins'}`, joinNames(mostWins.names)]);
  if (mostGames) rows.push(['Iron man', `${mostGames.count} games`, joinNames(mostGames.names)]);

  let y = 700;
  rows.slice(0, 3).forEach(([title, value, names]) => {
    ctx.fillStyle = AMBER; ctx.font = `800 32px ${FONT}`; ctx.fillText(title.toUpperCase(), pad, y);
    ctx.fillStyle = '#fff';
    ctx.font = `900 54px ${FONT}`;
    const valueW = ctx.measureText(value).width;
    ctx.fillText(value, W - pad - valueW, y + 4);
    const nameSize = fitText(ctx, names, W - pad * 2 - valueW - 40, '800', 54, 30);
    ctx.font = `800 ${nameSize}px ${FONT}`;
    ctx.fillText(names, pad, y + 66);
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(pad, y + 104, W - pad * 2, 3);
    y += 170;
  });
  if (rows.length === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = `700 40px ${FONT}`;
    ctx.fillText('No games finished yet.', pad, y + 40);
  }

  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = `700 32px ${FONT}`;
  ctx.fillText('pickupbasketballmanager.com', pad, H - 70);

  return new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/png'));
};

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

const stamp = (ts: number | null) => {
  const d = new Date(ts ?? Date.now());
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const recapFilename = (night: NightSummary) => `pickup-recap-${stamp(night.startedAt)}.png`;

export const downloadBackup = (night: NightSummary, extra?: object) => {
  const data = { app: 'Pickup Basketball Manager', kind: 'night-backup', version: 1, exportedAt: new Date().toISOString(), night, ...extra };
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `pickup-night-${stamp(night.startedAt)}.json`);
};
