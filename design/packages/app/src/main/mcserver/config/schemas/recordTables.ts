import type { Control, FieldMeta, RecordTableColumn } from "@worldlens/config";

const textColumn = (key: string, label: string, required = false): RecordTableColumn => ({ key, label, required, control: { kind: "text", monospace: key === "uuid" || key === "ip" } });
const numberColumn = (key: string, label: string): RecordTableColumn => ({ key, label, control: { kind: "number", integer: true, min: 0, max: 4 } });

function records(label: string, doc: string, columns: readonly RecordTableColumn[], uniqueBy = "uuid"): FieldMeta {
    const control: Control = { kind: "record-table", columns, uniqueBy };
    return { path: "records", key: "records", segments: [], javaField: "records", label, doc, group: "records", control, default: [], commentedOutInTemplate: false, hidden: false, invalidatesTiles: false, advanced: false, secret: false };
}

export const opsFields: readonly FieldMeta[] = [records("Operators", "Typed operator records from ops.json. Names and UUIDs are editable columns; level is the vanilla operator permission level and bypassPlayerLimit controls the operator's player-limit bypass.", [textColumn("name", "Name", true), textColumn("uuid", "UUID", true), numberColumn("level", "Level"), { key: "bypassesPlayerLimit", label: "Bypasses player limit", control: { kind: "switch" } }])];
export const whitelistFields: readonly FieldMeta[] = [records("Whitelist", "Typed player records from whitelist.json, preserving the server's name and UUID columns.", [textColumn("name", "Name", true), textColumn("uuid", "UUID", true)])];
export const bannedPlayersFields: readonly FieldMeta[] = [records("Banned players", "Typed player-ban records from banned-players.json. Dates are retained as text because servers write either ISO timestamps or the literal never.", [textColumn("name", "Name", true), textColumn("uuid", "UUID", true), textColumn("created", "Created"), textColumn("source", "Source"), textColumn("expires", "Expires"), textColumn("reason", "Reason")])];
export const bannedIpsFields: readonly FieldMeta[] = [records("Banned IP addresses", "Typed IP-ban records from banned-ips.json. The address, dates, source and reason remain separate editable columns.", [textColumn("ip", "IP address", true), textColumn("created", "Created"), textColumn("source", "Source"), textColumn("expires", "Expires"), textColumn("reason", "Reason")], "ip")];
