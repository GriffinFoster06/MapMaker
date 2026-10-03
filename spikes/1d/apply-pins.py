#!/usr/bin/env python3
"""Spike 1d: minimal patch that lets orogen's coarse-plate stage honour pins.
Applies to spikes/_work/orogen-1d (a copy of orogen @ cc2662b). Never touches upstream/.
Pins (passed as data.pins to the worker 'generate' command):
  plateAt(x,y,z) -> label >= 0 for a pinned plate, -1 free      (orogen frame)
  landAt(x,y,z)  -> 1 land, 0 ocean, -1 free
  plateVec       -> { label: {pole:[x,y,z], omega} }   optional pinned Euler poles
  growPinned     -> pinned plates may grow beyond their pinned cells (default true)
Every edit is tagged [1d] so the diff reads as the change list for the report."""
import pathlib, sys
JS = pathlib.Path(__file__).resolve().parents[1] / '_work' / 'orogen-1d' / 'js'

def edit(fname, old, new, count=1):
    p = JS / fname
    s = p.read_text()
    if s.count(old) != count:
        sys.exit(f'{fname}: expected {count} match(es), found {s.count(old)} for:\n{old}')
    p.write_text(s.replace(old, new))

# ── plates.js: generatePlates ───────────────────────────────────────────────
edit('plates.js', 'export function generatePlates(mesh, r_xyz, numPlates, seed) {',
     'export function generatePlates(mesh, r_xyz, numPlates, seed, pins = null) {')
edit('plates.js', '''    const firstSeed = randInt(numRegions);
    plateSeeds.add(firstSeed);
    isSeed[firstSeed] = 1;
    const fsx = r_xyz[3*firstSeed], fsy = r_xyz[3*firstSeed+1], fsz = r_xyz[3*firstSeed+2];
    for (let r = 0; r < numRegions; r++) {
        minDistToSeed[r] = 1 - (r_xyz[3*r]*fsx + r_xyz[3*r+1]*fsy + r_xyz[3*r+2]*fsz);
    }
    minDistToSeed[firstSeed] = 0;
''', '''    // [1d] Pinned plates: pre-assign pinned cells; a pinned plate's id is its first pinned cell.
    const locked = new Uint8Array(numRegions);
    const pinIds = new Map();
    if (pins && pins.plateAt) {
        for (let r = 0; r < numRegions; r++) {
            const L = pins.plateAt(r_xyz[3*r], r_xyz[3*r+1], r_xyz[3*r+2]);
            if (L < 0) continue;
            if (!pinIds.has(L)) pinIds.set(L, r);
            r_plate[r] = pinIds.get(L); locked[r] = 1;
        }
    }
    if (pinIds.size === 0) {
    const firstSeed = randInt(numRegions);
    plateSeeds.add(firstSeed);
    isSeed[firstSeed] = 1;
    const fsx = r_xyz[3*firstSeed], fsy = r_xyz[3*firstSeed+1], fsz = r_xyz[3*firstSeed+2];
    for (let r = 0; r < numRegions; r++) {
        minDistToSeed[r] = 1 - (r_xyz[3*r]*fsx + r_xyz[3*r+1]*fsy + r_xyz[3*r+2]*fsz);
    }
    minDistToSeed[firstSeed] = 0;
    } else {
        // [1d] Pinned plates count toward numPlates; free seeds are placed farthest from ALL pinned cells.
        for (const id of pinIds.values()) plateSeeds.add(id);
        const lockedList = [];
        for (let r = 0; r < numRegions; r++) if (locked[r]) { isSeed[r] = 1; lockedList.push(r); }
        for (let r = 0; r < numRegions; r++) {
            let m = Infinity;
            for (const l of lockedList) {
                const d = 1 - (r_xyz[3*r]*r_xyz[3*l] + r_xyz[3*r+1]*r_xyz[3*l+1] + r_xyz[3*r+2]*r_xyz[3*l+2]);
                if (d < m) m = d;
            }
            minDistToSeed[r] = m;
        }
    }
''')
edit('plates.js', '''        plateAreaCount[pid] = 1;
    }
''', '''        plateAreaCount[pid] = 1;
    }
    // [1d] Pinned plates start from all their pinned cells (or stay frozen if growPinned === false).
    if (pinIds.size) {
        const growPinned = pins.growPinned !== false;
        for (const id of pinIds.values()) { frontiers.set(id, []); plateAreaCount[id] = 0; }
        for (let r = 0; r < numRegions; r++) if (locked[r]) {
            plateAreaCount[r_plate[r]]++;
            if (growPinned) frontiers.get(r_plate[r]).push(r);
        }
    }
''')
edit('plates.js', '    let remaining = numRegions - plateIds.length;',
     '    let remaining = 0;\n    for (let r = 0; r < numRegions; r++) if (r_plate[r] === -1) remaining++;   // [1d] pinned cells are pre-assigned')
