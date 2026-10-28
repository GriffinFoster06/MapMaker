# @mapmaker/planet

Planet physics (Phase 6): a TypeScript port of the VPLanet POISE subset (insolation and the energy-balance model),
run through `dmath`, with golden tests against native VPLanet output (`test/golden/`). Orbital elements are fixed
inputs here; their secular evolution is Phase 6a. Provenance of every ported function is in `/PROVENANCE.md`.
