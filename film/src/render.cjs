// usage: node render.mjs <outdir> <frames: "a-b" or "1,5,9"> [workers]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const here = __dirname;
(async () => {
const [, , outdir, spec, workersArg] = process.argv;
fs.mkdirSync(outdir, { recursive: true });
let frames = [];
for (const part of spec.split(',')) {
  if (part.includes('-')) { const [a, b] = part.split('-').map(Number); for (let i = a; i <= b; i++) frames.push(i); }
  else frames.push(Number(part));
}
const workers = Number(workersArg || 1);
const browser = await chromium.launch({ args: ['--disable-gpu-sandbox', '--js-flags=--max-old-space-size=4096'] });
const chunks = Array.from({ length: workers }, () => []);
// contiguous chunks keep per-shot caches warm
const per = Math.ceil(frames.length / workers);
for (let i = 0; i < workers; i++) chunks[i] = frames.slice(i * per, (i + 1) * per);
const t0 = Date.now();
await Promise.all(chunks.map(async (fr, wi) => {
  if (!fr.length) return;
  const page = await browser.newPage({ viewport: { width: 1280, height: 544 } });
  page.on('console', (m) => { if (m.type() === 'error') console.log('[page]', m.text()); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto('file://' + path.join(here, 'render.html'));
  let n = 0;
  for (const f of fr) {
    const url = await page.evaluate((f) => { renderFrame(f); return document.getElementById('c').toDataURL('image/png'); }, f);
    fs.writeFileSync(path.join(outdir, `f${String(f).padStart(4, '0')}.png`), Buffer.from(url.split(',')[1], 'base64'));
    n++;
    if (n % 24 === 0) console.log(`w${wi} ${n}/${fr.length} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  await page.close();
}));
await browser.close();
console.log('done', frames.length, 'frames in', ((Date.now() - t0) / 1000).toFixed(1), 's');
})();
