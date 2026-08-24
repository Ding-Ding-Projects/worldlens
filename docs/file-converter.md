# Local file converter

The desktop converter starts with a native file picker and detects the input from bounded byte signatures. It does not trust a filename extension, a PATH executable, or a network service.

## Catalog and missing adapters

The catalog is grouped into Documents/PDF, Images, Audio, Video, Archives, Structured data/Spreadsheets, Code/Text, and Binary Encodings. Every known adapter remains visible. An adapter is enabled only when its bundled artifact is present and verified by the application. A missing adapter is disabled in place with the exact reason and never becomes a manual-install task.

## Queue and outputs

The queue stores versioned records beside application data, supports pause, resume, cancellation and restart recovery, and uses bounded concurrency. It does not impose a total-file limit. Each result records converted, skipped, cancelled or failed state, bytes and the reason. The output path is user-selected, lossy changes are disclosed before execution, and the source is never overwritten silently.

PDF operations are exposed by the adapter boundary as inspect, split, merge, extract, reorder, rotate and metadata. An operation that is not backed by the bundled adapter refuses before writing. PDF inspection validates `%PDF-` and `%%EOF`; output writes use a unique temporary sibling and an atomic replacement. The desktop surface provides the route to open a result in Visual Studio Code.

## Verification

`src/main/converter/registry.test.ts` proves byte detection, all eight categories, disabled reasons and the enabled-without-bundled-proof regression. `queue.test.ts` proves durable records, bounded concurrency and cancellation. `operations.ts` refuses unsupported mutation instead of fabricating output.
