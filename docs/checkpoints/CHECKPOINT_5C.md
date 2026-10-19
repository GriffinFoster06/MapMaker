# Checkpoint 5c: cartography v1

Branch `phase-5c` (PR #10 to `main`), 2026-10-19. ARCHITECTURE §7 (Phase 5c).

## 1. What was built

- **Housekeeping and audits:** `docs/RESUME.md` trimmed; decision W8; mapgen4 and mewo2/terrain audited (documentation only).
- **Conic projections** (`packages/projection/src/`): Albers, Lambert conformal, conic equidistant with standard-parallel controls, interactive and in the exact exports.
- **Brush cursor ring** on the globe and the flat map for all edit tools (`apps/web/src/editor/`, `globe/globe.ts`).
- **`packages/carto`:** port of Azgaar's `label-spread.ts` (no DOM, Helvetica AFM metrics, seeded), QGIS hillshade formula on the sphere mesh, style system and five themes (atlas, physical, parchment, political, satellite-like), cartographic data (landmasses, oceans, seas, ranges, rivers, coastline, placeholder names), label planning, SVG overlay (graticule, rivers, coast, labels, scale bar, legend), exact styled PNG and SVG kernels. No third-party symbols (W4).
- **App** (`apps/web`): a `styled` layer on the globe and flat map (GPU shader with lookup and relief factor), theme and relief controls, overlay toggles, globe labels, styled PNG/SVG export through the exact path.
- **Save and load** of `.mapmaker` files in the UI (3c; `saveWorld`/`loadWorld` already existed, the buttons and the `app.info` kernel are new).
- **Usability pass (3c):** generate, edit, globe and flat views with labels and hillshade, export, save, load all work end to end in Chromium and Firefox.

## 2. Checks run

- Lint, typecheck, build, `provenance:check`: pass.
- Unit tests: 450 passed, 1 skipped (new `packages/carto`: label-spread, font-metrics, hillshade, data, style, placement, export, golden images per theme; conic and exact tests).
- E2E (Chromium + Firefox): all pass, including `carto.spec.ts` (GPU against the exact raster: mean ≤ 0.18, p99 ≤ 1 of 255; export PNG and SVG equal Node's byte for byte; style and relief change pixels, never the World hash) and `saveload.spec.ts` (hash equal after a round trip). 26 passed in total.
- Not run: the full benchmark matrix and Q7 baselines (not touched by this phase).

## 3. Decisions

`docs/DECISIONS_LOG.md` W8 and 5c-1 to 5c-7.

## 4. Deviations and plan text to change

- Label solver is Azgaar's (decision W4); QGIS PAL is not ported. One font family, regular and italic (AFM table), until the Phase 10b font audit.
- The globe shows labels for point features and paths from the same plan, re-planned when the camera rests; there is no styled export of the globe view.
- Golden images have a pixel tolerance for the GPU-independent exact path only; the GPU path is compared numerically to the exact raster instead.

## 5. Known gaps and the next prerequisites

- No settlements or political borders; names are placeholders until Phase 18; river threshold is a heuristic; no PAL; one font family.
- Next: Q4 (Electron) on the user's next prompt; native file dialogs replace the browser save and load.

## 6. Waiting on the user

- Review PR #10. Nothing else.
