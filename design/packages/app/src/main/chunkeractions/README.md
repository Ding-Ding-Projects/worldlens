# Chunker conversion dispatch

The conversion wizard's GitHub Actions route uses the existing main-process GitHub CLI account broker. Account and repository choices are read from that broker. Credentials do not enter the renderer or conversion configuration.

The user prepares the bundled `chunk-world.yml` workflow, explicitly authorizes the world upload, and separately acknowledges public visibility when applicable. The uploader uses the existing backup archive and 500 MiB content-addressed parts. Its pointer is published last. The workflow streams and verifies every part and the complete archive before extracting it.

All seven Chunker JSON groups are transported as one bounded `chunker-config` input. The operation identity appears in the run name, so progress lookup does not adopt a neighboring dispatch. Saved local records support upload resumption, run lookup after restart, cancellation requests and later collection. A dispatch acknowledgement is not a completed conversion. Collection requires a successful run, one unexpired result, a matching published SHA-256 and a new output directory.

Java output with identity dimension mappings uses region shards. Pruning intersects inclusion rectangles or subtracts exclusion rectangles from the shard geometry. Other dimensions are explicitly excluded from each shard. Empty pruning lists retain Chunker's own unrestricted meaning; an empty intersection is represented by a full-range exclusion. Resume identity covers actual region coordinates and the configuration.

Bedrock output and dimension remapping use one whole-world conversion because copying Anvil region files cannot merge LevelDB or redirected dimensions safely. That path has the hosted machine's memory and storage limits and can fail on a large world. It is not evidence of bounded-memory support for those targets.

The local converter probes its selected jar for the actual supported formats, options and version, and binds the result to that jar's SHA-256. Original-NBT preservation additionally runs a main-owned SETTINGS inspection and requires the exact reported source format to match the target. The GitHub workflow runs the explicitly pinned Chunker 1.19.1 jar.

## Verification boundary

Focused tests cover configuration serialization, pruning algebra, local IPC and the batch machinery. Component compilation checks the new controls. Acceptance still requires driving the real packaged application, choosing a source and destination, preparing a repository, dispatching, observing its real run and collecting the resulting world. Source checks and component compilation do not prove that end-to-end interaction.

The Docker and SSH route panels invoke the real container adapter. It reuses saved-target validation, the existing strict SSH trust store and preflight, and rsync/SCP transfer selection. A named task container has no network, a read-only source and jar, a writable task staging mount, and a user-selected 2 through 64 GiB memory limit. Cancellation targets that exact container. Each operation has a one-hour deadline. These routes convert the whole world in one JVM and therefore do not promise that every large world fits their memory limit. Returned output is checked structurally before being moved to the new destination. Remote staging is deliberately retained and named for recovery.

The source-settings inspection runs the selected jar's SETTINGS writer and loads every reported setting into the structured editor. Integer settings outside JavaScript's safe-number range remain exact decimal strings, including 64-bit seeds. Empty templates never silently apply, and actual setting names remain the converter's own identifiers.
