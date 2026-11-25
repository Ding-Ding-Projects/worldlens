<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from "vue";
import { useI18n } from "vue-i18n";
import { raiseNotice } from "../../stores/notices.js";
import DockSurface from "./DockSurface.vue";
import TabsPane from "./TabsPane.vue";
import type { PaneModel } from "./paneModel.js";
import {
    applyNamedLayout,
    deleteNamedLayout,
    readDockLayout,
    readNamedLayouts,
    renameNamedLayout,
    saveNamedLayout,
    writeDockLayout,
    writeNamedLayouts,
    type DockLayoutJson,
    type NamedLayout,
} from "./dockLayoutStorage.js";
import {
    activateIn,
    adjacentStripId,
    mergeStripsIntoFirst,
    moveTabToStrip,
    nextWorkspaceGroupId,
    nextWorkspaceTabId,
    pruneEmptyStrips,
    splitDirectionOf,
    splitTabToNewStrip,
    stripIds,
    type LayoutCommand,
    type SplitDirection,
} from "./workLayout.js";
import type { SaveLayoutResult, WorkLayoutHost } from "./workLayoutHost.js";
import { applyClosePlan, type TabClosePlan } from "./closePlans.js";
import {
    addTab,
    applyGroupSeeds,
    assignTabToGroup,
    closeTabs,
    createGroup,
    moveGroup,
    moveTab,
    moveTabToIndex,
    pinTab,
    removeGroup,
    renameGroup,
    renameTab,
    seedTabOrder,
    setActiveTab,
    DEFAULT_TAB_PLACEMENT,
    type TabPlacement,
    setGroupCollapsed,
    setGroupColor,
    setTabPlacement,
    unpinTab,
    type TabGroupSeed,
    type TabPage,
    type TabStripState,
    type TabWorkspaceState,
} from "./tabModel.js";
import { DEFAULT_TAB_STORAGE_KEY, readTabWorkspace, writeTabWorkspace } from "./tabStorage.js";

/**
 * The tabbed shell: one strip, one panel, and the state behind both.
 *
 * This is the component a shell mounts. It owns exactly one
 * {@link TabWorkspaceState}, hands it down to the strip, and applies every
 * change through the pure functions in `tabModel.ts`. Nothing below it holds a
 * copy of the order, which is why what is drawn, what is searched and what is
 * written to storage can never be three different things.
 *
 * ### Pages, and why a tab is not a page
 *
 * The host declares its pages and renders one named slot each; a tab names a
 * page. Two tabs may name the same page, which is the whole difference between
 * a tab strip and a switch statement, and it is why the label lives on the tab
 * rather than being looked up from the page every time something searches.
 *
 * Only the active page's slot is rendered. A hidden panel per tab would keep
 * every page alive, and one of this application's pages holds a map renderer.
 *
 * ### Restoring, and choosing not to
 *
 * The layout is read once at setup and written on every change. A file that is
 * missing, unreadable, from another version, or internally inconsistent gets
 * the same treatment: the defaults are seeded instead, one tab per declared
 * page. That is a deliberate choice over restoring half a layout, because half
 * a layout is indistinguishable from a bug and a fresh one is obviously a fresh
 * one.
 *
 * ### Seeding a default that is not a wall of tabs
 *
 * "One tab per declared page" is honest and, for a shell with twelve
 * destinations, unreadable: a newcomer meets twelve flat, equal-weight names
 * and has no way to tell the two they need from the nine they will need later.
 * {@link initialGroups} lets the host say which pages belong together and under
 * what name, and {@link seedStrip} builds that shape once - a short strip of
 * loose tabs and named, collapsed groups, with every destination one disclosure
 * away rather than removed.
 *
 * This changes nothing about a workspace that already exists. `seedStrip` runs
 * only where `readTabWorkspace` returned null, which is the same condition it
 * always ran under, so a returning user's own order, pins, groups and collapse
 * states are restored exactly as they left them and never re-shaped to match a
 * default they never saw. A seeded group is also an ordinary group from the
 * moment it exists: renaming, recolouring, reordering, ungrouping and deleting
 * it all work, and the result is what gets persisted.
 *
 * ### Revealing without un-collapsing
 *
 * `revealed` is the runtime set of groups a search result has opened. It is
 * never persisted and never written into the group's own `collapsed` field, so
 * following a result into a collapsed group leaves the user's saved preference
 * exactly as they left it - which the contract asks for in as many words.
 */
