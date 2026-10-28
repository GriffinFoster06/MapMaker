#!/usr/bin/env python3
"""Trim native VPLanet EarthClimate output into the insolation golden file.

Usage: extract-insolation.py <run dir> > earthclimate-insolation.json
The run dir holds the output of `vplanet vpl.in` for examples/EarthClimate (see golden/README.md):
SeasonalClimateFiles/solarsys.Earth.DailyInsol.0 (365 days x 150 latitudes) and solarsys.Earth.Climate (grid output;
the first 150 rows are t = 0: Latitude(deg) TempLat AlbedoLat AnnInsol FluxIn FluxOut ...).
"""
import hashlib, json, sys
run = sys.argv[1]
daily_path = f"{run}/SeasonalClimateFiles/solarsys.Earth.DailyInsol.0"
clim_path = f"{run}/solarsys.Earth.Climate"
daily = [[float(x) for x in l.split()] for l in open(daily_path)]
clim = [[float(x) for x in l.split()] for l in open(clim_path)][:150]
days = [0, 45, 91, 137, 182, 228, 273, 319, 364]
sha = lambda p: hashlib.sha256(open(p, "rb").read()).hexdigest()
print(json.dumps({
    "source": "VPLanet dd55da7 examples/EarthClimate, built with clang -O3, t = 0 output",
    "sha256": {"DailyInsol.0": sha(daily_path), "Climate": sha(clim_path)},
    "inputs": {"luminosity_W": 3.846e26, "semiMajorAxis_AU": 1.00000011, "ecc": 0.0167, "obliquity_deg": 23.44,
               "longP_deg": 102.94719, "precA": 0.0, "nDays": 365, "nLats": 150},
    "latitude_deg": [r[1] for r in clim],
    "annualInsolation": [r[4] for r in clim],
    "seasonalModel": {"note": "native SEASONAL model at t = 0 (sClimateModel sea, land+water, ice sheets): a loose cross-check for the annual EBM, not a golden for it",
                      "tempC": [r[2] for r in clim], "albedo": [r[3] for r in clim], "fluxOut": [r[6] for r in clim]},
    "days": days,
    "dailyInsolation": [daily[d] for d in days],
}, separators=(",", ":")))
