// Label placement: a port of Azgaar's Fantasy Map Generator label-spread solver (Phase 5c, decision W4).
//
// Provenance: ported from upstream/Azgaars-Fantasy-Map-Generator/src/controllers/label-spread.ts at 3d94b80 (MIT,
// Copyright (c) 2017 Azgaar), see PROVENANCE.md. What is kept: the candidate generation (rings around a point label, six slots
// around a settlement icon, offsets along a path), the collision model (overlap as the covered fraction of the smaller glyph
// run, ramped between 4% and 20%, plus the outside-the-map and displacement costs), and the solver (conflict components grown
// through the labels that could reach them, refinement passes, seeded simulated annealing, refinement again). What is changed:
//   - no DOM. Text is measured by font-metrics.ts and described to the solver as data (a `LabelRequest`); the SVG measurement
//     sandbox, the icon lookup in the page and the patches written back to the map are gone;
//   - the solver runs in screen pixels of the view (Azgaar's `viewport.scale` is the `scale` option, default 1);
//   - determinism: Math.exp/pow/cos/sin/hypot go through dmath, `**` is multiplication or dmath.pow, ties between ids compare
//     code units instead of calling localeCompare (which depends on the locale), and the random stream is core's Alea with a
//     seed string built from the seed and the sorted item ids, as upstream.
// The solver is a pure function of its inputs, so a run is keyed by the view and the style (design note 18 §3.3).
import { Alea, dmath } from '@mapmaker/core';

export interface LabelBounds { x1: number; y1: number; x2: number; y2: number }

export interface LabelPlacement { dx?: number; dy?: number; startOffset?: number }

export interface LabelPlacementCandidate {
  placement: LabelPlacement;
  bounds: LabelBounds;
  collisionBounds: LabelBounds;
  collisionShapes?: LabelBounds[];
  burgCollisionShapes?: LabelBounds[];
  inkBounds?: LabelBounds[];
  preference: number;
}

export interface LabelPlacementItem {
  id: string;
  kind?: 'burg' | 'path' | 'label';
  obstacle?: boolean;
  candidates: LabelPlacementCandidate[];
}

export interface LabelPlacementSolution {
  selected: Map<string, LabelPlacementCandidate>;
  initialOverlaps: number;
  remainingOverlaps: number;
}

/** What the solver reads and mutates while searching. */
interface SolverState {
  items: LabelPlacementItem[];
  selected: Uint16Array; // candidate index picked per item
  staticCosts: Float64Array[]; // per candidate cost that never depends on the other items
  interactions: number[][]; // items that can collide with this one under some candidate
}

/** A path a text can run along (SVG getTotalLength / getPointAtLength). */
export interface PathGeometry {
  getTotalLength(): number;
  getPointAtLength(distance: number): { x: number; y: number };
}

/** The size of a label on a path at one start offset, from the text's glyph boxes laid along the path. */
export interface Measurement {
  bounds: LabelBounds;
  inkBounds: LabelBounds[];
  textLength: number;
  pathLength: number;
  upright: boolean;
}

interface BurgLabelCandidateOptions {
  current: LabelPlacementCandidate;
  iconBounds: LabelBounds;
  gap: number;
  changePenalty?: number;
  displacementScale?: number;
}

// candidate generation
const DIRECTIONS = Array.from({ length: 12 }, (_, index) => (index * Math.PI * 2) / 12);
const POINT_STEP_MULTIPLIERS = [0.4, 0.8, 1.2, 1.8, 2.5, 3.5]; // in label heights
const POINT_PLACEMENT_CHANGE_PENALTY = 60;
const POINT_DISPLACEMENT_WEIGHT = 140;
const BASE_BURG_SCREEN_HEIGHT = 12.5;
const BASE_BURG_PLACEMENT_CHANGE_PENALTY = 120;
const BURG_ICON_GAP_SCREEN = 2;
const MINIMUM_START_OFFSET = 20;
const MAXIMUM_START_OFFSET = 80;
const PREFERRED_MINIMUM_START_OFFSET = 30;
const PREFERRED_MAXIMUM_START_OFFSET = 70;
const START_OFFSET_STEP = 5;
const PATH_PLACEMENT_CHANGE_PENALTY = 40;
const DIRECTION_SAMPLES = 16;
const MINIMUM_POINT_STEP_SCREEN = 3;

