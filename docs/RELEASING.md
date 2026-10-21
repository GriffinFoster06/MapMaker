# Releasing the desktop app

Written so a fresh agent session can build, test, version, tag and explain a release from this file alone. Design decisions: `docs/DECISIONS_LOG.md` E1 to E3 (and P4, W7). Everything is **unsigned and not notarized**, and nothing here spends money, signs, or publishes: publishing a release is the user's step (see "Waiting on the user" in `docs/RESUME.md`).

## What the app is

`apps/desktop` wraps the web bundle (`apps/web`) in Electron. `src/main.ts` serves the bundle from `mapmaker://app/` with COOP/COEP headers, `src/preload.ts` exposes `window.mapmakerDesktop` (`saveFile`, `openWorld`, `info`), `src/updates.ts` checks for updates. The web app is unchanged and still runs with `npm run dev` (in a browser, saving downloads and loading uses a file input).

## Build and test locally

All commands go through `scripts/node24.sh` (project-local Node 24); on a fresh checkout run `scripts/node24.sh npm ci` and `node node_modules/electron/install.js` first (npm here skips install scripts, so Electron's binary is not downloaded otherwise).

| Goal | Command |
|---|---|
| Run the desktop app from source | `scripts/node24.sh npm run desktop:dev` (builds the web app, bundles the shell, opens a window) |
| Bundle only (no installer) | `scripts/node24.sh npm run desktop:build` (web build, then `apps/desktop/dist/`) |
| Smoke test | `scripts/node24.sh npm run desktop:smoke`: launches the built app, generates a 20k-cell world, checks `crossOriginIsolated`, `SharedArrayBuffer`, the narrow preload, that its World hash equals Node's, native save, load, and a cancelled export |
| Smoke test an installed build | `DESKTOP_EXE=/path/to/MapMaker.app/Contents/MacOS/MapMaker scripts/node24.sh npm run desktop:smoke` |
| Unsigned installer for this OS | `scripts/build-desktop.sh` (add `--smoke` to run the smoke test first). Output in `apps/desktop/release/` (gitignored): `MapMaker-<version>-mac-arm64.dmg` and `.zip`, `latest-mac.yml`, or on Windows `MapMaker-<version>-win-x64.exe`, `latest.yml` |

Build the macOS app on macOS and the Windows installer on Windows (or let CI do it). Only Apple Silicon macOS and 64-bit Windows are built; no Intel Mac, no Linux (W7).

## Version, tag, build in CI

1. The version is `version` in `apps/desktop/package.json` (semantic: `0.1.0`, `0.2.0`, ...). Edit it, commit on a branch, merge to `main` through a pull request (never push to `main`).
2. Tag the merge commit with the same number prefixed by `v` and push the tag: `git tag v0.2.0 && git push origin v0.2.0` (the user or an authorised agent; pushing a tag is outward-facing).
3. `.github/workflows/desktop.yml` runs on the tag: it builds the macOS and Windows installers, runs the smoke test on macOS (the Windows runner has no GPU), and uploads **workflow artifacts only** (`installer-macOS`, `installer-Windows`, kept 30 days). It does not create a release and signs nothing. It can also be started by hand (Actions, "Desktop installers", Run workflow) to test the build without a tag.
4. Download the artifacts from the workflow run page.

## Publish a release (the user's step)

1. On GitHub: Releases, Draft a new release, choose the tag `v<version>`, add notes.
2. Attach **all** files from both artifacts: the `.dmg`, the `.zip`, the `.exe`, every `.blockmap`, and **`latest-mac.yml` and `latest.yml`** (the update check reads these; without them the app sees no update).
3. Publish. (Command-line alternative: `gh release create v<version> <files> --title ... --notes ...`.)

## Installing unsigned builds (what the user will see)

- **macOS:** the app is not signed or notarized, so Gatekeeper blocks the first launch. Open the `.dmg`, drag MapMaker to Applications, then right-click the app, Open, Open (or System Settings, Privacy & Security, "Open Anyway"). If macOS says the app is damaged, run `xattr -cr /Applications/MapMaker.app` once.
- **Windows:** SmartScreen shows "Windows protected your PC"; choose More info, Run anyway. The installer is a standard NSIS wizard.

## How auto-update behaves

On start, a packaged app (never `npm run desktop:dev`) asks GitHub Releases for a version newer than its own (`latest*.yml` on the latest release). It never downloads or installs without a yes, and stays silent when offline or when no release exists. Set `MAPMAKER_NO_UPDATE_CHECK=1` to disable the check.

- **Windows:** "Download and install" downloads the update and restarts into it. electron-updater does not require a signed update unless `publisherName` is configured, so this works unsigned.
- **macOS:** an unsigned app cannot apply an update (Squirrel.Mac requires a code-signed app), so "Open download page" opens the latest release for a manual download and replacement of the app.
- Not yet tested against a real release: do "Check the update path" below after the first publish.

### Check the update path (after publishing two releases)

Install the older release, launch it, confirm the "MapMaker <new> is available" dialog appears and the buttons do what is described above. Record the result in `docs/RESUME.md`.

## Signing later (the user's money and accounts; not done)

- macOS: Apple Developer Program (about US$99 a year), a Developer ID Application certificate, notarization. Then set `mac.identity` and `mac.notarize` in `apps/desktop/electron-builder.yml`, add the certificate and Apple credentials as GitHub secrets, drop `CSC_IDENTITY_AUTO_DISCOVERY=false`, and macOS auto-install works (change `updates.ts` to download and install on macOS as on Windows).
- Windows: a code-signing certificate or Azure Trusted Signing; set `win.*` signing options and secrets. Removes the SmartScreen warning once reputation builds.

## Tests must not take focus (hidden and visible modes)

Tests and scripts never steal the user's focus. The desktop app has two test modes, both off by default (the normal launch is unchanged):

- `MAPMAKER_TEST=1`: hidden window (`show: false`, never `show()` or `focus()`), `backgroundThrottling: false` so hidden rendering and WebGL keep working, and on macOS the accessory activation policy plus `app.dock.hide()`, so nothing appears in the Dock or takes focus. The smoke test (`desktop:smoke`) sets it.
- `MAPMAKER_TEST_VISIBLE=1`: the window is shown with `showInactive()` (visible, no keyboard focus), the macOS policy stays `accessory`, throttling is off. For the checks that depend on the real on-screen path: frame rate while panning, graphics status, layout. `desktop:perf` sets it. Use it rarely (once per checkpoint at most); everything else runs hidden.

Playwright's Chromium and Firefox projects run headless (Firefox runs headed only when `FIREFOX_HEADED=1`, which CI sets on Linux under a virtual display). To check a visible-mode run takes no focus, type into another application while it runs; no keystroke may be lost.

## Check the graphics and frame rate

If the desktop app feels slow, run `scripts/node24.sh npm run desktop:perf` (after `desktop:build`; `DESKTOP_EXE=/path/to/MapMaker.app/Contents/MacOS/MapMaker` tests an installed build, `N=1000000` a bigger world). It launches the app (in visible mode, without taking focus), generates a world, drags the globe, and prints:

- **WebGL renderer**: must say `hardware` (on a Mac: `ANGLE (Apple, ANGLE Metal Renderer: ...)`). `SwiftShader`, `llvmpipe` or `Software` means the app has no GPU and everything will be slow.
- **GPU status**: `webgl`, `gpu_compositing` and `rasterization` should be `enabled`. The app sets no GPU switch and never calls `app.disableHardwareAcceleration()`; do not add one.
- **Globe canvas**: size in CSS and buffer pixels (the app renders at the display's pixel ratio, at most 2).
- **Globe drag**: draw calls per pointer move should be about one; far fewer means frames are dropped.
- **Frame rate and cost per frame**: animation frames should match the display (120 on a ProMotion Mac); the cost per frame is the draw plus the GPU time, about 5 ms at 200k cells and 9 ms at 1M on an M5 Pro, the same in Chromium and Firefox. Under 8 ms keeps 120 Hz smooth, under 16 ms keeps 60 Hz.

To compare with the web app, run the same world in the web build in Chromium (`npm run e2e` serves it); the figures should match. Findings so far: decision E4 in `docs/DECISIONS_LOG.md`. By hand: `app.getGPUFeatureStatus()` from the Playwright `_electron` handle gives the GPU status, and the page's `WEBGL_debug_renderer_info` extension gives the renderer string.

## Troubleshooting

- `apps/web/dist is missing`: run `scripts/node24.sh npm run build` (the `desktop:build` script does it).
- The smoke test cannot start Electron: `node node_modules/electron/install.js`.
- Dependencies (`electron`, `electron-builder`, `electron-updater`) are exact-pinned and logged in `PROVENANCE.md`; do not upgrade them without a failing check that requires it.
