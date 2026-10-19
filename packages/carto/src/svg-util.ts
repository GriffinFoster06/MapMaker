// Small helpers for building SVG text. Original code.

/** Escapes text for an SVG text node or attribute value. */
export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Rounds to 2 decimals for compact, stable output. */
export const r2 = (v: number): string => String(Math.round(v * 100) / 100);

/** RGBA bytes of a #rrggbb or #rrggbbaa colour. */
export function hexToRgbaBytes(hex: string): [number, number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255];
}
