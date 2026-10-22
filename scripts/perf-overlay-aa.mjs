/* global console, document, Image, Path2D*/
// Is a canvas (Path2D) drawing of the flat map's overlay paths the same picture as the SVG? Rasterizes the same d3 path strings both
// ways in Chromium and Firefox (headless) and counts the pixels that differ (docs/checkpoints/PERFORMANCE_STUDY.md, "After the first
// fixes", item 3). Usage: scripts/node24.sh npx tsx scripts/perf-overlay-aa.mjs
import process from 'node:process';
import { chromium, firefox } from '@playwright/test';
import { ProjectionView, graticule, pathFor } from '@mapmaker/projection';

const W = 1600, H = 900;
const coast = { type: 'MultiLineString', coordinates: [
  Array.from({ length: 400 }, (_, i) => [-175 + i * 0.87, 45 * Math.sin(i / 11) + 10]),
  Array.from({ length: 200 }, (_, i) => [-60 + i * 0.6, -45 + 30 * Math.cos(i / 9)]),
] };
for (const projection of ['robinson', 'orthographic']) {
  const v = new ProjectionView({ projection, width: W, height: H, rotate: [20, -15, 0], zoom: 3, pan: [-312.37, 187.61] });
  const specs = [[v.outline(), 2.2], [graticule(v, 15), 1.2], [coast, 3]].map(([g, w]) => ({ d: pathFor(v)(g) ?? '', w }));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>${specs.map((s) => `<path d="${s.d}" fill="none" stroke="#222" stroke-width="${s.w}"/>`).join('')}</svg>`;
  for (const [name, kind] of [['chromium', chromium], ['firefox', firefox]]) {
    const b = await kind.launch({ headless: true });
    const page = await b.newPage({ viewport: { width: 800, height: 600 } });
    await page.goto('about:blank');
    const r = await page.evaluate(async ([svgText, items, w, h]) => {
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
      await img.decode();
      const a = document.createElement('canvas'); a.width = w; a.height = h;
      a.getContext('2d').drawImage(img, 0, 0);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
      x.strokeStyle = '#222'; x.lineCap = 'butt'; x.lineJoin = 'miter'; x.miterLimit = 4;
      for (const it of items) { x.lineWidth = it.w; x.stroke(new Path2D(it.d)); }
      const p = a.getContext('2d').getImageData(0, 0, w, h).data, q = x.getImageData(0, 0, w, h).data;
      let max = 0, differing = 0, drawn = 0, sum = 0;
      for (let i = 0; i < p.length; i += 4) {
        const d = Math.max(Math.abs(p[i] - q[i]), Math.abs(p[i + 1] - q[i + 1]), Math.abs(p[i + 2] - q[i + 2]));
        if (p[i] < 250) drawn++;
        if (d) differing++;
        sum += d;
        if (d > max) max = d;
      }
      return { max, differing, drawn, mean: sum / (p.length / 4) };
    }, [svg, specs, W, H]);
    console.log(projection, name, JSON.stringify(r));
    await b.close();
  }
}
process.exit(0);
