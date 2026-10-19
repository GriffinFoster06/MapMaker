// Labels on the globe (Phase 5c; design note 18 §3.3): the label plan of packages/carto for the camera's current view,
// drawn as an SVG over the canvas. The features on the far side are dropped by the projector; the plan is recomputed when the
// camera stops moving (and the labels are hidden while it moves), and is a pure function of the data, the camera and the
// style. Original shell code. Nothing here writes the World.
import { type CartoData, type Style, furnitureLayout, labelsSvg, planLabels, riverThreshold } from '@mapmaker/carto';
import type { Globe } from './globe';

export interface GlobeLabelSource {
  /** The style to draw with, or null when labels are off. */
  style(): Style | null;
  data(): Promise<CartoData>;
}

export class GlobeLabels {
  private timer = 0;
  private gen = 0;
  /** The number of labels in the last plan (test hook). */
  count = 0;

  constructor(private readonly globe: Globe, private readonly svg: SVGSVGElement, private readonly src: GlobeLabelSource) {
    globe.onViewChange(() => this.schedule());
  }

  /** Redraws after the camera has rested for a moment; hides the labels until then. */
  schedule(delay = 140): void {
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
    const proj = { width: W, height: H, forward: (lon: number, lat: number) => this.globe.projectLonLat(lon, lat) };
    const fur = furnitureLayout(W, H, style, { scaleBar: false, legend: false });
    const plan = planLabels(data, proj, style, { obstacles: [fur.scale, fur.legend].filter((b): b is NonNullable<typeof b> => !!b), riverMinArea: riverThreshold(style, this.globe.pixelsPerRadian()) });
    this.count = plan.labels.length;
    this.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    this.svg.setAttribute('width', String(W));
    this.svg.setAttribute('height', String(H));
    this.svg.innerHTML = labelsSvg(plan, 'gl');
    this.svg.style.visibility = 'visible';
  }
}
