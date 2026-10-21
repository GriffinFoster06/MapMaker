// Bootstrap for probe-worker.ts inside a worker thread: worker_threads ignore `--import`, so register tsx and the
// d3-dmath alias hooks here (the same two `npm run probe` uses), then load the TypeScript entry.
import { register } from 'tsx/esm/api';
import { register as registerHooks } from 'node:module';

register();
registerHooks('../../packages/projection/alias/d3-dmath.mjs', import.meta.url);
await import('./probe-worker.ts');