const props = withDefaults(
    defineProps<{
        /** The pages this shell can show. One tab per page is seeded on first run. */
        pages: readonly TabPage[];
        /** Named in every master-search result, so a row is locatable. */
        windowLabel?: string;
        stripLabel?: string;
        /**
         * The storage key this instance's layout is written under.
         *
         * Defaults to the application shell's own key, so mounting this with no
         * `storageKey` behaves exactly as it always has. Any second surface that
         * mounts its own `TabbedNavigation` - settings, the config editor, a
         * project's editor - passes a key of its own, so its tab order, pins and
         * groups persist independently rather than overwriting the shell's.
         */
        storageKey?: string;
        /**
         * Page ids pinned automatically the moment a tab for them first exists - at seed
         * time on a genuinely fresh install, and via {@link ensurePage} for a workspace
         * that predates the page. Never reapplied once a tab already exists: a person who
         * deliberately unpins one of these later keeps it unpinned across every future
         * restart, because "hard to lose by accident" is a promise about the first time a
         * page appears, not a standing rule this component re-enforces against a choice
         * the user already made.
         */
        pinnedPageIds?: readonly string[];
        /**
         * The groups a **genuinely fresh** workspace is seeded into, named by page id.
         *
         * A host that declares more destinations than a person can read at a glance uses
         * this to hand a newcomer a short strip instead of a flat list: pages a seed names
         * are created inside that group, everything else stays a loose tab in declared
         * order, and the groups sit after the loose tabs in the order they are declared
         * here. Left empty - the default - the strip seeds exactly as it always has, one
         * loose tab per page.
         *
         * A host is expected to leave its landing page out of every seed - pinning it, as
         * `pinnedPageIds` does, or leaving it loose. Seeding the first declared page into a
         * collapsed group is not refused, but it opens on a tab that is not drawn until the
         * group is expanded, which is a layout nobody would choose on purpose.
         *
         * Consulted only when there is no saved workspace to restore. It is a default
         * layout, not a structure this component maintains: nothing re-applies a seed to a
         * workspace that already exists, no later mount repairs a group the user renamed,
         * emptied or deleted, and {@link ensurePage} adds its tab outside every group
         * because a page that arrives after somebody's layout was saved has no business
         * being filed into a group they may have taken apart months ago.
         */
        initialGroups?: readonly TabGroupSeed[];
        /**
         * Lets a map-owning shell pass pointer input through this one panel to the canvas
         * behind it. Nested tab sets stay interactive because false is the default; the
         * empty state is explicitly interactive so its reopen buttons remain usable.
         */
        panelPassThrough?: boolean;
        /**
         * Whether this strip publishes its left-edge inset as `--mb-tabs-strip-inline-size`,
         * for the shell chrome that floats over it. True for the shell's own strip and no
         * other: the document has one custom property, and this application draws four.
         *
         * Forwarded to `TabStrip` as `publishesInset === true` rather than bare. It has a
         * default here, but `vue-tsc` types a template reference to an optional prop from
         * its *declared* type, so the bare name is `boolean | undefined` at the binding -
         * and under this workspace's `exactOptionalPropertyTypes` that is not assignable to
         * the receiving `?: boolean`. The other optional booleans on this component are only
         * ever coerced in the template, which is why this is the one that trips it.
         */
        publishesInset?: boolean;
        /** True where these tabs are destinations rather than jobs: no close affordances. */
        closeless?: boolean;
        /** How the strip is drawn; see `TabStrip`'s own `appearance`. Behaviour is identical. */
        appearance?: "default" | "jobs";
        /**
         * Which of the declared pages a **genuinely fresh** workspace opens a tab for.
         *
         * The default is every page, which is what this component has always done and what every
         * consumer other than the Work workspace still wants. Work passes one id - the pinned
         * guide - because a workspace of jobs is meant to hold the jobs somebody actually
         * started, and seeding it with ten would put the twelve-tab strip back under a new name.
         *
         * It restricts seeding only. Every page in {@link pages} stays available to
         * {@link openPage}, {@link revealPage}, {@link ensurePage}, the tab finder and a restored
         * workspace, so nothing becomes unreachable by not being seeded - which is the difference
         * between a short strip and a smaller application.
         */
        seedPageIds?: readonly string[];
        /** Pages suppressed from this presentation only; the persisted workspace stays untouched. */
        hiddenPageIds?: readonly string[];
        /** Runtime-only page labels for a mode-specific presentation; never written to storage. */
        presentationLabels?: Readonly<Record<string, string>>;
        /**
         * Where a fresh workspace docks its strip.
         *
         * Left, unchanged, for every existing consumer. Work passes `top`, because the
         * application rail owns the outer left edge now and two things stacked against the same
         * edge is how a shell ends up with sixteen wasted columns. A restored workspace's own
         * placement always wins over this: it is a default, not a policy.
         */
        defaultPlacement?: TabPlacement;
        /**
         * Whether a tab created *after* seeding is filed into the seed group that names its page.
         *
         * False everywhere else, because a page that arrives after somebody's layout was saved has
         * no business being filed into a group they may have taken apart months ago - which is
         * what {@link ensurePage}'s own doc comment says and still means.
         *
         * Work is the one consumer where it is true, and the reason is specific rather than
         * general: Work seeds one tab, so its three groups start with no members at all and
         * `applyGroupSeeds` correctly creates none of them. Opening Projects from a catalogue must
         * then put it under "Rendering" the way it always has, or the seeded grouping would be a
         * feature that only ever existed on installs that never used it.
         */
        fileNewTabsIntoSeedGroups?: boolean;
        /**
         * Lets the workspace be split into several panes that can be arranged, floated and
         * saved as named layouts (see `DockSurface.vue`). Off, the component draws exactly the
         * one strip and one panel it always drew, which is what every settings sheet and editor
         * still gets.
         */
        dock?: boolean;
    }>(),
    {
        windowLabel: "",
        stripLabel: "",
        storageKey: DEFAULT_TAB_STORAGE_KEY,
        pinnedPageIds: () => [],
        hiddenPageIds: () => [],
        presentationLabels: () => ({}),
        initialGroups: () => [],
        panelPassThrough: false,
        publishesInset: false,
        // `seedPageIds` deliberately has no default. Under `exactOptionalPropertyTypes` a default
        // of `undefined` is not the same as an absent one, and absent is exactly the signal
        // `seedablePages()` reads as "seed every declared page, as this component always has".
        defaultPlacement: DEFAULT_TAB_PLACEMENT,
        fileNewTabsIntoSeedGroups: false,
        dock: false,
    },
);

/**
 * Told whenever the set of open pages changes, so a host can derive a count without keeping a
 * second copy of the workspace.
 *
 * The rewrite's application rail shows the number of open jobs on its Work item, and the one
 * thing it must not do to get that number is persist an `openJobIds` array beside this
 * component's own workspace. Two answers to "which jobs are open" is how a badge ends up
 * confidently reporting four when the strip is showing three.
 */
const emit = defineEmits<{
    "workspace-change": [pageIds: readonly string[]];
}>();

const { t } = useI18n();

const idPrefix = useId();
const panelId = `${idPrefix}-panel`;
const presentedPages = computed(() =>
    props.pages
        .filter((page) => !props.hiddenPageIds.includes(page.id))
        .map((page) => ({
            ...page,
            label: props.presentationLabels[page.id] ?? page.label,
        })),
);

/* -------------------------------------------------------------------------- */
/* State                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The pages a fresh workspace opens a tab for: every declared page, unless the host named a
 * subset.
 *
 * `undefined` rather than an empty array is the "no subset given" signal, because an empty array
 * is a legitimate thing for a host to pass - a workspace that starts with nothing open - and
 * conflating the two would make that impossible to express.
 */
function seedablePages(): readonly TabPage[] {
    const allowed = props.seedPageIds;
    if (allowed === undefined) return props.pages;
    return props.pages.filter((page) => allowed.includes(page.id));
}

