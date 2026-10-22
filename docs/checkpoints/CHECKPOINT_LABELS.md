# Checkpoint labels-quality: map labels and test modes

Branch `labels-quality` (PR to `main`), 2026-10-21. A direct user request, outside the authorization limit ("the labels are terrible"). Decisions C4 and L1 to L7 in `docs/DECISIONS_LOG.md`.

## 1. What was built

- **Item 0, testable without disturbing the user (C4):** `apps/desktop` test mode is hidden by default and keeps painting (`backgroundThrottling: false`, `disable-renderer-backgrounding`, `disable-backgrounding-occluded-windows`, `disable-background-timer-throttling`, Windows `CalculateNativeWinOcclusion`); screenshots through `webContents.capturePage()`. `apps/desktop/e2e/capture.spec.ts` proves the capture is non-blank and bit-identical hidden, shown (transparent) and minimised. The visible mode is gone; *recorded* (`apps/desktop/e2e/session.ts`: Playwright video and numbered screenshots in `docs/feedback/<name>/`) and *watch* (`MAPMAKER_TEST_WATCH=1`: small bottom-right window, 40% opacity, click-through, `showInactive()`, only on request) replace it. Docs: `docs/RELEASING.md`, `docs/OPERATING_GUIDE.md`, `.claude/commands/go.md`.
- **Looking first:** `scripts/label-shots.mjs` renders the matrix (flat equirectangular, Robinson, orthographic; zoom 1, 2, 4, 8; four themes; globe at three rotations; 200k and 1M cells; labels on and off) in the hidden app and measures overlaps and clipping; `docs/feedback/labels/DEFECTS.md` is the numbered defect list.
- **The fix** (`packages/carto`): `data.ts` regions raster; `label-mask.ts` screen mask with clearance and outline distance; `placement.ts` rewritten around them (area names on their own ground at the visible pole, sized by the room they have; smoothed least-turning river and range stretches; range abbreviations; islands; the label-spread solver with an `accept` filter on its candidates); globe and orthographic `limb` handling (`apps/web/src/globe/globe.ts` `lonLatAt`, `globe-labels.ts`, `map-ui.ts`, `kernels.ts`); smaller halos and island and river sizes in the five themes.
- **Tests:** `placement.test.ts` (10 synthetic: own ground, separation, clear of area names, zig-zag rivers smoothed, zoom reveals detail, a continent filling the view keeps its name, obstacles, determinism) and `placement.world.test.ts` (26 on a generated world, seven views: no overlap beyond the 20% ramp, inside the view and the map, clear of the scale bar and legend, oceans on water and continents on land, same view and seed same plan, a small pan moves the labels with the map, a small rotation keeps them, off the limb on a sphere).

## 2. Checks run

- Lint, typecheck, `provenance:check`: pass. Unit tests: 481 passed, 1 skipped (the skips are the upstream-checkout-dependent suites).
- Playwright e2e: 28 passed (Chromium and Firefox, 3.0 min; includes the exported SVG equal to Node). Electron (hidden): 3 passed (smoke, capture, recorded).
- Evidence (label counts, overlapping pairs by DOM box, clipped, 200k and 1M): before 24 labels with 4 to 5 overlapping pairs at zoom 1, 7 at zoom 4, 1 at zoom 8; after 14 to 19 labels with 0 to 1 pairs (the one pair is the rotated-box overstatement of two path labels or two adjacent ocean names), 8 at zoom 4. Fewer labels at zoom 1 is the cost of no longer printing text over land, other labels, the outline and the legend; more appear with zoom.
- Not run: the watch mode live (it would show a window); real occlusion by an opaque window (same reason; the hidden-window capture is the strictest case). A real trackpad and real fonts on Windows were not tried (only Electron on macOS).

## 3. Decisions

C4 (test modes), L1 to L7 (regions raster and mask, solver hook, rivers and ranges, limb, stability, names, goldens).

## 4. Deviations and proposals

- None to phase order or scope. One change inside the Azgaar port (the optional `accept` filter), recorded in its header and in `PROVENANCE.md`.
- No golden, World hash or probe key was re-recorded: none depends on labels (L7).

## 5. Known gaps

- Text on the globe stays horizontal (no skew for the foreshortening); ocean and continent names are straight, not curved along the basin; the legend panel can still sit over land; names are placeholders for Phase 18; label density at zoom 1 is modest on a world with few named features.

## 6. Waiting on the user

Nothing blocks. See "What the user does next" in `docs/RESUME.md` (look at the before/after images first).

## Images (`docs/feedback/labels/`, before and after pairs)

`02-flat-robinson-atlas-z1-200k` (overlaps, river text, oceans on land), `03-flat-orthographic-atlas-z1-200k`, `05-flat-robinson-atlas-z4-200k` (zoom), `09-flat-robinson-political-z1-200k`, `11-globe-atlas-rot0-200k` and `13-globe-atlas-rot2-200k` (limb), `15-flat-robinson-atlas-z1-1M`; and `after-04-flat-robinson-atlas-z2-200k` (zoom 2 detail, no before pair).