// collision model. Overlap is measured as the covered fraction of the smaller glyph run,
// ramped in so that grazing contact stays free while a real clash always has a gradient to follow
const LABEL_PADDING_SCREEN = 2;
const BURG_LABEL_PADDING_SCREEN = 4;
const IGNORED_OVERLAP_RATIO = 0.04;
const FULL_OVERLAP_RATIO = 0.2;
const OVERLAP_WEIGHT = 1_000; // cost of one fully covered glyph run
const OUTSIDE_WEIGHT = 1e9;
const INVALID_PLACEMENT_PENALTY = 5 * OVERLAP_WEIGHT;
const BURG_CONFLICT_WEIGHT = 2;
const OBSTACLE_CONFLICT_WEIGHT = 6; // hiding an icon costs the reader the settlement itself, not just its name
const PATH_CONFLICT_WEIGHT = 0.4;

// solver
const MINIMUM_SCALE = 0.25;
const REFINE_PASSES = 8;
const ANNEAL_ITERATIONS_PER_ITEM = 400;
const MINIMUM_ANNEAL_ITERATIONS = 2_000;
const MAXIMUM_ANNEAL_ITERATIONS = 20_000;
const START_TEMPERATURE = OVERLAP_WEIGHT * 0.4;
const END_TEMPERATURE = OVERLAP_WEIGHT * 0.01;
const CONFLICTED_ITEM_BIAS = 0.75;

/** The drawing area and the zoom of the view the labels are placed in (screen pixels; `scale` 1 unless the view is zoomed in user units). */
export interface LabelViewport { bounds: LabelBounds; scale: number }

const sq = (v: number): number => v * v;

/** Screen-space distances stay constant on screen, so convert them with the current zoom. */
function toMapUnits(screenValue: number, vp: LabelViewport): number {
  return screenValue / Math.max(vp.scale, MINIMUM_SCALE);
}

/** The label to place: measured by the caller (font-metrics.ts), not by the solver. */
export type LabelRequest =
  /** A label with a free position: `bounds` and `inkBounds` at its anchor (dx = dy = 0). */
  | { type: 'point'; id: string; bounds: LabelBounds; inkBounds: LabelBounds[] }
  /** A settlement name: it may not cover its icon, and takes one of six slots around it. */
  | { type: 'burg'; id: string; bounds: LabelBounds; inkBounds: LabelBounds[]; iconBounds: LabelBounds }
  /** A label on a path (river, range, route): it slides along it. `measure` lays the text out at a start offset in percent. */
  | { type: 'path'; id: string; path: PathGeometry; startOffset: number; measure: (startOffset: number) => Measurement | null };

export interface PlacedLabel { id: string; type: LabelRequest['type']; placement: LabelPlacement; candidate: LabelPlacementCandidate }

export interface LabelSpreadResult {
  labels: PlacedLabel[];
  displayedLabels: number;
  initialOverlaps: number;
  remainingOverlaps: number;
}

/**
 * Places `requests` in `viewport`, treating `obstacles` (icons, other map furniture) as fixed boxes the labels avoid.
 * Deterministic: the same requests, viewport and seed give the same placement.
 */
export function spreadLabels(requests: LabelRequest[], obstacles: LabelBounds[], viewport: LabelViewport, seed: string): LabelSpreadResult {
  if (!requests.length) return { labels: [], displayedLabels: 0, initialOverlaps: 0, remainingOverlaps: 0 };
  const items: LabelPlacementItem[] = [];
  for (const r of requests) items.push(buildPlacementItem(r, viewport));
  obstacles.forEach((b, i) => items.push({ id: `labelSpreadObstacle${i}`, obstacle: true, candidates: [{ placement: {}, bounds: b, collisionBounds: b, preference: 0 }] }));
  const ids = items.map((item) => item.id).sort();
  const solution = optimizeLabelPlacements(items, viewport.bounds, `${seed}|${ids.join('|')}`);
  const labels: PlacedLabel[] = [];
  for (const r of requests) {
    const candidate = solution.selected.get(r.id);
    if (candidate) labels.push({ id: r.id, type: r.type, placement: candidate.placement, candidate });
  }
  return { labels, displayedLabels: requests.length, initialOverlaps: solution.initialOverlaps, remainingOverlaps: solution.remainingOverlaps };
}

