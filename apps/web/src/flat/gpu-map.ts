// GPU flat map (ARCHITECTURE §3.7, "Interactive (GPU)"; Phase 5 M4). Original shell code. A full-screen triangle with
// the projection's fragment shader (packages/projection/src/gpu/glsl.ts) on three.js; the mesh lives in data textures
// (texelFetch only, no filtering): the triangle-id cube map, triangle vertex ids, halfedges, Float32 cell positions,
// the Delaunay adjacency, and the layer's per-cell values or colours. Debug renders go to an RGBA32UI target.
import * as THREE from 'three';
import type { Lut } from '@mapmaker/carto';
import { type DebugMode, type GpuProjectionId, MAP_VERTEX, type ProjectionView, cubeResolution, flatTextureWidth, mapFragmentShader, mapUniforms, padTo } from '@mapmaker/projection';

export interface GpuMesh {
  numRegions: number;
  /** Cell positions, xyz interleaved (rounded to Float32 on upload). */
  points: ArrayLike<number>;
  triangles: Int32Array;
  halfedges: Int32Array;
  adjOffset: Int32Array;
  adjList: Int32Array;
  cubeR: number;
  cube: Uint32Array;
}

/**
 * A layer as the shader draws it: barycentric values through a palette, nearest-cell colours, or (Phase 5c) a styled map:
 * barycentric elevation through the style's lookup, optionally nearest land colours above sea level, times a per-cell relief
 * factor interpolated barycentrically.
 */
export type GpuLayer =
  | { rule: 'barycentric'; values: Float32Array; palette: 'elevation' }
  | { rule: 'barycentric'; values: Float32Array; palette: 'ramp'; lo: number; hi: number }
  | { rule: 'nearest'; colors: Float32Array /* rgb per cell, linear 0..1 */ }
  | { rule: 'styled'; elevation: Float32Array; factor: Float32Array; colors: Float32Array | null; lut: Lut };

