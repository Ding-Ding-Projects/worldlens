import type { FieldMeta } from "@worldlens/config";
import { boundedInt, field, select, text } from "./schemaHelpers.js";

/** Forge's documented server-side extension keys. Unknown mod keys remain inferred. */
export const forgeFields: readonly FieldMeta[] = [
    field({ path: "forge.server.allow-flight", label: "Forge allow flight", doc: "Whether Forge's server hooks permit flight checks to be bypassed for supported mods.", control: { kind: "switch" }, default: false, group: "forge" }),
    field({ path: "forge.server.permission-level", label: "Forge permission level", doc: "Default permission level exposed to Forge server-side permission hooks.", control: boundedInt(0, 4, "level"), default: 4, group: "forge", advanced: true }),
    field({ path: "forge.server.max-tick-time", label: "Forge watchdog tick limit", doc: "Maximum tick duration before Forge's watchdog reports a stalled server, in milliseconds.", control: boundedInt(0, 2147483647, "ms"), default: 60000, group: "forge", advanced: true }),
    field({ path: "forge.logging.console-level", label: "Forge console log level", doc: "Minimum level for Forge diagnostics written to the server console.", control: select([{ value: "error", label: "Error" }, { value: "warn", label: "Warning" }, { value: "info", label: "Info" }, { value: "debug", label: "Debug" }, { value: "trace", label: "Trace" }], true), default: "info", group: "forge", advanced: true }),
    field({ path: "forge.logging.markers", label: "Forge log markers", doc: "Comma-separated Forge logging markers to enable; modpacks may add their own marker names.", control: text(), default: "", group: "forge", advanced: true }),
];
