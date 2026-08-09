<script setup lang="ts">
import { computed, ref, useSlots } from "vue";
import { useI18n } from "vue-i18n";
import { VBtn } from "vuetify/components";
import { TabbedNavigation, type TabGroupSeed, type TabPage } from "../tabs/index.js";
import { capabilityAvailable } from "./capabilities.js";
import { JOB_DEFINITIONS, JOB_SEED_GROUPS, FRESH_WORKSPACE_JOB_IDS } from "./jobRegistry.js";
import { WORK_DEFAULT_PLACEMENT } from "./tabWorkspaceMigration.js";

/**
 * Work: the existing tab system, re-hosted as a workspace of jobs somebody actually started.
 *
 * **This component does not reimplement anything.** It is a host: it hands `TabbedNavigation` the
 * job registry instead of the old twelve-page list, tells it to seed one pinned tab instead of
 * twelve, dock top instead of left, and file a later-opened job into its seed group - and then
 * forwards every slot straight through. Docking, groups, pinning, reordering, overflow, the four
 * discovery searches, bulk close with preview, the context menu, persistence and panel geometry
 * are all exactly the code that was already there, and the existing contract suite still proves
 * them.
 *
 * The one thing that genuinely changes is what the strip contains: the jobs somebody opened,
 * rather than every destination the application has. That is what makes the strip short, and the
 * eighty-five-feature catalogue on Home is what makes it safe for it to be short.
 */
const props = withDefaults(
    defineProps<{
        /** The live active-render count, for the Renders job's own label suffix. */
        runningRenderCount?: number;
    }>(),
    { runningRenderCount: 0 },
);

const emit = defineEmits<{
    /** The strip's `+` and the empty state both mean "take me back to choose something". */
    goHome: [];
    /** Forwarded from the tab workspace, so the rail badge counts the real thing. */
    workspaceChange: [pageIds: readonly string[]];
}>();

const { t } = useI18n();
const slots = useSlots();

const tabs = ref<InstanceType<typeof TabbedNavigation> | null>(null);

/**
 * The jobs this build can host, translated now rather than at import.
 *
 * Capability-gated jobs are filtered out entirely rather than declared and left unreachable: a
 * page id `TabbedNavigation` knows about but no slot renders produces its honest "this build has
 * no content for that page" panel, which is the right message for a real gap and the wrong one
 * for a job that was never meant to exist here.
 */
const pages = computed<TabPage[]>(() =>
    JOB_DEFINITIONS.filter((job) => capabilityAvailable(job.availability)).map((job) => ({
        id: job.id,
        label:
            job.id === "renders" && props.runningRenderCount > 0
                ? t(
                      "tabs.page.rendersCounted",
                      { count: String(props.runningRenderCount) },
                      "Renders ({count})",
                  )
                : t(job.labelKey, job.labelFallback),
        icon: job.icon,
    })),
);

/**
 * The same three seeded groups, with the same names, colours and memberships as before the
 * rewrite - a returning user's group headings say what they always said.
 */
const initialGroups = computed<TabGroupSeed[]>(() =>
    JOB_SEED_GROUPS.map((group) => ({
        id: group.id,
        name: t(group.nameKey, group.nameFallback),
        color: group.color,
        collapsed: false,
        pageIds: JOB_DEFINITIONS.filter((job) => job.seedGroup === group.key).map((job) => job.id),
    })),
);

const pinnedPageIds = computed(() =>
    JOB_DEFINITIONS.filter((job) => job.pinnedOnFreshWorkspace).map((job) => job.id),
);

const hasActiveJob = computed(() => tabs.value?.activePage != null);

/** Re-exposed so the shell can drive Work exactly as it drove the old strip. */
defineExpose({
    ensurePage: (pageId: string) => tabs.value?.ensurePage(pageId),
    revealPage: (pageId: string) => tabs.value?.revealPage(pageId),
    renamePage: (pageId: string, label: string) => tabs.value?.renamePage(pageId, label),
    activePage: computed(() => tabs.value?.activePage ?? null),
    openPageIds: computed<readonly string[]>(() => tabs.value?.openPageIds ?? []),
});
</script>