edit('plates.js', '''    smoothAndReconnectPlates(mesh, r_plate, plateSeeds, Math.round(PLATE_SMOOTH_BASE - PLATE_SMOOTH_LOW_T * lowPlateT));''',
     '''    smoothAndReconnectPlates(mesh, r_plate, plateSeeds, Math.round(PLATE_SMOOTH_BASE - PLATE_SMOOTH_LOW_T * lowPlateT), locked);''')
edit('plates.js', '    return { r_plate, plateSeeds, plateVec };',
     '    return { r_plate, plateSeeds, plateVec, pinIds, locked };   // [1d]')

# ── plates.js: smoothAndReconnectPlates ─────────────────────────────────────
edit('plates.js', 'export function smoothAndReconnectPlates(mesh, r_plate, plateSeeds, numPasses) {',
     'export function smoothAndReconnectPlates(mesh, r_plate, plateSeeds, numPasses, locked = null) {')
edit('plates.js', '            if (bestCount > deg * threshold && !isSeed[r]) {',
     '            if (bestCount > deg * threshold && !isSeed[r] && !(locked && locked[r])) {   // [1d]')
edit('plates.js', '''        for (const pid of Object.keys(bestComponent)) {
            for (const r of bestComponent[pid]) inMain[r] = 1;
        }
''', '''        for (const pid of Object.keys(bestComponent)) {
            for (const r of bestComponent[pid]) inMain[r] = 1;
        }
        if (locked) for (let r = 0; r < numRegions; r++) if (locked[r]) inMain[r] = 1;   // [1d] never reassign pinned cells
''')

# ── coarse-plates.js ────────────────────────────────────────────────────────
edit('coarse-plates.js', 'export function generateCoarsePlates(seed, numPlates, numContinents, continentSizeVariety = 0, landCoverage = 0.3) {',
     'export function generateCoarsePlates(seed, numPlates, numContinents, continentSizeVariety = 0, landCoverage = 0.3, pins = null) {')
edit('coarse-plates.js', '''    const { r_plate: coarse_r_plate, plateSeeds: coarsePlateSeeds, plateVec: coarsePlateVec } =
        generatePlates(coarseMesh, coarse_xyz, numPlates, seed);''',
     '''    const { r_plate: coarse_r_plate, plateSeeds: coarsePlateSeeds, plateVec: coarsePlateVec, pinIds: coarsePinIds } =
        generatePlates(coarseMesh, coarse_xyz, numPlates, seed, pins);   // [1d]''')
edit('coarse-plates.js', '''        coarseMesh, coarse_r_plate, coarsePlateSeeds, coarse_xyz, seed, numContinents, continentSizeVariety, landCoverage
    );''', '''        coarseMesh, coarse_r_plate, coarsePlateSeeds, coarse_xyz, seed, numContinents, continentSizeVariety, landCoverage, pins   // [1d]
    );''')
edit('coarse-plates.js', '''        coarsePlateIsOcean,
    };''', '''        coarsePlateIsOcean,
        coarsePinIds,   // [1d] label -> plate id
    };''')
edit('coarse-plates.js', 'export function projectCoarsePlates(mesh, r_xyz, coarseMesh, coarse_xyz, coarse_r_plate, seed, numPlates) {',
     'export function projectCoarsePlates(mesh, r_xyz, coarseMesh, coarse_xyz, coarse_r_plate, seed, numPlates, pins = null, pinIds = null) {')
edit('coarse-plates.js', '''    const N = mesh.numRegions;
    const r_plate = new Int32Array(N);''', '''    const N = mesh.numRegions;
    const r_plate = new Int32Array(N);
    const locked = new Uint8Array(N);   // [1d]
    projectCoarsePlates.lastLocked = locked;''')
