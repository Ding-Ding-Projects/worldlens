import type { FieldMeta } from "@worldlens/config";
import { boundedInt, field, select, text } from "./schemaHelpers.js";

/** Stable Fabric server.properties additions exposed by Fabric API/server. */
export const fabricFields: readonly FieldMeta[] = [
    field({ path: "fabric-api.networking.max-packet-size", label: "Fabric max packet size", doc: "Maximum payload size accepted by Fabric networking channels, in bytes.", control: boundedInt(256, 2097152, "bytes"), default: 1048576, group: "fabric", advanced: true }),
    field({ path: "fabric-api.networking.max-channels", label: "Fabric max networking channels", doc: "Maximum number of custom networking channels a client may register.", control: boundedInt(1, 65535, "channels"), default: 256, group: "fabric", advanced: true }),
    field({ path: "fabric-api.lifecycle.server-start", label: "Fabric server-start lifecycle", doc: "Whether Fabric API emits the server-start lifecycle callback for compatible mods.", control: { kind: "switch" }, default: true, group: "fabric", advanced: true }),
    field({ path: "fabric-api.lifecycle.server-stop", label: "Fabric server-stop lifecycle", doc: "Whether Fabric API emits the server-stop lifecycle callback for compatible mods.", control: { kind: "switch" }, default: true, group: "fabric", advanced: true }),
    field({ path: "fabric.loader.log-level", label: "Fabric loader log level", doc: "Minimum level for Fabric loader diagnostics written during server startup.", control: select([{ value: "error", label: "Error" }, { value: "warn", label: "Warning" }, { value: "info", label: "Info" }, { value: "debug", label: "Debug" }], true), default: "info", group: "fabric", advanced: true }),
    field({ path: "fabric.loader.extra-args", label: "Fabric loader extra arguments", doc: "Additional loader arguments supplied to the server process; values remain free text because mods may define their own flags.", control: text(), default: "", group: "fabric", advanced: true }),
];
