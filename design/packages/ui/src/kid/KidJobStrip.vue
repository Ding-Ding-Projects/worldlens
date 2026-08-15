<script setup lang="ts">
/**
 * Kid mode's job strip: **`WorkPane` re-hosted, never re-implemented.**
 *
 * `WorkPane` already builds the page list, the three seeded groups and the pinned set from
 * `jobRegistry.ts`, filters capability-gated jobs out entirely, and forwards every named slot the
 * host gave it straight through to `TabbedNavigation`. Kid mode therefore adds exactly two things:
 *
 *  1. **Kid labels**, applied through `WorkPane`'s own exposed `renamePage(pageId, label)`, which is
 *     the mechanism the tab system already has for a label that changes. `TabbedNavigation` has no
 *     chip slot, so re-labelling is the honest route - and because a rename is persisted the same
 *     way the user's own renames are, kid labels survive a restart and turning kid mode off puts
 *     the shipped labels back. `kidLabel()` resolves the current language mode itself (see
 *     `kidLabels.ts`'s own doc comment), but only when something actually calls it again - a
 *     `renamePage` here is a one-off imperative write, not a reactive template read, so
 *     `applyKidLabels()` has to be re-run by hand whenever the language mode changes rather than
 *     picking the change up on its own the way a `<template>` expression would. That is exactly
 *     what the `languageMode` watch source below is for.
 *  2. **Kid sizing**, as CSS on this wrapper only: 64px minimum chip height and the two-line chip.
 *
 * Everything else is untouched and therefore still true: docking left/right/top/bottom, groups,
 * pinning, drag reorder, overflow, the four discovery searches, bulk close with preview, the
 * context menu and workspace persistence. `scripts/test-tab-contract.mjs` passes unchanged.
 */
import { onMounted, ref, watch } from "vue";
import WorkPane from "../components/shell/WorkPane.vue";
import { JOB_DEFINITIONS } from "../components/shell/jobRegistry.js";
import { languageMode } from "../components/setup/setupI18n.js";
import { KID_JOB_LABELS, kidLabel } from "./kidLabels.js";
import { useKidMode } from "./kidMode.js";

const props = defineProps<{ runningRenderCount?: number }>();
const emit = defineEmits<{ workspaceChange: [pageIds: readonly string[]] }>();

const kid = useKidMode();
const pane = ref<InstanceType<typeof WorkPane> | null>(null);

/**
 * Re-label every job the moment the strip exists, and again whenever the label style changes.
 *
 * `renamePage` is a no-op for a page with no tab open, so this is safe to run over the whole
 * registry rather than only the open subset: a job opened later is renamed by the same watcher on
 * its next run, and the shipped label is what it starts from.
 */
function applyKidLabels(): void {
    for (const job of JOB_DEFINITIONS) {
        const pair = kidLabel(job.labelFallback, KID_JOB_LABELS, kid.labelStyle.value);
        pane.value?.renamePage(job.id, pair.primary);
    }
}

onMounted(applyKidLabels);
// `languageMode` is a plain function, not a ref - `watch()` treats a function element of its
// source array as a reactive getter, so this re-runs `applyKidLabels()` on the same schedule a
// `<template>` read of `languageMode()` would re-render on, without this file needing to import
// or construct a `computed()` just to give `watch()` something ref-shaped to hold.
watch([kid.labelStyle, kid.enabled, languageMode], applyKidLabels);

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
