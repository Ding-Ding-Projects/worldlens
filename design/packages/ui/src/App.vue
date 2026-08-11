<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, useId, watch } from "vue";
import { useI18n } from "vue-i18n";
import { i18nModule, loadLanguage, setLanguage } from "./i18n.js";
import {
    mdiCloudSyncOutline,
    mdiCloudUploadOutline,
    mdiEye,
    mdiFileDocumentOutline,
    mdiFolderMultipleOutline,
    mdiMapPlus,
    mdiProgressClock,
    mdiServerNetwork,
    mdiSourceRepository,
    mdiWeb,
} from "@mdi/js";
import type { MenuPage } from "@worldlens/viewer";
import MapView from "./components/MapView.vue";
import { HomeScreen } from "./components/home/index.js";
import ProfileManager from "./components/ProfileManager.vue";
import ZoomButtons from "./components/controls/ZoomButtons.vue";
import FreeFlightMobileControls from "./components/controls/FreeFlightMobileControls.vue";
import { ControlBar } from "./components/controlbar/index.js";
import { ConfigScreen } from "./components/config/index.js";
import { MainMenu, provideBlueMap, useBlueMapTheme } from "./components/menu/index.js";
import { MarkerMenu } from "./components/markers/index.js";
import type { AnyMarkerSetData } from "./components/markers/markerTypes.js";
import {
    AppRail,
    CataloguePage,
    HomeCatalogues,
    WorkPane,
    NotificationPanel,
    ProblemsPanel,
    StatusStrip,
    collectProblems,
    createShellNavigation,
    markMigrationRan,
    migrateWorkspace,
    migrationAlreadyRan,
    type CatalogueFeatureDefinition,
    type CatalogueMetaSources,
    type FeatureTarget,
    type RailDestination,
} from "./components/shell/index.js";
import { AppTitleBar } from "./components/shell/index.js";
import { readTabWorkspace, writeTabWorkspace } from "./components/tabs/tabStorage.js";
import { StartupRecoveryBanner } from "./components/startup/index.js";
import { requestReveal } from "./components/shell/revealRequests.js";
import { onDocsArticleRequested, requestDocsArticle } from "./components/docs/docsLink.js";
import {
    TutorialOverlay,
    markTutorialOffered,
    requestTutorialLaunch,
    tutorialCompleted,
    tutorialOffered,
} from "./components/tutorial/index.js";
import { FirstRunSetup, WelcomeSurface, useSchoolMode } from "./components/setup/index.js";
import { AppSettings, type SettingsSectionAnchor } from "./components/settings/index.js";
import { EulaSurface } from "./components/eula/index.js";
import { WorldScreen } from "./components/world/index.js";
import { ProjectsScreen } from "./components/project/index.js";
import { CiRenderScreen } from "./components/cirender/index.js";
import { createCiRenders } from "./components/cirender/ciRenders.js";
import { resolveCiRenderBridge } from "./components/cirender/ciRenderBridge.js";
import RendersScreen from "./components/renders/RendersScreen.vue";
import { createActiveRenders } from "./components/renders/activeRenders.js";
import type { ConsoleTarget } from "./components/renders/activeRenders.js";
import { CommandPalette, usePaletteShortcut } from "./components/palette/index.js";
import type { PaletteConfigTarget } from "./components/palette/index.js";
import { AppearanceTarget } from "./components/appearance/index.js";
import type { TabPage } from "./components/tabs/index.js";
import { BackupScreen } from "./components/backup/index.js";
import PagesScreen from "./components/pages/PagesScreen.vue";
import WorldRepoScreen from "./components/worldrepo/WorldRepoScreen.vue";
import PreviewScreen from "./components/preview/PreviewScreen.vue";
import { DocsPage } from "./components/docs/index.js";
import { UpdateBanner, createUpdates } from "./components/update/index.js";
import type { SettingsTarget } from "./components/world/index.js";
import { addLocalMap, profilesStore } from "./stores/profiles.js";
import { appState, blueMapApp, mapState, showMapMenu } from "./stores/bluemap.js";
import { notices, raiseNotice } from "./stores/notices.js";
import { wireProjectAutosaveNotices } from "./stores/projectAutosaveNotices.js";
import { productDisplayName } from "./stores/productName.js";

const { t } = useI18n();
const schoolMode = useSchoolMode();

/**
 * The viewer's own locale picker is a separate upstream seam from setupI18n. While the shared
 * presentation restriction is active, keep the UI locale on English too so a prior viewer locale
 * cannot leak Cantonese back through map controls or configuration copy. MapView gives the
 * viewer the same value-only restriction and preserves its raw `bluemap-lang` preference; when
 * the restriction ends, reload that raw choice rather than leaving the temporary English value.
 */
let applyingSchoolModeEnglish = false;
let restoringSchoolModeLanguage = false;
watch(
    [schoolMode.enabled, () => (i18nModule.global.locale as unknown as { value: string }).value],
    ([active, locale], previous) => {
        if (active && locale !== "en" && !applyingSchoolModeEnglish) {
            applyingSchoolModeEnglish = true;
            void setLanguage(i18nModule, "en").finally(() => {
                applyingSchoolModeEnglish = false;
            });
            return;
        }
        if (!active && previous?.[0] && !restoringSchoolModeLanguage) {
            restoringSchoolModeLanguage = true;
            void loadLanguage(i18nModule).finally(() => {
                restoringSchoolModeLanguage = false;
            });
        }
    },
    { immediate: true },
);

/**
 * The menu components resolve the running app through this injection key (their port of
 * upstream's `$bluemap` global property), and the theme bridge maps `appState.theme` onto the
 * Vuetify MD3 theme. Both belong to the shell, so they are installed once, here.
 */
const currentApp = computed(() => blueMapApp.value);
provideBlueMap(currentApp);
useBlueMapTheme(currentApp);

/* -------------------------------------------------------------------------- */
/* Pages                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The shell is three pages behind one strip, not one screen that swaps itself out.
 *
 * Everything this application does used to happen in the same rectangle: the map filled it,
 * the wizard covered the map when no profile was chosen, and the server list arrived as an
 * overlay on top of both. Which of them you were looking at was decided by state you could
 * not see - `profilesStore.activeId === null` - so there was no way to open the wizard while
 * a map was loaded, and no way to look at the map without leaving the wizard. Tabs replace
 * that with a place you can point at: three destinations, all reachable at any time, and the
 * one you were last on restored on the next launch.
 *
 * The ids are constants rather than inline strings because each one is written three times -
 * in this list, in the template's slot name, and wherever something navigates to it - and a
 * page whose slot name has drifted from its id renders the tab system's honest "this build
 * has no content for that page" message rather than failing loudly.
 */
const PAGE_HOME = "home";
const PAGE_MAP = "map";
const PAGE_WORLD = "world";
const PAGE_PROJECTS = "projects";
const PAGE_CIRENDER = "cirender";
const PAGE_RENDERS = "renders";
const PAGE_SERVERS = "servers";
const PAGE_BACKUPS = "backups";
const PAGE_PAGES = "pages";
const PAGE_WORLDREPO = "worldrepo";
const PAGE_PREVIEW = "preview";
const PAGE_DOCS = "docs";

/**
 * A count of everything in progress, kept alive for the whole life of the shell rather than
 * only while the Renders page happens to be the active tab.
 *
 * `TabbedNavigation` renders only the active page's slot - see `DocsPage.vue`'s own comment
 * on the same mechanism - so a counter built inside `RendersScreen.vue` itself would go dark
 * the instant somebody navigated to another tab, which is exactly the discoverability gap
 * this indicator exists to close. This is a second mount of `createActiveRenders`, not a
 * second implementation of it: the tab label below and the page itself both read the same
 * three routes through the same aggregator, so the count in the tab strip can never disagree
 * with the list it leads to.
 */
const renderIndicator = createActiveRenders({
    ciRenders: createCiRenders(resolveCiRenderBridge()),
});
onMounted(() => {
    void renderIndicator.reconcile();
});
onUnmounted(() => {
    renderIndicator.dispose();
});
const runningRenderCount = computed(
    () =>
        renderIndicator.rows.value.filter(
            (row) => row.state === "starting" || row.state === "running" || row.state === "offer",
        ).length,
);

/**
 * One percentage across everything actually running, or null when nothing can report one.
 *
 * `StatusStrip` has always drawn a progress bar and this shell never gave it a value, so the bar
 * could not appear no matter what was rendering - the "built but unreachable" shape this project
 * audits for. The mean is taken only over rows that report a percent: a render whose size is
 * genuinely unknown reports `null`, and averaging that in as a zero would drag a nearly finished
 * bar backwards and invent a denominator the progress model deliberately refuses to invent. When
 * no running row can report one, the bar stays absent rather than showing a confident nothing.
 */
const renderProgressPercent = computed<number | null>(() => {
    const running = renderIndicator.rows.value.filter(
        (row) => row.state === "starting" || row.state === "running",
    );
    const known = running
        .map((row) => row.percent)
        .filter((percent): percent is number => percent !== null && Number.isFinite(percent));
    if (known.length === 0) return null;
    return known.reduce((total, percent) => total + percent, 0) / known.length;
});