function seedStrip(): TabStripState {
    const empty: TabStripState = {
        id: "strip-main",
        label: props.stripLabel === "" ? t("tabs.strip.main", "Main") : props.stripLabel,
        windowId: "window-main",
        windowLabel:
            props.windowLabel === "" ? t("tabs.window.main", "This window") : props.windowLabel,
        placement: props.defaultPlacement,
        tabs: [],
        groups: [],
        pinnedOrder: [],
        slots: [],
        activeTabId: null,
    };
    // Ungrouped pages first, then each group's pages: `seedTabOrder`'s own doc comment says
    // why the creation order is what decides where the groups land.
    const seeded = seedTabOrder(seedablePages(), props.initialGroups).reduce<TabStripState>(
        (state, page) => addTab(state, { pageId: page.id, label: page.label, icon: page.icon }),
        empty,
    );
    // Pinned before the groups are made and before the active tab is chosen: pinning never
    // touches `activeTabId`, so the order makes no difference to which tab ends up in front,
    // but doing it first keeps this function reading top-to-bottom as "build the tabs, plant
    // the pins, gather the rest into their groups, then choose what is in front" rather than
    // interleaving the concerns - and it is what lets `applyGroupSeeds` leave a pinned tab
    // alone rather than quietly unpinning a landing tab a seed also named.
    const pinned = props.pinnedPageIds.reduce<TabStripState>((state, pageId) => {
        const tab = state.tabs.find((candidate) => candidate.pageId === pageId);
        return tab === undefined ? state : pinTab(state, tab.id);
    }, seeded);
    const grouped = applyGroupSeeds(pinned, props.initialGroups);
    // The first *declared* page rather than the last one opened, which is what a fresh
    // install should land on. Read off `props.pages` rather than off the strip, because the
    // strip's own creation order is the seeding order above: the first tab created is the
    // first ungrouped page, which is only the same thing while no seed names page one.
    const landing =
        grouped.tabs.find((tab) => tab.pageId === seedablePages()[0]?.id) ?? grouped.tabs[0];
    return landing === undefined ? grouped : setActiveTab(grouped, landing.id);
}

const workspace = ref<TabWorkspaceState>(
    readTabWorkspace(undefined, props.storageKey) ?? { strips: [seedStrip()] },
);

watch(
    workspace,
    (value) => {
        writeTabWorkspace(value, undefined, props.storageKey);
    },
    { deep: true },
);

/** The pane that last had focus; the first one until somebody uses another. */
const focusedStripId = ref<string | null>(null);

const strip = computed<TabStripState>(
    () =>
        workspace.value.strips.find((candidate) => candidate.id === focusedStripId.value) ??
        workspace.value.strips[0] ??
        seedStrip(),
);

// Hosts may remove pages at runtime (School mode is the canonical example). Prune their
// persisted tabs and select the first remaining page in the same update so the shell never
// leaves an active tab pointing at a page that no longer exists.
watch(
    () => props.pages.map((page) => page.id),
    (pageIds) => {
        const allowed = new Set(pageIds);
        let changed = false;
        const strips = workspace.value.strips.map((candidate) => {
            const unavailable = candidate.tabs
                .filter((tab) => !allowed.has(tab.pageId))
                .map((tab) => tab.id);
            let next = unavailable.length > 0 ? closeTabs(candidate, unavailable) : candidate;
            if (next.activeTabId === null) {
                const survivor = next.tabs.find((tab) => allowed.has(tab.pageId));
                if (survivor !== undefined) next = setActiveTab(next, survivor.id);
            }
            if (next !== candidate) changed = true;
            return next;
        });
        if (changed) setWorkspace({ strips });
    },
    { immediate: true, flush: "post" },
);

/**
 * Applies runtime visibility and labels without mutating the saved workspace. School mode uses
 * this to hide a forbidden tab while preserving its order/pin/group preference, and Kid Mode uses
 * it to show picture-first job labels without persisting them into the Adult workspace.
 */
function presentStrip(source: TabStripState): TabStripState {
    const hiddenPages = new Set(props.hiddenPageIds);
    const tabs = source.tabs
        .filter((tab) => !hiddenPages.has(tab.pageId))
        .map((tab) => ({
            ...tab,
            label: props.presentationLabels[tab.pageId] ?? tab.label,
        }));
    const visibleTabIds = new Set(tabs.map((tab) => tab.id));
    const groups = source.groups.map((group) => ({
        ...group,
        tabIds: group.tabIds.filter((tabId) => visibleTabIds.has(tabId)),
    }));
    const groupIds = new Set(groups.map((group) => group.id));
    const slots = source.slots.filter((slot) =>
        slot.kind === "tab" ? visibleTabIds.has(slot.tabId) : groupIds.has(slot.groupId),
    );
    const activeTabId =
        source.activeTabId !== null && visibleTabIds.has(source.activeTabId)
            ? source.activeTabId
            : (tabs[0]?.id ?? null);
    return {
        ...source,
        tabs,
        groups,
        pinnedOrder: source.pinnedOrder.filter((tabId) => visibleTabIds.has(tabId)),
        slots,
        activeTabId,
    };
}

const presentedWorkspace = computed<TabWorkspaceState>(() => ({
    strips: workspace.value.strips.map(presentStrip),
}));
const presentedStrip = computed<TabStripState>(() =>
    presentStrip(workspace.value.strips[0] ?? seedStrip()),
);

/** Replaces one strip, leaving every other strip in the workspace untouched. */
/**
 * Replaces the workspace. In a dockable workspace a pane whose last tab closed is removed
 * rather than left drawn as an empty pane; a lone strip always stays, because its own
 * "every tab is closed" state lives inside it.
 */
function setWorkspace(next: TabWorkspaceState): void {
    workspace.value = props.dock ? pruneEmptyStrips(next) : next;
}

function update(next: TabStripState): void {
    setWorkspace({
        strips: workspace.value.strips.map((candidate) =>
            candidate.id === next.id ? next : candidate,
        ),
    });
}

/**
 * Applies a change to the strip a result named, not to whichever strip is on
 * screen.
 *
 * The master search crosses strips, so a row it returns may belong to one this
 * shell is not currently drawing. Resolving by id is what makes the pin, unpin,
 * ungroup and close on such a row do their labelled job instead of quietly
 * missing; an unknown id changes nothing rather than guessing at the first
 * strip, because acting on the wrong tab is worse than doing nothing.
 */