function buildPlacementItem(r: LabelRequest, vp: LabelViewport): LabelPlacementItem {
  if (r.type === 'path') {
    const current = r.measure(r.startOffset);
    if (!current) return { id: r.id, kind: 'path', candidates: [] };
    const currentCandidate = pathCandidate(current, r.startOffset, vp);
    return { id: r.id, kind: 'path', candidates: buildPathCandidates(r, current, currentCandidate, vp) };
  }
  const measurement: Measurement = { bounds: r.bounds, inkBounds: r.inkBounds.length ? r.inkBounds : [r.bounds], textLength: r.bounds.x2 - r.bounds.x1, pathLength: 0, upright: true };
  const currentCandidate = toCandidate(measurement, r.type === 'burg', vp);
  if (r.type === 'burg') {
    return {
      id: r.id, kind: 'burg',
      candidates: getBurgLabelCandidates({
        current: currentCandidate, iconBounds: r.iconBounds, gap: toMapUnits(BURG_ICON_GAP_SCREEN, vp),
        changePenalty: getBurgChangePenalty(currentCandidate.bounds, vp), displacementScale: vp.scale,
      }),
    };
  }
  return { id: r.id, kind: 'label', candidates: buildPointCandidates(currentCandidate, vp) };
}

/**
 * The six placements a Burg name can hold without hiding its icon: centred above or below with a
 * fixed gap, or tucked into one of the four diagonals, which clear the icon sideways instead.
 * Distances are measured from the text ink rather than its box, so the gap reads the same whatever
 * ascenders and descenders the name happens to have.
 */
export function getBurgLabelCandidates({
  current, iconBounds, gap, changePenalty = BASE_BURG_PLACEMENT_CHANGE_PENALTY, displacementScale = 1,
}: BurgLabelCandidateOptions): LabelPlacementCandidate[] {
  const currentDx = current.placement.dx || 0;
  const currentDy = current.placement.dy || 0;
  const ink = getInkEnvelope(current);
  const centered = (iconBounds.x1 + iconBounds.x2) / 2 - (ink.x1 + ink.x2) / 2;
  const iconCenterY = (iconBounds.y1 + iconBounds.y2) / 2;
  const above = iconBounds.y1 - gap - ink.y2;
  const below = iconBounds.y2 + gap - ink.y1;
  const left = iconBounds.x1 - gap - ink.x2;
  const right = iconBounds.x2 + gap - ink.x1;
  const shifts = [
    [centered, above], // top
    [centered, below], // bottom
    [left, iconCenterY - ink.y2], // top-left
    [right, iconCenterY - ink.y2], // top-right
    [left, iconCenterY - ink.y1], // bottom-left
    [right, iconCenterY - ink.y1], // bottom-right
  ];
  const candidates = shifts
    .map(([deltaX, deltaY]) => ({
      ...translateCandidate(current, deltaX!, deltaY!),
      placement: { dx: round(currentDx + deltaX!), dy: round(currentDy + deltaY!) },
      preference: changePenalty + dmath.hypot(deltaX!, deltaY!) * displacementScale,
    }))
    .sort((first, second) => first.preference - second.preference)
    .filter((candidate) => candidate.placement.dx !== current.placement.dx || candidate.placement.dy !== current.placement.dy);
  return [current, ...candidates];
}

function getBurgChangePenalty(bounds: LabelBounds, vp: LabelViewport): number {
  const screenHeight = (bounds.y2 - bounds.y1) * Math.max(vp.scale, 1);
  return BASE_BURG_PLACEMENT_CHANGE_PENALTY * sq(screenHeight / BASE_BURG_SCREEN_HEIGHT);
}

