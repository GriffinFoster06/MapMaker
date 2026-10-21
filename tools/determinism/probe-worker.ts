// Worker-thread entry for the repeated-run stability test: runs the probe `runs` times in this one worker and posts
// every run's hashes back. The 30 s synchronous probe runs then never block the vitest worker's event loop.
import { parentPort, workerData } from 'node:worker_threads';
import { runProbe } from './probe';

const runs: Record<string, string>[] = [];
for (let i = 0; i < (workerData as { runs: number }).runs; i++) runs.push((await runProbe()).hashes);
parentPort!.postMessage(runs);