function updateIn(stripId: string, change: (state: TabStripState) => TabStripState): void {
    const target = workspace.value.strips.find((candidate) => candidate.id === stripId);
    if (target === undefined) return;
    update(change(target));
}

/** Groups temporarily shown because a search result is inside them. */
const revealed = ref<Set<string>>(new Set());

function reveal(groupId: string): void {
    revealed.value = new Set([...revealed.value, groupId]);
}

/*
 * A group the user has collapsed by hand stops being revealed, so the next
 * search result into it reveals it again rather than finding it already open
 * for reasons nobody can remember.
 */
function setCollapsed(groupId: string, collapsed: boolean, stripId?: string): void {
    if (collapsed) {
        const next = new Set(revealed.value);
        next.delete(groupId);
        revealed.value = next;
    }
    const owner =
        workspace.value.strips.find((candidate) => candidate.groups.some((g) => g.id === groupId)) ??
        workspace.value.strips.find((candidate) => candidate.id === stripId) ??
        strip.value;
    update(setGroupCollapsed(owner, groupId, collapsed));
}

/* -------------------------------------------------------------------------- */
/* The panel                                                                  */
/* -------------------------------------------------------------------------- */

const activeTab = computed(
    () =>
        presentedStrip.value.tabs.find((tab) => tab.id === presentedStrip.value.activeTabId) ??
        null,
);

const activePage = computed(() =>
    activeTab.value === null
        ? null
        : (presentedPages.value.find((page) => page.id === activeTab.value?.pageId) ?? null),
);

/* -------------------------------------------------------------------------- */
/* Actions                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Files a freshly created tab into the seed group that names its page, when the host asked for
 * that - creating the group if seeding never did, because a group whose members were all still
 * unopened correctly created nothing.
 *
 * Pinned tabs are skipped for the same reason `applyGroupSeeds` skips them: `createGroup` unpins
 * what it takes, and a host asking for a page to be both pinned and grouped means the pin.
 */
function fileIntoSeedGroup(state: TabStripState, pageId: string): TabStripState {
    if (!props.fileNewTabsIntoSeedGroups) return state;
    const seed = props.initialGroups.find((candidate) => candidate.pageIds.includes(pageId));
    if (seed === undefined) return state;
    const tab = state.tabs.find((candidate) => candidate.pageId === pageId);
    if (tab === undefined || state.pinnedOrder.includes(tab.id)) return state;
    if (state.groups.some((group) => group.tabIds.includes(tab.id))) return state;

    const existing =
        seed.id === undefined ? undefined : state.groups.find((group) => group.id === seed.id);
    if (existing !== undefined) return assignTabToGroup(state, tab.id, existing.id);

    const created = createGroup(
        state,
        {
            ...(seed.id === undefined ? {} : { id: seed.id }),
            name: seed.name,
            ...(seed.color === undefined ? {} : { color: seed.color }),
        },
        [tab.id],
    );
    // A seed that asked to start collapsed still does, even though its first member has only just
    // arrived: the seed is a statement about how the group should look, not about when it was made.
    return seed.collapsed === true && seed.id !== undefined
        ? setGroupCollapsed(created, seed.id, true)
        : created;
}

function openPage(pageId: string): void {
    openPageIn(strip.value.id, pageId);
}

function openPageIn(stripId: string, pageId: string): void {
    const page = presentedPages.value.find((candidate) => candidate.id === pageId);
    if (page === undefined) return;
    const target = workspace.value.strips.find((candidate) => candidate.id === stripId) ?? strip.value;
    focusedStripId.value = target.id;
    update(
        fileIntoSeedGroup(
            addTab(target, {
                ...freshTabIdField(),
                pageId: page.id,
                label: page.label,
                icon: page.icon,
            }),
            pageId,
        ),
    );
}

function freshTabIdField(): { id?: string } {
    return workspace.value.strips.length > 1 ? { id: nextWorkspaceTabId(workspace.value) } : {};
}

/*
 * With several panes, two panes each handing out `tab-1` would put two rows with the same id
 * in the master search and the palette, so a pane that is not alone draws its ids from the
 * whole workspace. A lone pane keeps the ids it always handed out.
 */

/**
 * Brings a page to the front for a host that has another way in.
 *
 * A shell does not only navigate by clicking tabs: a command palette offers the same
 * destinations, and finishing a render is a reason to land on the map whether or not the map
 * tab is the one on screen. Those routes need a verb, and it is deliberately not
 * {@link openPage}: opening is what a "new tab" gesture means, so an outside destination
 * wired to it would stack a fresh duplicate every time somebody used the palette twice.
 *
 * So an existing tab for the page is activated and only a page with no tab at all opens one.
 * That is the behaviour a person expects from a destination - "take me there", not "make me
 * another one" - and it is why closing the map tab still leaves the palette able to reach the
 * map rather than silently doing nothing.
 *
 * A tab inside a collapsed group is revealed on the way, through the same runtime set a search
 * result uses: the strip would otherwise show a panel with no selected tab anywhere in it,
 * which reads as the navigation having gone wrong. Revealed rather than expanded, so the
 * group's own saved preference is left exactly as the user set it - see `revealed` above.
 */
function revealPage(pageId: string): void {
    if (!presentedPages.value.some((page) => page.id === pageId)) return;
    const owner =
        strip.value.tabs.some((tab) => tab.pageId === pageId)
            ? strip.value
            : workspace.value.strips.find((candidate) =>
                  candidate.tabs.some((tab) => tab.pageId === pageId),
              );
    const existing = owner?.tabs.find((tab) => tab.pageId === pageId);
    if (owner === undefined || existing === undefined) {
        openPage(pageId);
        return;
    }
    const holding = owner.groups.find((group) => group.tabIds.includes(existing.id));
    if (holding !== undefined && holding.collapsed) reveal(holding.id);
    focusedStripId.value = owner.id;
    update(setActiveTab(owner, existing.id));
}