// Point labels move in rings around the current spot. Both the ring radius and its cost are
// expressed in label heights, so a tiny Burg name and a huge State name behave the same way
function buildPointCandidates(current: LabelPlacementCandidate, vp: LabelViewport): LabelPlacementCandidate[] {
  const currentDx = current.placement.dx || 0;
  const currentDy = current.placement.dy || 0;
  const step = Math.max(current.bounds.y2 - current.bounds.y1, toMapUnits(MINIMUM_POINT_STEP_SCREEN, vp));
  const candidates = [current];
  for (const multiplier of POINT_STEP_MULTIPLIERS) {
    const radius = step * multiplier;
    const preference = POINT_PLACEMENT_CHANGE_PENALTY + sq(multiplier) * POINT_DISPLACEMENT_WEIGHT;
    for (const angle of DIRECTIONS) {
      const deltaX = dmath.cos(angle) * radius;
      const deltaY = dmath.sin(angle) * radius;
      const translated = translateCandidate(current, deltaX, deltaY);
      if (getOutsideArea(translated.bounds, vp.bounds) > 0) continue;
      candidates.push({ ...translated, placement: { dx: round(currentDx + deltaX), dy: round(currentDy + deltaY) }, preference });
    }
  }
  return candidates;
}

function pathCandidate(m: Measurement, startOffset: number, vp: LabelViewport): LabelPlacementCandidate {
  return {
    placement: { startOffset: round(startOffset) },
    bounds: m.bounds,
    collisionBounds: getCollisionEnvelope(m.inkBounds, vp),
    collisionShapes: m.inkBounds.map((b) => padBounds(b, LABEL_PADDING_SCREEN, vp)),
    inkBounds: m.inkBounds,
    preference: 0,
  };
}

// Path labels can only slide along their own path, so every offset has to be measured separately
function buildPathCandidates(r: Extract<LabelRequest, { type: 'path' }>, currentMeasurement: Measurement, current: LabelPlacementCandidate, vp: LabelViewport): LabelPlacementCandidate[] {
  const currentOffset = round(r.startOffset);
  const isCurrentValid = currentMeasurement.upright && fitsLength(currentMeasurement.pathLength, currentMeasurement.textLength, currentOffset);
  const candidates: LabelPlacementCandidate[] = [
    { ...current, preference: getPathStartOffsetPreference(currentOffset) + (isCurrentValid ? 0 : INVALID_PLACEMENT_PENALTY) },
  ];
  for (const startOffset of getPathStartOffsetCandidates(currentOffset).filter((offset) => offset !== currentOffset)) {
    const m = r.measure(startOffset);
    // reject cheaply: the text must fit the path and run left to right
    if (!m || !m.upright || !fitsLength(m.pathLength, m.textLength, startOffset)) continue;
    if (getOutsideArea(m.bounds, vp.bounds) > 0) continue;
    candidates.push({
      placement: { startOffset: round(startOffset) },
      bounds: m.bounds,
      collisionBounds: getCollisionEnvelope(m.inkBounds, vp),
      collisionShapes: m.inkBounds.map((b) => padBounds(b, LABEL_PADDING_SCREEN, vp)),
      inkBounds: m.inkBounds,
      preference: PATH_PLACEMENT_CHANGE_PENALTY + getPathStartOffsetPreference(startOffset),
    });
  }
  return candidates;
}

export function getPathStartOffsetCandidates(currentOffset: number): number[] {
  const clampedCurrent = clamp(round(currentOffset), MINIMUM_START_OFFSET, MAXIMUM_START_OFFSET);
  const offsets = Array.from(
    { length: (MAXIMUM_START_OFFSET - MINIMUM_START_OFFSET) / START_OFFSET_STEP + 1 },
    (_, index) => MINIMUM_START_OFFSET + index * START_OFFSET_STEP,
  );
  return [clampedCurrent, ...offsets.filter((offset) => offset !== clampedCurrent)];
}

export function getPathStartOffsetPreference(startOffset: number): number {
  const distance =
    startOffset < PREFERRED_MINIMUM_START_OFFSET
      ? PREFERRED_MINIMUM_START_OFFSET - startOffset
      : startOffset > PREFERRED_MAXIMUM_START_OFFSET
        ? startOffset - PREFERRED_MAXIMUM_START_OFFSET
        : 0;
  return sq(distance);
}

/** Whether a text of `textLength` centred at `startOffset` percent of the path runs left to right throughout. */
export function isPathTextUpright(path: PathGeometry, textLength: number, startOffset: number): boolean {
  const pathLength = path.getTotalLength();
  if (!pathLength || !textLength) return false;
  const center = (pathLength * startOffset) / 100;
  const start = center - textLength / 2;
  const end = center + textLength / 2;
  if (start < 0 || end > pathLength) return false;

  let previous = path.getPointAtLength(start);
  for (let index = 1; index <= DIRECTION_SAMPLES; index++) {
    const point = path.getPointAtLength(start + ((end - start) * index) / DIRECTION_SAMPLES);
    const dx = point.x - previous.x;
    const distance = dmath.hypot(dx, point.y - previous.y);
    if (distance && dx / distance < -0.02) return false;
    previous = point;
  }
  return true;
}