const pages = computed<TabPage[]>(() => [
    // First in the strip and pinned on a fresh install (see the `pinned-page-ids` binding
    // below): the one destination that represents every capability this app has, weighted
    // so a newcomer sees the single obvious next step and a returning user sees what they
    // were doing last. "Opening new tabs, people won't know where to go at first" is the
    // exact complaint this page exists to answer.
    // Home and Map are gone from this list, and that is the rewrite in one line: they are rail
    // destinations now, not tabs. Everything else is unchanged, because everything else is a job
    // somebody opens and closes. `tabWorkspaceMigration.ts` removes their tabs from a workspace
    // that predates this, and removes only those two.
    { id: PAGE_WORLD, label: t("tabs.page.world", "Make a map"), icon: mdiMapPlus },
    // Declared next to the guide because they are the two ends of one job: the guide asks
    // five questions and writes a project, and this is where every other setting that
    // project can carry actually lives. On a fresh install it is seeded into the "Rendering"
    // group rather than sitting beside the guide in the strip - see `initialGroups` below
    // for why a newcomer meets the guide and not the settings behind it.
    {
        id: PAGE_PROJECTS,
        label: t("tabs.page.projects", "Projects"),
        icon: mdiFolderMultipleOutline,
    },
    // The fourth answer to "where does this render run": GitHub's machines do the work and
    // this one only uploads and downloads. It is a page rather than a radio button on the
    // guide because it is a workflow - a repository, two consents, an upload, and a run
    // watched job by job - and the guide's "where it runs" card links straight to it, so all
    // four places are named in one list without four screens to discover separately.
    {
        id: PAGE_CIRENDER,
        label: t("tabs.page.ciRender", "GitHub runners"),
        icon: mdiCloudSyncOutline,
    },
    // The label itself carries the count, which is what makes this the persistent,
    // unobtrusive indicator the contract asks for: it says something is going wherever the
    // tab strip is drawn, without a toast, a badge dot with no number, or a second surface
    // fighting for attention. Zero renders in progress reads as a perfectly ordinary tab.
    {
        id: PAGE_RENDERS,
        label:
            runningRenderCount.value > 0
                ? t(
                      "tabs.page.rendersCounted",
                      { count: String(runningRenderCount.value) },
                      "Renders ({count})",
                  )
                : t("tabs.page.renders", "Renders"),
        icon: mdiProgressClock,
    },
    { id: PAGE_SERVERS, label: t("tabs.page.servers", "Maps and servers"), icon: mdiServerNetwork },
    { id: PAGE_BACKUPS, label: t("tabs.page.backups", "Backups"), icon: mdiCloudUploadOutline },
    { id: PAGE_PAGES, label: t("tabs.page.pages", "Publish to Pages"), icon: mdiWeb },
    // A world, rather than a render, going the other direction: kept in a git repository so
    // it updates incrementally instead of being re-zipped whole, and recognised again on a
    // second computer that has never touched it - see WorldRepoScreen.vue's own doc comment.
    {
        id: PAGE_WORLDREPO,
        label: t("tabs.page.worldRepo", "World repository"),
        icon: mdiSourceRepository,
    },
    // The local twin of the Pages tab above: that one puts a render on somebody else's
    // static host, this one serves it straight off this computer's own disk so it can be
    // watched in a browser while it is still being rendered. See `PreviewScreen.vue`'s own
    // doc comment for the tile-caching caveat that stays on screen the whole time.
    { id: PAGE_PREVIEW, label: t("tabs.page.preview", "Watch it live"), icon: mdiEye },
    // Full-text, in-app documentation, bundled with no network needed to read it. Its own
    // tab rather than only the Info page fold the changelog uses, because unlike the
    // changelog this is a browsable, searchable set of 25-odd articles that deserves the
    // same reach as every other destination in the strip.
    { id: PAGE_DOCS, label: t("tabs.page.docs", "Docs"), icon: mdiFileDocumentOutline },
]);

/**
 * How a brand-new workspace is arranged, and why it is not twelve flat tabs.
 *
 * Twelve equal-weight destinations is what every one of the pages above deserves and not
 * what a person meeting this application deserves: the two they need on the first day sit in
 * a list with nine they will need later and one they need when stuck, all in the same
 * typeface, all the same size, none of them explaining the others. That flat list is this
 * shell's single biggest source of "cluttered", and the answer is not to delete a
 * destination - every one of them is somebody's whole reason for opening the app - but to
 * say out loud which ones belong together, which is what the tab strip's own groups are for.
 *
 * So a fresh install seeds three named groups and leaves four things in front of them:
 *
 *  - **Home**, pinned by `pinned-page-ids` below and therefore outside every group, because
 *    the pinned region is what keeps the landing page at the front of the strip.
 *  - **Map** and **Make a map**, loose. They are the two things a newcomer actually does -
 *    look at a map, or make one - and putting either behind a disclosure would be answering
 *    "too much on screen" by hiding the part that is not too much.
 *  - **Docs**, loose. It is the destination somebody reaches for precisely when the rest of
 *    the strip has stopped making sense, and it is one tab: a group holding a single tab is
 *    a header that hides exactly one thing and saves exactly one row, which is an
 *    indirection charging rent it does not pay.
 *
 * The three groups are named for the job their members share, taken from what each page is
 * for rather than from where it happens to sit in the list above:
 *
 *  - **Rendering** - Projects, GitHub runners, Renders. Everything that decides how a render
 *    is set up and shows what it is doing: the settings a project carries, the fourth answer
 *    to "where does this render run", and the count of what is in flight.
 *  - **Finished maps** - Maps and servers, Publish to Pages, Watch it live. A map that
 *    already exists, and the three places it can be looked at: this application's own list
 *    of local and remote maps, somebody else's static host, and this computer serving it
 *    straight off its own disk.
 *  - **Keeping a copy** - Backups, World repository. The two ways a world or a render is put
 *    somewhere that is not this one machine: a versioned upload to GitHub, and a git
 *    repository a second computer can adopt.
 *
 * This is a default rather than a structure. Every group here can be renamed, recoloured,
 * reordered, emptied or ungrouped from the moment the strip is drawn, and that choice is what
 * gets persisted; nothing re-applies this list to a workspace that already exists, which is
 * the whole reason it is passed as a seed rather than enforced on every mount. A returning
 * user's strip is exactly the one they arranged, groups and all.
 *
 * ## They are seeded open, and that is deliberate
 *
 * The first version of this seeded them collapsed, on the reasoning that the shortest
 * possible strip is the least cluttered one. It is, and it costs more than it saves. What
 * makes twelve flat tabs hard to read is that nothing says which of them belong together,
 * and a name over a group fixes that on its own - the reader's eye gets three labelled
 * regions instead of one undifferentiated list, whether or not the members are showing.
 * Collapsing on top of that does not remove clutter so much as remove *destinations*: every
 * page below a header becomes a thing you must already know is there to go looking for, and
 * the strip stops being able to answer "what can this application do" by being looked at.
 *
 * There is a concrete cost too, and it is the kind that is easy to miss from a wide window.
 * A disclosure is a control, and a control is something that can fail to be pressed - by
 * automation, by an assistive technology driving the strip, or by anyone on a short window
 * where the header itself is what scrolled out of reach. Reachability that depends on a
 * click is strictly weaker than reachability that does not, and the capture harness proved
 * it: with the groups seeded shut, five destinations became unreachable to it, on a strip
 * whose own diagnostics reported every group present, named and correct.
 *
 * Open by default, then. The grouping does the de-cluttering, the strip stays honest about
 * what the application contains, and collapsing is left as what it always should have been:
 * something the reader does to the sections they have decided they do not need.
 */
/*
 * The seeded groups moved to `WorkPane`, which is the component that now hands them to
 * `TabbedNavigation`. Same three names, same colours, same memberships - see
 * `jobRegistry.ts`. They are declared once, there, rather than here and there.
 */

const tabs = ref<InstanceType<typeof WorkPane> | null>(null);

/* -------------------------------------------------------------------------- */
/* The shell: three destinations                                              */
/* -------------------------------------------------------------------------- */

/**
 * Home, Map and Work, and the one function that opens a catalogue feature.
 *
 * Every host callback below is a call into code this component already had. The controller
 * decides *what* should happen when a row is pressed; this file keeps owning *how*, which is the
 * same division the command palette has always used here.
 */
const shell = createShellNavigation({
    ensureJob: (jobId) => tabs.value?.ensurePage(jobId),
    revealJob: (jobId) => tabs.value?.revealPage(jobId),
    revealInJob: (jobId, reveal) => {
        // Deep reveals reuse each screen's own existing request mechanism rather than a new one.
        // Docs is the only job with a published article route today; the rest land on the job
        // itself, which is the honest behaviour until each screen exposes its own.
        if (jobId === "docs") requestDocsArticle(reveal);
    },
    revealOnMap: (reveal) => {
        const app = blueMapApp.value;
        if (app === null) return;
        app.appState.menu.openPage(reveal, () => t(`menu.${reveal}`, reveal));
    },
    openOverlay: (overlay, reveal) => {
        switch (overlay) {
            case "settings":
                openSettings((reveal ?? null) as SettingsSectionAnchor | null);
                return;
            case "config":
                // The reveal is the whole point of the row that sent it. Dropped here, the
                // catalogue's "Local version history" landed on Core settings instead of the
                // History tab it names - the reveal travelled all the way from the manifest
                // through `shellNavigation.ts` and was discarded at the last step.
                openConfig((reveal ?? null) as PaletteConfigTarget);
                return;
            case "palette":
                paletteOpen.value = true;
                return;
            case "notifications":
                requestReveal("noticeCentre");
                return;
            case "eula":
                eulaOpen.value = true;
                return;
            case "tour":
                requestTutorialLaunch();
                return;
        }
    },
    runWorkAction: (action) => {
        if (action === "tab-finder") requestReveal("tabFinder");
    },
    openDocsArticle: (articleId) => requestDocsArticle(articleId),
    reportProblem: (problem) => {
        // An unknown or unavailable target is never a click that silently does nothing. It says
        // so, once, through the same notice history everything else uses.
        raiseNotice("warning", problem.message);
        if (!routingFailures.value.some((entry) => entry.id === problem.id)) {
            routingFailures.value = [...routingFailures.value, { id: problem.id, message: problem.message }];
        }
    },
});

