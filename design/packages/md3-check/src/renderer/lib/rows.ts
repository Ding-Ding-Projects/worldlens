/**
 * The coverage manifest: every component this instrument's brief names as worth checking
 * (`packages/ui`'s own component-frequency inventory - see the scout report this app was
 * built from), each marked either `"implemented"` (there is a real row for it in
 * `RowsGallery.vue`, and the capture JSON will carry real measurements for it) or
 * `"planned"` (there is not, yet, and the reason is stated here rather than left silent).
 *
 * This exists because a completeness list that only ever describes what already got built
 * cannot fail: nothing checks it against what was *supposed* to get built, so it silently
 * stops meaning anything the moment someone adds a ninth Vuetify component to the product
 * without adding a matching row here. Every id below is checked against `RowsGallery.vue`'s
 * real `data-md3-row` attributes by `rows.test.ts`, in both directions - an id marked
 * `"implemented"` with no matching row fails the test, and so does a row in the gallery with
 * no matching entry here. See that file for the enforcement; this file is only the data.
 */

export type RowStatus = "implemented" | "planned";

export interface RowManifestEntry {
    readonly id: string;
    /** The Vuetify component this row's "Worldlens" pane renders. */
    readonly vuetifyComponent: string;
    readonly status: RowStatus;
    /** Required when `status` is `"planned"`: why this instrument does not check it yet. */
    readonly plannedReason?: string;
    /** Optional even when `status` is `"implemented"`: a caveat worth surfacing regardless (see `alert` below). */
    readonly caveat?: string;
}

export const ROW_MANIFEST: readonly RowManifestEntry[] = [
    { id: "button-filled", vuetifyComponent: "v-btn", status: "implemented" },
    { id: "button-outlined", vuetifyComponent: "v-btn", status: "implemented" },
    { id: "button-text", vuetifyComponent: "v-btn", status: "implemented" },
    { id: "chip-assist", vuetifyComponent: "v-chip", status: "implemented" },
    { id: "card-elevated", vuetifyComponent: "v-card", status: "implemented" },
    { id: "text-field-outlined", vuetifyComponent: "v-text-field", status: "implemented" },
    { id: "switch", vuetifyComponent: "v-switch", status: "implemented" },
    { id: "checkbox", vuetifyComponent: "v-checkbox", status: "implemented" },
    { id: "radio", vuetifyComponent: "v-radio", status: "implemented" },
    { id: "list-item", vuetifyComponent: "v-list-item", status: "implemented" },
    { id: "progress-linear", vuetifyComponent: "v-progress-linear", status: "implemented" },
    { id: "progress-circular", vuetifyComponent: "v-progress-circular", status: "implemented" },
    { id: "divider", vuetifyComponent: "v-divider", status: "implemented" },
    { id: "icon", vuetifyComponent: "v-icon", status: "implemented" },
    {
        id: "alert",
        vuetifyComponent: "v-alert",
        status: "implemented",
        caveat:
            "Material 3 does not define an \"Alert\" component at all. This row's reference pane is a " +
            "documented nearest-analogue, not a spec transcription - see its own citation text in " +
            "RowsGallery.vue and the honesty banner at the top of the app.",
    },
    {
        id: "tooltip",
        vuetifyComponent: "v-tooltip",
        status: "planned",
        plannedReason: "Not yet built. Would need to measure a transient, hover/focus-triggered overlay rather than a static row - the row-shell/measure.ts machinery here assumes an always-present element.",
    },
    {
        id: "select",
        vuetifyComponent: "v-select",
        status: "planned",
        plannedReason: "Not yet built. Shares v-text-field's outlined-field shape when closed; its distinct M3 surface is the open menu list, which needs the same overlay-measurement work v-menu does below.",
    },
    {
        id: "menu",
        vuetifyComponent: "v-menu",
        status: "planned",
        plannedReason: "Not yet built. An overlay teleported to <body> on open, outside this app's fixed two-column layout - needs its own capture step that opens it before measuring, which this instrument's static rows do not yet support.",
    },
    {
        id: "dialog",
        vuetifyComponent: "v-dialog",
        status: "planned",
        plannedReason: "Not yet built. Same overlay/teleport gap as v-menu, plus a scrim to account for in any screenshot.",
    },
    {
        id: "slider",
        vuetifyComponent: "v-slider",
        status: "planned",
        plannedReason: "Not yet built. M3's slider spec (handle, active/inactive track, optional tick marks) is a genuinely separate shape and interaction model from every row implemented so far and was cut for time, not by design.",
    },
    {
        id: "btn-toggle",
        vuetifyComponent: "v-btn-toggle",
        status: "planned",
        plannedReason: "Not yet built. Cut for time; it is a real, distinct M3 shape (a segmented button group) that COMPONENT_DEFAULTS overrides specifically (see vuetify.ts's VBtnGroup entry), which makes it a genuinely useful future row, not a redundant one.",
    },
    {
        id: "textarea",
        vuetifyComponent: "v-textarea",
        status: "planned",
        plannedReason: "Not yet built. Shares v-text-field's shape/type/colour contract closely enough that the marginal coverage was judged lower priority than the rows above; cut for time.",
    },
] as const;

export function implementedRows(): readonly RowManifestEntry[] {
    return ROW_MANIFEST.filter((r) => r.status === "implemented");
}

export function plannedRows(): readonly RowManifestEntry[] {
    return ROW_MANIFEST.filter((r) => r.status === "planned");
}
