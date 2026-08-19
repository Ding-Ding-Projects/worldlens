# Three.js upgrade parity receipt

This directory is the acceptance contract for issue #73. It describes the evidence a future
headless run must produce; it is not evidence that the run happened. A fresh report starts with
`status: "unrun"` and remains that way until the packaged viewer has produced every required
record. Unit tests, source previews, a dependency diff, or a claim that a browser should behave a
certain way cannot replace a receipt from the built artifact.

## Run shape

The eventual producer must pin one full source commit and record the installed three.js version
before and after the upgrade. It must drive the packaged viewer through the approved cheap
Lowlevel headless route, on an isolated profile, and keep the visible desktop untouched. The
producer should:

1. inventory every changed/deprecated API used by loaders, shaders, cameras, controls, CSS2D,
   textures, caches, markers, picking, screenshots, and WebGL lifecycle;
2. render the same representative world and marker fixture before and after in light, dark, and
   reduced-motion states, retaining raw PNGs and their SHA-256 digests;
3. exercise camera navigation and marker picking with real input and record the resulting state;
4. record startup time, p95 frame time, peak memory, large-map observations, created GPU resources,
   disposed GPU resources, and the leak count against the budgets in `contract.json`;
5. force WebGL context loss and recovery, show the unsupported-GPU message, and prove a blank
   canvas is treated as a failure rather than a successful launch; and
6. open the installed/package artifact and bind every receipt to its exact source commit and
   artifact digest.

No capture or packaged run is created by this documentation and contract change.

## Report and validation

The producer emits one JSON report. The minimum shape is:

```json
{
  "schema": 1,
  "status": "unrun",
  "sourceCommit": "<40 hex characters>",
  "currentVersion": "0.147.0",
  "targetVersion": "0.180.0",
  "artifact": { "path": "<installed artifact>", "sha256": "<64 hex characters>" },
  "evidence": {}
}
```

Each evidence entry is keyed by an identifier in `contract.json` and records the exact artifact,
source commit, route, timestamps, and outcome. Visual entries additionally record `state`,
`baselinePath`, `candidatePath`, dimensions, and both image digests. Interaction entries record
the real input route and observed state transition. Performance entries record the measured
values and budget verdict. Lifecycle entries record the deliberate trigger and the observed
recovery or refusal. A missing or guessed field is an unverified record, not a pass.

Validate a future report without launching anything:

```text
node tools/threejs-upgrade-e2e/verify.mjs <evidence-report.json>
```

The validator only checks receipt shape, hashes, contract coverage, and consistency. It never
launches the viewer, creates captures, or turns an `unrun` report into a success claim.
