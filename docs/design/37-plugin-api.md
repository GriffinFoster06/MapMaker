# Design note 37: Plugin, mod and scripting API

| | |
|---|---|
| Status | Draft (2026-10-13 overhaul) |
| Built in | Phase 17 (the module system it builds on arrives in Phase 15) |
| Depends on | The module system (§3.9), the parameter registry (note 17), the stage runner and worker protocol (§6.1) |
| Used by | Users and contributors who want new rules, stages, styles, tools, importers or exporters without changing the core |

## 1. Problem

No fixed set of systems will cover every worldbuilder's idea. A scripting and plugin API lets users add their own: a custom climate tweak, a new export format, a game-system statistics generator, a style pack, a language-model text rewriter. It must not break determinism or the save, and untrusted code must not be able to harm the user.

## 2. Canonical inputs and outputs

A **plugin** is a module (§3.9) with code. Kinds:
- **simulation plugins:** hooks and stages (deterministic, saved, hashed);
- **view plugins:** styles, renderers, overlays (non-authoritative);
- **tool plugins:** editor tools, importers, exporters, generators of articles or stats (non-authoritative, or producing edits through the edit log).

## 3. Approach and algorithm choice

- **Language:** JavaScript/TypeScript modules running in workers (simulation plugins) or sandboxed iframes (UI plugins), with a typed API over the canonical model: read layers and tables, declare outputs, use injected RNG and `dmath`.
- **Sandbox:** no network or DOM access for simulation plugins; capability-based permissions for tool plugins (file access, network) granted by the user.
- **Determinism:** simulation plugins are content-hashed into `modules.json`; a save records the hash, and loading requires the same plugin version (as with stage code versions, §5).
- **Distribution:** plugins are files the user loads (personal project: no marketplace needed); a folder of examples ships with the app.
- **Scripting console:** a REPL over the API for quick queries and batch edits (which become recorded edits).

## 4. Upstream references (algorithm level)

- **Godot** plugin and GDExtension patterns; **QGIS** Python plugin and Processing framework (`src/analysis/processing/`) as API-design references.
- **SLiM** Eidos scripting: a domain language over a simulation, a reference for the console.
- **Azgaar**'s "custom scripts" usage in its community: the demand this serves.

## 5. Validation

- A plugin cannot call `Math.random` or the DOM from a simulation worker (sandbox tests).
- Plugin outputs are deterministic and hashed; a changed plugin invalidates its stages.

## 6. Open questions

1. Should WASM plugins be allowed (performance) given the determinism rules? Proposed: yes, with the same fixed-point or `dmath`-equivalent rules and a cross-engine test.

## 7. Size estimate

| Part | LOC |
|---|---|
| API surface and types | ~2,000 |
| Sandboxing and permissions | ~1,500 |
| Loader, hashing, versioning | ~800 |
| Console | ~800 |
| Examples and docs | ~1,500 |

## 8. User controls and edit points

Install, enable, order and configure plugins; grant permissions; run scripts in the console.

## 9. Earth-recovery test

Not applicable. As with fantasy modules (note 35), the Earth tests can run with plugins enabled to report their effect.
