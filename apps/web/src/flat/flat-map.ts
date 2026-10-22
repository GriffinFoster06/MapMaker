// Flat map controller (ARCHITECTURE §3.7): the GPU path for the shader projections (decision 5-5) when the mesh fits
// the GPU's textures, otherwise the CPU path at reduced resolution, computed in the engine worker in row bands so the
// page stays responsive. Projection is a view: nothing here writes the World.
import type { EngineClient, MeshData } from '@mapmaker/engine';
import { type LocatedRaster, ProjectionView, type ViewOptions, isGpuProjection } from '@mapmaker/projection';
import { colorize } from './colorize';
import { GpuMap, type GpuLayer } from './gpu-map';
import { yieldTurn } from '../yield-turn';

/** Longest stretch of the mesh upload that runs without giving the page back (milliseconds). */
const UPLOAD_SLICE_MS = 4;

/** `parallels`: the standard parallels of a conic projection, degrees (ignored by the others). */
export interface MapState { projection: string; rotate: [number, number, number]; zoom: number; pan: [number, number]; parallels?: [number, number] }

/** Linear resolution factor of the CPU path (half the pixels in each dimension). */
export const CPU_REDUCTION = 2;
/** Rows per CPU band. */
const CPU_ROWS = 16;

type Lookup = { R: number; cube: Uint32Array; adjOffset: Int32Array; adjList: Int32Array };

export class FlatMap {
  readonly gpu: GpuMap | null;
  private mesh: MeshData | undefined;
  private lookup: Promise<Lookup> | undefined;
  private uploaded = false;
  private uploading: Promise<boolean> | undefined;
  private worldGen = 0;
  private layer: GpuLayer | undefined;
  private layerUploaded = false;
  private gen = 0;
  /** The path that drew the last completed render. */
  lastPath: 'gpu' | 'cpu' | null = null;

  constructor(private readonly client: EngineClient, readonly gpuCanvas: HTMLCanvasElement, readonly cpuCanvas: HTMLCanvasElement) {
    let gpu: GpuMap | null = null;
    try { gpu = new GpuMap(gpuCanvas); } catch { gpu = null; }
    this.gpu = gpu;
  }

  setWorld(m: MeshData): void {
    this.mesh = m;
    this.worldGen++;
    this.lookup = undefined;
    this.uploaded = false;
    this.layerUploaded = false;
  }

  setLayer(l: GpuLayer): void {
    this.layer = l;
    this.layerUploaded = false;
  }

  /** Whether a world and a layer are set. */
  get ready(): boolean { return !!this.mesh && !!this.layer; }

  /** Device-pixel size of the map area. */
  size(): [number, number] {
    const r = this.gpuCanvas.parentElement!.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    return [Math.max(2, Math.round(r.width * dpr)), Math.max(2, Math.round(r.height * dpr))];
  }

  /** The stock view of a state at a size (interactive display). */
  static view(st: MapState, width: number, height: number, scale = 1): ProjectionView {
    const opts: ViewOptions = { projection: st.projection, width, height, rotate: st.rotate, zoom: st.zoom, pan: [st.pan[0] / scale, st.pan[1] / scale], ...(st.parallels ? { parallels: st.parallels } : {}) };
    return new ProjectionView(opts);
  }

  /** Whether `projection` is drawn by the GPU for the current world. */
  usesGpu(projection: string): boolean {
    // The adjacency has about 6 entries per cell (2E for E ≈ 3N edges); the upload checks the exact size again.
    return !!this.gpu && !!this.mesh && isGpuProjection(projection) && this.gpu.fits(this.mesh.numRegions, this.mesh.triangles.length, 6 * this.mesh.numRegions + 64);
  }

  /** Uploads the mesh, lookup and layer to the GPU if needed. */
  async ensureGpu(): Promise<GpuMap> {
    if (!this.gpu || !this.mesh || !this.layer) throw new Error('flat map not ready');
    if (!this.uploaded) {
      // One upload at a time, in slices that give the page back between them; a new world abandons it.
      this.uploading ??= this.uploadMesh().finally(() => { this.uploading = undefined; });
      if (!(await this.uploading)) return this.ensureGpu();
    }
    if (!this.layerUploaded) { this.gpu.setLayer(this.layer); this.layerUploaded = true; }
    return this.gpu;
  }

  private async uploadMesh(): Promise<boolean> {
    const gpu = this.gpu!, m = this.mesh!, world = this.worldGen;
    this.lookup ??= this.client.worldKernel<Lookup>('projection.gpuLookup', {});
    const lk = await this.lookup;
    if (world !== this.worldGen) return false;
    const ok = await gpu.setMeshSliced({ numRegions: m.numRegions, points: m.points, triangles: m.triangles, halfedges: m.halfedges, adjOffset: lk.adjOffset, adjList: lk.adjList, cubeR: lk.R, cube: lk.cube },
      { sliceMs: UPLOAD_SLICE_MS, yieldNow: yieldTurn, cancelled: () => world !== this.worldGen });
    if (!ok || world !== this.worldGen) return false;
    this.uploaded = true;
    this.layerUploaded = false;
    return true;
  }

  /** Draws the state; resolves when drawn (or superseded by a newer render). */
  async render(st: MapState): Promise<'gpu' | 'cpu' | 'superseded'> {
    const gen = ++this.gen;
    const [W, H] = this.size();
    if (this.usesGpu(st.projection)) {
      const gpu = await this.ensureGpu();
      if (gen !== this.gen) return 'superseded';
      gpu.render(FlatMap.view(st, W, H));
      this.gpuCanvas.hidden = false; this.cpuCanvas.hidden = true;
      this.lastPath = 'gpu';
      return 'gpu';
    }
    return this.renderCpu(st, W, H, gen);
  }

  private async renderCpu(st: MapState, W: number, H: number, gen: number): Promise<'cpu' | 'superseded'> {
    if (!this.mesh || !this.layer) throw new Error('flat map not ready');
    const w = Math.ceil(W / CPU_REDUCTION), h = Math.ceil(H / CPU_REDUCTION);
    const c = this.cpuCanvas;
    c.width = w; c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    this.gpuCanvas.hidden = true; c.hidden = false;
    const layer = this.layer, tris = this.mesh.triangles;
    const spec: ViewOptions = { projection: st.projection, width: w, height: h, rotate: st.rotate, zoom: st.zoom, pan: [st.pan[0] / CPU_REDUCTION, st.pan[1] / CPU_REDUCTION], ...(st.parallels ? { parallels: st.parallels } : {}) };
    for (let y0 = 0; y0 < h; y0 += CPU_ROWS) {
      const y1 = Math.min(h, y0 + CPU_ROWS);
      const r = await this.client.worldKernel<LocatedRaster>('projection.locate', { view: spec, y0, y1 });
      if (gen !== this.gen) return 'superseded';
      ctx.putImageData(new ImageData(colorize(r, layer, tris) as Uint8ClampedArray<ArrayBuffer>, w, y1 - y0), 0, y0);
    }
    this.lastPath = 'cpu';
    return 'cpu';
  }
}
