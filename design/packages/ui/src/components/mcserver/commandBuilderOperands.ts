export interface RegistryData { values: Record<string, string[]>; blocks: Record<string, { properties: Record<string, string[]> }>; tags: Record<string, string[]> }
export interface ParserControl { parser: string; control: string; properties: Record<string, unknown> | null; reason?: string }
export interface TypedOperand { kind: string; [key: string]: unknown }
export function initialOperand(control: string, player?: string): TypedOperand {
    switch (control) {
        case "entity": return { kind: "entity", player: player ?? "" };
        case "block": return { kind: "block", id: "", properties: {} };
        case "item": case "resource": return { kind: control, id: "" };
        case "range": return { kind: "range" };
        case "rotation": return { kind: "rotation", yaw: 0, pitch: 0 };
        case "nbt": return { kind: "nbt", value: { type: "compound", values: {} } };
        default: return { kind: control };
    }
}
export function operandRegistry(parser: ParserControl): string {
    if (parser.control === "block") return "minecraft:block";
    if (parser.control === "item") return "minecraft:item";
    return typeof parser.properties?.registry === "string" ? parser.properties.registry : "";
}
export const typedOperandControls = new Set(["entity", "block", "item", "resource", "range", "rotation"]);
