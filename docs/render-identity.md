# Render identity and workspace leases

Three identities a render carries, kept distinct on purpose, and the lease that stops two
processes from writing the same render workspace.

## Behaviour

A render has an immutable run id, a stable project id and an effective map id. The Java engine
normalises map ids the way upstream BlueMap's `sanitiseMapId` does, replacing every character
outside ASCII letters, digits and underscore with an underscore. The orchestrator resolves that
normalisation once, before any configuration or session is written, and rejects a request whose
maps would collide at the engine's output id instead of letting the second map overwrite the first.

Before a render starts, the orchestrator acquires a workspace lease: a small lock file in the render
storage naming the lease id, the owning process and the render id. A second start for the same
render while the lease is held fails as already running. The lease is released when the run ends,
and only by the holder whose lease id still matches.

Recovery of an older workspace is read-only. It proposes map identities derived exclusively from the
matching source configuration, never adopted from observed output, and leaves originals, timestamps,
worlds and output untouched until a separate, explicit apply and re-verification step.

## Configuration

Nothing to configure. Lease files are named `.render-workspace-<render id>.lock` inside the render
storage directory and are at most 4 KiB.

## Failure modes

- Two maps whose ids normalise to the same engine output id are refused with the colliding id named.
- A lease file that is a symbolic link, oversized, malformed or from an older format is reported as
  unavailable and left for manual diagnosis rather than deleted.
- A release whose lease id no longer matches the file stops, because the file now belongs to someone
  else.

## Security considerations

Links anywhere inside a retained workspace, including parent directories, are rejected during
recovery. Identity is never read from output a previous process produced, so a tampered output
folder cannot rename a map.

## Verification

On the integrated tree: the map identity, workspace lease and promotion tests pass under the lane's
own vitest configuration; the app package typechecks. Not verified here: a packaged render against a
real world, and the recovery proposal applied to a real legacy workspace.

## Sources and suggested articles

- `design/packages/app/src/main/render/mapIdentity.ts`
- `design/packages/app/src/main/render/workspaceLease.ts`
- `design/packages/app/src/main/render/mapIdentityRecovery.ts`
- [Choosing a render engine](./render-engine-choice.md), [Hosting a verified map](./managed-hosting.md)
