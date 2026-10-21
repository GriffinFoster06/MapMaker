// Three.js globe (ARCHITECTURE §3.7, §6.3: WebGL2 is the baseline renderer). Original shell code; the camera and layer
// ideas follow orogen's scene.js and planet-mesh.js, but the geometry is built from the canonical mesh.
//
// Geometry: the Delaunay triangulation over the cell centres, with one vertex colour per cell (Gouraud shading), so a layer
// switch rewrites only the colour buffer. 3 floats of position and 3 of colour per cell, 3 indices per triangle: about
// 100 B per cell, which is 260 MB at 2.56M cells.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { MeshData } from '@mapmaker/engine';

export class Globe {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.01, 50);
  private readonly controls: OrbitControls;
  private mesh: THREE.Mesh | undefined;
  private color: Float32Array | undefined;
  private framePending = false;
  private ring: THREE.LineLoop | undefined;
  private readonly listeners = new Set<() => void>();

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setClearColor(0x05060d);
    this.camera.position.set(0, 0.6, 3.2);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enablePan = false;
    this.controls.minDistance = 1.15;
    this.controls.maxDistance = 8;
    this.controls.addEventListener('change', () => { this.render(); for (const l of this.listeners) l(); });
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  /** Replaces the world geometry. Canonical frame is +Z north; three.js is Y-up, so (x, y, z) -> (x, z, -y), a rotation. */
  setMesh(m: MeshData): void {
    this.disposeMesh();
    const n = m.numRegions;
    const pos = new Float32Array(3 * n);
    for (let i = 0; i < n; i++) {
      pos[3 * i] = m.points[3 * i]!;
      pos[3 * i + 1] = m.points[3 * i + 2]!;
      pos[3 * i + 2] = -m.points[3 * i + 1]!;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.color = new Float32Array(3 * n).fill(0.2);
    g.setAttribute('color', new THREE.BufferAttribute(this.color, 3));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(m.triangles.buffer, m.triangles.byteOffset, m.triangles.length), 1));
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    this.scene.add(this.mesh);
    this.render();
  }

  get regions(): number { return this.color ? this.color.length / 3 : 0; }

  /** The colour buffer to fill, then call `colorsChanged()`. */
  get colors(): Float32Array {
    if (!this.color) throw new Error('no mesh');
    return this.color;
  }

  colorsChanged(): void {
    if (!this.mesh) return;
    (this.mesh.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    this.render();
  }

  /**
   * Draws the current scene on the next animation frame. At most one frame is pending: a request while one is pending is
   * already covered, because the frame draws the scene as it is when it runs. (Cancelling and re-requesting on every
   * camera change starved the globe of frames when pointer events arrived about once per frame: one draw per drag.)
   */
  render(): void {
    if (this.framePending) return;
    this.framePending = true;
    requestAnimationFrame(() => { this.framePending = false; this.renderer.render(this.scene, this.camera); });
  }

  private resize(): void {
    const w = this.canvas.clientWidth || 640, h = this.canvas.clientHeight || 480;
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.render();
    for (const l of this.listeners) l();
  }

  private disposeMesh(): void {
    if (!this.mesh) return;
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh = undefined;
  }

  /**
   * The brush ring (Phase 5c): a closed line through `points` (canonical unit vectors, xyz interleaved), lifted 0.2% above
   * the surface; null hides it. One small buffer, redrawn with the globe; no change to the world geometry.
   */
  setRing(points: ArrayLike<number> | null): void {
    if (!points) {
      if (this.ring) this.ring.visible = false;
      this.render();
      return;
    }
    const n = points.length / 3, lift = 1.002;
    if (!this.ring || (this.ring.geometry.getAttribute('position') as THREE.BufferAttribute).count !== n) {
      this.ring?.geometry.dispose();
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * n), 3));
      if (this.ring) this.ring.geometry = g;
      else {
        this.ring = new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: 0xffffff }));
        this.ring.frustumCulled = false;
        this.scene.add(this.ring);
      }
    }
    const a = this.ring.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < n; i++) a.setXYZ(i, points[3 * i]! * lift, points[3 * i + 2]! * lift, -points[3 * i + 1]! * lift);
    a.needsUpdate = true;
    this.ring.visible = true;
    this.render();
  }

  /** Number of points of the visible brush ring (test hook), 0 when hidden. */
  ringPoints(): number { return this.ring?.visible ? (this.ring.geometry.getAttribute('position') as THREE.BufferAttribute).count : 0; }

  /** Calls `f` whenever the camera moves or the canvas is resized (label overlays follow it). Returns an unsubscribe. */
  onViewChange(f: () => void): () => void { this.listeners.add(f); return () => { this.listeners.delete(f); }; }

  /**
   * Pixel position on the canvas (CSS pixels from its top-left) of a longitude and latitude in degrees, or null when the
   * point is on the far side of the globe or outside the canvas. three.js is Y-up, so canonical (x, y, z) is (x, z, −y).
   */
  projectLonLat(lon: number, lat: number): [number, number] | null {
    const a = (lon * Math.PI) / 180, b = (lat * Math.PI) / 180;
    const v = new THREE.Vector3(Math.cos(b) * Math.cos(a), Math.sin(b), -Math.cos(b) * Math.sin(a));
    if (v.dot(this.camera.position) <= 1.0005) return null; // beyond the horizon of the unit sphere
    const p = v.clone().project(this.camera), w = this.canvas.clientWidth || 640, h = this.canvas.clientHeight || 480;
    const x = ((p.x + 1) / 2) * w, y = ((1 - p.y) / 2) * h;
    return x < 0 || x > w || y < 0 || y > h ? null : [x, y];
  }

  /** Pixels per radian of arc at the centre of the disc facing the camera (for scale-dependent detail such as rivers). */
  pixelsPerRadian(): number {
    const h = this.canvas.clientHeight || 480, d = this.camera.position.length();
    return h / 2 / Math.tan((this.camera.fov * Math.PI) / 360) / Math.max(0.05, d - 1);
  }

  /** Turns the orbit controls off while an editing tool is active (a drag then paints instead of rotating). */
  setControlsEnabled(on: boolean): void { this.controls.enabled = on; }

  /**
   * Canonical unit vector under a pointer position (client coordinates), or null where the ray misses the globe.
   * three.js is Y-up: (x, y, z) in the canonical frame is (x, z, −y) here, so the inverse is (X, −Z, Y).
   */
  pick(clientX: number, clientY: number): [number, number, number] | null {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -(((clientY - r.top) / r.height) * 2 - 1));
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = ray.ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(), 1), new THREE.Vector3());
    return hit ? [hit.x, -hit.z, hit.y] : null;
  }

  /** Fraction of canvas pixels that differ from the clear colour (test hook: a rendered globe is not blank). */
  litFraction(): number {
    const gl = this.renderer.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    this.renderer.render(this.scene, this.camera);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let lit = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i]! > 40 || px[i + 1]! > 40 || px[i + 2]! > 40) lit++;
    return lit / (w * h);
  }

  /** Hash-able snapshot of the canvas for tests: sum of all channel values. */
  pixelSum(): number {
    const gl = this.renderer.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    this.renderer.render(this.scene, this.camera);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let s = 0;
    for (let i = 0; i < px.length; i++) s += px[i]!;
    return s;
  }
}
