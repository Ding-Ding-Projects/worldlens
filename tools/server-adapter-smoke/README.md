# Server-adapter smoke contract

This is the repeatable contract for issue #83. It covers the six Minecraft-server
adapters shipped by the upstream BlueMap build: Fabric, Forge, NeoForge, Paper, Spigot,
and Sponge. The harness is Windows-only, runs only against local server processes, and
does not download servers, jars, game files, or dependencies.

## Important boundary

`smoke.mjs` is plan-only by default. It does not boot a server, accept a licence, or
contact a distribution service. A real run requires all of the following supplied by the
operator:

1. A checked-out server fixture and dependencies whose licences the operator has already
   reviewed.
2. A licence-consent file passed with `--accept-licenses`; the harness never creates or
   edits that file.
3. A filled version matrix with exact game, loader, and server versions, sourced from the
   vendored upstream revision.
4. A local artifact index emitted by `tools/describe-jars.mjs`, plus the six local jars.

The contract intentionally ships empty version arrays. Guessing a loader or game version
would turn a green smoke report into false compatibility evidence. Populate those arrays
from the exact vendored BlueMap source revision before an authorised run.

## Commands

```text
node tools/server-adapter-smoke/smoke.mjs --plan
node tools/server-adapter-smoke/smoke.mjs --config tools/server-adapter-smoke/run-config.json --execute --accept-licenses C:\path\to\reviewed-licenses.json
```

`--plan` validates the contract shape and prints every required case for each adapter. It
does not inspect or start a server. `--execute` creates one temporary directory per adapter,
copies the already-reviewed jar into the loader's install directory, starts the configured
server command, probes the configured endpoint, checks generated configuration and render
sentinels, stops and restarts the process, then runs each negative case in a fresh directory.
All child processes are killed in a `finally` path and no server data is retained unless an
explicit `report` path is supplied.

## Run configuration

`run-config.example.json` is a schema-shaped template, not a runnable fixture. Each adapter
must provide a local command, arguments, endpoint, discovery marker, config marker, render
request and negative-case fixtures. Commands are arrays rather than shell strings: the
harness never invokes a shell or accepts arbitrary command concatenation. The endpoint must
be loopback and the configured render request must be local to that server.

Reports contain start/end timestamps, duration, exit codes, bounded stdout/stderr tails,
resource samples, exact source SHA, jar path, jar SHA-256, and the expected/observed case
results. They deliberately omit world paths, usernames, licence contents, tokens, and
private server data.

## Evidence rules

The harness will not call a jar “tested” unless the artifact index and the local bytes agree
on implementation, version, source SHA, and SHA-256. A missing hash, an index/source mismatch,
an empty version matrix, a non-loopback endpoint, or a missing negative-case fixture is a
hard failure. This is a smoke harness contract only; it is not evidence that a run happened
until an operator supplies a report from `--execute`.
