// Typed entry to the verbatim orogen modules in ../vendor/js (ARCHITECTURE §2, §3.6). Original shell code.
// The vendored files call Math.* directly, so everything imported from here runs only inside dmath.withMode('native')
// in stages flagged `parity` (CLAUDE.md, vendor exception). The vendored JS is not type-checked, and TypeScript infers
// partial shapes from it, so its functions are re-exported with loose signatures here, in one place.
/* eslint-disable @typescript-eslint/no-explicit-any */
import Delaunator from 'delaunator';
import * as sphereMesh from '../vendor/js/sphere-mesh.js';
import * as rng from '../vendor/js/rng.js';
import * as noise from '../vendor/js/simplex-noise.js';
import * as coarse from '../vendor/js/coarse-plates.js';
import * as plates from '../vendor/js/plates.js';
import * as physics from '../vendor/js/plate-physics.js';
import * as superPlates from '../vendor/js/super-plates.js';
import * as elevation from '../vendor/js/elevation.js';
import * as post from '../vendor/js/terrain-post.js';
import * as wind from '../vendor/js/wind.js';
import * as ocean from '../vendor/js/ocean.js';
import * as precip from '../vendor/js/precipitation.js';
import * as temp from '../vendor/js/temperature.js';
import * as koppen from '../vendor/js/koppen.js';
import * as colorMap from '../vendor/js/color-map.js';
import * as config from '../vendor/js/terrain-config.js';

sphereMesh.setDelaunator(Delaunator);

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
