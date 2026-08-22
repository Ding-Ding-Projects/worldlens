import type { FieldMeta } from "@worldlens/config";
import { boundedInt, field, select, text } from "./schemaHelpers.js";

/** NeoForge server extension keys; mod-defined keys continue through inference. */
export const neoforgeFields: readonly FieldMeta[] = [
    field({ path: "neoforge.server.allow-flight", label: "NeoForge allow flight", doc: "Whether NeoForge server hooks permit flight checks to be bypassed for supported mods.", control: { kind: "switch" }, default: false, group: "neoforge" }),
    field({ path: "neoforge.server.permission-level", label: "NeoForge permission level", doc: "Default permission level exposed to NeoForge permission hooks.", control: boundedInt(0, 4, "level"), default: 4, group: "neoforge", advanced: true }),
    field({ path: "neoforge.server.max-tick-time", label: "NeoForge watchdog tick limit", doc: "Maximum tick duration before NeoForge's watchdog reports a stalled server, in milliseconds.", control: boundedInt(0, 2147483647, "ms"), default: 60000, group: "neoforge", advanced: true }),
    field({ path: "neoforge.logging.console-level", label: "NeoForge console log level", doc: "Minimum level for NeoForge diagnostics written to the server console.", control: select([{ value: "error", label: "Error" }, { value: "warn", label: "Warning" }, { value: "info", label: "Info" }, { value: "debug", label: "Debug" }, { value: "trace", label: "Trace" }], true), default: "info", group: "neoforge", advanced: true }),
    field({ path: "neoforge.logging.markers", label: "NeoForge log markers", doc: "Comma-separated NeoForge logging markers to enable; modpacks may add their own marker names.", control: text(), default: "", group: "neoforge", advanced: true }),
];
