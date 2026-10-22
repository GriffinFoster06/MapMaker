// Gives the main thread back for one task turn (pointer moves and frames queued meanwhile run first). Original shell code.

export function yieldTurn(): Promise<void> {
  return new Promise((resolve) => { const ch = new MessageChannel(); ch.port1.onmessage = () => { ch.port1.close(); resolve(); }; ch.port2.postMessage(0); });
}
