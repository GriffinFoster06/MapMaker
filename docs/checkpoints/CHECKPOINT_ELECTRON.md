# Checkpoint Electron: desktop app (Q4)

Branch `phase-electron` (PR to `main`), 2026-10-20. Decisions P4, W7, and new E1 to E3 and P5.

## 1. What was built

- **Item 0, candidate upstream (P5):** the newer orogen (`47edc28`, Orogen Evolution / Import / Classic) is registered as `orogen-evolution` in `upstream-manifest.json` (GPL-3.0, same `LICENSE` text as `orogen`), `PROVENANCE.md`, `docs/reconciliation/README.md` and Prerequisite lines for Phases 6, 6b and 11 in `docs/ARCHITECTURE.md` §7. Docs and manifest only; `upstream/orogen`, `vendor/` and every hash are untouched. Nothing decided about its use.
- **Electron shell** `apps/desktop` (E1): `src/main.ts` (custom `mapmaker://app/` scheme with COOP/COEP headers; contextIsolation on, nodeIntegration off, sandbox on; navigation locked; sender-checked IPC), `src/preload.ts` (`saveFile`, `openWorld`, `info` only), `src/ipc.ts`, `build.mjs` (esbuild bundle + copy of the web build).
- **Web app:** `apps/web/src/desktop.ts` routes `.mapmaker` save, heightmap PNG, SVG, styled PNG and styled SVG exports through native save dialogs, and Load world through the native open dialog, when `window.mapmakerDesktop` exists; in a browser the old download and file input remain (`npm run dev` still works).
- **Smoke test** `apps/desktop/e2e/smoke.spec.ts` (`npm run desktop:smoke`, `playwright.desktop.config.ts`): launches the built app (or `DESKTOP_EXE` for a packaged one), checks `crossOriginIsolated`, `SharedArrayBuffer`, no `require`, the three-function preload, generates N = 20,000 seed 4242 and checks its World hash equals a Node run, then save through a (stubbed) native dialog, load of another world and back (hash equal), and a cancelled export writing nothing.
- **Packaging and update** (E2, E3): `apps/desktop/electron-builder.yml`, `scripts/build-desktop.sh` (built the macOS arm64 `.dmg` and `.zip` here), `.github/workflows/desktop.yml` (tag `v*` or manual; artifacts only), `src/updates.ts` (electron-updater against GitHub Releases: ask first; Windows installs, macOS opens the release page), `docs/RELEASING.md`.

## 2. Checks run

- Smoke test: passes against the dev bundle and against the packaged unsigned `MapMaker.app` (arm64).
- Lint, typecheck, `provenance:check`: pass. Unit tests: 450 passed in total; five heavy 200k-cell tests timed out when the machine was loaded (two runs at once) and passed when re-run alone (31 of 31). Web e2e (Chromium + Firefox): 26 of 26 pass; `map.spec.ts` failed once under load and passed on re-run. No engine, core or hash code changed.
- Not run: the Windows installer and the GitHub workflow (no Windows machine here; the workflow runs on the first tag). Update flow against a real release (needs two published releases).

## 3. Decisions

P5 (candidate upstream), E1 (shell design and security), E2 (update behaviour without certificates, and the signing option), E3 (build and release machinery): `docs/DECISIONS_LOG.md`.

## 4. Deviations and proposals

- None to phase order or scope. The Electron wrapper needed no changes to the engine, the worker protocol or any hash.
- Proposal: add an app icon (`apps/desktop/build/icon.png`, 1024 px) when the user has one; the default Electron icon is used now.

## 5. Known gaps and next prerequisites

- Unsigned: first launch needs Gatekeeper (macOS) and SmartScreen (Windows) overrides; macOS cannot auto-install updates. Intel Macs and Linux are not built.
- The Windows path is untested locally (esbuild bundle and NSIS config are platform-neutral; the first tag will show).
- Next phase (6) first needs the reconciliation of the newer orogen with GPlates and the other tectonic candidates (P5).

## 6. Waiting on the user

See `docs/RESUME.md`: merge the PR, push a tag to build installers, publish the release, and (optionally) the signing steps.
