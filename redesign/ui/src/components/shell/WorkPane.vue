<script setup lang="ts">
import { computed, ref, useSlots } from "vue";
import { useI18n } from "vue-i18n";
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
            There is deliberately no empty state here. `TabbedNavigation` already draws one
            inside its own panel - "Every tab is closed", with a button per page that opens
            that job in place - and a second one laid over the top of it was both redundant
            and actively harmful: it was `position: absolute; inset: 0` against `.wl-work`,
            whose box starts at the top of the tab strip, so with no job open it painted an
            opaque background over the strip, the new-tab button and the ten-button empty
            state underneath, and offered one button that navigated away to Home instead.
            Measured in the running application: the overlay occupied y=40..1000 while the
            strip row occupied y=40..84, `elementsFromPoint` at the centre of the strip
            returned `.wl-work__empty` above `.mb-tabs-strip__ordinary`, and the new-tab
            button's own centre hit the overlay rather than the button.

            Constraining it to the panel instead of deleting it was the alternative, and it
            is not available honestly: the strip docks to any of four edges the user chooses,
            so "below the strip" is a different inset per placement and this component would
            have to work out the strip's geometry to draw around it - reimplementing what the
            tab system already owns, which is the one thing this component's own doc comment
            above promises it does not do. The panel-hosted empty state is placement-correct
            for free, because it is inside the panel.
        -->
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

/*
 * The strip is chrome, and chrome is not where a tall page takes its space from.
 *
 * A flex item defaults to `flex-shrink: 1`, so a top-docked strip row is shrinkable by the panel
 * below it, and `TabStrip`'s own `min-block-size: 44px` floors that at exactly one row's worth -
 * which is no protection at all for the strip this component actually draws, because a row
 * carrying a group heading above its chips is taller than 44px and has nothing holding it there.
 * `0 0 auto` says the row is sized by its content and gives up none of it. The panel is already
 * `flex: 1 1 auto; min-height: 0; overflow: auto`, so it is the thing that should absorb a short
 * window, and unlike the strip it is built to.
 *
 * Deliberately not applied to a left or right strip. On those placements `TabStrip` sets its own
 * `flex: 0 0 clamp(13rem, 22vw, 20rem)`, and replacing that bounded width with the labels'
 * intrinsic width is how one long tab name starves the active panel.
 *
 * Inherited from a rule `App.vue` carried against the pre-rewrite shell strip, which stopped
 * matching anything when that strip moved in here and was renamed. It lives in this file now
 * because this is the component that owns Work's strip and the one that docks it top.
 */
.wl-work :deep(.mb-tabs-strip-row[data-placement="top"]),
.wl-work :deep(.mb-tabs-strip-row[data-placement="bottom"]) {
    flex: 0 0 auto;
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

/*
 * Work's strip is one of the rewrite surfaces that promises literal 21:1 in the contrast theme.
 * The shared tab component intentionally uses medium-emphasis ink and translucent state layers
 * elsewhere; retain that Material treatment there, but turn every readable Work-strip state into
 * an opaque existing role pair here. This is scoped to Work so settings and editor tab strips keep
 * their independently configurable appearance.
 */
:global(.v-theme--contrast) .wl-work :deep(.mb-tabs-strip) {
    --v-hover-opacity: 0;
    --v-focus-opacity: 0;
    --v-pressed-opacity: 0;
    --v-dragged-opacity: 0;
    --v-activated-opacity: 0;
}

:global(.v-theme--contrast) .wl-work :deep(.mb-tabs-strip__tab),
:global(.v-theme--contrast) .wl-work :deep(.mb-tabs-strip__group-head),
:global(.v-theme--contrast) .wl-work :deep(.mb-tabs-strip__controls .v-btn) {
    color: rgb(var(--v-theme-on-surface));
}

:global(.v-theme--contrast) .wl-work :deep(.mb-tabs-strip__tab:hover),
:global(.v-theme--contrast) .wl-work :deep(.mb-tabs-strip__group) {
    background: rgb(var(--v-theme-surface));
}

:global(.v-theme--contrast) .wl-work :deep(.mb-tabs-strip__tab--active) {
    background: rgb(var(--v-theme-primary-container));
    color: rgb(var(--v-theme-on-primary-container));
}

:global(.v-theme--contrast) .wl-work :deep(.mb-tabs-strip__tab--active .mb-tabs-strip__dot) {
    background: rgb(var(--v-theme-on-primary-container));
}

:global(.v-theme--contrast) .wl-work :deep(.mb-tabs-strip__x),
:global(.v-theme--contrast) .wl-work :deep(.mb-tabs-strip__count) {
    opacity: 1;
}

:global(.v-theme--contrast) .wl-work :deep(.mb-tabs-strip__group-head .v-chip) {
    background: rgb(var(--v-theme-primary-container)) !important;
    color: rgb(var(--v-theme-on-primary-container)) !important;
}

:global(.v-theme--contrast) .wl-work :deep(.mb-tabs-strip__group-head .v-chip__underlay),
:global(.v-theme--contrast) .wl-work :deep(.mb-tabs-strip__group-head .v-chip__overlay) {
    opacity: 0 !important;
}
</style>