function toCandidate(measurement: Measurement, burg: boolean, vp: LabelViewport): LabelPlacementCandidate {
  const collisionShapes = measurement.inkBounds.map((b) => padBounds(b, LABEL_PADDING_SCREEN, vp));
  const burgCollisionShapes = burg ? measurement.inkBounds.map((b) => padBounds(b, BURG_LABEL_PADDING_SCREEN, vp)) : undefined;
  return {
    placement: { dx: 0, dy: 0 },
    bounds: measurement.bounds,
    collisionBounds: (burgCollisionShapes ?? collisionShapes).reduce(unionBounds),
    collisionShapes,
    ...(burgCollisionShapes ? { burgCollisionShapes } : {}),
    inkBounds: measurement.inkBounds,
    preference: 0,
  };
}

function unionBounds(first: LabelBounds, second: LabelBounds): LabelBounds {
  return { x1: Math.min(first.x1, second.x1), y1: Math.min(first.y1, second.y1), x2: Math.max(first.x2, second.x2), y2: Math.max(first.y2, second.y2) };
}

function padBounds(bounds: LabelBounds, screenPadding: number, vp: LabelViewport): LabelBounds {
  const padding = toMapUnits(screenPadding, vp);
  return { x1: bounds.x1 - padding, y1: bounds.y1 - padding, x2: bounds.x2 + padding, y2: bounds.y2 + padding };
}

function translateBounds(bounds: LabelBounds, dx: number, dy: number): LabelBounds {
  return { x1: bounds.x1 + dx, y1: bounds.y1 + dy, x2: bounds.x2 + dx, y2: bounds.y2 + dy };
}

function translateBoundsList(bounds: LabelBounds[] | undefined, dx: number, dy: number): LabelBounds[] | undefined {
  return bounds?.map((bound) => translateBounds(bound, dx, dy));
}

function translateCandidate(candidate: LabelPlacementCandidate, dx: number, dy: number): Omit<LabelPlacementCandidate, 'placement' | 'preference'> {
  const collisionShapes = translateBoundsList(candidate.collisionShapes, dx, dy);
  const burgCollisionShapes = translateBoundsList(candidate.burgCollisionShapes, dx, dy);
  const inkBounds = translateBoundsList(candidate.inkBounds, dx, dy);
  return {
    bounds: translateBounds(candidate.bounds, dx, dy),
    collisionBounds: translateBounds(candidate.collisionBounds, dx, dy),
    ...(collisionShapes ? { collisionShapes } : {}),
    ...(burgCollisionShapes ? { burgCollisionShapes } : {}),
    ...(inkBounds ? { inkBounds } : {}),
  };
}

function getCollisionEnvelope(inkBounds: LabelBounds[], vp: LabelViewport): LabelBounds {
  return inkBounds.map((bounds) => padBounds(bounds, LABEL_PADDING_SCREEN, vp)).reduce(unionBounds);
}

/** What the reader actually sees, falling back to the text box when the ink was not measured. */
function getInkEnvelope(candidate: LabelPlacementCandidate): LabelBounds {
  return candidate.inkBounds?.length ? candidate.inkBounds.reduce(unionBounds) : candidate.bounds;
}

function getOutsideArea(bounds: LabelBounds, map: LabelBounds): number {
  const width = Math.max(bounds.x2 - bounds.x1, 0);
  const height = Math.max(bounds.y2 - bounds.y1, 0);
  const insideWidth = Math.max(Math.min(bounds.x2, map.x2) - Math.max(bounds.x1, map.x1), 0);
  const insideHeight = Math.max(Math.min(bounds.y2, map.y2) - Math.max(bounds.y1, map.y1), 0);
  return width * height - insideWidth * insideHeight;
}

function fitsLength(pathLength: number, textLength: number, startOffset: number): boolean {
  if (!pathLength || !textLength) return false;
  const center = (pathLength * startOffset) / 100;
  return textLength / 2 <= Math.min(center, pathLength - center);
}

