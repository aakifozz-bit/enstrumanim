// ===== timeline + frame dispatcher =====
const SHOTS = [];
const _cache = {};
function once(key, fn) { if (!(key in _cache)) _cache[key] = fn(); return _cache[key]; }
function shot(start, end, fn) { SHOTS.push({ start, end, fn }); }
let mainCanvas;
function renderFrame(f) {
  if (!mainCanvas) { mainCanvas = document.getElementById('c'); }
  const ctx = mainCanvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const s = SHOTS.find((s) => f >= s.start && f < s.end) || SHOTS[SHOTS.length - 1];
  ctx.save(); s.fn(ctx, f - s.start, f); ctx.restore();
  return true;
}
function totalFrames() { return SHOTS[SHOTS.length - 1].end; }
// common helpers for shots
function layer(key, fn) { return once(key, () => { const c = mk(); fn(c.getContext('2d'), c); return c; }); }
function fadeBlack(ctx, a) { if (a <= 0) return; ctx.fillStyle = `rgba(0,0,0,${clamp(a)})`; ctx.fillRect(0, 0, W, H); }
// camera shake on twos (hand-keyed feel)
function shake(f, amp, seed = 1) { const k = on(f, 2); return [(hash2(k, 1, seed) - 0.5) * 2 * amp, (hash2(k, 2, seed) - 0.5) * 2 * amp]; }