<template>
    <div class="wl-work">
        <TabbedNavigation
            ref="tabs"
            class="wl-work__tabs"
            :pages="pages"
            :pinned-page-ids="pinnedPageIds"
            :initial-groups="initialGroups"
            :seed-page-ids="FRESH_WORKSPACE_JOB_IDS"
            :default-placement="WORK_DEFAULT_PLACEMENT"
            file-new-tabs-into-seed-groups
            publishes-inset
            @workspace-change="(ids: readonly string[]) => emit('workspaceChange', ids)"
        >
            <!--
                Every named slot the host gave us, forwarded verbatim. The job screens stay where
                they already are - in the shell that owns the state they emit back into - rather
                than being re-parented into this component, which would make it a second place
                that knows how a render is opened.
            -->
            <template v-for="(_, name) in slots" #[name]="scope: Record<string, unknown>">
                <slot :name="name" v-bind="scope ?? {}" />
            </template>
        </TabbedNavigation>

        <!--
            Nothing open. A purposeful empty state with a real route out, not a blank tab: a tab
            with no job in it is a control that does nothing, and this application does not ship
            those.
        -->
        <div v-if="!hasActiveJob" class="wl-work__empty">
            <h2 class="wl-work__empty-title">{{ t("work.empty.title", "No job is open") }}</h2>
            <p class="wl-work__empty-body">
                {{
                    t(
                        "work.empty.body",
                        "Work holds the jobs you have started. Pick one from Home and it appears here.",
                    )
                }}
            </p>
            <v-btn class="mb-interactive" color="primary" variant="flat" @click="emit('goHome')">
                {{ t("work.empty.choose", "Choose work") }}
            </v-btn>
        </div>
    </div>
</template>

<style scoped>
.wl-work {
    position: relative;
    block-size: 100%;
    display: flex;
    flex-direction: column;
    background: rgb(var(--v-theme-background));
}

.wl-work__tabs {
    flex: 1 1 auto;
    min-block-size: 0;
}

/*
 * The job strip's own look, from the approved prototype.
 *
 * Applied from here as a scoped override rather than by editing `TabStrip.vue`, and that is a
 * deliberate boundary: `TabStrip` is shared by the config editor and the project editor as well
 * as by Work, and its 247-case contract suite is what proves docking, groups, pinning, overflow
 * and bulk close still behave. Restyling it in place would put that suite at risk for a change
 * that is only about how Work looks. Everything below is appearance; not one rule changes what a
 * chip does.
 *
 * `:deep()` because these elements are `TabStrip`'s, not this component's.
 */
.wl-work :deep(.mb-tabs-strip) {
    padding: 8px 12px 0;
    background: rgb(var(--v-theme-surface));
    border-block-end: 1px solid rgb(var(--v-theme-outline-variant));
}

/*
 * A tab shape, not a pill: square at the bottom so a chip meets the pane it opens, rounded at the
 * top so the strip reads as a row of sheets rather than a row of buttons. That is the whole
 * difference between "browser-style tabs" and "a toolbar", and it is the shape the prototype
 * draws.
 */
.wl-work :deep(.mb-tabs-strip__tab),
.wl-work :deep(.mb-tab-button) {
    border-start-start-radius: 10px;
    border-start-end-radius: 10px;
    border-end-start-radius: 0;
    border-end-end-radius: 0;
    min-block-size: 38px;
}

/* The group label above its first member: a small rounded chip, not a full pill. */
.wl-work :deep(.mb-tabs-strip__group-head) {
    min-block-size: 24px;
    border-radius: 6px;
    font-size: 0.6875rem;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
}

.wl-work__empty {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 32px;
    text-align: center;
    background: rgb(var(--v-theme-background));
}

.wl-work__empty-title {
    margin: 0;
    font-size: 1.625rem;
    font-weight: 400;
    color: rgb(var(--v-theme-on-surface));
}

.wl-work__empty-body {
    margin: 0;
    max-inline-size: 68ch;
    font-size: 0.875rem;
    line-height: 1.5;
    color: rgb(var(--v-theme-on-surface-variant));
    text-wrap: pretty;
}
</style>
