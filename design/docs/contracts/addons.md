# JavaScript/ESM add-ons

The server package exposes a versioned, least-privilege add-on contract through
`@worldlens/server`. An add-on directory contains an `addon.json` manifest and a local
entry module. The current manifest and API versions are `1`; incompatible versions are
rejected before the entry point is read.

```json
{
  "manifestVersion": 1,
  "id": "example-markers",
  "name": "Example markers",
  "version": "1.0.0",
  "apiVersion": "1",
  "entry": "index.mjs",
  "capabilities": ["markers"],
  "dependencies": {},
  "conflicts": []
}
```

`AddonRegistry` discovers local packages in lexical order, records SHA-256 provenance
for the manifest and entry, rejects duplicate IDs, missing dependencies, conflicts and
dependency cycles, and returns a deterministic dependency-first load order. Safe mode
returns no loadable add-ons. Discovery diagnostics are retained for the manager UI.

`SandboxedAddonRuntime` currently fails closed as a non-executing inspector. Node's permission
model does not provide the required network boundary, so a Node child/vm wrapper is not treated
as a sandbox. The inspector bounds and reads the entry only to produce diagnostics; it never
evaluates package code. Enabling an add-on remains disabled with an explicit diagnostic until a
bundled non-Node isolate (with memory and interrupt limits, a confined ESM loader, and no host
globals/network/filesystem/process access) is available. This is deliberate: unavailable secure
execution is safer than a false sandbox claim.

The runtime intentionally does not treat add-ons as trusted application code. Future hooks
must be added as narrow, serializable messages on the worker boundary and must preserve the
same timeout, memory, capability-consent and failure-isolation rules. Package updates should
be staged beside the current directory and swapped only after manifest validation and a
successful startup; the registry provenance hashes make that transition auditable.
