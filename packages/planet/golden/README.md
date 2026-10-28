# Golden data from native VPLanet

Oracle: VPLanet `dd55da7` (MIT, `upstream-manifest.json`), built in a scratch copy, never inside `upstream/`:

```
cp -R upstream/VPLanet <scratch>/vpl && cd <scratch>/vpl && mkdir -p bin
clang -O3 -o bin/vplanet src/*.c -lm -DGITVERSION=\"dd55da7\"
mkdir run && cd run && cp ../examples/EarthClimate/*.in .
sed -i '' 's/dStopTime     1e6/dStopTime     2000/' vpl.in      # t = 0 rows only are used
../bin/vplanet vpl.in
python3 <repo>/packages/planet/golden/extract-insolation.py . > earthclimate-insolation.json
```

- `earthclimate-insolation.json`: daily insolation (9 of 365 days, 150 latitudes) and annual-mean insolation at
  t = 0 of `examples/EarthClimate`, with the sha256 of the two source files. Output precision is 6 decimals
  (`iDigits 6`), so tests compare to 1e-5 W/m².
- The annual-only model (`sClimateModel ann`) segfaults in this build in three configurations tried
  (minimal poise-only system, distorb+distrot+poise with one planet, the full example with the annual option), exit
  code 139, while the unmodified example (`sea`) runs. The annual EBM therefore has no native golden; see
  `docs/RESUME.md`, "Waiting on the user", and `docs/DECISIONS_LOG.md` P8.

## DistOrb and DistRot (Phase 6a M2)

`distorb-ll2.json`: all eight planets (and Earth's obliquity and precession angle) of `examples/SSDistOrbDistRot/LL2`, every
20 kyr over 1 Myr plus the first three rows. Built in a scratch copy as above, then in `LL2/vpl.in` set `bVarDt 0`,
replace `dEta` by `dTimeStep 1` and `dStopTime 1000000` (decision A2: fixed 1 yr step), run `../../../bin/vplanet vpl.in`
in that directory, and `python3 extract-distorb.py <dir> > distorb-ll2.json`. The JSON records the sha256 of every input.

## EqTide and Stellar (Phase 6a M3)

`eqtide-ctl.json`: `examples/TideLock/CTL` with `d.in` edited (`dRadius -1.5` in place of `sMassRad sotin07`, output
`Time SemiMajorAxis Eccentricity -RotPer Obliq`), `vpl.in` with `dEta 0.001`, `dOutputTime 1e7`; 101 rows for the planet,
star rotation period. `stellar-baraffe.json`: a scratch system of three single stars (`saModules stellar`,
`sStellarModel baraffe`, masses 0.1, 0.5, 1.0, `bVarDt 0`, `dTimeStep 1e7`, `dStopTime 1e10`, `dOutputTime 5e8`, outputs
`Time -Luminosity -Radius Temperature RadGyra`; `-Radius` prints Earth radii). Inputs' sha256 are recorded in each file.

## Circumbinary orbit (Phase 6a M4)

`circumbinary-ll13.json`: `examples/CircumbinaryOrbit` with `vpl.in` set to `bVarDt 0`, `dTimeStep 1e-4`, `dStopTime 2.0`,
`dOutputTime 0.02` and `cbp.in` output `Time CBPR CBPZ CBPPhi LL13N0 LL13K0 LL13V0 R0` (every 5th row kept).
