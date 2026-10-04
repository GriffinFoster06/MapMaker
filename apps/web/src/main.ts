const $ = (id: string) => document.getElementById(id)!;

// ?coi loads the COOP/COEP service-worker shim (GitHub Pages cannot set headers). It reloads the page once.
if (new URLSearchParams(location.search).has('coi')) {
  const s = document.createElement('script');
  s.src = `${import.meta.env.BASE_URL}coi-serviceworker.js`;
  document.head.appendChild(s);
}

$('isolated').textContent = String(self.crossOriginIsolated);
$('sab').textContent = typeof SharedArrayBuffer === 'function' ? 'available' : 'unavailable';
$('engine').textContent = navigator.userAgent;

declare global {
  interface Window { __probe?: Promise<{ version: number; hashes: Record<string, string>; ua: string }>; __probeWorker?: Worker }
}

function startProbe(): Window['__probe'] {
  const w = new Worker(new URL('./probe-worker.ts', import.meta.url), { type: 'module' });
  window.__probeWorker = w;
  $('probe').textContent = 'running…';
  return new Promise((resolve, reject) => {
    w.addEventListener('message', function h(e: MessageEvent) {
      if (e.data.op === 'run') { w.removeEventListener('message', h); $('probe').textContent = `${Object.keys(e.data.hashes).length} hashes`; $('out').textContent = JSON.stringify(e.data.hashes, null, 1); resolve(e.data); }
      else if (e.data.op === 'error') { $('probe').textContent = 'error'; reject(new Error(e.data.message)); }
    });
    w.postMessage({ op: 'run' });
  });
}

$('run').addEventListener('click', () => { window.__probe = startProbe(); });
// Automation hook: ?probe starts the probe on load.
if (new URLSearchParams(location.search).has('probe')) window.__probe = startProbe();
