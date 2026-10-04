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
  private frame = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setClearColor(0x05060d);
    this.camera.position.set(0, 0.6, 3.2);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enablePan = false;
    this.controls.minDistance = 1.15;
    this.controls.maxDistance = 8;
    this.controls.addEventListener('change', () => this.render());
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

  render(): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.renderer.render(this.scene, this.camera));
  }

  private resize(): void {
    const w = this.canvas.clientWidth || 640, h = this.canvas.clientHeight || 480;
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.render();
  }

  private disposeMesh(): void {
    if (!this.mesh) return;
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh = undefined;
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
