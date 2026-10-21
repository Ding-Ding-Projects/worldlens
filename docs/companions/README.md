# Companion content preparation

The proposed offline guide is not yet a built application or portable executable. Its content
preparation helper inventories every nested Markdown article under `docs/` and every Markdown
article in the separately acquired wiki. Complete article text, SHA-256 hashes, source revisions,
distinct `/docs/` and `/wiki/` routes, heading anchors, internal link targets and referenced local
asset bytes form a deterministic JSON manifest. It does not execute article content.

Run `node scripts/guide-content/prepare.mjs --repository <checkout> --wiki <wiki-checkout>
--report <external-report.json> --output <external-bundle.json>` as one command. The wiki must be
available at revision `0b66c19306add3a090fc70ad08f1d785b49794f7`. The explicit
`--wiki-revision <full-commit-sha>` option selects another reviewed immutable snapshot. The helper uses the existing `marked`
dependency declared by the viewer package; `--toolchain <checkout>` can select an already installed
toolchain from another checkout. It installs nothing, performs no network requests, and never
substitutes for the root build or installer scripts. Both output paths must have existing parents
outside the source checkouts, and existing files are never overwritten.

The report is an inventory, not delivery proof. Missing articles, anchors or assets, symlinks,
escaping paths, route collisions, remote images and unsupported embedded HTML prevent a complete
bundle. External ordinary links are labeled separately and require deliberate activation in the
future renderer. Markdown remains untrusted: the eventual application must use its existing
sanitized renderer and resolve navigation/assets through the manifest, never execute raw HTML or
fetch resources directly from article text. The HTML subset explicitly allows `details`, `summary`, `b`, `strong`, `em`, `i`, `code`,
`kbd`, `br`, `hr`, `span`, `p`, `a` and `img`. Global attributes are only `id` and `title`;
`details` additionally accepts `open`, `a` accepts `href`, and `img` accepts `src`, `alt`,
`width` and `height`. Values must be quoted, except the boolean `open` attribute. Entity
escapes in attributes, executable/event attributes, styles, unknown attributes and unsupported
elements are rejected rather than stripped. Images require alt text. Tags and nesting are
bounded, containers must balance, and explicit IDs must be unique. HTML links and images use
the same route, anchor, traversal and offline-asset checks as Markdown. Leading or trailing
ASCII whitespace in URLs is rejected before scheme or local-path classification; interior
spaces in valid article and asset paths remain supported. Comments accept only
plain comment text. SVG and other active asset
formats require a separately reviewed offline adapter. Wiki-specific double-bracket links are
reported as unsupported rather than silently omitted.

Bounds are 10,000 source files per root, 4 MiB per article and 512 MiB of total retained input.
The CLI reads only tracked blobs from the documentation HEAD object tree and selected wiki
object tree. Changed working files, ignored files and untracked files never enter the bundle,
including referenced assets. Symlinks and submodule entries in either source tree are rejected.
Every Git read disables replacement refs and lazy fetch, discards inherited Git object/config
routing overrides, disables global/system configuration and transport protocols, and uses a
15-second timeout with bounded output. Missing objects fail rather than fetching. Source
revisions, source links and content hashes therefore refer to the same immutable bytes.
Heading identifiers are allocated uniquely across the complete article, including collisions
between naturally suffixed headings and generated suffixes. A successful preparation still requires
publication review before any wiki snapshot or generated content enters tracked public source.
The existing public website remains unchanged.

Focused verification: `node --test scripts/guide-content/prepare.test.mjs`. An existing alternate
toolchain can be selected with `GUIDE_TOOLCHAIN_ROOT`. Fixtures cover complete nested text,
reference images, duplicate heading anchors, deterministic output, distinct namespaces, external
assets, missing targets, traversal, symlinks, collisions and output protection. Real-source
inventory reports are kept outside the checkout, because their content has not passed publication
review. Current offline content completeness, rendered navigation, accessibility, packaging,
one-file launch and release delivery remain unverified.

Repository-relative links may leave `docs/` but must remain within the pinned repository
root. Referenced Markdown is retained in full under `/supplemental/`, recursively and with
cycle deduplication; its links, anchors, HTML and assets receive the same validation. New
problems in these articles remain diagnostics. Optional code, data and directory references
carry pinned object identities and explicitly labeled external source links requiring
connectivity. The reviewed BlueMap source reference uses the parent tree's submodule pin and
local object database, never the checked-out submodule revision. Missing objects are failures.
Source roots must be exact real repository roots: nested directories and symlink aliases
are rejected. Object listings use full-tree paths, and subsequent blob reads use the same
explicit object database. The separate submodule adapter accepts an exact real object-database
directory rather than treating its administrative directory as a documentation root.

Exactly three reviewed historical wiki image URLs have an offline adapter in
`scripts/guide-content/repository-resolver.mjs`. Their full revisions, paths and blob identities
must match locally available objects. The manifest retains their original source URLs and
identities beside the bundled bytes. No network acquisition occurs; other external images
remain unsupported. These historical images are not evidence of a current application build.

Heading preparation follows the documented per-space fragment rule: each ASCII space becomes
one hyphen after punctuation removal, while inline formatting contributes its text. Unicode
letters, numbers and combining marks are retained. Unique IDs are allocated across the article,
including natural suffix collisions. The manifest records each heading's assigned ID and a
compatibility mapping for the existing viewer's whitespace-collapsing IDs. Internal links using
an unambiguous compatibility ID normalize to the assigned ID. A fragment that could select two
different headings produces `ambiguous-anchor`, never a guessed destination. The companion
renderer must apply these explicit assignments; the existing product viewer is unchanged and
its collapsing behavior is not proof of companion navigation. These rules implement the bounded
heading cases tested here, not a claim of complete Markdown-renderer parity.
