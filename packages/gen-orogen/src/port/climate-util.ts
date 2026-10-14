// Provenance: ported from upstream/orogen/js/climate-util.js @ cc2662b (GPL-3.0). See PROVENANCE.md.
// Shared climate utilities: smoothing, ITCZ lookup, and percentile selection. Math.log/exp go through dmath.
import { dmath } from '@mapmaker/core';
import type { PortMesh } from './types';

// ── Laplacian smoothing ──────────────────────────────────────────────────────

export function smoothField(mesh: PortMesh, field: Float32Array, passes: number): void {
  const { adjOffset, adjList, numRegions } = mesh;
  const tmp = new Float32Array(numRegions);
  let src: Float32Array = field, dst: Float32Array = tmp;

  for (let pass = 0; pass < passes; pass++) {
    for (let r = 0; r < numRegions; r++) {
      let sum = src[r]!;
      let count = 1;
      const end = adjOffset[r + 1]!;
      for (let ni = adjOffset[r]!; ni < end; ni++) {
        sum += src[adjList[ni]!]!;
        count++;
      }
      dst[r] = sum / count;
    }
    const swap = src; src = dst; dst = swap;
  }
  // If result ended up in tmp, copy back to field
  if (src !== field) field.set(src);
}

// ── ITCZ latitude lookup (linear interpolation with wrapping) ────────────────

export function makeItczLookup(itczLons: ArrayLike<number>, itczLats: ArrayLike<number>): (lon: number) => number {
  const n = itczLons.length;
  const step = (2 * Math.PI) / n;
  const lonStart = -Math.PI + step * 0.5;

  return function (lon: number): number {
    let fi = (lon - lonStart) / step;
    fi = ((fi % n) + n) % n;
    const i0 = Math.floor(fi);
    const i1 = (i0 + 1) % n;
    const frac = fi - i0;
    return itczLats[i0]! * (1 - frac) + itczLats[i1]! * frac;
  };
}

// ── Floyd-Rivest selection (O(N) expected percentile) ────────────────────────

function floydRivest(arr: Float32Array, left: number, right: number, k: number): void {
  while (right > left) {
    if (right - left > 600) {
      const n = right - left + 1;
      const i = k - left + 1;
      const z = dmath.log(n);
      const s = 0.5 * dmath.exp(2 * z / 3);
      const sd = 0.5 * Math.sqrt(z * s * (n - s) / n) * (i - n / 2 < 0 ? -1 : 1);
      const newLeft = Math.max(left, Math.floor(k - i * s / n + sd));
      const newRight = Math.min(right, Math.floor(k + (n - i) * s / n + sd));
      floydRivest(arr, newLeft, newRight, k);
    }

    const t = arr[k]!;
    if (t !== t) return; // NaN pivot — cannot partition, bail out
    let i = left;
    let j = right;

    arr[k] = arr[left]!;
    arr[left] = t;

    if (arr[right]! > t) {
      arr[left] = arr[right]!;
      arr[right] = t;
    }

    while (i < j) {
      const tmp = arr[i]!;
      arr[i] = arr[j]!;
      arr[j] = tmp;
      i++;
      j--;
      while (arr[i]! < t) i++;
      while (arr[j]! > t) j--;
    }

    if (arr[left] === t) {
      const tmp = arr[left]!;
      arr[left] = arr[j]!;
      arr[j] = tmp;
    } else {
      j++;
      const tmp = arr[j]!;
      arr[j] = arr[right]!;
      arr[right] = tmp;
    }

    if (j <= k) left = j + 1;
    if (k <= j) right = j - 1;
  }
}

/**
 * Compute the p-th percentile of a numeric array in O(N) expected time.
 * Returns the value at index floor(n * p) of the sorted order.
 * Makes a copy so the input is not mutated. Returns 1 if the result is 0.
 */
export function percentile(arr: ArrayLike<number>, p: number): number {
  const n = arr.length;
  if (n === 0) return 1;
  const work = new Float32Array(arr);
  const k = Math.floor(n * p);
  floydRivest(work, 0, n - 1, k);
  return work[k] || 1;
}
