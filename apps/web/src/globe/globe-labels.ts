// Labels on the globe (Phase 5c; design note 18 §3.3): the label plan of packages/carto for the camera's current view,
// drawn as an SVG over the canvas. The features on the far side are dropped by the projector; the plan is recomputed when the
// camera stops moving (and the labels are hidden while it moves), and is a pure function of the data, the camera and the
// style. Original shell code. Nothing here writes the World.
import { type CartoData, type Style, buildMaskSliced, furnitureLayout, labelsSvg, maskCell, planLabels, riverThreshold } from '@mapmaker/carto';
import type { Globe } from './globe';
import { yieldTurn } from '../yield-turn';

export interface GlobeLabelSource {
  /** The style to draw with, or null when labels are off. */
  style(): Style | null;
  data(): Promise<CartoData>;
}

/** Longest stretch of the re-plan that runs without giving the main thread back (milliseconds). */
const SLICE_MS = 2;

export class GlobeLabels {
  private timer = 0;
  private gen = 0;
  /** The number of labels in the last plan (test hook). */
  count = 0;
  private slices: number[] = [];

  /** Test and measurement hook: main-thread milliseconds of each uninterrupted stretch of the re-plans since the last call (at most 5000). */
  takeSlices(): number[] {
    const s = this.slices;
    this.slices = [];
    return s;
  }

  constructor(private readonly globe: Globe, private readonly svg: SVGSVGElement, private readonly src: GlobeLabelSource) {
    globe.onViewChange(() => this.schedule());
  }

  /** Redraws after the camera has rested for a moment; hides the labels until then. */
  schedule(delay = 140): void {
    this.gen++; // a plan still being made for the view that just moved is abandoned
    this.svg.style.visibility = 'hidden';
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => { void this.refresh().catch((e: unknown) => { console.error(e); }); }, delay);
  }

  async refresh(): Promise<void> {
    const my = ++this.gen, style = this.src.style();
    if (!style || !this.globe.regions) { this.svg.replaceChildren(); this.count = 0; return; }
    const data = await this.src.data();
    if (my !== this.gen) return;
    const canvas = this.globe.canvas, W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W || !H) return;
    const sample = this.globe.lonLatSampler(), tmp = new Float64Array(2);
    const proj = {
      width: W, height: H,
      forward: (lon: number, lat: number) => this.globe.projectLonLat(lon, lat),
      invert: (x: number, y: number): [number, number] | null => (sample(x, y, tmp) ? [tmp[0]!, tmp[1]!] : null),
      invertInto: sample,
    };
    // The mask is the long part of the plan (a ground lookup for every cell of a coarse screen grid): made in slices, and dropped if the camera moves meanwhile.
    let mark = performance.now();
    const lap = (): void => { const t = performance.now(); if (this.slices.length < 5000) this.slices.push(t - mark); mark = t; };
    const pause = async (): Promise<void> => { lap(); await yieldTurn(); mark = performance.now(); };
    const mask = await buildMaskSliced(proj, data.regions, maskCell(W), { sliceMs: SLICE_MS, yieldNow: pause, cancelled: () => my !== this.gen, now: () => performance.now() });
    if (!mask || my !== this.gen) return;
    await pause(); // the placement below is a slice of its own
    if (my !== this.gen) return;
    const fur = furnitureLayout(W, H, style, { scaleBar: false, legend: false });
    const plan = planLabels(data, proj, style, { obstacles: [fur.scale, fur.legend].filter((b): b is NonNullable<typeof b> => !!b), riverMinArea: riverThreshold(style, this.globe.pixelsPerRadian()), limb: true, mask });
    this.count = plan.labels.length;
    this.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    this.svg.setAttribute('width', String(W));
    this.svg.setAttribute('height', String(H));
    this.svg.innerHTML = labelsSvg(plan, 'gl');
    this.svg.style.visibility = 'visible';
    lap();
  }
}
