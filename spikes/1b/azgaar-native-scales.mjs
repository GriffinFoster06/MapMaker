// Spike 1b helper: native Azgaar field scales (prec, temp, h, area, flux) for the facade mapping.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const AZ = process.cwd(), PORT = 4175;
const server = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: AZ, stdio: 'ignore' });
for (let i = 0; i < 60; i++) { try { await fetch(`http://127.0.0.1:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }
const b = await chromium.launch();
try {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(`http://127.0.0.1:${PORT}/?seed=mapmaker-1a&width=1280&height=720`);
  await p.waitForFunction(() => window.mapHistory?.length, undefined, { timeout: 180000 });
  console.log(JSON.stringify(await p.evaluate(() => {
    const q = (a) => { const s = Array.from(a).sort((x, y) => x - y); return [0.05, 0.25, 0.5, 0.75, 0.95, 1].map((f) => s[Math.min(s.length - 1, Math.floor(f * s.length))]); };
    const land = (arr, h) => Array.from(arr).filter((_, i) => h[i] >= 20);
    return { gridN: grid.cells.i.length, packN: pack.cells.i.length, precLand: q(land(grid.cells.prec, grid.cells.h)), precAll: q(grid.cells.prec),
      tempLand: q(land(grid.cells.temp, grid.cells.h)), hLand: q(land(pack.cells.h, pack.cells.h)), areaQ: q(pack.cells.area),
      flMax: Math.max(...pack.cells.fl), graph: options.map.graph, rivers: pack.rivers.length, maxDischarge: Math.max(...pack.rivers.map((r) => r.discharge)) };
  })));
} finally { await b.close(); server.kill(); }