/**
 * Adds a tab for a page that has never had one in this workspace, without disturbing
 * whichever tab is currently in front - and pins it, when the host asked for that, exactly
 * as {@link seedStrip} would have on a fresh install.
 *
 * This is the upgrade path {@link seedStrip}'s own seeding cannot reach: a page declared
 * after somebody's tab layout was already saved is invisible to a workspace that was
 * written before that page existed, because restoring never invents tabs for pages a saved
 * record does not know about. A host calls this once a page it wants guaranteed reachable -
 * a landing page, say - so an upgrading user gets it too, without their last-active tab
 * being yanked out from under them the way {@link revealPage} would.
 *
 * A no-op once the tab exists, on purpose: it is safe to call on every mount rather than
 * only once, and it never re-pins a tab the user has since unpinned by hand - see the
 * `pinnedPageIds` prop doc for why that matters.
 */
function ensurePage(pageId: string): void {
    const page = presentedPages.value.find((candidate) => candidate.id === pageId);
    if (page === undefined) return;
    if (workspace.value.strips.some((candidate) => candidate.tabs.some((tab) => tab.pageId === pageId)))
        return;

    const previousActive = strip.value.activeTabId;
    let next = addTab(strip.value, {
        ...freshTabIdField(),
        pageId: page.id,
        label: page.label,
        icon: page.icon,
    });
    // `addTab` makes the new tab active; a returning user's place is restored unless the
    // strip had nothing active at all, in which case the new tab is a perfectly reasonable
    // thing to land on.
    if (previousActive !== null && next.tabs.some((tab) => tab.id === previousActive)) {
        next = setActiveTab(next, previousActive);
    }

    if (props.pinnedPageIds.includes(pageId)) {
        const created = next.tabs.find((tab) => tab.pageId === pageId);
        if (created !== undefined) next = pinTab(next, created.id);
    }

    update(fileIntoSeedGroup(next, pageId));
}

/**
 * The pages this workspace currently has a tab for, deduplicated.
 *
 * Deduplicated because a page can legitimately have two tabs - the context menu offers Duplicate -
 * and "how many jobs are open" is a question about destinations rather than about tabs. A badge
 * reading 4 over a strip showing three names is worse than no badge.
 */
const openPageIds = computed<readonly string[]>(() => [
    ...new Set(
        workspace.value.strips.flatMap((candidate) => candidate.tabs.map((tab) => tab.pageId)),
    ),
]);

/**
 * A read-only discovery projection for the host palette. It contains only the live tab/group
 * labels and stable ids already rendered by this strip. Navigation still goes through
 * `revealPage`, so the projection cannot create a second tab or a second persistence path.
 */
const discoveryEntries = computed(() => [
    ...workspace.value.strips
        .flatMap((owner) => owner.tabs.map((tab) => ({ owner, tab })))
        .map(({ owner, tab }) => {
        const group = owner.groups.find((candidate) => candidate.tabIds.includes(tab.id));
        return {
            id: `tab.${tab.id}`,
            tabId: tab.id,
            pageId: tab.pageId,
            title: tab.label,
            group: group?.name ?? "Tabs",
            groupId: group?.id ?? null,
            groupName: group?.name ?? null,
            location: [group?.name ?? "Tabs", tab.label],
            pinned: owner.pinnedOrder.includes(tab.id),
        };
    }),
    ...workspace.value.strips.flatMap((owner) => owner.groups.map((group) => ({ owner, group }))).map(({ owner, group }) => ({
        id: `group.${group.id}`,
        groupId: group.id,
        pageIds: group.tabIds
            .map((tabId) => owner.tabs.find((tab) => tab.id === tabId)?.pageId)
            .filter((pageId): pageId is string => pageId !== undefined),
        title: group.name,
        group: "Tab groups",
        groupName: group.name,
        location: ["Tab groups", group.name],
        pinned: false,
    })),
]);

watch(
    openPageIds,
    (value) => {
        emit("workspace-change", value);
    },
    { immediate: true },
);

/**
 * Renames every open tab that shows one page.
 *
 * A page's own label - the string in {@link TabPage.label} - is read only once, when a
 * tab for it is first seeded or opened; after that the tab carries its own label, which is
 * what lets a person rename a tab without the host's static page list overwriting it back.
 * That is fine for a label that never changes, and wrong for one that carries a live count
 * - "Maps (3)" - because nothing then updates the three open tabs already showing "Maps
 * (1)". This is the host's way of pushing that update through deliberately, rather than
 * `TabbedNavigation` guessing which labels are supposed to move on their own.
 */
function renamePage(pageId: string, label: string): void {
    for (const owner of workspace.value.strips) {
        const affected = owner.tabs.filter((tab) => tab.pageId === pageId);
        if (affected.length === 0) continue;
        update(affected.reduce((state, tab) => renameTab(state, tab.id, label), owner));
    }
}

/**
 * The three things a host cannot work out, or safely change, from the outside.
 *
 * `activePage` is exposed because chrome that belongs to one page - a control bar, a floating
 * cluster that has to lift clear of another control - has to know whether that page is the one
 * on screen, and the answer lives in this component's state. Reading it back is the difference
 * between a shell that hides a control when its page is gone and one that leaves a row of
 * buttons pointing at nothing, which is exactly the decorative control this project refuses to
 * ship. `revealPage` and `renamePage` are the only two writes a host gets: which tab is in
 * front, and what an existing tab is called. Everything else about the layout - order, pins,
 * groups - stays changed only through this component's own strip. `ensurePage` is a third,
 * narrower write: it can only add a tab for a page that has none, never move, close or
 * rename one that already exists.
 */
function newGroup(tabId: string, stripId?: string): void {
    const owner =
        workspace.value.strips.find((candidate) => candidate.id === stripId) ??
        workspace.value.strips.find((candidate) => candidate.tabs.some((tab) => tab.id === tabId)) ??
        strip.value;
    update(
        createGroup(
            owner,
            {
                name: t("tabs.group.newName", "New group"),
                ...(workspace.value.strips.length > 1
                    ? { id: nextWorkspaceGroupId(workspace.value) }
                    : {}),
            },
            [tabId],
        ),
    );
}

/* -------------------------------------------------------------------------- */
/* Panes: arranging, floating and saving layouts                              */
/* -------------------------------------------------------------------------- */

const dockSurface = ref<InstanceType<typeof DockSurface> | null>(null);
const announcement = ref("");
const namedLayouts = ref<NamedLayout[]>(
    props.dock ? readNamedLayouts(undefined, props.storageKey) : [],
);