const destination = shell.destination;

/**
 * Targets this build could not route, and the panel that shows them.
 *
 * A routing failure used to be a click that silently did nothing. It is a visible, dismissible
 * problem now, with the same wording the development-time error carries - a row that cannot be
 * opened says so rather than teaching somebody that the catalogue is decorative.
 */
const routingFailures = ref<{ id: string; message: string }[]>([]);
const problemsOpen = ref(false);

/** Stable landmark/disclosure ids shared by the controls and the surfaces they own. */
const MAIN_CONTENT_ID = "worldlens-main-content";
const NOTIFICATIONS_PANEL_ID = "worldlens-notifications-panel";
const PROBLEMS_PANEL_ID = "worldlens-problems-panel";
const SETTINGS_PANEL_ID = "docked.app-settings.panel";

/**
 * The rail bell the notification history anchors to.
 *
 * Generated rather than spelled out so nothing else in the document can collide with it, and
 * handed to both the rail and the panel so the panel anchors to the exact control that opens it.
 */
const notificationsActivatorId = useId();
const settingsActivatorId = useId();
const notificationsOpen = ref(false);

const problems = computed(() =>
    collectProblems(
        {
            unresolvedPageIds: unresolvedPageIds.value,
            routingFailures: routingFailures.value,
        },
        t as never,
    ),
);

/** Page ids restored from a workspace nothing in this build declares. Kept, never deleted. */
const unresolvedPageIds = ref<readonly string[]>([]);

/** A remedy button routes through the same activation path every catalogue row uses. */
function onProblemRemedy(target: FeatureTarget): void {
    void shell.activateTarget(target);
}

/** Open jobs, read back from the tab workspace rather than kept in a second array here. */
const openJobIds = ref<readonly string[]>([]);

/**
 * The one-time move off the twelve-page workspace.
 *
 * Runs before anything reads the workspace, and marks itself done only after the transformed
 * value has been written - a crash between the two leaves it to run again rather than leaving a
 * half-migrated strip stamped as finished. Idempotent, so calling it on every mount is safe.
 */
onMounted(() => {
    if (migrationAlreadyRan()) return;
    const result = migrateWorkspace(readTabWorkspace());
    if (result.workspace !== null) writeTabWorkspace(result.workspace);
    unresolvedPageIds.value = result.unresolvedPageIds;
    markMigrationRan();
    shell.destination.value = result.destination;
    if (result.activeJobId !== null) {
        void nextTick(() => tabs.value?.revealPage(result.activeJobId as string));
    }
});

/**
 * Unread notices, derived the way the notice centre itself derives them: everything newer than
 * the highest id the centre has been opened over. An id rather than a count, because the history
 * is bounded - once it starts dropping its oldest entry, "seen" and "raised" counts drift apart
 * silently and the badge starts lying.
 */
const unreadNoticeCount = computed(
    () => notices.history.filter((notice) => notice.id > notices.reviewedId).length,
);

/** Live values for the catalogue row metas. Nothing here is a literal. */
const metaSources = computed<CatalogueMetaSources>(() => ({
    runningRenderCount: runningRenderCount.value,
    profileCount: profilesStore.profiles.length,
    unreadNoticeCount: unreadNoticeCount.value,
    paletteShortcut: "Ctrl+Shift+F",
}));

function onRailSelect(next: RailDestination): void {
    // Picking a destination closes the options editor. The editor is an opaque surface over
    // the content area, so leaving it open would show the rail moving its pill to Home while
    // Home stayed hidden behind the editor - the rail would look broken rather than the
    // navigation it is. `closeConfig` keeps its own unsaved-changes handling.
    if (configOpen.value) {
        closeConfig();
    }
    shell.select(next);
}

async function onActivateFeature(feature: CatalogueFeatureDefinition): Promise<void> {
    await shell.activateFeature(feature);
}

/**
 * Navigating from outside the strip.
 *
 * The palette offers the same destinations the tabs do, and finishing a render is a reason to
 * land on the map. Both go through the tab component rather than through a second copy of the
 * shell's navigation state, because two sources of truth for "which page is showing" is how a
 * palette ends up sending somebody to a screen the strip stopped drawing.
 */
function revealPage(pageId: string): void {
    // Two of the twelve old page ids are rail destinations now, so a caller that still asks for
    // them by name gets the destination rather than nothing. Everything else is a job: open it
    // and switch to Work, which is what "take me there" has always meant.
    if (pageId === PAGE_HOME) {
        shell.select("home");
        return;
    }
    if (pageId === PAGE_MAP) {
        shell.select("map");
        return;
    }
    tabs.value?.ensurePage(pageId);
    tabs.value?.revealPage(pageId);
    shell.destination.value = "work";
}

/**
 * The render id `WorldScreen.vue`'s own `focusRenderId` prop watches, set the moment "Renders
 * in progress" asks to open a local or container render's console.
 *
 * Cleared back to null immediately after the world page reads it, so a second **Open
 * console** for the same render - or a page revisit through the tab strip - fires the watch
 * again rather than being ignored as "no change" by Vue's own equality check on the prop.
 */
const worldFocusRenderId = ref<string | null>(null);

/**
 * "Renders in progress"'s own **Open console** action, resolved into real navigation.
 *
 * A CI render already shows on `CiRenderScreen` the moment it is reconciled - see that
 * screen's own `reconcile()`/`loadKnown()` - so revealing the page is the whole route. A
 * local or container render additionally needs `WorldScreen.vue` told which one to watch,
 * because unlike the CI screen it draws exactly one render at a time.
 */
function onOpenConsole(target: ConsoleTarget): void {
    if (target.page === "cirender") {
        revealPage(PAGE_CIRENDER);
        return;
    }
    worldFocusRenderId.value = target.focusRenderId;
    revealPage(PAGE_WORLD);
    void nextTick(() => {
        worldFocusRenderId.value = null;
    });
}

/**
 * Home reaches every workspace, not only a fresh install's.
 *
 * `TabbedNavigation`'s own seeding pins Home for a genuinely new install, because
 * `PAGE_HOME` is first in `pages` and `pinned-page-ids` names it - see that binding above.
 * A workspace saved by an earlier build never restores a tab for a page it did not know
 * about, though, so `ensurePage` is what reaches an upgrading user: it adds a pinned Home
 * tab exactly once and otherwise does nothing, on every mount, per its own doc comment on
 * `TabbedNavigation.vue`. Cheap enough to call unconditionally rather than behind a
 * one-time flag of this component's own.
 */

/**
 * The autosave scheduler's own notice policy, mounted once for the whole session rather than
 * per project screen: `main/project/autosave.ts`'s quiet timer keeps running, and can flush,
 * even while nobody has the project editor open. See `stores/projectAutosaveNotices.ts` for
 * what actually gets said - almost always nothing, per the non-blocking-notification rules.
 */
const stopAutosaveNotices = wireProjectAutosaveNotices();
onUnmounted(stopAutosaveNotices);

/**
 * A glossary term's "tell me more" link asking for the Docs tab specifically.
 *
 * `DocsPage.vue` only exists once this switch lands - `TabbedNavigation.vue` renders only the
 * active page's slot - so the tab switch has to happen somewhere that stays mounted no matter
 * which page is showing, which is here. `DocsPage.vue`'s own `onMounted` reads the same
 * pending target and opens the actual article; this only gets the tab in front of it.
 */
onDocsArticleRequested(() => revealPage(PAGE_DOCS));

/**
 * Which page is on screen, for the chrome that belongs to one of them.
 *
 * Read back from the tab component rather than mirrored here. Only the shell-level furniture
 * needs it: everything inside a page slot already knows, because a slot that is not the active
 * one is never rendered at all.
 */
const mapPageActive = computed(() => tabs.value?.activePage?.id === PAGE_MAP);

/**
 * Opening a link the application does not draw itself.
 *
 * `window.open` rather than a bridge call: the shell denies the popup and hands the URL to
 * the system browser, which is the one route that already refuses anything that is not
 * HTTPS. A renderer that opened URLs itself would be a second policy to keep in step.
 */
/**
 * The updater, mounted once for the whole shell.
 *
 * One controller, because two would each check on their own schedule and each stage their
 * own copy - and the banner and the settings row would then disagree about what is ready.
 * A refusal becomes an ordinary notice rather than a thrown error: "a render is running"
 * is a sentence, not a fault.
 */
