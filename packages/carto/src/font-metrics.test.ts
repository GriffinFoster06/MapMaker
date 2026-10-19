import { describe, expect, test } from 'vitest';
import { advanceEm, advances, measureText, textWidth } from './font-metrics';

describe('font metrics', () => {
  test('widths are the Helvetica AFM advances', () => {
    expect(textWidth('Hello', { size: 1000 })).toBe(722 + 556 + 222 + 222 + 556);
    expect(textWidth('W', { size: 10 })).toBeCloseTo(9.44, 12);
    expect(advanceEm(' ')).toBe(0.278);
    expect(advanceEm('~')).toBe(0.584);
    expect(advanceEm('0')).toBe(0.556);
    expect(advanceEm('@')).toBe(1.015);
  });
  test('the table covers exactly the 95 printable ASCII characters (no shifted row)', () => {
    // i, l narrow; m, w wide; capital I narrow, capital M wide: a row shifted by one would break these.
    for (const [c, w] of [['i', 0.222], ['l', 0.222], ['m', 0.833], ['w', 0.722], ['I', 0.278], ['M', 0.833], ['A', 0.667], ['z', 0.5], ['Z', 0.611], ['a', 0.556], ['`', 0.333], ['{', 0.334], ['|', 0.26], ['}', 0.334]] as const) expect(advanceEm(c), c).toBe(w);
  });
  test('accented Latin letters take the base letter width; unknown scripts the fallback', () => {
    expect(advanceEm('é')).toBe(advanceEm('e'));
    expect(advanceEm('Å')).toBe(advanceEm('A'));
    expect(advanceEm('漢')).toBe(0.556);
  });
  test('tracking is added after every character', () => {
    expect(textWidth('abc', { size: 10, tracking: 2 })).toBeCloseTo(textWidth('abc', { size: 10 }) + 6, 12);
    for (const a of advances('ab', { size: 10, tracking: 1 })) expect(a).toBeCloseTo(6.56, 12);
  });
  test('ink runs: three non-space glyphs each, words never merged, trimmed top and bottom', () => {
    const m = measureText('Alpine Sea', { size: 10 });
    expect(m.ink).toHaveLength(3); // Alp, ine | Sea
    expect(m.width).toBeCloseTo(textWidth('Alpine Sea', { size: 10 }), 12);
    expect(m.ink[0]!.x1).toBe(0);
    expect(m.ink[2]!.x1).toBeGreaterThan(m.ink[1]!.x2 + 2); // the space separates the words
    const line = m.bounds.y2 - m.bounds.y1;
    expect(m.ink[0]!.y2 - m.ink[0]!.y1).toBeCloseTo(line * 0.76, 12);
    expect(m.bounds.y1).toBeCloseTo(-9.05, 12);
  });
});