export function optimizeLabelPlacements(items: LabelPlacementItem[], bounds: LabelBounds, randomSeed: string): LabelPlacementSolution {
  const validItems = items.filter((item) => item.candidates.length);
  const state: SolverState = {
    items: validItems,
    selected: new Uint16Array(validItems.length),
    staticCosts: validItems.map((item) => Float64Array.from(item.candidates, (candidate) => getOutsideArea(candidate.bounds, bounds) * OUTSIDE_WEIGHT + candidate.preference)),
    interactions: getPotentialInteractions(validItems),
  };

  const initialPairs = getOverlapPairs(state);
  const random = new Alea('label-spread', randomSeed);
  const next = () => random.next();
  for (const component of getConflictComponents(state, initialPairs)) {
    refine(state, component);
    anneal(state, component, next);
    refine(state, component); // the annealer leaves the best state it saw, not a locally optimal one
  }

  const selected = new Map<string, LabelPlacementCandidate>();
  validItems.forEach((item, index) => void selected.set(item.id, item.candidates[state.selected[index]!]!));
  return { selected, initialOverlaps: initialPairs.length, remainingOverlaps: getOverlapPairs(state).length };
}

/**
 * Labels that already collide seed a component, which then grows through every label they could
 * possibly reach. Direct neighbours join too, so a label with no collision of its own can still
 * step aside and let a chain of crowded labels unwind.
 */
function getConflictComponents(state: SolverState, pairs: [number, number][]): number[][] {
  const itemCount = state.items.length;
  const seeds = new Uint8Array(itemCount);
  for (const [first, second] of pairs) { seeds[first] = 1; seeds[second] = 1; }

  const visited = new Uint8Array(itemCount);
  const components: number[][] = [];
  for (let index = 0; index < itemCount; index++) {
    if (!seeds[index] || visited[index]) continue;
    const component: number[] = [];
    const queue = [index];
    visited[index] = 1;
    while (queue.length) {
      const current = queue.pop()!;
      component.push(current);
      if (!seeds[current]) continue; // neighbours join the component but do not drag in their own neighbours
      for (const linked of state.interactions[current]!) {
        if (visited[linked]) continue;
        visited[linked] = 1;
        queue.push(linked);
      }
    }
    components.push(sortByMobility(component, state.items));
  }
  return components;
}

/** Labels with the cheapest alternatives move first, so the crowded ones still find a free slot. */
function sortByMobility(component: number[], items: LabelPlacementItem[]): number[] {
  return component.sort((first, second) => {
    const difference = getMinimumMovementPreference(items[first]!) - getMinimumMovementPreference(items[second]!);
    if (difference) return difference;
    const a = items[first]!.id, b = items[second]!.id;
    return a < b ? -1 : a > b ? 1 : 0; // code-unit order, not localeCompare (locale-dependent)
  });
}

function getMinimumMovementPreference(item: LabelPlacementItem): number {
  if (item.candidates.length < 2) return Number.POSITIVE_INFINITY;
  return Math.min(...item.candidates.slice(1).map((candidate) => candidate.preference));
}

/** Repeatedly gives every label its cheapest candidate until nobody wants to move any more. */
function refine(state: SolverState, component: number[]): void {
  for (let pass = 0; pass < REFINE_PASSES; pass++) {
    let changed = false;
    for (const itemIndex of component) {
      const candidates = state.items[itemIndex]!.candidates;
      if (candidates.length < 2) continue;

      let bestIndex = state.selected[itemIndex]!;
      let bestCost = getCandidateCost(state, itemIndex, bestIndex);
      for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex++) {
        if (candidateIndex === bestIndex) continue;
        const cost = getCandidateCost(state, itemIndex, candidateIndex);
        if (cost >= bestCost) continue;
        bestIndex = candidateIndex;
        bestCost = cost;
      }
      if (bestIndex === state.selected[itemIndex]) continue;
      state.selected[itemIndex] = bestIndex;
      changed = true;
    }
    if (!changed) return;
  }
}