edit('coarse-plates.js', '''        const ox = r_xyz[3 * r], oy = r_xyz[3 * r + 1], oz = r_xyz[3 * r + 2];
''', '''        const ox = r_xyz[3 * r], oy = r_xyz[3 * r + 1], oz = r_xyz[3 * r + 2];

        // [1d] Pinned cells take their pinned plate directly at hi-res (no FBM wobble, exact boundary).
        if (pins && pins.plateAt && pinIds) {
            const L = pins.plateAt(ox, oy, oz);
            if (L >= 0 && pinIds.has(L)) { r_plate[r] = pinIds.get(L); locked[r] = 1; continue; }
        }
''')

# ── ocean-land.js ───────────────────────────────────────────────────────────
edit('ocean-land.js', 'export function assignOceanLand(mesh, r_plate, plateSeeds, r_xyz, seed, numContinents, continentSizeVariety = 0, landCoverage = 0.3) {',
     'export function assignOceanLand(mesh, r_plate, plateSeeds, r_xyz, seed, numContinents, continentSizeVariety = 0, landCoverage = 0.3, pins = null) {')
edit('ocean-land.js', '''    const targetLandArea = landCoverage * numRegions;
''', '''    const targetLandArea = landCoverage * numRegions;

    // [1d] Forced land / ocean, decided per plate by majority of its pinned cells.
    const forcedLand = new Set(), forcedOcean = new Set();
    if (pins && pins.landAt) {
        const nL = {}, nO = {};
        for (let r = 0; r < numRegions; r++) {
            const v = pins.landAt(r_xyz[3*r], r_xyz[3*r+1], r_xyz[3*r+2]);
            if (v === 1) nL[r_plate[r]] = (nL[r_plate[r]] || 0) + 1;
            else if (v === 0) nO[r_plate[r]] = (nO[r_plate[r]] || 0) + 1;
        }
        for (const pid of plateIds) {
            if ((nL[pid] || 0) > (nO[pid] || 0)) forcedLand.add(pid);
            else if ((nO[pid] || 0) > 0) forcedOcean.add(pid);
        }
    }
    // [1d] Connected groups of forced-land plates each become one continent.
    const forcedComps = [];
    {
        const seen = new Set();
        for (const pid of forcedLand) {
            if (seen.has(pid)) continue;
            const comp = [pid]; seen.add(pid);
            for (let qi = 0; qi < comp.length; qi++) for (const a of plateAdj[comp[qi]]) if (forcedLand.has(a) && !seen.has(a)) { seen.add(a); comp.push(a); }
            forcedComps.push(comp);
        }
    }
''')
edit('ocean-land.js', '''    const first = plateIds[Math.floor(rng() * numPlates)];
    continentSeeds.push(first);
    chosen.add(first);

    for (let s = 1; s < effectiveNum; s++) {''', '''    if (forcedComps.length) {   // [1d]
        for (const comp of forcedComps) { continentSeeds.push(comp[0]); for (const p of comp) chosen.add(p); }
    } else {
    const first = plateIds[Math.floor(rng() * numPlates)];
    continentSeeds.push(first);
    chosen.add(first);
    }

    for (let s = continentSeeds.length; s < effectiveNum; s++) {   // [1d] was s = 1''')
edit('ocean-land.js', '''        for (const pid of plateIds) {
            if (chosen.has(pid)) continue;
            const cx = plateCentroid[pid];''', '''        for (const pid of plateIds) {
            if (chosen.has(pid) || forcedOcean.has(pid)) continue;   // [1d]
            const cx = plateCentroid[pid];''')
edit('ocean-land.js', '''    let seedArea = 0;
    for (const pid of continentSeeds) seedArea += plateArea[pid];
    while (continentSeeds.length > 1 && seedArea > targetLandArea) {
        let maxIdx = 0;
        for (let i = 1; i < continentSeeds.length; i++) {
            if (plateArea[continentSeeds[i]] > plateArea[continentSeeds[maxIdx]]) maxIdx = i;
        }''', '''    let seedArea = 0;
    for (const pid of continentSeeds) seedArea += plateArea[pid];
    for (const comp of forcedComps) for (const p of comp.slice(1)) seedArea += plateArea[p];   // [1d]
    while (continentSeeds.length > forcedComps.length && seedArea > targetLandArea) {   // [1d] never trim forced
        let maxIdx = forcedComps.length;
        for (let i = forcedComps.length + 1; i < continentSeeds.length; i++) {
            if (plateArea[continentSeeds[i]] > plateArea[continentSeeds[maxIdx]]) maxIdx = i;
        }''')
