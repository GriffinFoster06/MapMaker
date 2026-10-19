// Our own font metrics for label measurement (Phase 5c, decision 5c-3). Azgaar's label-spread measures text through SVG
// DOM calls (getComputedTextLength, getExtentOfChar), which depend on the machine's fonts and need a browser. Here the
// advance widths are a table, so a label's size, and therefore its placement, is the same in every browser, in the engine
// worker and in Node.
//
// The table is the advance widths of Helvetica (Adobe Core 14 AFM, units of 1/1000 em, characters 32 to 126). Arial is
// metric-compatible with Helvetica, so styles name `Helvetica, Arial, sans-serif` and the macOS and Windows renderers draw
// text of the measured size. No font file is shipped or used here (fonts are an asset-licence item, Phase 10b).
//
// Original code; the widths are published font metrics, not a copy of any program's source.

/** Advance widths of the characters 32 to 126, thousandths of the font size. */
const ADVANCE = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, // space ! " # $ % & ' ( ) * + , - . /
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, // 0-9 : ; < = > ?
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, // @ A-O
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, // P-Z [ \ ] ^ _
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, // ` a-o
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, // p-z { | } ~
];

/** Advance of characters outside the table whose base letter is unknown (the digit width). */
const FALLBACK = 556;

/** Ascent and descent of the line box, fractions of the font size (Arial/Helvetica hhea: 0.905 and 0.212). */
export const ASCENT = 0.905;
export const DESCENT = 0.212;
/** Share of the line box height trimmed from the top and bottom of a glyph's ink box (label-spread INK_VERTICAL_TRIM). */
export const INK_VERTICAL_TRIM = 0.12;

/** Advance of one character in em. Accented Latin letters take their base letter's width. */
export function advanceEm(ch: string): number {
  const c = ch.codePointAt(0)!;
  if (c >= 32 && c <= 126) return ADVANCE[c - 32]! / 1000;
  if (c === 160) return ADVANCE[0]! / 1000;
  const base = ch.normalize('NFD').charCodeAt(0);
  return base >= 32 && base <= 126 ? ADVANCE[base - 32]! / 1000 : FALLBACK / 1000;
}

export interface TextStyle {
  /** Font size in pixels. */
  size: number;
  /** Extra space after every character, pixels (SVG letter-spacing). */
  tracking?: number;
}

/** Per-character advances of `text` in pixels (tracking included after each character, as SVG letter-spacing adds it). */
export function advances(text: string, s: TextStyle): number[] {
  const out: number[] = [];
  for (const ch of text) out.push(advanceEm(ch) * s.size + (s.tracking ?? 0));
  return out;
}

/** Width of `text` in pixels. The last character's tracking is counted, as getComputedTextLength counts it. */
export function textWidth(text: string, s: TextStyle): number {
  let w = 0;
  for (const a of advances(text, s)) w += a;
  return w;
}

export interface Box { x1: number; y1: number; x2: number; y2: number }

/** Characters per ink run (label-spread INK_RUN_LENGTH): runs of this many non-space glyphs, each one box. */
export const INK_RUN_LENGTH = 3;

/**
 * The line box of `text` with its baseline-left at (0, 0), and its glyph runs: label-spread's ink boxes, groups of
 * up to three non-space characters with the top and bottom 12% of the line trimmed, so a label can slot into the gap
 * between two words instead of being solid.
 */
export function measureText(text: string, s: TextStyle): { bounds: Box; ink: Box[]; width: number } {
  const adv = advances(text, s);
  const chars = [...text];
  const top = -ASCENT * s.size, bottom = DESCENT * s.size, trim = (bottom - top) * INK_VERTICAL_TRIM;
  const ink: Box[] = [];
  let run: Box | undefined, runLength = 0, x = 0;
  for (let i = 0; i < chars.length; i++) {
    const a = adv[i]!;
    if (/\s/u.test(chars[i]!)) {
      if (run) ink.push(run);
      run = undefined; runLength = 0;
    } else {
      const box = { x1: x, y1: top + trim, x2: x + a - (s.tracking ?? 0), y2: bottom - trim };
      run = run ? { x1: run.x1, y1: box.y1, x2: box.x2, y2: box.y2 } : box;
      runLength++;
      if (runLength >= INK_RUN_LENGTH) { ink.push(run); run = undefined; runLength = 0; }
    }
    x += a;
  }
  if (run) ink.push(run);
  return { bounds: { x1: 0, y1: top, x2: x, y2: bottom }, ink: ink.filter((b) => b.x2 > b.x1 && b.y2 > b.y1), width: x };
}