function anneal(state: SolverState, component: number[], random: () => number): void {
  const movable = component.filter((index) => state.items[index]!.candidates.length > 1);
  if (!movable.length) return;

  let conflicted = getConflictedItems(state, movable);
  if (!conflicted.length) return; // refine already cleared this component

  const iterations = clamp(movable.length * ANNEAL_ITERATIONS_PER_ITEM, MINIMUM_ANNEAL_ITERATIONS, MAXIMUM_ANNEAL_ITERATIONS);
  const cooling = dmath.pow(END_TEMPERATURE / START_TEMPERATURE, 1 / iterations);
  const bestSelection = Uint16Array.from(component, (index) => state.selected[index]!);
  let currentCost = getComponentCost(state, component);
  let bestCost = currentCost;
  let temperature = START_TEMPERATURE;

  for (let iteration = 0; iteration < iterations; iteration++, temperature *= cooling) {
    if (iteration % movable.length === 0) conflicted = getConflictedItems(state, movable);
    const pool = conflicted.length && random() < CONFLICTED_ITEM_BIAS ? conflicted : movable;
    const itemIndex = pool[Math.floor(random() * pool.length)]!;
    const previousIndex = state.selected[itemIndex]!;
    const nextIndex = Math.floor(random() * state.items[itemIndex]!.candidates.length);
    if (nextIndex === previousIndex) continue;

    const previousCost = getCandidateCost(state, itemIndex, previousIndex);
    state.selected[itemIndex] = nextIndex;
    const delta = getCandidateCost(state, itemIndex, nextIndex) - previousCost;
    if (delta > 0 && random() >= dmath.exp(-delta / temperature)) {
      state.selected[itemIndex] = previousIndex;
      continue;
    }

    currentCost += delta;
    if (currentCost >= bestCost) continue;
    bestCost = currentCost;
    component.forEach((index, position) => { bestSelection[position] = state.selected[index]!; });
  }
  component.forEach((index, position) => { state.selected[index] = bestSelection[position]!; });
}

/** Proposals are worth far more when aimed at a label that is actually covered by something. */
function getConflictedItems(state: SolverState, movable: number[]): number[] {
  return movable.filter((itemIndex) => {
    for (const otherIndex of state.interactions[itemIndex]!) if (getSelectedPairOverlap(state, itemIndex, otherIndex) > 0) return true;
    return false;
  });
}

function getCandidateCost(state: SolverState, itemIndex: number, candidateIndex: number): number {
  const item = state.items[itemIndex]!;
  const candidate = item.candidates[candidateIndex]!;
  let cost = state.staticCosts[itemIndex]![candidateIndex]!;
  for (const otherIndex of state.interactions[itemIndex]!) {
    const other = state.items[otherIndex]!;
    cost += getPairOverlap(item, candidate, other, other.candidates[state.selected[otherIndex]!]!) * OVERLAP_WEIGHT;
  }
  return cost;
}

/** Total cost of the component, counting every interacting pair exactly once. */
function getComponentCost(state: SolverState, component: number[]): number {
  const inside = new Set(component);
  let cost = 0;
  for (const itemIndex of component) {
    cost += state.staticCosts[itemIndex]![state.selected[itemIndex]!]!;
    for (const otherIndex of state.interactions[itemIndex]!) {
      if (inside.has(otherIndex) && otherIndex < itemIndex) continue;
      cost += getSelectedPairOverlap(state, itemIndex, otherIndex) * OVERLAP_WEIGHT;
    }
  }
  return cost;
}

function getSelectedPairOverlap(state: SolverState, firstIndex: number, secondIndex: number): number {
  const first = state.items[firstIndex]!;
  const second = state.items[secondIndex]!;
  return getPairOverlap(first, first.candidates[state.selected[firstIndex]!]!, second, second.candidates[state.selected[secondIndex]!]!);
}

/** Items that can never touch, whatever candidate they pick, are dropped from the cost loop for good. */
function getPotentialInteractions(items: LabelPlacementItem[]): number[][] {
  const interactions = Array.from({ length: items.length }, () => [] as number[]);
  const ordered = items
    .map((item, index) => ({ index, bounds: item.candidates.map((candidate) => candidate.collisionBounds).reduce(unionBounds) }))
    .sort((first, second) => first.bounds.x1 - second.bounds.x1 || first.index - second.index);

  for (let left = 0; left < ordered.length; left++) {
    const first = ordered[left]!;
    for (let right = left + 1; right < ordered.length; right++) {
      const second = ordered[right]!;
      if (second.bounds.x1 >= first.bounds.x2) break;
      if (second.bounds.y1 >= first.bounds.y2 || second.bounds.y2 <= first.bounds.y1) continue;
      interactions[first.index]!.push(second.index);
      interactions[second.index]!.push(first.index);
    }
  }
  return interactions;
}