edit('ocean-land.js', '''    for (let c = 0; c < continentSeeds.length; c++) {
        plateContinent[continentSeeds[c]] = c;
    }''', '''    for (let c = 0; c < continentSeeds.length; c++) {
        plateContinent[continentSeeds[c]] = c;
    }
    forcedComps.forEach((comp, c) => { for (const p of comp) plateContinent[p] = c; });   // [1d]''')
edit('ocean-land.js', '''    for (let c = 0; c < numC; c++) {
        continentArea[c] = plateArea[continentSeeds[c]];
    }''', '''    for (let c = 0; c < numC; c++) {
        continentArea[c] = plateArea[continentSeeds[c]];
    }
    forcedComps.forEach((comp, c) => { for (const p of comp.slice(1)) continentArea[c] += plateArea[p]; });   // [1d]''')
edit('ocean-land.js', '''            for (const pid of plateIds) {
                if (plateContinent[pid] !== undefined) continue;
                let touchesSelf = false, touchesOther = false;''', '''            for (const pid of plateIds) {
                if (plateContinent[pid] !== undefined || forcedOcean.has(pid)) continue;   // [1d]
                let touchesSelf = false, touchesOther = false;''')
edit('ocean-land.js', '''        const component = oceanComponents[i];

        const bordering = new Set();''', '''        const component = oceanComponents[i];
        if (component.some((op) => forcedOcean.has(op))) continue;   // [1d] pinned ocean is never absorbed

        const bordering = new Set();''')

# ── planet-worker.js ────────────────────────────────────────────────────────
edit('planet-worker.js', 'landCoverage = 0.3, seed: overrideSeed, toggledIndices, skipClimate } = data;',
     'landCoverage = 0.3, seed: overrideSeed, toggledIndices, skipClimate, pins = null } = data;   // [1d]')
edit('planet-worker.js', '''        const { coarseMesh, coarse_xyz, coarse_r_plate, coarsePlateSeeds, coarsePlateVec, coarsePlateIsOcean } =
            generateCoarsePlates(seed, P, numContinents, continentSizeVariety, landCoverage);''',
     '''        const { coarseMesh, coarse_xyz, coarse_r_plate, coarsePlateSeeds, coarsePlateVec, coarsePlateIsOcean, coarsePinIds } =
            generateCoarsePlates(seed, P, numContinents, continentSizeVariety, landCoverage, pins);   // [1d]''')
edit('planet-worker.js', '''        const r_plate = projectCoarsePlates(mesh, r_xyz, coarseMesh, coarse_xyz, coarse_r_plate, seed, P);''',
     '''        const r_plate = projectCoarsePlates(mesh, r_xyz, coarseMesh, coarse_xyz, coarse_r_plate, seed, P, pins, coarsePinIds);   // [1d]''')
edit('planet-worker.js', '''        smoothAndReconnectPlates(mesh, r_plate, coarsePlateSeeds, 3);''',
     '''        smoothAndReconnectPlates(mesh, r_plate, coarsePlateSeeds, 3, projectCoarsePlates.lastLocked);   // [1d]''')
edit('planet-worker.js', '''        const plateVec = coarsePlateVec;''', '''        const plateVec = coarsePlateVec;
        if (pins && pins.plateVec && coarsePinIds) {   // [1d] pinned Euler poles (plate physics still adjusts them)
            for (const [L, v] of Object.entries(pins.plateVec)) {
                const id = coarsePinIds.get(+L);
                if (id !== undefined) plateVec[id] = { pole: v.pole.slice(), omega: v.omega };
            }
        }''')
edit('planet-worker.js', '''            _params: { N, P,''', '''            _pinIds: coarsePinIds ? Array.from(coarsePinIds.entries()) : null,   // [1d]
            _coarse: { r_plate: coarse_r_plate, xyz: coarse_xyz },   // [1d] for analysis
            _params: { N, P,''')
print('patched', JS)
