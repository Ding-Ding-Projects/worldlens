# Three.js upgrade and parity record

## Scope

Issue [#73](https://github.com/Ding-Ding-Projects/worldlens/issues/73) covers upgrading the
viewer’s three.js dependency while preserving the behavior users can see and exercise. The
viewer includes upstream-derived loaders and render helpers alongside project-specific camera,
marker, cache, picking, and screenshot code. A version bump alone is therefore not acceptance.

This record is the durable contract for the upgrade. It is intentionally separate from the
dependency manifest so the version change, compatibility work, and evidence cannot be mistaken
for one another.

## Current boundary

The issue remains open. This records-only update did not change viewer runtime code, run tests,
build a package, launch the viewer, or take screenshots. No rendered parity, interaction parity,
performance, WebGL recovery, or packaged-artifact result is claimed here.

The recovered continuation plan and the current project roadmap identify the three.js upgrade as
pending. The prior material-bluemap baseline is
[`e137779`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/e13777927876a3d7898778f18193e9465bc97cc2).
That baseline is provenance only; it is not proof that the current Worldlens viewer has parity.

## Required implementation review

Before changing the dependency, inventory the current and target versions and every API used by
the viewer. Review loaders, shaders/materials, camera and controls, CSS2D labels, textures,
caches, markers, picking, screenshot paths, and WebGL lifecycle code for removed, renamed, or
behaviorally changed APIs. Compatibility shims must not hide a failed path or turn a blank canvas
into an apparently successful load.

The upgrade must preserve, or document a deliberate reviewed difference for:

- map geometry, materials, transparency, biome and light colors;
- level-of-detail transitions and large-map navigation;
- marker position, selection, hover, and picking behavior;
- camera navigation, controls, resize, device-pixel-ratio, and screenshot output;
- startup latency, frame time, memory growth, and GPU-resource disposal; and
- WebGL context loss/recovery, unsupported GPU/browser messaging, and blank-canvas failure.

## Evidence required before closure

The next implementation lane must attach the exact dependency versions and commit, the API
inventory, and deterministic before/after evidence. The evidence set must include representative
worlds and markers in light, dark, and reduced-motion states, plus interaction coverage for
navigation, picking, markers, loading, resize, screenshot, context loss/recovery, and unsupported
hardware/browser handling.

Performance evidence must identify the same map and capture profile on both sides and report startup,
frame-time, memory, and GPU-resource-disposal measurements. A packaged application run on an
isolated hidden desktop must prove that the built artifact—not a source preview or injected test
surface—renders the upgraded viewer. Captures and machine-readable comparison reports belong with
that later evidence pass; none exists from this records-only update.

## Acceptance checklist

- [ ] Inventory current and target three.js versions and all changed APIs used by the viewer.
- [ ] Update loaders, shaders/materials, camera/controls, CSS2D, textures, caches, markers,
      picking, screenshot, and WebGL lifecycle paths.
- [ ] Preserve geometry, materials, transparency, biome/light color, LOD, marker placement,
      camera navigation, and documented performance budgets.
- [ ] Add deterministic rendered-image comparisons and interaction checks for representative
      worlds and markers in light, dark, and reduced-motion modes.
- [ ] Measure startup, frame time, memory, GPU-resource disposal, and large-map behavior before
      and after the upgrade.
- [ ] Verify WebGL context loss/recovery, unsupported GPU/browser messaging, and no silent blank
      canvas failure.
- [ ] Run the genuine packaged hidden-desktop viewer proof and update dependency, security, and
      license documentation.
- [ ] Attach the exact reports and captures to Issue #73, then close it only after the evidence
      is independently read back.

## Failure boundaries

An upgrade that builds but renders a blank or materially different map is not accepted. Neither is
an injected seam test, a source preview, a filename-only capture manifest, or a performance number
from a different map/profile. Missing context-loss, unsupported-hardware, or disposal evidence
remains an open acceptance item rather than a pass by omission.

### 廣東話 / Cantonese

three.js upgrade 唔係改 version 然後拜神。Viewer 入面 loader、shader、camera、marker、cache
同 screenshot 都黐住佢；要逐樣查 API 變化，做真畫面同操作對比，再量 startup、frame time、
memory、GPU cleanup 同 context loss。升完開到 app 但 canvas 變宇宙真空，唔算 parity passed。

今次 records-only pass 冇改 runtime、冇跑 tests、冇影 captures、冇 packaged proof。Issue #73
繼續 open；下一手要用真 build、真 viewer、真 map profile 補齊證據，先可以講 acceptance。
