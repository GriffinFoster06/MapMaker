// Append-only event log with explicit causes, chunked by tick range (ARCHITECTURE §3.4). Original shell code.
import type { EntityRef } from '../entities/table';

export interface GameEvent {
  id: number;
  /** Tick on the history axis, or geo step for the geologic log. */
  tick: number;
  type: string;
  actors: EntityRef[];
  cells: number[];
  payload: Record<string, unknown>;
  causes: number[];
}

export type NewEvent = Omit<GameEvent, 'id' | 'causes'> & { causes?: number[] };

export class EventLog {
  private readonly events: GameEvent[] = [];

  /** `chunkTicks` ticks per saved chunk. */
  constructor(readonly chunkTicks = 1024) {}

  get length(): number { return this.events.length; }

  append(e: NewEvent): number {
    const last = this.events[this.events.length - 1];
    if (last && e.tick < last.tick) throw new Error('events must be appended in non-decreasing tick order');
    const causes = e.causes ?? [];
    for (const c of causes) if (!(c >= 1 && c <= this.events.length)) throw new Error(`cause ${c} does not refer to an earlier event`);
    const id = this.events.length + 1;
    this.events.push({ id, tick: e.tick, type: e.type, actors: e.actors, cells: e.cells, payload: e.payload, causes });
    return id;
  }

  get(id: number): GameEvent {
    const e = this.events[id - 1];
    if (!e) throw new Error(`no event ${id}`);
    return e;
  }

  range(fromTick: number, toTickInclusive: number): GameEvent[] {
    return this.events.filter((e) => e.tick >= fromTick && e.tick <= toTickInclusive);
  }

  /** Full causal ancestry of an event, nearest first, without duplicates. */
  ancestry(id: number): GameEvent[] {
    const seen = new Set<number>();
    const out: GameEvent[] = [];
    const stack = [...this.get(id).causes];
    while (stack.length) {
      const c = stack.shift()!;
      if (seen.has(c)) continue;
      seen.add(c);
      const e = this.get(c);
      out.push(e);
      stack.push(...e.causes);
    }
    return out;
  }

  /** chunk index -> events, where chunk = floor(tick / chunkTicks). */
  chunks(): Map<number, GameEvent[]> {
    const m = new Map<number, GameEvent[]>();
    for (const e of this.events) {
      const k = Math.floor(e.tick / this.chunkTicks);
      (m.get(k) ?? m.set(k, []).get(k)!).push(e);
    }
    return m;
  }

  static fromEvents(events: GameEvent[], chunkTicks: number): EventLog {
    const l = new EventLog(chunkTicks);
    for (const e of events) l.append(e);
    return l;
  }
}
