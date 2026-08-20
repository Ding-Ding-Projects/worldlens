<script setup lang="ts">
/**
 * Kid mode's job strip: **`WorkPane` re-hosted, never re-implemented.**
 *
 * `WorkPane` already builds the page list, the three seeded groups and the pinned set from
 * `jobRegistry.ts`, filters capability-gated jobs out entirely, and forwards every named slot the
 * host gave it straight through to `TabbedNavigation`. Kid mode therefore adds exactly two things:
 *
 *  1. **Kid labels**, supplied through `TabbedNavigation`'s runtime presentation-label map. The
 *     saved workspace keeps shipped and user-renamed labels untouched, while every open tab,
 *     including one opened after mount, searches and renders the current Kid label. Language,
 *     label style and the live Renders count are reactive inputs to that map.
 *  2. **Kid sizing**, as CSS on this wrapper only: 64px minimum chip height and the two-line chip.
 *
 * Everything else is untouched and therefore still true: docking left/right/top/bottom, groups,
 * pinning, drag reorder, overflow, the four discovery searches, bulk close with preview, the
 * context menu and workspace persistence. `scripts/test-tab-contract.mjs` passes unchanged.
 */
import { computed, ref } from "vue";
import WorkPane from "../components/shell/WorkPane.vue";
import { JOB_DEFINITIONS } from "../components/shell/jobRegistry.js";
import { KID_JOB_LABELS, kidLabel } from "./kidLabels.js";
import { useKidMode } from "./kidMode.js";

const props = defineProps<{ runningRenderCount?: number }>();
const emit = defineEmits<{ workspaceChange: [pageIds: readonly string[]] }>();

const kid = useKidMode();
const pane = ref<InstanceType<typeof WorkPane> | null>(null);

const presentationLabels = computed<Readonly<Record<string, string>>>(() =>
    Object.fromEntries(
        JOB_DEFINITIONS.map((job) => {
        const pair = kidLabel(job.labelFallback, KID_JOB_LABELS, kid.labelStyle.value);
            const count = job.id === "renders" ? (props.runningRenderCount ?? 0) : 0;
            return [job.id, count > 0 ? `${pair.primary} (${count})` : pair.primary];
        }),
    ),
);

/** The shell drives Work exactly as it always did; kid mode adds no second navigation path. */
defineExpose({
    ensurePage: (pageId: string) => pane.value?.ensurePage(pageId),
    revealPage: (pageId: string) => pane.value?.revealPage(pageId),
    renamePage: (pageId: string, label: string) => pane.value?.renamePage(pageId, label),
    activePage: () => pane.value?.activePage ?? null,
    openPageIds: () => pane.value?.openPageIds ?? [],
});
</script>

<template>
    <div class="wl-kid-jobs">
        <WorkPane
            ref="pane"
            :running-render-count="props.runningRenderCount ?? 0"
            :presentation-labels="presentationLabels"
            @workspace-change="(ids: readonly string[]) => emit('workspaceChange', ids)"
        >
            <!-- Every job screen the host passed in, forwarded verbatim, as WorkPane already does. -->
            <template v-for="(_, name) in $slots" #[name]="scope: Record<string, unknown>">
                <slot :name="name" v-bind="scope ?? {}" />
            </template>
        </WorkPane>
    </div>
</template>

<style scoped>
/*
 * Kid sizing only. These selectors reach into TabStrip's own class names deliberately and are the
 * one place kid mode does so: the alternative is a prop on a component the tab contract covers.
 */
.wl-kid-jobs :deep(.mb-tab) {
    min-height: var(--wl-kid-target-min);
    padding-inline: 14px;
    border-radius: var(--wl-kid-radius-md) var(--wl-kid-radius-md) 0 0;
    font-size: 19px;
    font-weight: 800;
}
.wl-kid-jobs :deep(.mb-tab__close) {
    /*
     * The adult shell's own floor here is 44px; kid mode's own doc comment in `kidTheme.ts` states
     * plainly that its 64px floor raises that, and nothing in kid mode may go below it (kid-mode
     * drop-in audit, defect 13) - these two selectors hard-coded 44px, under both floors.
     */
    min-width: var(--wl-kid-target-min);
    min-height: var(--wl-kid-target-min);
}
.wl-kid-jobs :deep(.mb-tab-group__header) {
    min-height: var(--wl-kid-target-min);
    font-size: 16px;
    font-weight: 800;
}
</style>
