import { runProbe } from '@mapmaker/determinism/probe';
let arrays;
self.onmessage = async (e) => {
    try {
        if (e.data.op === 'run') {
            const r = await runProbe({ keepArrays: true });
            arrays = r.arrays;
            self.postMessage({ op: 'run', version: r.version, hashes: r.hashes, ua: navigator.userAgent });
        }
        else {
            const a = arrays?.[e.data.key];
            self.postMessage({ op: 'get', key: e.data.key, type: a?.constructor.name, data: a ? Array.from(a, (x) => (Number.isNaN(x) ? 'NaN' : x)) : null });
        }
    }
    catch (err) {
        self.postMessage({ op: 'error', message: err instanceof Error ? err.stack ?? err.message : String(err) });
    }
};
