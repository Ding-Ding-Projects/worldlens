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
fetch resources directly from article text. Inline HTML beyond comments, line breaks, horizontal
rules and simple details/summary containers is currently unsupported. SVG and other active asset
formats require a separately reviewed offline adapter. Wiki-specific double-bracket links are
reported as unsupported rather than silently omitted.

Bounds are 10,000 source files per root, 4 MiB per article and 512 MiB of total retained input.
The CLI reads only tracked blobs from the documentation HEAD object tree and selected wiki
object tree. Changed working files, ignored files and untracked files never enter the bundle,
including referenced assets. Symlinks and submodule entries in either source tree are rejected.
Source revisions, source links and content hashes therefore refer to the same immutable bytes.
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
