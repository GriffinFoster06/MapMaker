// The edit log (ARCHITECTURE §3.8). Original shell code. Append-only except for the redo tail: undo moves a cursor back,
// redo forward, and a new edit after an undo truncates the tail (branches are note 36). The world at a cursor is "replay
// edits[0..cursor]"; hashes ignore wall-clock fields so equal edit sequences give equal hashes.
import { hashString } from '../hash';
import { canonicalJson } from '../typed';
import type { Edit, EditDraft } from './types';

export const MAIN_BRANCH = 'main';

/** The part of an edit that defines its effect (everything except wall-clock and authorship fields). */
export function editContent(e: Edit): unknown {
  return { id: e.id, target: e.target, region: e.region, op: e.op, payload: e.payload, mode: e.mode, weight: e.weight ?? null, gesture: e.gesture ?? null };
}

export interface EditLogJSON { edits: Edit[]; cursor: number; nextId: number }

export class EditLog {
  private list: Edit[] = [];
  private cur = 0;
  private nextId = 1;

  /** Number of active edits (those before the cursor). */
  get cursor(): number { return this.cur; }
  get length(): number { return this.list.length; }
  get canUndo(): boolean { return this.cur > 0; }
  get canRedo(): boolean { return this.cur < this.list.length; }
  /** Active edits, in application order. */
  active(): readonly Edit[] { return this.list.slice(0, this.cur); }
  all(): readonly Edit[] { return this.list; }
  isEmpty(): boolean { return this.list.length === 0; }

  append(draft: EditDraft, now = ''): Edit {
    if (draft.mode === 'soft' && !(draft.weight !== undefined && draft.weight > 0 && draft.weight <= 1)) throw new Error('a soft edit needs a weight in (0, 1]');
    this.list.length = this.cur; // a new edit after an undo drops the redo tail
    const e: Edit = { ...draft, id: this.nextId++, seq: this.list.length, branch: MAIN_BRANCH, createdAt: draft.createdAt ?? now };
    this.list.push(e);
    this.cur = this.list.length;
    return e;
  }

  /** Moves the cursor back over the last edit, and over every earlier edit of the same gesture. Returns the edits undone. */
  undo(): Edit[] {
    const undone: Edit[] = [];
    if (this.cur === 0) return undone;
    const g = this.list[this.cur - 1]!.gesture;
    do { undone.push(this.list[--this.cur]!); } while (g !== undefined && this.cur > 0 && this.list[this.cur - 1]!.gesture === g);
    return undone;
  }

  redo(): Edit[] {
    const redone: Edit[] = [];
    if (this.cur >= this.list.length) return redone;
    const g = this.list[this.cur]!.gesture;
    do { redone.push(this.list[this.cur++]!); } while (g !== undefined && this.cur < this.list.length && this.list[this.cur]!.gesture === g);
    return redone;
  }

  clear(): void { this.list = []; this.cur = 0; }

  /** Hash of the active edits accepted by `filter` (all by default); ignores wall-clock fields. */
  hash(filter: (e: Edit) => boolean = () => true): Promise<string> {
    return hashString(canonicalJson(this.active().filter(filter).map(editContent)));
  }

  toJSON(): EditLogJSON { return { edits: this.list, cursor: this.cur, nextId: this.nextId }; }

  static fromJSON(j: EditLogJSON): EditLog {
    const l = new EditLog();
    l.list = j.edits;
    l.cur = j.cursor;
    l.nextId = j.nextId;
    if (l.cur < 0 || l.cur > l.list.length) throw new Error('edit log cursor out of range');
    return l;
  }
}

/** Per-system switch (ARCHITECTURE §3.8): the stage simulates, is wholly authored by the edit log, or is switched off. */
export type SystemMode = 'simulate' | 'manual' | 'off';
