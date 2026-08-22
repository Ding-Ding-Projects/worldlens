/**
 * Synthesises a real, typed control for a key that has no hand-written schema entry.
 *
 * This is the guarantee that closes the loop the "no-text-box" guard checks: even a
 * plugin config nobody has ever written `FieldMeta` for gets something better than a raw
 * text box, inferred from what the value actually looks like. A field only falls through
 * to `text` when nothing more specific fits - and that fallback is badged `guessed` so the
 * GUI can say plainly "we don't know what this is" instead of pretending the free-text box
 * was a deliberate design choice.
 */

import type { Control } from "@worldlens/config";

export interface InferredField {
    readonly control: Control;
    /** True when this control was guessed from the value rather than hand-authored. */
    readonly guessed: true;
}

const PORT_KEY = /port$/i;
const COLOR_HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const MINECRAFT_COLOR_CODE = /§[0-9a-fk-orA-FK-OR]/;

function inferScalar(key: string, value: unknown, siblingEnum: readonly string[] | undefined): Control {
    if (typeof value === "boolean") return { kind: "switch" };

    if (typeof value === "number") {
        if (PORT_KEY.test(key)) return { kind: "number", integer: true, min: 1, max: 65535 };
        if (Number.isInteger(value)) {
            // Widen generously around the observed value: an inferred bound is a fence
            // against fat-fingering, not a claim about what the plugin actually accepts.
            const magnitude = Math.max(64, Math.abs(value) * 4);
            return { kind: "number", integer: true, min: -magnitude, max: magnitude };
        }
        return { kind: "number", integer: false, step: 0.1 };
    }

    if (typeof value === "string") {
        if (COLOR_HEX.test(value) || MINECRAFT_COLOR_CODE.test(value)) {
            return { kind: "color", alpha: value.length === 9 };
        }
        if (siblingEnum !== undefined && siblingEnum.includes(value)) {
            return { kind: "select", options: siblingEnum.map((v) => ({ value: v, label: v })), allowCustom: false };
        }
        return { kind: "text", multiline: value.includes("\n") };
    }

    return { kind: "text" };
}

/**
 * Infers a control for one key. `siblings` is every other value observed for the same key
 * across the corpus this document was drawn from (multiple worlds' copies of the same
 * plugin config, for instance) - when every sibling value is drawn from a small closed set,
 * the field is offered as a select with those values as options rather than free text.
 */
export function inferField(key: string, value: unknown, siblings: readonly unknown[] = []): InferredField {
    if (Array.isArray(value) && value.every((item) => typeof item !== "object" || item === null)) {
        return { control: { kind: "list", item: inferScalar(key, value[0] ?? "", undefined), itemLabel: key, unique: false }, guessed: true };
    }
    if (Array.isArray(value)) {
        // Array of like objects: represented as a record table via key-value on the
        // stringified rows, since `Control` has no dedicated "table of objects" kind and
        // `key-value` is the closest structural fit among the twelve shipped kinds.
        return { control: { kind: "key-value", keyLabel: "Index", valueLabel: "Value", secretKeys: [] }, guessed: true };
    }

    const siblingStrings = siblings.filter((v): v is string => typeof v === "string");
    const uniqueSiblings = Array.from(new Set(siblingStrings));
    const siblingEnum = typeof value === "string" && uniqueSiblings.length > 1 && uniqueSiblings.length <= 8 ? uniqueSiblings : undefined;

    return { control: inferScalar(key, value, siblingEnum), guessed: true };
}