export class GpuMap {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: THREE.Mesh;
  private readonly materials = new Map<string, THREE.RawShaderMaterial>();
  private textures: Record<string, THREE.DataTexture> = {};
  private texW = 1;
  private layer: GpuLayer | undefined;
  readonly maxTextureSize: number;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, preserveDrawingBuffer: true });
    this.renderer.setClearColor(0x000000, 0);
    this.maxTextureSize = this.renderer.capabilities.maxTextureSize;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.quad = new THREE.Mesh(g);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  /** Whether the mesh's flat textures fit this GPU (otherwise the CPU path draws). */
  fits(numRegions: number, triangleIndices: number, adjacency: number): boolean {
    const longest = Math.max(triangleIndices, adjacency, 3 * numRegions + 1);
    return flatTextureWidth(longest, this.maxTextureSize) !== null && 3 * cubeResolution(triangleIndices / 3) <= this.maxTextureSize;
  }

  private dataTexture(data: Uint32Array | Float32Array | Uint8Array, w: number, h: number, kind: 'u32' | 'f32' | 'rgba8' | 'rgba32f'): THREE.DataTexture {
    const d = data as ArrayBufferView<ArrayBuffer>;
    const t = kind === 'u32' ? new THREE.DataTexture(d, w, h, THREE.RedIntegerFormat, THREE.UnsignedIntType)
      : kind === 'f32' ? new THREE.DataTexture(d, w, h, THREE.RedFormat, THREE.FloatType)
      : kind === 'rgba32f' ? new THREE.DataTexture(d, w, h, THREE.RGBAFormat, THREE.FloatType)
      : new THREE.DataTexture(d, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.internalFormat = kind === 'u32' ? 'R32UI' : kind === 'f32' ? 'R32F' : kind === 'rgba32f' ? 'RGBA32F' : 'RGBA8';
    t.minFilter = t.magFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.flipY = false;
    t.unpackAlignment = 1;
    t.colorSpace = THREE.NoColorSpace;
    t.needsUpdate = true;
    return t;
  }

  private flat(data: Uint32Array | Float32Array, kind: 'u32' | 'f32'): THREE.DataTexture {
    const h = Math.ceil(data.length / this.texW);
    return this.dataTexture(padTo(data, this.texW * h), this.texW, h, kind);
  }

  setMesh(m: GpuMesh): void {
    this.dispose();
    const longest = Math.max(m.triangles.length, m.adjList.length, 3 * m.numRegions + 1);
    const size = flatTextureWidth(longest, this.maxTextureSize);
    if (!size) throw new Error('mesh too large for this GPU');
    this.texW = size.width;
    const u32 = (a: Int32Array) => new Uint32Array(a.buffer, a.byteOffset, a.length);
    this.textures = {
      uCube: this.dataTexture(m.cube, 3 * m.cubeR, 2 * m.cubeR, 'u32'),
      uTri: this.flat(u32(m.triangles), 'u32'),
      uHalf: this.flat(u32(m.halfedges), 'u32'),
      uPos: this.flat(Float32Array.from(m.points), 'f32'),
      uAdjOff: this.flat(u32(m.adjOffset), 'u32'),
      uAdj: this.flat(u32(m.adjList), 'u32'),
    };
    this.cubeR = m.cubeR;
    this.regions = m.numRegions;
  }

  private cubeR = 0;
  private regions = 0;

  setLayer(l: GpuLayer): void {
    for (const k of ['uValue', 'uColor', 'uShade', 'uLut']) this.textures[k]?.dispose();
    const n = this.regions;
    const dummyShade = () => this.dataTexture(new Float32Array(1), 1, 1, 'f32');
    const rgba8 = (colors: Float32Array) => {
      const h = Math.ceil(n / this.texW), px = new Uint8Array(4 * this.texW * h);
      for (let i = 0; i < n; i++) {
        px[4 * i] = Math.round(Math.min(1, Math.max(0, colors[3 * i]!)) * 255);
        px[4 * i + 1] = Math.round(Math.min(1, Math.max(0, colors[3 * i + 1]!)) * 255);
        px[4 * i + 2] = Math.round(Math.min(1, Math.max(0, colors[3 * i + 2]!)) * 255);
        px[4 * i + 3] = 255;
      }
      return this.dataTexture(px, this.texW, h, 'rgba8');
    };
    this.textures['uShade'] = dummyShade();
    this.textures['uLut'] = this.dataTexture(new Float32Array(8), 2, 1, 'rgba32f');
    if (l.rule === 'styled') {
      this.textures['uValue'] = this.flat(l.elevation, 'f32');
      this.textures['uShade']?.dispose();
      this.textures['uShade'] = this.flat(l.factor, 'f32');
      this.textures['uLut']?.dispose();
      this.textures['uLut'] = this.dataTexture(l.lut.rgba, l.lut.rgba.length / 4, 1, 'rgba32f');
      this.textures['uColor'] = l.colors ? rgba8(l.colors) : this.dataTexture(new Uint8Array(4), 1, 1, 'rgba8');
    } else if (l.rule === 'barycentric') {
      this.textures['uValue'] = this.flat(l.values, 'f32');
      this.textures['uColor'] = this.dataTexture(new Uint8Array(4), 1, 1, 'rgba8');
    } else {
      this.textures['uValue'] = this.dataTexture(new Float32Array(1), 1, 1, 'f32');
      this.textures['uColor'] = rgba8(l.colors);
    }
    this.layer = l;
  }

  private material(projection: GpuProjectionId, debug: boolean): THREE.RawShaderMaterial {
    const key = `${projection}/${debug}`;
    let m = this.materials.get(key);
    if (!m) {
      m = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: MAP_VERTEX, fragmentShader: mapFragmentShader(projection, debug), uniforms: {}, depthTest: false, depthWrite: false });
      // Every uniform exists before the first compile (three resolves them then).
      for (const k of ['uK', 'uTx', 'uTy', 'uOrigin', 'uTargetH', 'uRot', 'uHasClip', 'uCosClip', 'uHasMaxLat', 'uMaxLat', 'uVecRot', 'uMode', 'uCubeR', 'uTexW', 'uRule', 'uPalette', 'uLo', 'uHi', 'uCube', 'uTri', 'uHalf', 'uPos', 'uAdjOff', 'uAdj', 'uValue', 'uColor', 'uShade', 'uLut', 'uHasShade', 'uLutN', 'uOceanMin', 'uLandMax']) m.uniforms[k] = { value: null };
      this.materials.set(key, m);
    }
    return m;
  }

  private prepare(view: ProjectionView, debug: boolean, origin: [number, number], targetH: number, mode: DebugMode | 0): void {
    if (!this.layer) throw new Error('no layer');
    const u = mapUniforms(view);
    const mat = this.material(u.projection, debug);
    const l = this.layer;
    const uni: Record<string, { value: unknown }> = {
      uK: { value: u.k }, uTx: { value: u.tx }, uTy: { value: u.ty },
      uOrigin: { value: new THREE.Vector2(origin[0], origin[1]) }, uTargetH: { value: targetH },
      uRot: { value: new THREE.Matrix3().fromArray(u.rot) },
      uHasClip: { value: u.cosClip !== null }, uCosClip: { value: u.cosClip ?? -2 },
      uHasMaxLat: { value: u.maxLat !== null }, uMaxLat: { value: u.maxLat ?? 10 }, uVecRot: { value: u.vecRot },
      uMode: { value: mode }, uCubeR: { value: this.cubeR }, uTexW: { value: this.texW },
      uRule: { value: l.rule === 'nearest' ? 0 : 1 },
      uPalette: { value: l.rule === 'styled' ? (l.colors ? 3 : 2) : l.rule === 'barycentric' && l.palette === 'ramp' ? 1 : 0 },
      uHasShade: { value: l.rule === 'styled' ? 1 : 0 },
      uLutN: { value: l.rule === 'styled' ? l.lut.rgba.length / 8 : 2 },
      uOceanMin: { value: l.rule === 'styled' ? l.lut.oceanMin : -1 },
      uLandMax: { value: l.rule === 'styled' ? l.lut.landMax : 1 },
      uLo: { value: l.rule === 'barycentric' && l.palette === 'ramp' ? l.lo : 0 },
      uHi: { value: l.rule === 'barycentric' && l.palette === 'ramp' ? l.hi : 1 },
    };
    for (const [k, t] of Object.entries(this.textures)) uni[k] = { value: t };
    // three keeps the uniforms object it compiled with, so values are updated in place.
    for (const [k, u] of Object.entries(uni)) {
      if (mat.uniforms[k]) mat.uniforms[k]!.value = u.value; else mat.uniforms[k] = u;
    }
    this.quad.material = mat;
  }

  /** Draws the view onto the canvas (whose drawing buffer must be view.width × view.height). */
  render(view: ProjectionView): void {
    this.renderer.setSize(view.width, view.height, false);
    this.prepare(view, false, [0, 0], view.height, 0);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
  }

  /** Debug render of the whole view into an RGBA32UI target; rows top to bottom, 4 uint32 per pixel. */
  debug(view: ProjectionView, mode: DebugMode): Uint32Array {
    const W = view.width, H = view.height;
    const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.UnsignedIntType, format: THREE.RGBAIntegerFormat, internalFormat: 'RGBA32UI', depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    try {
      this.prepare(view, true, [0, 0], H, mode);
      this.renderer.setRenderTarget(rt);
      this.renderer.render(this.scene, this.camera);
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      const raw = new Uint32Array(4 * W * H);
      gl.readPixels(0, 0, W, H, gl.RGBA_INTEGER, gl.UNSIGNED_INT, raw);
      const out = new Uint32Array(4 * W * H);
      for (let r = 0; r < H; r++) out.set(raw.subarray(4 * W * r, 4 * W * (r + 1)), 4 * W * (H - 1 - r));
      return out;
    } finally {
      this.renderer.setRenderTarget(null);
      rt.dispose();
    }
  }

  dispose(): void {
    for (const t of Object.values(this.textures)) t.dispose();
    this.textures = {};
  }
}
