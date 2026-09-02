# Minecraft Java version catalogue

## Behaviour

The New server wizard reads Java Edition version identity from Mojang's canonical
`version_manifest_v2.json` at the main-process boundary. It keeps every manifest entry whose
type is `release` or `snapshot`, including older releases and snapshots, and does not silently
replace a large manifest with a newest-25 sample. Each exact entry keeps its published release
time, Java requirement, and server download when Mojang published one.

The version step separates releases and snapshots, then groups exact rows into collapsible
families such as `1.21.x`, `1.20.x`, `26.3 snapshots`, and year-based weekly snapshot families.
Family counts are counts of the exact entries in that family. The newest release family is marked
Recommended, and the newest exact entry is shown in the family header. Search filters exact rows
first, so a matching family opens as a useful result without changing the user's saved collapsed
or expanded preference.

The list renders 500 exact rows per page. A large catalogue remains complete in the cache and
search, while the UI avoids mounting thousands of controls at once. The page controls state the
filtered count, and moving to the next page reveals older matching rows instead of hiding them.
Rows with no published server artifact stay visible but disabled with the exact reason.

## Configuration and persistence

The main process stores the catalogue in `mcserver-catalogue.v1.json` inside the app data folder.
The cache carries a shape number, fetched timestamp, a stable SHA-256 digest of Mojang's raw
canonical manifest, and per-flavour failure facts. A fresh cache is served without a
network request. An expired cache attempts a refresh, then remains usable and visibly stale when
the refresh cannot complete. A partially refreshed flavour keeps its prior rows and exposes its
last fetched timestamp and failure reason. Cache reads validate nested records, timestamps,
duplicate version identifiers, digest fields, and every stored HTTPS URL before any row is returned.

Family expansion is a renderer preference stored under
`worldlens.mcserver.version-families.v1:<flavour>` in local browser storage. It is keyed by
stability and family name, so a search never destroys the user's normal layout choice.

## Wiki actions

Every exact row has a Wiki action. The main process owns a bounded Wiki verification cache and
checks a selected article with a timeout-limited HEAD request, falling back to GET when the server
does not support HEAD. A 403, 408, or 429 remains offline-unverified rather than being called
unavailable. `versionPresentation.ts` derives only HTTPS URLs from the exact
version identifier and refuses empty, path-like, or unsafe identifiers. Numbered releases use the
`Java_Edition_<version>` title convention; snapshots use their own exact title. The action labels
one of three honest states: Wiki article verified, Wiki article unavailable, or Wiki link not
checked offline. A cached link is never described as verified merely because its URL looks right.

## Failure modes and security

All requests are HTTPS-only, bounded to a 15-second timeout, and rejected when their response is
larger than the configured limit. The manifest and each version detail are validated before use,
including the required versions array and HTTPS detail and download URLs. Invalid JSON, an
oversized response, a missing server artifact, and an upstream outage remain visible facts. The
renderer never fetches Mojang or wiki content directly. It receives only the validated snapshot
through the Electron bridge.

The catalogue cache is written atomically. An older cache shape is refused and refreshed rather
than being upgraded by guessing missing fields. Other server flavours retain their existing
project APIs and independent failure handling, so Paper, Purpur, Spigot, Fabric, Forge, NeoForge,
Velocity, and the local, container, SSH, and AWS compatibility facts are not hidden by a Mojang
refresh problem.

## Verification

- `packages/app/src/main/mcserver/flavours/catalogue.test.ts` covers the canonical response shape,
  every flavour, source revision, cache fallback, a large release and snapshot manifest,
  malformed schema, oversized responses, and the deliberate old-cache rejection.
- `packages/ui/src/components/mcserver/wizardModel.test.ts` covers family grouping, exact counts,
  latest and Recommended labels, fallback families, plain search, regex search, and invalid
  regexes.
- `packages/ui/src/components/mcserver/versionPresentation.test.ts` covers representative old,
  modern, patch, build-suffixed, snapshot, unsafe, and verified or unavailable wiki states.
- Representative internet checks on 2026-08-24 returned HTTP 200 for
  `https://minecraft.wiki/w/Java_Edition_1.21.4`,
  `https://minecraft.wiki/w/Java_Edition_1.20.1`, and `https://minecraft.wiki/w/24w14a` with a
  normal browser user agent. The checked responses are evidence for the canonical mapping, not a
  promise that every newly published article exists.

Suggested articles: [Minecraft server manager](./minecraft-server-manager.md),
[Minecraft server configuration](./mcserver-config.md),
[Minecraft server transport](./mcserver-transport.md), and
[Java runtime provisioning](./java-runtime-provisioning.md).
