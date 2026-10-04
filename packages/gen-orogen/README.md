# @mapmaker/gen-orogen

orogen (cc2662b) in the shell. `vendor/` holds verbatim orogen files (never edited; see PROVENANCE.md). `src/` holds the adapter:
the six stages (`mesh`, `orogen.tectonics`, `.elevation`, `.erosion`, `.climate`, `.koppen`), layer descriptors (`orogen.*` layers are private), the
stock-shape view used by the parity test, and `startOrogenHost` for workers. Vendored code calls `Math.*` directly, so the `orogen.*` stages are
`parity` stages and run inside `dmath.withMode('native')`.
