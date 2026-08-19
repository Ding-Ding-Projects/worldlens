# Three.js upgrade parity and evidence contract

Issue #73 upgrades the viewer's three.js dependency from `0.147.0` to the pinned target in
[`tools/threejs-upgrade-e2e/contract.json`](../../tools/threejs-upgrade-e2e/contract.json). A
version change alone is not compatibility proof: loaders, shaders, cameras, controls, CSS2D,
textures, caches, markers, picking, screenshots, and WebGL lifecycle all sit on the viewer API.

## Compatibility boundary

The contract names the current and target versions, the exact API inventory, and the performance
budgets. The migration must update callers directly and let changed APIs fail loudly; compatibility
shims that hide a missing or deprecated call are not accepted. Geometry, materials, transparency,
biome/light colours, LOD transitions, marker coordinates, camera navigation, and picking must keep
their observed meaning.

## Receipt requirements

The future producer runs the packaged viewer through the isolated cheap Lowlevel headless route.
It records raw baseline/candidate images for light, dark, and reduced-motion states, real camera
and marker interactions, before/after timing and memory, GPU resource creation/disposal, context
loss recovery, unsupported-GPU messaging, and a deliberate blank-canvas negative case. Every
record names the full source commit, packaged artifact path, artifact SHA-256, timestamps, and the
route that produced it. The report remains `unrun` until all required identifiers are present.

`tools/threejs-upgrade-e2e/verify.mjs` checks receipt structure, contract coverage, image digests,
artifact binding, interaction route, performance budgets, lifecycle outcomes, and packaged-artifact
provenance. It does not launch the app, create images, or infer a result from source code. A report
that is `failed` or `unrun` is useful evidence of state, not a parity pass.

## Security and licensing

The upgrade does not add a network renderer, remote texture source, or executable loader. Bundled
three.js and its declarations remain governed by the package lock and their upstream licence and
notice records. The receipt must never contain tokens, profile contents, private map paths, or raw
user data; representative worlds and markers are task-owned fixtures. WebGL diagnostics are
bounded and local, and unsupported hardware must produce an actionable message rather than a
silent blank surface.

## 廣東話

three.js 升級唔係改 version 然後向 canvas 祈禱。Loader、shader、camera、controls、texture、marker
同 WebGL lifecycle 都要有真 receipt：同一個 fixture 做 light/dark/reduced-motion 畫面對比，真操作
camera 同 picking，再量 startup、frame time、memory 同 GPU disposal。`unrun` 就係未跑，唔可以靠
source diff 冒充 parity；canvas 一片空白亦要當 failure，唔可以當成「開咗」。
