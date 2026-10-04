# tools/tuning

Calibration harnesses (Q8: data is downloaded, never committed).

- `climate/`: orogen's Earth-Köppen tuning harness (`evaluate.mjs`, `optimize.mjs`), running headless against the shell. The context is built through the shell's `mesh` stage and heightmap import, and each evaluation runs the shell's `orogen.climate` and `orogen.koppen` stages.
  - `climate/fetch-kottek.sh` downloads the Kottek et al. ground truth (SHA-256 checked).
  - `tsx tools/tuning/climate/evaluate.mjs --n 40000 --seed 1234 [--maps] [--params file.json]`
  - `climate/baseline.json`: the committed baseline objectives (0.6778 at 40k, 0.6683 at 160k, equal to spike 1a's stock-harness numbers).
- `ab/`: the Q7 fidelity A/B harness and its baseline (added in this phase, see `ab-baseline.json`).

`apply-params.mjs` is not ported: it edits orogen's `js/climate-config.js`, and the vendored copy is never edited.