/**
 * Whether the two editors that can hold unsaved work are currently holding some.
 *
 * They are tracked as separate flags rather than one because they are owned by two
 * components that mount and unmount independently: the configuration editor lives in the
 * settings overlay and the project editor lives on its own destination, so a single shared
 * flag would be cleared by whichever of them unmounted last regardless of what the other
 * still had pending. Each emits its own state and each clears its own on unmount.
 */
const unsavedConfigChanges = ref(false);
const unsavedProjectChanges = ref(false);
const updates = createUpdates({
    /**
     * The updater asks before it restarts, and this is the only thing that can answer
     * truthfully. Restart protection used to cover the configuration editor alone, which
     * meant a half-written project could be thrown away by an update the user accepted
     * while looking at a different page entirely.
     */
    hasUnsavedWork: () => unsavedConfigChanges.value || unsavedProjectChanges.value,
    onRefusal: (message: string) => {
        raiseNotice("warning", message);
    },
});
const restartingForUpdate = ref(false);

async function restartForUpdate(): Promise<void> {
    restartingForUpdate.value = true;
    try {
        await updates.restart();
    } finally {
        restartingForUpdate.value = false;
    }
}

function openInBrowser(url: string): void {
    window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Restoring a backup, which is the downloads surface's job and not a second downloader.
 *
 * The backup screen has already chosen the release and the asset; the settings surface is
 * where the parts are fetched, verified against their published digests and rejoined. This
 * only carries the choice there and says what happened, because a Restore button that
 * silently changes a screen the person is not looking at reads as a button that did
 * nothing.
 */
function revealBackupRestore(where: {
    owner: string;
    repo: string;
    tag: string;
    asset: string;
}): void {
    openSettings();
    raiseNotice(
        "info",
        t(
            "backup.restoreHandoff",
            { asset: where.asset, repo: `${where.owner}/${where.repo}` },
            "Downloads is open. Fetch {asset} from {repo} there: every part is checked against its published digest before anything is written.",
        ),
    );
}

/* -------------------------------------------------------------------------- */
/* Making a map                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A finished render becomes an entry in the same map list a remote server uses, and is
 * opened by making it active. The viewer needs no idea which of the two it is looking at:
 * the profile carries the data root, and `LocalMapHandler` serves it off the disk.
 */
function openRenderedMap(dataRoot: string, mapIds: readonly string[]): void {
    const label = mapIds.length > 0 ? mapIds.join(", ") : t("world.rendered", "Rendered map");
    const profile = addLocalMap(dataRoot, label);
    profilesStore.activeId = profile.id;
}

/**
 * A map that GitHub's runners produced, opened exactly as a local render's is.
 *
 * By the time this fires the map has already been downloaded and registered on this
 * machine, so there is no second case to handle: the profile carries a data root and the
 * viewer neither knows nor needs to know which of the four places drew the tiles.
 */
function openCiRenderedMap(where: { renderId: string; dataRoot: string; mapId: string }): void {
    openRenderedMap(where.dataRoot, [where.mapId]);
}

/**
 * Which world's project the projects page should open when it gets there.
 *
 * The guide writes a project and offers to open it, and the world somebody chose may
 * already have had one. Both land here, and the page reads it as a prop rather than being
 * called as a component: a tab panel that is not the active one is never rendered, so at
 * the moment this decides to navigate there is no component to call a method on.
 */
const projectToOpen = ref<string | null>(null);
const ciWorldToOpen = ref<string | null>(null);

function openProject(world: string): void {
    projectToOpen.value = world;
    revealPage(PAGE_PROJECTS);
}

/** Opens the GitHub Actions renderer, optionally prefilled from a project's saved route. */
function openCiRender(world: string | null = null): void {
    ciWorldToOpen.value = world;
    revealPage(PAGE_CIRENDER);
}

/**
 * Choosing a map takes you to the map.
 *
 * The two places that set an active profile - the wizard finishing a render, and a row in the
 * maps-and-servers list - are both on a different page from the one the map draws on, so
 * without this the user's chosen map would load correctly and invisibly behind whichever page
 * they were still looking at. Watching the store rather than calling this from both sites is
 * what keeps a third caller from having to remember.
 */
watch(
    () => profilesStore.activeId,
    (id) => {
        if (id !== null) revealPage(PAGE_MAP);
    },
);

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

const settingsOpen = ref(false);
/**
 * `SettingsSectionAnchor` rather than the narrower `SettingsAnchor`: a render failure can
 * only ever point at the four bridge-reachable anchors, but this shell also opens the
 * surface at sections a render never points at - GitHub sign-in among them, from the
 * CI-render screen's "Open the GitHub sign-in" button. `openSettings()` with no argument
 * used to be the only way that button's `signIn` emit was wired, which opened the sheet
 * without ever switching to, scrolling to or focusing the sign-in row - a click that looked
 * like it worked and left the person exactly where they started.
 */
const settingsAnchor = ref<SettingsSectionAnchor | null>(null);
const settingsMissing = ref(false);

/**
 * Bumped every time the settings surface closes.
 *
 * The shell is the only thing that knows this happened. Settings is an in-app dialog rather
 * than another window, so a surface underneath it sees no focus or visibility event when it
 * closes - and the Mojang download consent, which the wizard and the projects screen both
 * point people at, is changed inside it.
 *
 * That was a real defect: the review step warned that consent was missing, its
 * **Open the setting** button opened Settings, accepting there worked and persisted, and
 * the warning stayed for the life of the window because consent had been sampled once at
 * mount and never read again. The counter is how the surfaces underneath find out.
 * `components/world/consentState.ts` records why this is a fallback for a shared store.
 */
const settingsEpoch = ref(0);

watch(settingsOpen, (open) => {
    if (!open) settingsEpoch.value += 1;
});

function openSettings(anchor: SettingsSectionAnchor | null = null, missing = false): void {
    settingsAnchor.value = anchor;
    settingsMissing.value = missing;
    settingsOpen.value = true;
}

/** The rail settings control is a disclosure: pressing it again closes the surface it names. */
function toggleSettingsFromRail(): void {
    if (settingsOpen.value) {
        settingsOpen.value = false;
        return;
    }
    openSettings();
}

/**
 * A render that failed for a fixable reason says which setting would fix it. This is the
 * other end of that: it opens the surface *and* reveals the exact control, because
 * landing somebody on a settings page and leaving them to find the row is the difference
 * between a remedy and a hint.
 */
function revealSetting(target: SettingsTarget): void {
    openSettings(target.anchor, target.missing);
}

/* -------------------------------------------------------------------------- */
/* Licence viewer                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The standalone docked licence panel, alongside its two embedded copies (the first-run
 * licence step and the consent settings row). `EulaSurface` documents itself as "mount one
 * in the shell and open it from anywhere" - this is that mount, and the "anywhere" is two
 * routes rather than a permanent button: the licence card on Home, and the command
 * palette's own row, reachable with Ctrl+Shift+F from any screen. It used to have a FAB in
 * the corner stack below as well, which made four floating buttons on every screen for a
 * document most people read once; the two workbench controls kept their buttons and this
 * panel kept its reachability.
 */
const eulaOpen = ref(false);

/* -------------------------------------------------------------------------- */
/* "What is this?"                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The standalone "what is this?" panel, alongside first-run setup's own welcome step.
 * `WelcomeSurface` is `EulaSurface`'s twin: "mount one in the shell and open it from
 * anywhere", and this is that mount. Its "anywhere" is the same pair of routes the licence
 * panel's is - the introduction card on Home, and the command palette row - rather than a
 * fourth permanent FAB. It is how the welcome step's content stays reachable once setup is
 * complete and never shown again unprompted - exactly as `firstRunFlow.ts` intends
 * first-run setup itself to behave.
 */
const welcomeOpen = ref(false);

/**
 * "Start here" was pressed inside the panel: close it and land directly on the wizard,
 * skipping Home on purpose. Pressing this button is a deliberate, explicit "take me
 * straight there" from someone already reading the panel's own description of the
 * wizard - unlike `onFirstRunFinished` below, which is not a button press at all and
 * lands a first-time user on Home instead, where that same destination is one click away
 * as the hero card.
 */
function onWelcomeStart(): void {
    revealPage(PAGE_WORLD);
}

/**
 * First-run setup finished for real - not merely dismissed after a failure.
 *
 * This used to call `revealPage(PAGE_WORLD)` directly, which landed a brand-new install
 * straight on the wizard and skipped Home - the one screen built to answer "where do I
 * start" - every single time a person actually finished setup. Home is `pages`' own first
 * entry, seeded pinned and already active on a genuinely fresh workspace (see
 * `seedStrip()` in `TabbedNavigation.vue`), so `revealPage(PAGE_HOME)` here either
 * confirms that seed or, on an upgrading install whose saved layout was last left
 * somewhere else, brings the person back to it - `onMounted`'s `ensurePage(PAGE_HOME)`
 * above guarantees the tab exists by the time this can ever fire. This handler only runs
 * once, the instant a first-time user's own setup completes, so it can never pull a
 * returning user back from wherever their persisted workspace already had them.
 *
 * The welcome step's "start here" pointer still names "Make a map" as the next step - see
 * `welcome.startHere` - and that promise still holds: Home's own hero card is that same
 * destination, weighted `primary`, exactly one click away.
 */
function onFirstRunFinished(): void {
    revealPage(PAGE_HOME);
}

/* -------------------------------------------------------------------------- */
/* Offering the interactive tour, exactly once                                */
/* -------------------------------------------------------------------------- */

/**
 * A single, dismissible, non-blocking invitation - never a second one.
 *
 * Raised on mount rather than tied to first-run finishing, because "offered" has to cover
 * two different people: somebody on a brand-new install (first-run setup may well be showing
 * at the same moment; this toast never blocks it and never steals its focus) and somebody who
 * already finished first-run setup on an earlier build before this feature existed, whose
 * next ordinary launch is the only "first time this could have been offered" they will ever
 * have. `tutorialOffered()` is checked and `markTutorialOffered()` is called in the same
 * breath specifically so a page that mounts this component twice - a test, a hot reload -
 * cannot raise it twice either.
 *
 * `tutorialCompleted()` is also checked, for the person who reached the tour through Info,
 * Docs or the palette before this toast ever got a chance to fire: having already taken the
 * tour is a stronger reason not to invite them again than merely having seen the invitation.
 */
onMounted(() => {
    if (tutorialOffered() || tutorialCompleted()) return;
    markTutorialOffered();
    raiseNotice(
        "info",
        t(
            "tutorial.offer.message",
            "New to BlueMap? There is a short interactive tour that walks through finding a world, rendering it and opening the result.",
        ),
        {
            actions: [
                {
                    id: "start-tour",
                    label: t("tutorial.launch.start", "Take the tour"),
                    run: () => requestTutorialLaunch(),
                },
            ],
        },
    );
});

/* -------------------------------------------------------------------------- */
/* Server configuration                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The options editor, which is a workbench rather than a page.
 *
 * Seven screens, a search that reaches every setting on all of them, and a save plan that
 * states what is about to be written - so it keeps the full-bleed host it has always had,
 * covering the whole shell including the tab strip, rather than becoming a fourth tab. That
 * is deliberate: a tab is somewhere you leave and come back to, and this is a surface you
 * either save or abandon. Escape is the way out, and the tab strip underneath is made inert
 * while it is open so nothing behind an opaque surface can still be reached with Tab.
 */
const configOpen = ref(false);
const configHost = ref<HTMLElement | null>(null);
const pendingConfigScreen = ref<PaletteConfigTarget>(null);

/**
 * The button is found by id rather than by a template ref because it is a tooltip
 * activator, and `v-bind="tooltipProps"` carries a `ref` of Vuetify's own that quietly
 * wins over one written beside it - leaving the ref null and the focus on `<body>`. The id
 * is generated rather than spelled out so nothing else in the document can collide with it.
 */
const configFabId = useId();

function openConfig(screen: PaletteConfigTarget = null): void {
    pendingConfigScreen.value = screen;
    configOpen.value = true;
    // The host is focused so Escape works from the first keystroke. Left alone, focus stays
    // on the button the surface has just covered, and the key that closes this only works
    // once the user has clicked something inside it.
    void nextTick(() => configHost.value?.focus());
}

/** Escape and a finished save both land here, and focus goes back to the button that opened it. */
function closeConfig(): void {
    configOpen.value = false;
    pendingConfigScreen.value = null;
    void nextTick(() => document.getElementById(configFabId)?.focus());
}

/* -------------------------------------------------------------------------- */
/* Command palette                                                            */
/* -------------------------------------------------------------------------- */

/**
 * One shortcut over every command, setting and destination the app has.
 *
 * It opens nothing itself. Every destination it offers emits back to this component, so
 * the code that actually opens these surfaces stays in the one place that already owns it
 * rather than being copied into a second component that would then drift out of step -
 * which is how a palette ends up sending somebody to a screen the shell stopped using.
 *
 * `usePaletteShortcut` binds the window in the capture phase, so the chord works from
 * inside a text field, and calls `preventDefault` only when it actually matched.
 */
const paletteOpen = ref(false);
usePaletteShortcut(paletteOpen);

/**
 * The changelog, which is a fold inside the viewer's own Info page.
 *
 * Two steps rather than one, because the fold is two surfaces down: the menu has to be showing
 * that page before there is a fold to expand. The page is opened here, the way every other menu
 * destination in the palette opens one, and the request tells the page itself to expand and
 * scroll to it. The palette does not offer this row at all without a viewer running, so the
 * guard here is belt and braces rather than the thing keeping it honest.
 */
function openChangelog(): void {
    const app = blueMapApp.value;
    if (app === null) return;
    app.appState.menu.openPage("info", () => t("info.title", "Info"));
    void nextTick(() => {
        requestReveal("changelog");
    });
}

/**
 * A save happened, so the editor steps out of the way and says where it wrote.
 *
 * `saved(folder)` exists so a shell can offer to start a render, and this one deliberately
 * does not: nothing yet takes a config folder to the render engine, and an offer that
 * leads nowhere is worse than no offer. The folder is named because it is the one fact the
 * user cannot recover once this surface closes over it.
 */
function configSaved(folder: string): void {
    closeConfig();
    raiseNotice(
        "success",
        t("config.saved", { folder }, "Saved the BlueMap configuration in {folder}."),
    );
}

/* -------------------------------------------------------------------------- */
/* Viewer chrome                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `appState.controls.state` is the single source of truth for the view mode. It is written
 * only at the end of a view transition, so read it, never mirror it.
 */
const freeFlight = computed(() => appState.value?.controls.state === "free");

/**
 * The free-flight cluster is gated on the map page as well as on the view mode, because the
 * shell's own button column has to step above it and that column is on screen whatever page
 * is showing. Gate only on the mode and the buttons lift over an empty corner whenever
 * somebody in free flight looks at the server list.
 */
const showFreeFlightControls = computed(
    () => mapPageActive.value && mapState.value === "loaded" && freeFlight.value,
);

const showZoomButtons = computed(
    () =>
        showMapMenu.value &&
        (appState.value?.controls.showZoomButtons ?? false) &&
        !freeFlight.value,
);

/** Upstream renders the map state as `$t("map." + mapState)`; these are the en.conf strings. */
const MAP_STATE_FALLBACK: Record<string, string> = {
    unloaded: "No map loaded.",
    loading: "Loading map...",
    errored: "There was an error trying to load this map!",
};

const mapStateMessage = computed(() =>
    t("map." + mapState.value, MAP_STATE_FALLBACK[mapState.value] ?? mapState.value),
);

/**
 * The map's own chrome is for a map, and now the page it belongs to says so.
 *
 * Its "is there anything behind this to zoom, tilt or drop a marker on" question used to be
 * answered by `!showWorldScreen`; the control bar lives inside the map page's slot now, and a
 * slot that is not the active one is never rendered, so the page answers it instead. What is
 * left is the case a page boundary cannot see: the options editor is an opaque surface laid
 * over the whole shell, and the control bar is `z-index: 3` against its `auto`, so without
 * this it would float on top of the editor aiming at a map nobody can see.
 */
const showViewerChrome = computed(() => !configOpen.value);

/**
 * `MenuPage` carries page data behind an index signature, so the marker set the page was
 * opened with arrives as `unknown`.
 */
function pageMarkerSet(page: MenuPage | null | undefined): AnyMarkerSetData | null {
    return (page?.markerSet as AnyMarkerSetData | undefined) ?? null;
}
</script>

<template>
    <v-app class="mb-app">
        <!--
            The window's own chrome. Frameless means the operating system draws no caption
            bar, so this is it; in a browser build the component renders nothing at all.

            It is the first appearance target because it is the first thing a person sees and
            the one piece of chrome that is on screen no matter what they are doing.
        -->
        <AppearanceTarget
            id="app.titleBar"
            :label="t('appearance.target.app.titleBar', 'The window title bar')"
            as="div"
        >
            <AppTitleBar :title="productDisplayName" :main-content-id="MAIN_CONTENT_ID" />
        </AppearanceTarget>

        <!--
            Under the title bar and above everything else, because an update that is ready
            is worth seeing and worth nothing if it interrupts. It never covers a page, and
            it waits: restarting is the person's decision and the render guard is re-read
            at the moment they press it.
        -->
        <UpdateBanner
            :model="updates.banner.value"
            :busy="restartingForUpdate"
            @restart="restartForUpdate"
            @dismiss="updates.dismiss()"
            @open-notes="openInBrowser"
        />

        <!--
            Startup failures are not a reason to erase the shell. This persistent,
            non-modal surface names the unavailable path and keeps the complete local
            diagnostics inspectable, copyable and exportable. The same errors are also
            raised through the one notification queue mounted below, so they remain in
            notification history after this fold is collapsed.
        -->
        <StartupRecoveryBanner />

        <!--
            One reflowing line, and only when there is something to say. Under the banners and
            above the content, in the layout rather than over it: a status line that floated would
            be a toast with a different name.
        -->
        <StatusStrip
            :running-render-count="runningRenderCount"
            :render-progress="renderProgressPercent"
            :problem-count="problems.length"
            :problems-open="problemsOpen"
            :problems-panel-id="PROBLEMS_PANEL_ID"
            @open-renders="revealPage(PAGE_RENDERS)"
            @toggle-problems="problemsOpen = !problemsOpen"
        />

        <v-main :id="MAIN_CONTENT_ID" class="mb-main" tabindex="-1">
            <!--
                The viewer, which renders into #map-container rather than into this tree, so
                it stays mounted at shell level and keyed on the profile exactly as before.
                Putting it inside the map page's slot would dispose the whole renderer every
                time somebody glanced at another tab.
            -->
            <MapView v-if="profilesStore.activeId" :key="profilesStore.activeId" />

            <!--
                The strip and its pages. Made inert rather than unmounted while the options
                editor is open, for the same reason the editor's own comment gives: the page
                behind an opaque surface must not still be reachable with Tab, and tearing it
                down would lose whatever step of the wizard somebody was on.

                The inert goes on the content, never on this row, because the rail lives in
                this row too. Marking the whole body inert took the rail's three destinations
                out with the page - the editor painted over the only navigation in the
                application and then disabled it, so the way out of the options editor was to
                already know about Escape.
            -->
            <div class="mb-shell-body">
                <!--
                    The application rail: 80 px, always, at every supported width. It emits and
                    owns nothing - every action below is a call into the code this component
                    already had, which is the same division the command palette has used here
                    since it was written.
                -->
                <AppearanceTarget
                    id="app.tabBar"
                    :label="t('appearance.target.app.rail', 'The application rail')"
                    as="div"
                >
                    <AppRail
                        class="mb-interactive"
                        :destination="destination"
                        :open-job-count="openJobIds.length"
                        :unread-count="unreadNoticeCount"
                        :product-name="productDisplayName"
                        :notifications-activator-id="notificationsActivatorId"
                        :notifications-panel-id="NOTIFICATIONS_PANEL_ID"
                        :notifications-open="notificationsOpen"
                        :settings-activator-id="settingsActivatorId"
                        :settings-panel-id="SETTINGS_PANEL_ID"
                        :settings-open="settingsOpen"
                        @select="onRailSelect"
                        @open-palette="paletteOpen = true"
                        @toggle-notifications="notificationsOpen = !notificationsOpen"
                        @open-settings="toggleSettingsFromRail"
                    />
                </AppearanceTarget>

                <div class="mb-shell-content" :inert="configOpen">
                    <!--
                        Map. The canvas itself is mounted at shell level above and stays there:
                        this layer is the chrome that only makes sense over one, and it is
                        transparent so the map underneath can be dragged. Home and Work are
                        opaque layers over the top of it, which is what makes the canvas
                        invisible on those destinations without ever unmounting it - navigation
                        must never cost a WebGL scene, a camera or a marker selection.
                    -->
                    <div
                        class="mb-shell-layer mb-shell-layer--map"
                        :inert="destination !== 'map'"
                        :aria-hidden="destination !== 'map' ? 'true' : undefined"
                    >
                        <div class="mb-map-page">
                                <FreeFlightMobileControls v-if="showFreeFlightControls" />
                                <ZoomButtons v-if="showZoomButtons" />

                                <ControlBar v-if="showViewerChrome" />

                                <div v-if="mapState !== 'loaded'" class="mb-map-state">
                                    <!--
                                        The live region is the sentence and only the sentence.
                                        A button inside it would be re-announced every time the
                                        map moved between loading, loaded and errored, which
                                        turns a status update into a repeated instruction.
                                    -->
                                    <p class="mb-map-state__line" role="status" aria-live="polite">
                                        {{ mapStateMessage }}
                                    </p>

                                    <!--
                                        "No map loaded." names a state and not the one action
                                        that leaves it. With nothing chosen at all the message
                                        keeps its own tab company: the strip already offers the
                                        wizard, and this puts the same door where the person is
                                        actually looking.
                                    -->
                                    <v-btn
                                        v-if="profilesStore.activeId === null"
                                        class="mb-interactive"
                                        variant="tonal"
                                        :prepend-icon="mdiMapPlus"
                                        @click="revealPage(PAGE_WORLD)"
                                    >
                                        {{ t("tabs.page.world", "Make a map") }}
                                    </v-btn>
                                </div>

                                <!--
                                    The menu owns the page stack (`appState.menu`), which the
                                    control bar pushes onto, so it belongs to the same page the
                                    control bar does. Its "markers" page is a slot because the
                                    marker list lives in its own component; `page.markerSet` is
                                    whatever the opener put there, which is the root set for the
                                    Markers button and the `bm-players` set for the Players one.
                                -->
                                <MainMenu
                                    @open-docs="revealPage(PAGE_DOCS)"
                                    @open-tutorial="requestTutorialLaunch()"
                                >
                                    <template #markers="{ page, menu }">
                                        <MarkerMenu
                                            v-if="blueMapApp"
                                            :app="blueMapApp"
                                            :menu="menu"
                                            :marker-set="pageMarkerSet(page)"
                                        />
                                    </template>
                                </MainMenu>
                        </div>
                    </div>

                    <!--
                        Home, and the catalogue page that is a page *of* Home rather than a
                        fourth destination. Opaque, so the map behind it is invisible without
                        being unmounted.
                    -->
                    <div v-show="destination === 'home'" class="mb-shell-layer mb-interactive">
                        <CataloguePage
                            v-if="shell.catalogueId.value"
                            :catalogue-id="shell.catalogueId.value"
                            :meta-sources="metaSources"
                            :restricted-mode-active="schoolMode.enabled.value"
                            @back="shell.backToHomeRoot()"
                            @activate-feature="onActivateFeature"
                        />
                        <HomeCatalogues
                            v-else
                            :meta-sources="metaSources"
                            :restricted-mode-active="schoolMode.enabled.value"
                            @open-catalogue="shell.openCatalogue"
                            @activate-feature="onActivateFeature"
                            @new-map="revealPage(PAGE_PROJECTS)"
                            @walk-me-through="revealPage(PAGE_WORLD)"
                        />
                    </div>

                    <!--
                        Work: the existing tab system, re-hosted. Every job slot below is
                        exactly the component it always was, emitting back into the shell that
                        owns the state it needs - re-hosted, not re-parented.
                    -->
                    <div v-show="destination === 'work'" class="mb-shell-layer mb-interactive">
                        <WorkPane
                            ref="tabs"
                            :running-render-count="runningRenderCount"
                            @workspace-change="(ids: readonly string[]) => (openJobIds = ids)"
                        >
                        <!--
                            The wizard is taller than a short window, so it keeps its own
                            scroll container: the step buttons must never be the thing that
                            ends up off-screen.
                        -->
                        <template #world>
                            <div class="mb-world-host mb-interactive">
                                <WorldScreen
                                    :settings-epoch="settingsEpoch"
                                    :can-open-ci="true"
                                    :focus-render-id="worldFocusRenderId"
                                    @consent="openSettings('mojang-download-consent')"
                                    @settings="revealSetting"
                                    @open-map="openRenderedMap"
                                    @open-project="openProject"
                                    @open-ci-render="openCiRender()"
                                />
                            </div>
                        </template>

                        <!--
                            Projects: the settings a world renders with, all of them, before
                            a render starts. Its own scroll container for the same reason the
                            guide has one - the editor is far taller than a short window, and
                            the Save button must never be the thing that ends up off-screen.
                        -->
                        <template #projects>
                            <div class="mb-world-host mb-interactive">
                                <ProjectsScreen
                                    :settings-epoch="settingsEpoch"
                                    :open-world="projectToOpen"
                                    @consent="openSettings('mojang-download-consent')"
                                    @settings="revealSetting"
                                    @open-map="openRenderedMap"
                                    @cloud-render="openCiRender"
                                    @dirty-change="unsavedProjectChanges = $event"
                                />
                            </div>
                        </template>

                        <!--
                            Rendering on GitHub's runners: the answer for a machine that
                            cannot render a large world at all. Its own page rather than a
                            fourth choice on the guide, because it is a workflow with a
                            repository, two consents and a run to watch - and it refuses
                            before packing anything when a world would exceed a release
                            asset's ceiling, which is a message worth arriving early.

                            `rendered` carries a map that has already been downloaded and
                            registered, so it is opened exactly as a local render's is.
                            Mojang's licence is deliberately not accepted on that screen;
                            it points at the settings row that already asks.
                        -->
                        <template #cirender>
                            <div class="mb-world-host mb-interactive">
                                <div class="mb-shell-centre">
                                    <CiRenderScreen
                                        :key="ciWorldToOpen ?? 'manual'"
                                        :worlds="
                                            ciWorldToOpen === null
                                                ? []
                                                : [{ folder: ciWorldToOpen, label: ciWorldToOpen }]
                                        "
                                        :can-open-settings="true"
                                        @sign-in="openSettings('github-account')"
                                        @open-consent="openSettings('mojang-download-consent')"
                                        @open="openInBrowser"
                                        @rendered="openCiRenderedMap"
                                    />
                                </div>
                            </div>
                        </template>

                        <!--
                            Every render this application knows about, on any of its three
                            routes, including one this app did not start this session - a
                            container found running from an earlier launch, or a render on
                            GitHub's runners entirely independent of this window. Its own page
                            rather than folded into the world guide, so navigating away from
                            wherever a render was started never again means losing sight of
                            it: this page, and the tab label's own live count above, are both
                            reachable regardless of which screen a render was watched from.
                        -->
                        <template #renders>
                            <div class="mb-world-host mb-interactive">
                                <RendersScreen @open-console="onOpenConsole" />
                            </div>
                        </template>

                        <!--
                            The list is a card rather than a full-width screen, so it is
                            centred in its page instead of stretched across it. Its Close
                            button now goes back to the map, which is the only thing "close"
                            can honestly mean on a page that cannot be dismissed.
                        -->
                        <template #servers>
                            <div class="mb-world-host mb-interactive">
                                <div class="mb-shell-centre">
                                    <ProfileManager @close="revealPage(PAGE_MAP)" />
                                </div>
                            </div>
                        </template>

                        <!--
                            Backing a world or a rendered map up to GitHub release assets.
                            Restoring is deliberately not a second downloader: the screen
                            names the release it wants and the existing downloads surface,
                            which already verifies every part against its published digest,
                            is what fetches it.
                        -->
                        <template #backups>
                            <div class="mb-world-host mb-interactive">
                                <div class="mb-shell-centre">
                                    <BackupScreen
                                        :can-open-settings="true"
                                        @sign-in="openSettings()"
                                        @open="openInBrowser"
                                        @restore="revealBackupRestore"
                                    />
                                </div>
                            </div>
                        </template>

                        <template #pages>
                            <div class="mb-world-host mb-interactive">
                                <div class="mb-shell-centre">
                                    <PagesScreen @open="openInBrowser" />
                                </div>
                            </div>
                        </template>

                        <!--
                            A world going the other direction, incrementally: synced into a
                            git repository rather than re-zipped whole, and recognised again
                            on a second computer that never touched it. `adopted` lands on the
                            same Projects page a finished guide run does, open at the world
                            just written - the natural next step once a project exists there.
                        -->
                        <template #worldrepo>
                            <div class="mb-world-host mb-interactive">
                                <div class="mb-shell-centre">
                                    <WorldRepoScreen
                                        @open="openInBrowser"
                                        @open-settings="(anchor) => openSettings(anchor)"
                                        @adopted="openProject"
                                    />
                                </div>
                            </div>
                        </template>

                        <!--
                            The local twin of the Pages tab above. `PreviewScreen.vue` drives
                            its own bridge and IPC channel directly - there is no URL for the
                            shell to open externally here, because opening a loopback address
                            through the same https-only door Pages uses would silently do
                            nothing (see `main/preview/ipc.ts`'s own `openExternal` doc
                            comment), so this screen calls the main process itself instead.
                        -->
                        <template #preview>
                            <div class="mb-world-host mb-interactive">
                                <div class="mb-shell-centre">
                                    <PreviewScreen />
                                </div>
                            </div>
                        </template>

                        <!--
                            Every article under docs/, bundled at build time and rendered
                            through the app's one shared Markdown renderer. Its own scroll
                            container for the same reason every other tall page here has one.
                        -->
                        <template #docs>
                            <div class="mb-world-host mb-interactive">
                                <DocsPage />
                            </div>
                        </template>
                        </WorkPane>
                    </div>

                    <!--
                        Docked to the bottom of the content, full width excluding the rail. It
                        reflows the destination above it rather than covering it - a panel over
                        the bottom of the screen would hide the Save button on the very surface
                        the problem is about.
                    -->
                    <ProblemsPanel
                        :panel-id="PROBLEMS_PANEL_ID"
                        :problems="problems"
                        :open="problemsOpen"
                        @update:open="problemsOpen = $event"
                        @remedy="onProblemRemedy"
                    />
                </div>
            </div>

            <!--
                The options editor gets a host of its own, painted over the page behind it -
                but beside the rail, never over it. That sentence used to read "and everything
                under it", and it was written when the navigation was a tab strip inside the
                content area. The rail is not: it is the 80px the contract keeps on screen at
                every width, and covering it left somebody in the editor with no visible way
                back to Home, Map or Work.
                `tabindex="-1"` is what lets the region hold focus, so Escape reaches it
                before anything inside has been clicked.
            -->
            <div
                v-if="configOpen"
                ref="configHost"
                class="mb-world-host mb-world-host--beside-rail mb-interactive"
                tabindex="-1"
                role="region"
                :aria-label="t('config.title', 'Server configuration')"
                @keydown.esc="closeConfig"
            >
                <ConfigScreen
                    :initial-screen="
                        pendingConfigScreen !== null && typeof pendingConfigScreen === 'object'
                            ? pendingConfigScreen.screen
                            : (pendingConfigScreen ?? 'core')
                    "
                    :initial-field-path="
                        pendingConfigScreen !== null && typeof pendingConfigScreen === 'object'
                            ? pendingConfigScreen.fieldPath
                            : null
                    "
                    :settings-epoch="settingsEpoch"
                    @consent="openSettings('mojang-download-consent')"
                    @saved="configSaved"
                    @dirty-change="unsavedConfigChanges = $event"
                />
            </div>

            <!--
                Shell-only controls: settings and the options editor have no upstream
                counterpart, so they are not in the ported menu, and neither of them is a
                page. The server list used to have a button here too and no longer does -
                it is a tab now, and a floating button that opens what a tab already opens is
                two navigation models arguing in the same corner of the screen. The licence
                panel and "what is this?" used to stack two more buttons here for the same
                bad trade: four permanent buttons on every screen, two of them for panels
                most people open once. Both panels keep their Home cards and gained a
                command-palette row each, so the stack holds only the two workbench
                controls somebody reaches for repeatedly.
            -->
            <!--
                The floating buttons are gone. There were four of them at one point - settings,
                the options editor, the licence panel and the welcome panel - hovering over every
                screen, two of them for surfaces most people open once. Settings is in the rail
                footer now and the options editor is a row in Set up & help, which is the
                difference between chrome and litter: chrome has somewhere to live.
            -->

            <!--
                The history, anchored beside the rail and opened only because somebody pressed the
                bell or asked for it by name. `raiseNotice()` is untouched: a notice still lands in
                the history and still moves the badge, and still never appears over the content.
            -->
            <NotificationPanel
                :state="notices"
                :activator="`#${notificationsActivatorId}`"
                :open="notificationsOpen"
                :panel-id="NOTIFICATIONS_PANEL_ID"
                @update:open="notificationsOpen = $event"
            />

            <AppSettings
                :open="settingsOpen"
                :anchor="settingsAnchor"
                :anchor-missing="settingsMissing"
                :updates="updates"
                @update:open="settingsOpen = $event"
            />

            <!--
                The standalone route `EulaSurface`'s own doc comment describes: a docked panel
                the user can place, opened from the licence card on Home and from the command
                palette's own row rather than only reachable through the first-run step or the
                consent settings row.
            -->
            <EulaSurface :open="eulaOpen" @update:open="eulaOpen = $event" />

            <!--
                `WelcomeSurface`'s own twin route: the welcome step's "what is this?"
                content, reachable from Home's introduction card and the command palette
                rather than only met once at first run. Its "Start here" button is the live
                half of the wizard pointer the welcome step can only ever describe.
            -->
            <WelcomeSurface
                :open="welcomeOpen"
                @update:open="welcomeOpen = $event"
                @start="onWelcomeStart"
            />

            <!--
                Every destination emits back here rather than opening anything itself, so
                the shell keeps one copy of the code that opens each surface.
            -->
            <CommandPalette
                :open="paletteOpen"
                :pages="pages"
                :can-route-config-screens="true"
                @update:open="paletteOpen = $event"
                @reveal-setting="revealSetting"
                @open-settings="openSettings()"
                @open-config="openConfig($event)"
                @open-profiles="revealPage(PAGE_SERVERS)"
                @open-page="revealPage($event)"
                @open-notice-centre="requestReveal('noticeCentre')"
                @open-tab-finder="requestReveal('tabFinder')"
                @open-changelog="openChangelog"
                @open-tutorial="requestTutorialLaunch()"
                @open-eula="eulaOpen = true"
                @open-welcome="welcomeOpen = true"
            />
        </v-main>

        <!--
            First-run setup decides for itself whether this is a first launch and stays
            invisible when it is not. It is mounted outside v-main so its blocking dialog -
            the only one in this application - is never a child of a click-through layer.
        -->
        <FirstRunSetup @finished="onFirstRunFinished" />

        <!--
            The interactive tour: a highlighted control and a card of text beside it, never a
            backdrop and never blocking. Mounted here for the same reason `CommandPalette` is -
            it is asked to open from three places that are nowhere near each other in this tree
            (Info, the docs browser, the command palette row
            above), via `requestTutorialLaunch()`, and it drives the tab strip itself through
            `revealPage` as its steps advance.
        -->
        <TutorialOverlay :reveal-page="revealPage" />

    </v-app>
</template>

<style scoped>
/*
 * Layering, pointer-events and the map/chrome stacking order all live in styles/global.scss,
 * because they are properties of the #app / #map-container pair rather than of this component.
 */

/*
 * The tabbed shell fills the map area and is click-through by default, exactly as v-main is:
 * the map canvas is behind the whole application layer, and a full-bleed navigation container
 * that swallowed pointer events would make the map undraggable everywhere except the gaps
 * between the floating controls. The strip and each page opt back in individually below.
 */
/*
 * The shell body: the rail, then everything else. Click-through by default, exactly as the tab
 * shell it replaced was, because the map canvas is behind the whole application layer and a
 * full-bleed container that swallowed pointer events would make the map undraggable everywhere
 * except the gaps between the floating controls. The rail and each opaque destination opt back in
 * individually through `mb-interactive`.
 */
.mb-shell-body {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: row;
    pointer-events: none;
}

.mb-shell-content {
    position: relative;
    flex: 1 1 auto;
    min-inline-size: 0;
    /* Column, so the docked Problems panel is a sibling that takes height from the layer
     * stack above it rather than floating over it. */
    display: flex;
    flex-direction: column;
    /*
     * The one place the shell's own height is decided. Nothing here scrolls: every visible pane
     * owns exactly one scroll region of its own, which is what keeps a wheel gesture from being
     * swallowed by a wrapper nobody knew was there.
     */
    overflow: hidden;
}

/*
 * A destination. All three are stacked in the same box, and only one is showing - Home and Work
 * are opaque and painted over the map, and the map layer is transparent so the canvas behind the
 * whole application layer can be dragged.
 *
 * `v-show` rather than `v-if` for Home and Work is not laziness: mounting and unmounting a
 * destination on every rail press would throw away whatever step of the wizard somebody was on.
 * The map layer is never even hidden that way - it stays in the tree with `inert` and
 * `aria-hidden`, because `display: none` on a canvas host is how a WebGL scene loses its size and
 * has to be rebuilt, and navigation must never cost a scene, a camera or a marker selection.
 */
.mb-shell-layer {
    /*
     * All three destinations stacked in the same box, so switching between them is a change of
     * which one is on top rather than a change of layout.
     *
     * `inset: 0` resolves against `.mb-shell-content`, which is the area above the Problems panel
     * rather than the whole window. That is what makes opening the panel *shorten* each
     * destination instead of having the panel drawn over the bottom of it - a distinction worth
     * stating because both arrangements look identical until somebody opens the panel while a map
     * is loaded and finds the map's own controls underneath it.
     */
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    min-block-size: 0;
    /*
     * Each layer is its own stacking context, which is what makes "Home and Work are opaque
     * layers over the top of the map" true of the map's *chrome* and not only of its canvas.
     *
     * Without it, a positioned descendant of the map layer with a z-index of its own competes
     * with the destinations rather than with its siblings, and paint order stops being decided by
     * which layer is on top. The viewer control bar does exactly that - `ControlBar.vue` gives
     * `.mb-cb` `z-index: 3` so it sits above the canvas - so it went on painting over Home and
     * Work, both of which are declared after the map layer and should therefore cover it. It was
     * plainly visible in the captures that prompted this: a crop of Work's tab strip contained the
     * viewer's compass and its live x/z position inputs, and Home rendered with the whole control
     * bar across its top.
     *
     * Worse than untidy, because the map layer is `inert` on those destinations: what showed
     * through was chrome that looked usable and was not, which is the one thing this project's
     * rules single out as never acceptable.
     *
     * `z-index: 0` rather than `isolation: isolate` only because it says the same thing in a
     * property every reader of this file already has to understand. It costs the control bar
     * nothing on the map itself: the canvas is `#map-container` at `z-index: 0` and the whole
     * application layer is `#app` at `z-index: 10` (see `styles/global.scss`), so the chrome is
     * above the canvas because of that, not because of anything `.mb-cb` asks for here.
     */
    z-index: 0;
}

.mb-shell-layer--map {
    /* Transparent, and click-through except for its own controls. */
    pointer-events: none;
}

/*
 * The appearance wrapper around the rail is `display: contents` until somebody gives the rail a
 * background, a border or a padding to paint, at which point `--box` turns it into a real
 * inline-block - which a flex container blockifies to a plain block. A block child does not
 * stretch to its flex parent's cross size the way a flex item does, so the rail inside it falls
 * back to its own content height and stops being a full-height column.
 *
 * Measured in the running application at 1440x900: with the wrapper painting nothing, the rail
 * is 860px tall and its footer sits at y=888, one pill clear of the window's bottom edge. Adding
 * `--box` alone leaves the wrapper at 860px but collapses the rail to 366px and drags the footer
 * up to y=394. What that looks like on screen is the rail's surface and its right-hand divider
 * stopping two-thirds of the way down the window, with Settings and the notification bell
 * stranded in the middle of it - so customising the rail's colour would break the rail's shape,
 * which is the one thing the appearance contract must never do to the element it is decorating.
 *
 * A row rather than a column, and that is not arbitrary. `AppRail`'s own `flex: 0 0 80px` is
 * written for the row-direction parent it normally has, so a column wrapper would reinterpret
 * that 80px basis as a block-size and hand the window an 80px-tall rail instead of an 80px-wide
 * one. `flex: 0 0 auto` on the wrapper keeps the fixed column fixed for the same reason the rail
 * is not flexible itself: a wrapper allowed to grow or shrink would take width from, or give it
 * to, `.mb-shell-content` beside it.
 *
 * This is the successor to a rule written against `.mb-shell-tabs`, from when the appearance
 * target carrying this id wrapped the shell's own twelve-tab strip rather than the rail. The
 * Material Design 3 rewrite moved the target and deleted that class, and the rule was left
 * matching nothing at all until the collapse above was measured.
 */
.mb-shell-body > .mb-appearance-target--box {
    display: flex;
    flex: 0 0 auto;
    min-inline-size: 0;
    min-block-size: 0;
}

/*
 * The control bar anchors itself under the title bar with `position: fixed`, which was right when
 * it was the topmost thing in the window and is wrong the moment anything else shares that edge.
 * Inside the map page it becomes absolute instead, so it fills whatever box the shell leaves for
 * the map rather than the whole window, and it needs no measured offset that would have to be
 * kept in step with the chrome around it.
 *
 * This rule was written against `.mb-shell-tabs`, which was the shell's own tab strip and no
 * longer exists: the Material Design 3 rewrite moved the strip inside the Work destination and
 * renamed it, and this selector was left behind matching nothing. `position: fixed` therefore
 * came back, and with `left: 0` the bar spanned the whole window again - including the 80px
 * column the application rail now occupies - so the control bar's own Menu button sat directly on
 * top of the rail's Home destination and swallowed every click aimed at it. With a map loaded,
 * Home was unreachable.
 *
 * Found by the screenshot harness rather than by a person: a capture of Home timed out clicking
 * `[data-destination="home"]`, and Playwright named the interceptor outright - "<svg class=
 * mb-cb-menu__icon> from <div class=mb-shell-content> subtree intercepts pointer events". A
 * screenshot of Home would have shown the two elements overlapping and told nobody which one
 * won; driving the application is what turned a layout that looks slightly odd into a
 * destination that does not work.
 *
 * `.mb-map-page` is this component's own element and is `position: absolute; inset: 0` inside the
 * map layer, which is itself inset within `.mb-shell-content` - the column beside the rail. So
 * anchoring to it puts the bar in the space the map actually occupies, which is what it was
 * always meant to mean.
 */
.mb-map-page :deep(.mb-cb) {
    position: absolute;
    top: 0;
}

/*
 * The map page paints nothing: the canvas is a sibling of #app and shows through. Filling the
 * panel rather than sitting in its flow is what gives the control bar above something with the
 * panel's own geometry to anchor against.
 */
.mb-map-page {
    position: absolute;
    inset: 0;
}

.mb-map-state {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    max-width: min(90vw, 40rem);
    padding: 0 1rem;
    color: rgba(var(--v-theme-on-surface), 0.7);
    text-align: center;
    text-wrap: balance;
    pointer-events: none;
}

.mb-map-state__line {
    margin: 0;
}

/*
 * Opaque on purpose. There is no map behind the wizard or the server list once the page is
 * on screen - and where there is one, showing it faintly through a form is worse than not
 * showing it at all - so a translucent panel would read as a rendering fault rather than as
 * a surface. Also the options editor own host, where it covers the whole shell.
 *
 * The left gutter this used to reserve is gone with the floating buttons that needed it. A
 * fixed stack in the bottom-left corner painted over whatever the host had scrolled to, so
 * every opaque page paid 76px of permanent inset to keep its first characters out from
 * under a gear icon - confirmed across nine captures, the worst a radio button sitting
 * under the icon at a high display scale. The rail owns that edge now and reserves its own
 * width in the flex row, so the page starts where the content starts.
 */
.mb-world-host {
    position: absolute;
    inset: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    background: rgb(var(--v-theme-background));
}

/*
    The one host that is a sibling of `.mb-shell-body` rather than a job pane inside it, so
    `inset: 0` reaches the window edge and swallows the rail. It starts where the content
    starts instead. The width is the rail's own `flex: 0 0 80px` from `AppRail.vue`; if that
    ever moves, `railWidthContract.test.ts` fails rather than this silently misaligning.
*/
.mb-world-host--beside-rail {
    inset-inline-start: 80px;
}

/* The maps-and-servers card has its own width, so its page centres it rather than stretching it. */
.mb-shell-centre {
    display: flex;
    justify-content: center;
    padding: 16px;
}

/*
 * The floating-button stack that used to live here is gone, along with the gutter every
 * opaque host reserved to keep text out from under it. Both were the cost of chrome that
 * had nowhere to live; the application rail is where those controls live now.
 */
</style>