function getOverlapPairs(state: SolverState): [number, number][] {
  const ordered = state.items
    .map((item, index) => ({ index, bounds: item.candidates[state.selected[index]!]!.collisionBounds }))
    .sort((first, second) => first.bounds.x1 - second.bounds.x1 || first.index - second.index);
  const pairs: [number, number][] = [];

  for (let left = 0; left < ordered.length; left++) {
    const first = ordered[left]!;
    for (let right = left + 1; right < ordered.length; right++) {
      const second = ordered[right]!;
      if (second.bounds.x1 >= first.bounds.x2) break;
      if (getSelectedPairOverlap(state, first.index, second.index) > 0) pairs.push([first.index, second.index]);
    }
  }
  return pairs;
}

function getPairOverlap(firstItem: LabelPlacementItem, first: LabelPlacementCandidate, secondItem: LabelPlacementItem, second: LabelPlacementCandidate): number {
  if (firstItem.obstacle && secondItem.obstacle) return 0;
  if (!boundsIntersect(first.collisionBounds, second.collisionBounds)) return 0;

  if (firstItem.obstacle || secondItem.obstacle) {
    const [obstacle, label] = firstItem.obstacle ? [first, second] : [second, first];
    return getShapesOverlap([obstacle.bounds], label.inkBounds ?? [label.bounds]) * OBSTACLE_CONFLICT_WEIGHT;
  }

  // Burg names sit in the densest part of the map, so they get both a wider gap and a heavier cost
  const isBurgToBurg = firstItem.kind === 'burg' && secondItem.kind === 'burg';
  const overlap = getShapesOverlap(getCollisionShapes(first, isBurgToBurg), getCollisionShapes(second, isBurgToBurg));
  return overlap * getConflictWeight(firstItem, secondItem);
}

function getCollisionShapes(candidate: LabelPlacementCandidate, useBurgPadding: boolean): LabelBounds[] {
  const padded = useBurgPadding ? candidate.burgCollisionShapes : undefined;
  return padded ?? candidate.collisionShapes ?? [candidate.collisionBounds];
}

function getConflictWeight(first: LabelPlacementItem, second: LabelPlacementItem): number {
  if (first.kind === 'burg' || second.kind === 'burg') return BURG_CONFLICT_WEIGHT;
  if (first.kind === 'path' || second.kind === 'path') return PATH_CONFLICT_WEIGHT;
  return 1;
}

function getShapesOverlap(first: LabelBounds[], second: LabelBounds[]): number {
  let overlap = 0;
  for (const firstBounds of first) for (const secondBounds of second) overlap += getOverlapScore(firstBounds, secondBounds);
  return overlap;
}

/**
 * Covered fraction of the smaller shape, faded in between IGNORED and FULL overlap ratios.
 * The ramp keeps hairline contact free while leaving a continuous gradient for the solver to
 * follow; a hard threshold made every partial collision look perfectly clean.
 */
function getOverlapScore(first: LabelBounds, second: LabelBounds): number {
  const width = Math.min(first.x2, second.x2) - Math.max(first.x1, second.x1);
  if (width <= 0) return 0;
  const height = Math.min(first.y2, second.y2) - Math.max(first.y1, second.y1);
  if (height <= 0) return 0;

  const smallerArea = Math.min(getArea(first), getArea(second));
  if (!smallerArea) return 0;
  const ratio = (width * height) / smallerArea;
  return ratio * clamp((ratio - IGNORED_OVERLAP_RATIO) / (FULL_OVERLAP_RATIO - IGNORED_OVERLAP_RATIO), 0, 1);
}

function getArea(bounds: LabelBounds): number {
  return Math.max(bounds.x2 - bounds.x1, 0) * Math.max(bounds.y2 - bounds.y1, 0);
}

function boundsIntersect(first: LabelBounds, second: LabelBounds): boolean {
  return first.x1 < second.x2 && first.x2 > second.x1 && first.y1 < second.y2 && first.y2 > second.y1;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
