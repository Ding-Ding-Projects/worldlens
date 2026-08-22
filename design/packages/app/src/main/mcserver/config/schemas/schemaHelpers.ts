/**
 * Shared field-builder helpers for hand-written flavour schemas.
 *
 * Every flavour schema (`serverProperties.ts`, `paperGlobal.ts`, `spigot.ts`, `purpur.ts`,
 * ...) wants the same handful of `Control` shapes - a bounded integer, a port, a closed
 * select, a text field - so they are built once here instead of once per file. A field
 * whose path has dots (`"proxies.velocity.enabled"`) is nested YAML, and `segments` is
 * derived from it automatically rather than repeated by hand at every call site, which is
 * exactly the kind of drift a hand-written duplicate `segments` array invites.
 */

import type { Control, FieldMeta } from "@worldlens/config";

export type FieldDraft = Pick<FieldMeta, "path" | "label" | "doc" | "control" | "default"> &
    Partial<Pick<FieldMeta, "group" | "advanced" | "secret" | "key" | "segments">>;

export function field(partial: FieldDraft): FieldMeta {
    const segments = partial.segments ?? partial.path.split(".");
    const key = partial.key ?? (segments[segments.length - 1] ?? partial.path);
    return {
        segments,
        key,
        javaField: key,
        group: partial.group ?? "general",
        commentedOutInTemplate: false,
        hidden: false,
        invalidatesTiles: false,
        advanced: partial.advanced ?? false,
        secret: partial.secret ?? false,
        ...partial,
    };
}

export function boundedInt(min: number, max: number, unit?: string): Control {
    return unit === undefined ? { kind: "number", integer: true, min, max } : { kind: "number", integer: true, min, max, unit };
}

export function port(): Control {
    return boundedInt(1, 65535);
}

export function select(options: readonly { readonly value: string; readonly label: string }[], allowCustom = false): Control {
    return { kind: "select", options, allowCustom };
}

export function text(multiline = false): Control {
    return { kind: "text", multiline };
}

export function ticks(min = 0, max = 2147483647): Control {
    return boundedInt(min, max, "ticks");
}

export function ms(min = 0, max = 2147483647): Control {
    return boundedInt(min, max, "ms");
}
