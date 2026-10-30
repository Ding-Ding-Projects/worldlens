<script setup lang="ts">
import { computed, ref, useSlots } from "vue";
import { useI18n } from "vue-i18n";
import { TabbedNavigation, type TabGroupSeed, type TabPage } from "../tabs/index.js";
import { capabilityAvailable } from "./capabilities.js";
import { provideJobOpener } from "./jobOpener.js";
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
        /** Runtime-only labels for a presentation mode; TabbedNavigation never persists them. */
        presentationLabels?: Readonly<Record<string, string>>;
    }>(),
    { runningRenderCount: 0, presentationLabels: () => ({}) },
);

const emit = defineEmits<{
    /** Forwarded from the tab workspace, so the rail badge counts the real thing. */
    workspaceChange: [pageIds: readonly string[]];
}>();

const { t } = useI18n();
const slots = useSlots();

const tabs = ref<InstanceType<typeof TabbedNavigation> | null>(null);

/** Job screens inside this strip can bring another job forward; see `jobOpener.ts`. */
provideJobOpener((pageId) => tabs.value?.revealPage(pageId));

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
    discoveryEntries: computed(() => tabs.value?.discoveryEntries ?? []),
});
</script>

<template>
    <div class="wl-work">
        <TabbedNavigation
            ref="tabs"
            class="wl-work__tabs"
            :pages="pages"
            :presentation-labels="props.presentationLabels"
            :pinned-page-ids="pinnedPageIds"
            :initial-groups="initialGroups"
            :seed-page-ids="FRESH_WORKSPACE_JOB_IDS"
            :default-placement="WORK_DEFAULT_PLACEMENT"
            file-new-tabs-into-seed-groups
            publishes-inset
            appearance="jobs"
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
 * The job strip's own look, from the approved prototype, is `TabStrip`'s `appearance="jobs"`
 * presentation, passed above. It lives in `TabStrip.vue` scoped to `.mb-tabs-strip-row--jobs`
 * because it changes structure as well as paint (the pinned tab keeps its label, a group's
 * heading is one chip, new-tab follows the last tab) and only the strip can do that. The
 * settings sheet's and the editors' strips do not pass it and are unchanged. What remains
 * here is Work's own: the drawn sizes, the touch-target expansion that goes with them, the
 * dock sizing and the contrast-theme overrides.
 */
.wl-work :deep(.mb-tabs-strip-row--jobs[data-placement="top"] .mb-tabs-strip__tab),
.wl-work :deep(.mb-tabs-strip-row--jobs[data-placement="bottom"] .mb-tabs-strip__tab) {
    min-block-size: 38px;
    block-size: 38px;
}

.wl-work :deep(.mb-tabs-strip-row--jobs .mb-tabs-strip__x) {
    min-inline-size: 24px;
    min-block-size: 24px;
    inline-size: 24px;
    block-size: 24px;
}

.wl-work :deep(.mb-tabs-strip-row--jobs .mb-tabs-strip__group-head) {
    min-block-size: 32px;
    block-size: 32px;
}

.wl-work :deep(.mb-tabs-strip-row--jobs .mb-tabs-strip__controls .v-btn) {
    min-block-size: 32px;
    block-size: 32px;
    min-inline-size: 32px;
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

/*
 * The drawn chip keeps its size; what a finger can hit does not.
 *
 * The restyle above deliberately draws Work's chips smaller than `TabStrip`'s own 44px floor
 * - a 38px tab so the strip reads as sheets, a 24px group chip so the label reads as a label
 * - and that is a statement about how the strip *looks*, which the file comment above stakes
 * out as this component's whole business here. It said nothing about what it costs to press,
 * and the touch-target sweep answered: every tab, group head, close affordance and strip
 * control in Work measured under the 44px minimum the rest of the product holds.
 *
 * A centered pseudo-element expands the target back to 44px without moving a pixel of the
 * drawing. Clicks on it land on the control; the strip's own layout, which packs these
 * controls closer than 44px vertically, is unaffected because the pseudo-element takes no
 * space.
 *
 * `::before`, not `::after`, and `pointer-events` stated explicitly: Vuetify's `.v-btn::after`
 * is the button's focus ring and carries `pointer-events: none`, so an expansion written
 * there inherits the none - it computes a 44px box that catches nothing - while also
 * overwriting the focus indicator. `GlossaryTerm.vue` records the same trap; it measured as
 * exactly zero expansion until the pseudo moved.
 */
.wl-work :deep(.mb-tabs-strip__tab),
.wl-work :deep(.mb-tab-button),
.wl-work :deep(.mb-tabs-strip__x),
.wl-work :deep(.mb-tabs-strip__group-head),
.wl-work :deep(.mb-tabs-strip-row .v-btn) {
    position: relative;
}

.wl-work :deep(.mb-tabs-strip__tab)::before,
.wl-work :deep(.mb-tab-button)::before,
.wl-work :deep(.mb-tabs-strip__x)::before,
.wl-work :deep(.mb-tabs-strip__group-head)::before,
.wl-work :deep(.mb-tabs-strip-row .v-btn)::before {
    content: "";
    position: absolute;
    inset: 50% auto auto 50%;
    translate: -50% -50%;
    inline-size: max(100%, 44px);
    block-size: max(100%, 44px);
    pointer-events: auto;
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