/*
 * The stored arrangement is only offered to dockview when it accounts for exactly the strips
 * that were just read. Anything else is dropped here, before dockview sees it, and the surface
 * lays the strips out as the default arrangement instead.
 */
const storedDock = props.dock
    ? readDockLayout(stripIds(workspace.value), undefined, props.storageKey)
    : null;
if (storedDock?.activeStripId) focusedStripId.value = storedDock.activeStripId;

const paneStrips = computed(() =>
    workspace.value.strips.map((candidate) => ({ id: candidate.id, label: candidate.label })),
);

/** Said to assistive technology; the same words the person would read in a notification. */
function announce(message: string): void {
    // A repeated message would not be re-read, so a trailing no-width mark changes the text.
    announcement.value = announcement.value === message ? `${message}​` : message;
}

function onLayoutChange(layout: DockLayoutJson): void {
    writeDockLayout(layout, focusedStripId.value, undefined, props.storageKey);
}

function onPaneFocus(stripId: string): void {
    if (workspace.value.strips.some((candidate) => candidate.id === stripId))
        focusedStripId.value = stripId;
}

function nextPaneLabel(): string {
    return t(
        "tabs.strip.pane",
        { n: String(workspace.value.strips.length + 1) },
        "Pane {n}",
    );
}

/** Splits a tab into a new pane placed beside `referenceStripId` (default: its own pane). */
function splitTab(
    fromStripId: string,
    tabId: string,
    direction: SplitDirection,
    referenceStripId: string = fromStripId,
): boolean {
    const result = splitTabToNewStrip(
        workspace.value,
        fromStripId,
        tabId,
        nextPaneLabel(),
        referenceStripId !== fromStripId,
    );
    if (result === null) {
        announce(
            t(
                "workLayout.cannotSplit",
                "That tab cannot be split away: a pane needs at least two tabs to split one out.",
            ),
        );
        return false;
    }
    dockSurface.value?.place(result.stripId, referenceStripId, direction);
    setWorkspace(result.workspace);
    focusedStripId.value = result.stripId;
    announce(
        t(
            "workLayout.didSplit",
            { direction: directionLabel(direction) },
            "Tab moved into a new pane to the {direction}.",
        ),
    );
    return true;
}

function directionLabel(direction: SplitDirection): string {
    switch (direction) {
        case "left":
            return t("workLayout.dir.left", "left");
        case "right":
            return t("workLayout.dir.right", "right");
        case "above":
            return t("workLayout.dir.above", "top");
        default:
            return t("workLayout.dir.below", "bottom");
    }
}

function moveToPane(fromStripId: string, tabId: string, toStripId: string): boolean {
    const next = moveTabToStrip(workspace.value, fromStripId, tabId, toStripId);
    if (next === null) return false;
    setWorkspace(next);
    focusedStripId.value = toStripId;
    announce(t("workLayout.didMove", "Tab moved into the other pane."));
    return true;
}

function runLayoutCommand(stripId: string, tabId: string | null, command: LayoutCommand): void {
    if (!props.dock) return;
    const direction = splitDirectionOf(command);
    if (direction !== null) {
        if (tabId !== null) splitTab(stripId, tabId, direction);
        return;
    }
    if (command === "next-pane" || command === "previous-pane") {
        const target = adjacentStripId(workspace.value, stripId, command === "next-pane" ? 1 : -1);
        if (target === null || tabId === null) {
            announce(t("workLayout.reason.needsTwoPanes", "There is only one pane."));
            return;
        }
        moveToPane(stripId, tabId, target);
        return;
    }
    const surface = dockSurface.value;
    if (surface === null) return;
    if (command === "float") {
        announce(
            surface.float(stripId)
                ? t("workLayout.didFloat", "The pane is now floating.")
                : t("workLayout.cannotFloat", "That pane cannot float: there is only one pane."),
        );
    } else if (command === "dock") {
        announce(
            surface.dock(stripId)
                ? t("workLayout.didDock", "The pane is docked back into the layout.")
                : t("workLayout.cannotDock", "Nothing to dock this pane beside."),
        );
    } else if (command === "maximize") {
        const was = surface.maximised === stripId;
        surface.toggleMaximise(stripId);
        announce(
            was
                ? t("workLayout.didRestore", "The pane is restored.")
                : t("workLayout.didMaximize", "The pane fills the workspace."),
        );
    }
}

function onDockDrop(
    fromStripId: string,
    tabId: string,
    toStripId: string,
    zone: "centre" | SplitDirection,
): void {
    if (zone === "centre") {
        moveToPane(fromStripId, tabId, toStripId);
        return;
    }
    splitTab(fromStripId, tabId, zone, toStripId);
}

function saveLayout(rawName: string): SaveLayoutResult {
    const result = saveNamedLayout(
        namedLayouts.value,
        rawName,
        workspace.value,
        dockSurface.value?.toJSON() ?? null,
    );
    if (!result.ok) {
        const reason =
            result.reason === "empty-name"
                ? t("workLayout.nameRequired", "Give the layout a name before saving it.")
                : t("workLayout.full", "No more layouts can be saved. Delete one first.");
        raiseNotice("warning", reason);
        return result.reason;
    }
    namedLayouts.value = [...result.layouts];
    writeNamedLayouts(namedLayouts.value, undefined, props.storageKey);
    raiseNotice(
        "success",
        result.replaced
            ? t("workLayout.replaced", "Replaced the saved layout with that name.")
            : t("workLayout.saved1", "Layout saved."),
    );
    return result.replaced ? "replaced" : "saved";
}

function applyLayout(id: string): boolean {
    const layout = namedLayouts.value.find((candidate) => candidate.id === id);
    if (layout === undefined) return false;
    const applied = applyNamedLayout(
        layout,
        workspace.value,
        new Set(props.pages.map((page) => page.id)),
    );
    if (applied === null) {
        raiseNotice(
            "warning",
            t(
                "workLayout.cannotApply",
                "That layout has no tab this build can show, so nothing was changed.",
            ),
        );
        return false;
    }
    setWorkspace(applied.workspace);
    focusedStripId.value = applied.workspace.strips[0]?.id ?? null;
    void nextTick(() => dockSurface.value?.load(applied.dock));
    raiseNotice(
        "success",
        t("workLayout.applied", { name: layout.name }, "Applied the layout {name}."),
    );
    announce(t("workLayout.applied", { name: layout.name }, "Applied the layout {name}."));
    return true;
}

