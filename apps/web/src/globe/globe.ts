// Three.js globe (ARCHITECTURE §3.7, §6.3: WebGL2 is the baseline renderer). Original shell code; the camera and layer
// ideas follow orogen's scene.js and planet-mesh.js, but the geometry is built from the canonical mesh.
//
// Geometry: the Delaunay triangulation over the cell centres, with one vertex colour per cell (Gouraud shading), so a layer
// switch rewrites only the colour buffer. 3 floats of position and 3 of colour per cell, 3 indices per triangle: about
// 100 B per cell, which is 260 MB at 2.56M cells.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { MeshData } from '@mapmaker/engine';
import { orderTriangles, pictureAgrees } from './triangle-order';

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
    this.pos = pos;
    this.color = new Float32Array(3 * n).fill(0.2);
    this.rawIndex = new Uint32Array(m.triangles.buffer, m.triangles.byteOffset, m.triangles.length);
    this.fastIndex = undefined;
    this.show('former');
    if (!this.forceFormer) this.verifyFastPath(m);
    this.render();
  }

  /** Which index buffer and faces draw the globe: `fast` (front faces, triangles by lowest vertex) or the `former` way (both faces, the mesh's order). */
  drawPath: 'fast' | 'former' = 'former';
  private pos: Float32Array | undefined;
  private fastIndex: Uint32Array | undefined;
  private rawIndex: Uint32Array | undefined;
  private forceFormer = false;

  /** Replaces the drawn mesh by one with the chosen path's index buffer and faces (its GPU buffers are freed with the old one). */
  private show(path: 'fast' | 'former'): void {
    const idx = path === 'fast' ? this.fastIndex : this.rawIndex;
    if (!idx || !this.pos || !this.color) return;
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.color, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: path === 'fast' ? THREE.FrontSide : THREE.DoubleSide }));
    this.scene.add(this.mesh);
    this.drawPath = path;
  }

  /**
   * Test hook: draws the world the former way (both faces, the mesh's own triangle order) or the faster way where this GPU and
   * browser draw it identically (`drawPath` says which is in use). The colours are kept.
   */
  setFormerDraw(former: boolean): void {
    this.forceFormer = former;
    if (former) this.show('former');
    else if (this.fastIndex) this.show('fast');
    this.render();
  }

  /**
   * The faster way to draw (performance study, "After the first fixes"): `FrontSide` culling and the triangles ordered by lowest
   * vertex, which measured 13% and 16% less GPU time. Whether the picture stays the same depends on the rasterizer: the Metal
   * GPU of Chromium and Electron draws it pixel for pixel as before; software GL (SwiftShader) differs along the limb, where
   * far-side triangles lie at the depth of the front ones, and Firefox differs where triangles share an edge. So the faster way is
   * used only after it has drawn the mesh in random colours from several viewpoints and every pixel agreed with the former way
   * on this machine; otherwise the former way stays.
   */
  private verifyFastPath(m: MeshData): void {
    const ordered = orderTriangles(this.pos!, m.triangles);
    if (ordered.flipped > 0) return; // culling needs every triangle wound the same way
    const gl = this.renderer.getContext(), color = this.color!, saved = color.slice();
    // Random colours per cell (a fixed integer hash, not Math.random): any pixel won by the wrong triangle then shows.
    for (let i = 0; i < color.length; i++) { const x = Math.imul(i + 1, 0x9e3779b1) ^ (Math.imul(i >>> 3, 0x85ebca6b) >>> 7); color[i] = ((x >>> 8) & 0xff) / 255; }
    this.show('former');
    const cam = new THREE.PerspectiveCamera(this.camera.fov, this.camera.aspect, this.camera.near, this.camera.far);
    const poses: [number, number, number][] = [[0, 0.6, 3.2], [2.1, -0.9, 7.5], [-0.5, 1.4, 1.5], [1.1, 0.2, -2.3], [0.2, -0.3, 8]];
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const grab = (): Uint8Array[] => poses.map((p) => {
      cam.position.set(...p);
      cam.lookAt(0, 0, 0);
      cam.updateMatrixWorld();
      this.renderer.render(this.scene, cam);
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return px;
    });
    let same = true;
    try {
      const before = grab();
      this.fastIndex = ordered.indices;
      this.show('fast');
      const after = grab();
      for (let k = 0; k < poses.length && same; k++) {
        const dist = Math.hypot(...poses[k]!), disc = (h / 2) / Math.sqrt(dist * dist - 1) / Math.tan((this.camera.fov * Math.PI) / 360);
        same = pictureAgrees(before[k]!, after[k]!, w, h, disc);
      }
    } finally {
      if (!same) { this.fastIndex = undefined; this.show('former'); }
      color.set(saved);
      (this.mesh!.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  get regions(): number { return this.color ? this.color.length / 3 : 0; }

  /** The colour buffer to fill, then call `colorsChanged()`. */
  get colors(): Float32Array {
    if (!this.color) throw new Error('no mesh');
    return this.color;
  }

  /** Adopts a colour array (3 floats per cell, made elsewhere and transferred here) as the vertex colours: no copy, one upload. */
  setColors(c: Float32Array): void {
    if (!this.mesh) return;
    if (c.length !== this.color?.length) throw new Error(`colour array of ${c.length / 3} cells for a mesh of ${this.regions}`);
    this.color = c;
    const attr = this.mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
    attr.array = c; // same attribute and GL buffer: one upload of the new array, nothing to free
    attr.needsUpdate = true;
    this.render();
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
    this.pos = this.fastIndex = this.rawIndex = undefined;
    this.drawPath = 'former';
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

  /**
   * Compiles the brush ring's shader program ahead of its first drawing (the first hover used to stall the frame for 60 to 75 ms).
   * The ring stays hidden; three.js compiles only visible objects, so it is shown for the call.
   */
  warmRing(): void {
    if (this.ring?.userData['warm']) return;
    if (!this.ring) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
      this.ring = new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: 0xffffff }));
      this.ring.frustumCulled = false;
      this.scene.add(this.ring);
    }
    this.ring.visible = true;
    this.renderer.compile(this.scene, this.camera);
    this.ring.visible = false;
    this.ring.userData['warm'] = true;
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

  /**
   * `projectLonLat` for batches (the label planner projects every point of every river and range): the camera matrices and the
   * canvas size are read once, and no Vector3 or other object is made per call. The arithmetic is three.js's own
   * (`Vector3.applyMatrix4` twice), operation for operation, so the pixel positions are bit-identical (tested).
   * Writes the pixel position to `out[0..1]` and returns whether the point is visible.
   */
  projectSampler(): (lon: number, lat: number, out: Float64Array) => boolean {
    const w = this.canvas.clientWidth || 640, h = this.canvas.clientHeight || 480;
    this.camera.updateMatrixWorld();
    const m = this.camera.matrixWorldInverse.elements, q = this.camera.projectionMatrix.elements, c = this.camera.position;
    const cx = c.x, cy = c.y, cz = c.z;
    return (lon, lat, out) => {
      const a = (lon * Math.PI) / 180, b = (lat * Math.PI) / 180;
      const vx = Math.cos(b) * Math.cos(a), vy = Math.sin(b), vz = -Math.cos(b) * Math.sin(a);
      if (vx * cx + vy * cy + vz * cz <= 1.0005) return false; // beyond the horizon of the unit sphere
      const w1 = 1 / (m[3]! * vx + m[7]! * vy + m[11]! * vz + m[15]!);
      const x1 = (m[0]! * vx + m[4]! * vy + m[8]! * vz + m[12]!) * w1, y1 = (m[1]! * vx + m[5]! * vy + m[9]! * vz + m[13]!) * w1, z1 = (m[2]! * vx + m[6]! * vy + m[10]! * vz + m[14]!) * w1;
      const w2 = 1 / (q[3]! * x1 + q[7]! * y1 + q[11]! * z1 + q[15]!);
      const px = (q[0]! * x1 + q[4]! * y1 + q[8]! * z1 + q[12]!) * w2, py = (q[1]! * x1 + q[5]! * y1 + q[9]! * z1 + q[13]!) * w2;
      const x = ((px + 1) / 2) * w, y = ((1 - py) / 2) * h;
      if (x < 0 || x > w || y < 0 || y > h) return false;
      out[0] = x;
      out[1] = y;
      return true;
    };
  }

  /** Test hook: on a grid of points, how many give a different result (any bit) from `projectSampler` and from `projectLonLat`. */
  projectionDiffs(): { points: number; differing: number; visible: number } {
    const f = this.projectSampler(), out = new Float64Array(2);
    let points = 0, differing = 0, visible = 0;
    for (let lat = -90; lat <= 90; lat += 3.7) for (let lon = -180; lon <= 180; lon += 4.3) {
      const a = this.projectLonLat(lon, lat), ok = f(lon, lat, out);
      points++;
      if (a) visible++;
      if (!!a !== ok || (a && ok && (!Object.is(a[0], out[0]) || !Object.is(a[1], out[1])))) differing++;
    }
    return { points, differing, visible };
  }

  /**
   * Longitude and latitude (degrees) of the globe under a canvas pixel (CSS pixels from its top-left), or null where the ray
   * misses it. The inverse of `projectLonLat`; analytic (no allocation), as the label planner calls it for every cell of a grid.
   */
  lonLatAt(px: number, py: number): [number, number] | null {
    const out = new Float64Array(2);
    return this.lonLatSampler()(px, py, out) ? [out[0]!, out[1]!] : null;
  }

  /**
   * `lonLatAt` for batches: the camera matrix, position and canvas size are read once, here, and the returned function writes
   * longitude and latitude (degrees) to `out[0..1]` and returns whether the pixel is on the globe, with no allocation and no
   * matrix update per call. The arithmetic is that of the former per-call version, operation for operation (bit-identical).
   * It describes the camera as it is now: a plan built with it is a function of that snapshot.
   */
  lonLatSampler(): (px: number, py: number, out: Float64Array) => boolean {
    const w = this.canvas.clientWidth || 640, h = this.canvas.clientHeight || 480, t = Math.tan((this.camera.fov * Math.PI) / 360), aspect = w / h;
    this.camera.updateMatrixWorld();
    const e = this.camera.matrixWorld.elements, c = this.camera.position;
    const e0 = e[0]!, e1 = e[1]!, e2 = e[2]!, e4 = e[4]!, e5 = e[5]!, e6 = e[6]!, e8 = e[8]!, e9 = e[9]!, e10 = e[10]!;
    const cx = c.x, cy = c.y, cz = c.z, cc = cx * cx + cy * cy + cz * cz - 1;
    return (px, py, out) => {
      const dx = ((px / w) * 2 - 1) * t * aspect, dy = (1 - (py / h) * 2) * t, dz = -1;
      let X = e0 * dx + e4 * dy + e8 * dz, Y = e1 * dx + e5 * dy + e9 * dz, Z = e2 * dx + e6 * dy + e10 * dz;
      const n = Math.hypot(X, Y, Z);
      X /= n; Y /= n; Z /= n;
      const b = cx * X + cy * Y + cz * Z, disc = b * b - cc;
      if (disc < 0) return false;
      const s = -b - Math.sqrt(disc);
      if (s < 0) return false;
      const hx = cx + s * X, hy = cy + s * Y, hz = cz + s * Z; // three.js frame; canonical (x, y, z) is (X, −Z, Y)
      out[0] = (Math.atan2(-hz, hx) * 180) / Math.PI;
      out[1] = (Math.asin(Math.max(-1, Math.min(1, hy))) * 180) / Math.PI;
      return true;
    };
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
