// Phase 4b M2 (design note 14 §3.10): the TypeScript ports of the vendored orogen modules, exported under exactly the
// names and shapes of ../vendor.ts. Original shell code. The port-parity test swaps ../vendor for this module and
// re-runs the 69-array stock-orogen parity check: under dmath 'native' the ports are bit-identical to the vendored
// JavaScript. Unlike the vendored files, the ports call dmath, so they may also run in fdlibm (non-parity) stages.
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as sphereMesh from './sphere-mesh';
import * as rng from './rng';
import * as noise from './simplex-noise';
import * as coarse from './coarse-plates';
import * as plates from './plates';
import * as physics from './plate-physics';
import * as superPlates from './super-plates';
import * as elevation from './elevation';
import * as post from './terrain-post';
import * as wind from './wind';
import * as ocean from './ocean';
import * as precip from './precipitation';
import * as temp from './temperature';
import * as koppen from './koppen';
import * as colorMap from './color-map';
import * as config from '../../vendor/js/terrain-config.js';

type Fn = (...a: any[]) => any;
const fn = (f: unknown): Fn => f as Fn;

export const makeRng = fn(rng.makeRng);
export const SimplexNoise = noise.SimplexNoise as unknown as new (seed?: number) => any;
export const VendorSphereMesh = sphereMesh.SphereMesh as unknown as new (triangles: Int32Array, halfedges: Int32Array, numRegions: number) => any;
export const buildSphere = fn(sphereMesh.buildSphere);
export const computeNeighborDist = fn(sphereMesh.computeNeighborDist);
export const generateTriangleCenters = fn(sphereMesh.generateTriangleCenters);
export const generateCoarsePlates = fn(coarse.generateCoarsePlates);
export const projectCoarsePlates = fn(coarse.projectCoarsePlates);
export const smoothAndReconnectPlates = fn(plates.smoothAndReconnectPlates);
export const applyPlatePhysics = fn(physics.applyPlatePhysics);
export const expandPlatePhysicsDebug = fn(physics.expandPlatePhysicsDebug);
export const buildSuperPlates = fn(superPlates.buildSuperPlates);
export const assignElevation = fn(elevation.assignElevation);
export const warpTerrain = fn(post.warpTerrain);
export const smoothElevation = fn(post.smoothElevation);
export const erodeComposite = fn(post.erodeComposite);
export const sharpenRidges = fn(post.sharpenRidges);
export const applySoilCreep = fn(post.applySoilCreep);
export const applyDetailNoise = fn(post.applyDetailNoise);
export const computeWind = fn(wind.computeWind);
export const computeOceanCurrents = fn(ocean.computeOceanCurrents);
export const computePrecipitation = fn(precip.computePrecipitation);
export const computeTemperature = fn(temp.computeTemperature);
export const classifyKoppen = fn(koppen.classifyKoppen);
export const KOPPEN_CLASSES = koppen.KOPPEN_CLASSES as { code: string }[];
export const elevToHeightKm = fn(colorMap.elevToHeightKm);
export const biomeColor = fn(colorMap.biomeColor);
export const elevationToColor = fn(colorMap.elevationToColor);
export const SUPER_PLATE_PHYSICS_MULT = config.SUPER_PLATE_PHYSICS_MULT as number;
export const DETAIL_NOISE_DAMPEN_STRENGTH = config.DETAIL_NOISE_DAMPEN_STRENGTH as number;