function renameLayout(id: string, name: string): boolean {
    const next = renameNamedLayout(namedLayouts.value, id, name);
    if (next === null) {
        raiseNotice(
            "warning",
            t("workLayout.cannotRename", "That name is empty or already used by another layout."),
        );
        return false;
    }
    namedLayouts.value = [...next];
    writeNamedLayouts(namedLayouts.value, undefined, props.storageKey);
    return true;
}

function removeLayout(id: string): void {
    namedLayouts.value = [...deleteNamedLayout(namedLayouts.value, id)];
    writeNamedLayouts(namedLayouts.value, undefined, props.storageKey);
    raiseNotice("success", t("workLayout.deleted", "Layout deleted."));
}

function resetLayout(): void {
    setWorkspace(mergeStripsIntoFirst(workspace.value));
    focusedStripId.value = workspace.value.strips[0]?.id ?? null;
    void nextTick(() => dockSurface.value?.load(null));
    announce(t("workLayout.didReset", "Every tab is back in one pane."));
}

const layoutHost = computed<WorkLayoutHost | undefined>(() =>
    props.dock
        ? {
              paneCount: workspace.value.strips.length,
              layouts: namedLayouts.value.map(({ id, name, savedAt }) => ({ id, name, savedAt })),
              isFloating: (id) => dockSurface.value?.floating.has(id) ?? false,
              isMaximised: (id) => dockSurface.value?.maximised === id,
              run: runLayoutCommand,
              save: saveLayout,
              apply: applyLayout,
              rename: renameLayout,
              remove: removeLayout,
              reset: resetLayout,
          }
        : undefined,
);

/** Pane helpers for the template: each pane draws its own strip, active tab and panel. */
function paneStrip(stripId: string): TabStripState {
    return presentStrip(
        workspace.value.strips.find((candidate) => candidate.id === stripId) ?? strip.value,
    );
}

function paneActiveTab(stripId: string) {
    const pane = paneStrip(stripId);
    return pane.tabs.find((tab) => tab.id === pane.activeTabId) ?? null;
}

function panePage(stripId: string) {
    const tab = paneActiveTab(stripId);
    return tab === null ? null : (presentedPages.value.find((page) => page.id === tab.pageId) ?? null);
}

/**
 * Everything one pane needs: its own strip state, its own panel, and every strip listener,
 * each bound to the pane it belongs to rather than to whichever pane has focus.
 */
function paneProps(stripId: string): PaneModel {
    const pane = paneStrip(stripId);
    const suffix = paneSuffix(stripId);
    const tab = paneActiveTab(stripId);
    const page = panePage(stripId);
    return {
        stripId,
        placement: pane.placement,
        panelDomId: `${panelId}${suffix}`,
        labelledBy: tab === null ? null : `${idPrefix}${suffix}-tab-${tab.id}`,
        activeTab: tab,
        page,
        pages: presentedPages.value,
        panelPassThrough: props.panelPassThrough,
        stripBindings: {
            strip: pane,
            workspace: presentedWorkspace.value,
            revealed: revealed.value,
            panelId: `${panelId}${suffix}`,
            idPrefix: `${idPrefix}${suffix}`,
            pages: presentedPages.value,
            publishesInset: props.publishesInset === true && suffix === "",
            closeless: props.closeless === true,
            appearance: props.appearance === "jobs" ? "jobs" : "default",
            layoutHost: layoutHost.value,
            onSetPlacement: (placement: TabPlacement) =>
                updateIn(stripId, (state) => setTabPlacement(state, placement)),
            onActivate: (tabId: string, owner: string) =>
                updateIn(owner, (state) => setActiveTab(state, tabId)),
            onClose: (tabId: string, owner: string) =>
                updateIn(owner, (state) => closeTabs(state, [tabId])),
            onPin: (tabId: string, owner: string) =>
                updateIn(owner, (state) => pinTab(state, tabId)),
            onUnpin: (tabId: string, owner: string) =>
                updateIn(owner, (state) => unpinTab(state, tabId)),
            onMoveTab: (tabId: string, delta: number) =>
                updateIn(stripId, (state) => moveTab(state, tabId, delta)),
            onDropTab: (tabId: string, index: number) =>
                updateIn(stripId, (state) => moveTabToIndex(state, tabId, index)),
            onNewGroup: (tabId: string) => newGroup(tabId, stripId),
            onAssign: (tabId: string, groupId: string | null, owner: string) =>
                updateIn(owner, (state) => assignTabToGroup(state, tabId, groupId)),
            onRenameGroup: (groupId: string, name: string) =>
                updateIn(stripId, (state) => renameGroup(state, groupId, name)),
            onSetGroupColor: (groupId: string, color: string) =>
                updateIn(stripId, (state) => setGroupColor(state, groupId, color)),
            onSetGroupCollapsed: (groupId: string, collapsed: boolean) =>
                setCollapsed(groupId, collapsed, stripId),
            onMoveGroup: (groupId: string, delta: number) =>
                updateIn(stripId, (state) => moveGroup(state, groupId, delta)),
            onRemoveGroup: (groupId: string) =>
                updateIn(stripId, (state) => removeGroup(state, groupId)),
            onReveal: reveal,
            onOpenPage: (pageId: string) => openPageIn(stripId, pageId),
            onApply: (
                plan: TabClosePlan,
                options: { closeUnsaved: boolean; keepEmptyGroups: boolean },
            ) => applyPlan(plan, options, stripId),
        },
    };
}

/** The first pane keeps the original DOM ids; later panes are suffixed so ids never collide. */
function paneSuffix(stripId: string): string {
    return workspace.value.strips[0]?.id === stripId ? "" : `-${stripId}`;
}

/** Runs a layout command on the focused pane's active tab; what the palette calls. */
function layoutCommand(command: LayoutCommand): void {
    runLayoutCommand(strip.value.id, strip.value.activeTabId, command);
}

defineExpose({
    activePage,
    revealPage,
    renamePage,
    ensurePage,
    openPageIds,
    discoveryEntries,
    layoutCommand,
    namedLayouts,
    saveLayout,
    applyLayout,
    resetLayout,
    paneCount: computed(() => workspace.value.strips.length),
});

/**
 * Applies a close plan and says honestly what happened.
 *
 * The three numbers are reported separately because they mean different things:
 * what closed, what was held back for unsaved work, and which groups the close
 * emptied. Rolling them into one "done" is exactly the partial-completion-as-
 * total-success failure the contract names, and the notice level follows the
 * worst of them rather than the best.
 */
function applyPlan(
    plan: TabClosePlan,
    options: { closeUnsaved: boolean; keepEmptyGroups: boolean },
    stripId?: string,
): void {
    const owner =
        workspace.value.strips.find((candidate) => candidate.id === stripId) ?? strip.value;
    const outcome = applyClosePlan(owner, plan, options);
    update(outcome.strip);

    const kept = outcome.kept.map((entry) => entry.hit.label);
    const protectedPinned = plan.protectedPinned.map((entry) => entry.hit.label);

    const parts: string[] = [
        t("tabs.close.done", { closed: outcome.closed.length }, "Closed {closed} tabs."),
    ];
    if (kept.length > 0) {
        parts.push(
            t(
                "tabs.close.doneKept",
                { labels: kept.join(", ") },
                "These stayed open because they hold unsaved work: {labels}",
            ),
        );
    }
    if (protectedPinned.length > 0) {
        parts.push(
            t(
                "tabs.close.doneProtected",
                { labels: protectedPinned.join(", ") },
                "Pinned and left alone: {labels}",
            ),
        );
    }
    if (outcome.emptiedGroups.length > 0) {
        parts.push(
            options.keepEmptyGroups
                ? t(
                      "tabs.close.doneGroupsKept",
                      { groups: outcome.emptiedGroups.map((group) => group.name).join(", ") },
                      "These groups are now empty and were kept: {groups}",
                  )
                : t(
                      "tabs.close.doneGroupsGone",
                      { groups: outcome.emptiedGroups.map((group) => group.name).join(", ") },
                      "These groups were emptied and removed: {groups}",
                  ),
        );
    }

    raiseNotice(kept.length > 0 ? "warning" : "success", parts.join(" "));
}
</script>

<template>
    <DockSurface
        v-if="props.dock"
        ref="dockSurface"
        :enabled="true"
        :strips="paneStrips"
        :initial="storedDock?.layout ?? null"
        :announcement="announcement"
        @layout-change="onLayoutChange"
        @focus="onPaneFocus"
        @drop-tab="onDockDrop"
    >
        <template #default="{ stripId }">
            <TabsPane
                :pane="paneProps(stripId)"
                :dock-id="stripId"
                @open-page="(pageId: string) => openPageIn(stripId, pageId)"
                @focus="onPaneFocus(stripId)"
            >
                <template #page="scope">
                    <slot :name="scope.page.id" :tab="scope.tab" :page="scope.page">
                        <p class="mb-tabs__missing">
                            {{ t("tabs.panel.missing", { page: scope.page.label }, "This build has no content for the page {page}.") }}
                        </p>
                    </slot>
                </template>
            </TabsPane>
        </template>
    </DockSurface>
    <TabsPane
        v-else
        :pane="paneProps(strip.id)"
        @open-page="(pageId: string) => openPageIn(strip.id, pageId)"
    >
        <template #page="scope">
            <slot :name="scope.page.id" :tab="scope.tab" :page="scope.page">
                        <p class="mb-tabs__missing">
                            {{ t("tabs.panel.missing", { page: scope.page.label }, "This build has no content for the page {page}.") }}
                        </p>
                    </slot>
        </template>
    </TabsPane>
</template>

<style>
.mb-tabs {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
}

.mb-tabs--left,
.mb-tabs--right {
    flex-direction: row;
}

html[dir="rtl"] .mb-tabs--left,
html[dir="rtl"] .mb-tabs--right {
    direction: ltr;
}

html[dir="rtl"] .mb-tabs--left > *,
html[dir="rtl"] .mb-tabs--right > * {
    direction: rtl;
}

.mb-tabs--right .mb-tabs-strip-row,
.mb-tabs--bottom .mb-tabs-strip-row {
    order: 2;
}

/*
 * The panel is the box a page occupies, and `position: relative` is what makes that
 * literally true rather than merely the intent.
 *
 * A page rendered into the slot is entitled to say "fill the space I was given" - every one
 * of Work's job screens does, through `App.vue`'s `.mb-world-host` wrapper, which is
 * `position: absolute; inset: 0` because each of those screens wants its own scroll
 * container rather than scrolling the whole shell. `inset: 0` resolves against the nearest
 * *positioned* ancestor, and while this panel was static that was never the panel: it was
 * whichever ancestor above the tab set happened to be positioned. In the shell that is
 * `WorkPane`'s `.wl-work` (relative, so its empty state can be laid over the tabs), whose
 * box starts at the top of the strip rather than below it.
 *
 * So the page filled the strip's own row as well as the panel, and because those wrappers
 * paint an opaque `--v-theme-background` they painted straight over it. Measured in the
 * running application: the strip row occupied y=40..88 with all three of its segments laid
 * out and nothing overflowing, `.mb-world-host` occupied y=40..1000 with `offsetParent`
 * `div.wl-work`, and `document.elementsFromPoint` at the centre of the strip returned the
 * job's card above `.mb-tabs-strip__ordinary`. The strip was drawn, complete and correct,
 * and buried - which is why nothing about it looked broken from the inside.
 *
 * Making the panel a containing block confines that "fill my box" to the box it names, for
 * every consumer of this component rather than for the one that noticed. Nothing else about
 * the layout moves: a static element and a relatively positioned one with no offsets occupy
 * exactly the same place.
 */
.mb-tabs__panel {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
}

.mb-tabs__panel--pointer-passthrough {
    pointer-events: none;
}

.mb-tabs__live {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
}

.mb-tabs__empty--pointer-interactive {
    pointer-events: auto;
}

.mb-tabs__panel:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: -2px;
}

.mb-tabs__empty {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 24px;
    text-align: center;
}

.mb-tabs__empty-line,
.mb-tabs__missing {
    font-size: var(--md-sys-typescale-body-medium-size);
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-tabs__missing {
    padding: 24px;
}

.mb-tabs__empty-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: center;
}
</style>
