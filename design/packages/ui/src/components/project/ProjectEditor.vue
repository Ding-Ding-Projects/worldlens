<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiArrowLeft, mdiContentSaveOutline, mdiPlay, mdiUndoVariant } from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VCardText,
    VChip,
    VProgressLinear,
    VSelect,
    VSpacer,
    VSwitch,
    VTextField,
} from "vuetify/components";
import {
    EMPTY_INVOCATION,
    PROJECT_FILE_NAME,
    buildCliArgs,
    resolveCliActions,
    type CliInvocation,
    type FieldMeta,
    type PlainValue,
    type ProjectFile,
    type ResolvedCliActions,
} from "@worldlens/config";
import PathField from "../PathField.vue";
import ConfigFileForm from "../config/ConfigFileForm.vue";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { clearFieldValue, replaceText, setFieldValue } from "../config/configModel.js";
import { valueToText } from "../config/fieldValue.js";
import { createSettingMatcher } from "../config/regexEngine.js";
import { TabbedNavigation, type TabPage } from "../tabs/index.js";
import { SimpleHistoryList } from "../history/index.js";
import ProjectMapsPanel from "./ProjectMapsPanel.vue";
import ProjectStoragesPanel from "./ProjectStoragesPanel.vue";
import { resolveProjectHistoryHost } from "./projectHost.js";
import {
    EMPTY_RENDER,
    SINGLETONS,
    isRenderFieldDefault,
    openSingletonFile,
    orderedMaps,
    projectRenderRoute,
    renderProblems,
    withName,
    withRender,
    withRenderFieldDefault,
    withSingleton,
    type RenderFieldKey,
    type SingletonKind,
} from "./projectModel.js";

/**
 * The project editor: every setting a render will use, before the render starts.
 *
 * This is the answer to the question the whole feature exists for - "shouldn't a user
 * configure all the map settings before rendering starts". The guide asks five questions
 * and starts; this holds all of it. Every map with its full config, every storage, how the
 * render itself is run, and the four whole-file settings BlueMap reads once.
 *
 * Nothing here names a BlueMap setting. The maps and storages panels hand their files to
 * `../config/ConfigFileForm.vue`, and so do the four singleton tabs, so the groups, the
 * controls, the documentation and the defaults all come from `@worldlens/config`.
 * A setting added to the schema tomorrow appears here with no change to this file.
 *
 * ## Absent is not empty
 *
 * The four singletons start absent, and absent means "this project never touched it, so
 * BlueMap's own default applies at render time". That is why each of those tabs opens an
 * empty body rather than a generated template: a project that shipped a full generated
 * `core.conf` would be asserting a hundred values nobody chose, and a later change to
 * BlueMap's defaults would silently not reach it. The form writes only what somebody
 * actually sets, and a body that ends up with nothing in it is stored as absent again.
 */
const props = withDefaults(
    defineProps<{
        project: ProjectFile;
        /** The world folder the project file lives at the root of. */
        world: string;
        /** True when the project differs from what is on disk. */
        dirty?: boolean;
        saving?: boolean;
        /** Whatever the last save said when it refused, verbatim. */
        saveFailure?: string | null;
        /** False when this build cannot start a render at all. */
        canRender?: boolean;
        /** True while a render is already going, so a second start is refused. */
        rendering?: boolean;
        separator?: string;
        /** Where the app writes renders, used as the root of a new file storage. */
        defaultRoot?: string;
    }>(),
    {
        dirty: false,
        saving: false,
        saveFailure: null,
        canRender: false,
        rendering: false,
        separator: "/",
        defaultRoot: "",
    },
);

const emit = defineEmits<{
    "update:project": [value: ProjectFile];
    save: [];
    /** Throw the unsaved edits away and read the file again. */
    revert: [];
    close: [];
    render: [];
    consent: [];
    notify: [message: string];
}>();

const { t } = useI18n();

/**
 * Vuetify's props and `exactOptionalPropertyTypes` disagree about `undefined`, so every
 * optional flag of ours is normalised once here rather than coalesced at each binding.
 */
const isDirty = computed(() => props.dirty === true);
const isSaving = computed(() => props.saving === true);
const renderable = computed(() => props.canRender === true);
const isRendering = computed(() => props.rendering === true);
const selectedRenderRoute = computed(() => projectRenderRoute(props.project));
const separatorValue = computed(() => props.separator ?? "/");
const defaultRootValue = computed(() => props.defaultRoot ?? "");

const TAB_MAPS = "maps";
const TAB_STORAGES = "storages";
const TAB_RENDER = "render";
const TAB_HISTORY = "history";

const tabsNav = ref<InstanceType<typeof TabbedNavigation> | null>(null);
const selectedMap = ref<string | null>(null);
const selectedStorage = ref<string | null>(null);

/**
 * This project file's own version history, bound to the world it lives in.
 *
 * `project:save` has recorded one revision per save since the project layer landed; this is
 * what lets somebody actually browse and restore that record rather than it existing only on
 * disk. Recomputed from `world` rather than resolved once, because a person can close one
 * project and open another without the editor unmounting.
 */
const projectHistoryHost = computed(() => resolveProjectHistoryHost(props.world));

const maps = computed(() => orderedMaps(props.project));

const problems = computed(() => renderProblems(props.project));
const problemTexts = computed(() =>
    // `t(key, named, fallback)`, and no filling afterwards: vue-i18n compiles the fallback
    // as a message too, so it consumes `{id}` as a named parameter of its own and the id
    // the message is complaining about is gone by the time anything else could put it back.
    problems.value.map((problem) => t(problem.key, problem.vars ?? {}, problem.fallback)),
);

const canStart = computed(
    () => renderable.value && !isRendering.value && problems.value.length === 0,
);

const singletonLabels: Record<SingletonKind, string> = {
    core: "Core",
    webapp: "Web app",
    webserver: "Web server",
    plugin: "Plugin",
};

const singletonTabs = computed(() =>
    SINGLETONS.map((kind) => ({
        id: kind,
        label: t(`project.editor.tab.${kind}`, singletonLabels[kind]),
        touched: props.project[kind] !== null,
    })),
);

/* -------------------------------------------------------------------------- */
/* The tabs                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * One browser-style tab per section, carried by the project's own `TabbedNavigation`
 * rather than a bespoke `v-tabs`/`v-window` pair: an overflow surface once the strip
 * cannot fit seven tabs, reordering, pinning, grouping, the four tab-discovery searches
 * and a layout that survives a restart under this surface's own storage key.
 *
 * Maps and storages carry a live count in their label, which a plain `TabPage` cannot
 * keep current on its own - the label is read once, when a tab first opens, and after
 * that belongs to the tab rather than the page. The watcher below is what pushes a
 * changed count into any tab already open, through `renamePage`.
 *
 * The small dot that used to sit beside a touched singleton's tab is gone: it lived in
 * `TabButton`'s own fixed rendering, which every `TabbedNavigation` shares, and a tab
 * strip that let one caller inject a bespoke dot would let every caller do the same,
 * which is exactly the drift the shared component exists to prevent. The fact itself is
 * not lost - the paragraph at the top of each singleton's tab still says outright whether
 * this project carries its own file or is following BlueMap's defaults - it is simply
 * read on arrival rather than glanced at from the strip.
 */
const pages = computed<TabPage[]>(() => [
    {
        id: TAB_MAPS,
        label: t("project.editor.tab.maps", { maps: maps.value.length }, "Maps ({maps})"),
        icon: null,
    },
    {
        id: TAB_STORAGES,
        label: t(
            "project.editor.tab.storages",
            { storages: props.project.storages.length },
            "Storages ({storages})",
        ),
        icon: null,
    },
    { id: TAB_RENDER, label: t("project.editor.tab.render", "How it renders"), icon: null },
    { id: TAB_HISTORY, label: t("project.editor.tab.history", "History"), icon: null },
    ...singletonTabs.value.map((tab) => ({ id: tab.id, label: tab.label, icon: null })),
]);

/**
 * The Project Editor has two complementary ways to move through a project:
 *
 * - `TabbedNavigation` remains the durable, fully featured browser-style tab strip shared by
 *   every settings surface; and
 * - this tree is the project-shaped route from the approved redesign. It names the actual map
 *   and storage records a person is about to edit, instead of asking them to first infer which
 *   generic tab might contain them.
 *
 * It deliberately does not claim the `tree` ARIA role. Native buttons already give the tree a
 * complete keyboard route, whereas the ARIA tree pattern would require a separate arrow-key
 * model and roving focus. A visual tree with an incomplete keyboard tree model would be worse
 * than a plainly labelled navigation list.
 */
type WorkspaceNodeKind = "section" | "map" | "storage" | "render" | "history" | "singleton";

interface WorkspaceNode {
    readonly id: string;
    readonly page: string;
    readonly label: string;
    readonly detail: string;
    readonly kind: WorkspaceNodeKind;
    readonly depth: 0 | 1;
    readonly mapId?: string;
    readonly storageId?: string;
}

const activeWorkspaceNode = ref(TAB_MAPS);

const workspaceNodes = computed<readonly WorkspaceNode[]>(() => [
    {
        id: TAB_MAPS,
        page: TAB_MAPS,
        label: t("project.workspace.maps", "Maps"),
        detail: t("project.workspace.mapsCount", { count: maps.value.length }, "{count} map(s)"),
        kind: "section",
        depth: 0,
    },
    ...maps.value.map<WorkspaceNode>((map) => ({
        id: `map:${map.id}`,
        page: TAB_MAPS,
        label: map.name,
        detail: map.enabled
            ? t(
                  "project.workspace.mapDetail",
                  { id: map.id, dimension: map.dimension },
                  "{id} · {dimension}",
              )
            : t("project.workspace.mapDisabled", { id: map.id }, "{id} · disabled"),
        kind: "map",
        depth: 1,
        mapId: map.id,
    })),
    {
        id: TAB_STORAGES,
        page: TAB_STORAGES,
        label: t("project.workspace.storages", "Storages"),
        detail: t(
            "project.workspace.storagesCount",
            { count: props.project.storages.length },
            "{count} storage(s)",
        ),
        kind: "section",
        depth: 0,
    },
    ...props.project.storages.map<WorkspaceNode>((storage) => ({
        id: `storage:${storage.id}`,
        page: TAB_STORAGES,
        label: storage.id,
        detail: t("project.workspace.storageDetail", "Tile storage"),
        kind: "storage",
        depth: 1,
        storageId: storage.id,
    })),
    {
        id: TAB_RENDER,
        page: TAB_RENDER,
        label: t("project.workspace.render", "How it renders"),
        detail:
            selectedRenderRoute.value === "github-actions"
                ? t("project.workspace.renderActions", "GitHub Actions")
                : t("project.workspace.renderLocal", "This computer"),
        kind: "render",
        depth: 0,
    },
    {
        id: TAB_HISTORY,
        page: TAB_HISTORY,
        label: t("project.workspace.history", "History"),
        detail: t("project.workspace.historyDetail", "Local project revisions"),
        kind: "history",
        depth: 0,
    },
    ...singletonTabs.value.map<WorkspaceNode>((tab) => ({
        id: tab.id,
        page: tab.id,
        label: tab.label,
        detail: tab.touched
            ? t("project.workspace.singletonOwn", { file: `${tab.id}.conf` }, "Uses its own {file}")
            : t(
                  "project.workspace.singletonDefault",
                  { file: `${tab.id}.conf` },
                  "Follows BlueMap's {file} defaults",
              ),
        kind: "singleton",
        depth: 0,
    })),
]);

watch(
    workspaceNodes,
    (nodes) => {
        if (!nodes.some((node) => node.id === activeWorkspaceNode.value)) {
            activeWorkspaceNode.value = TAB_MAPS;
        }
    },
    { immediate: true },
);

function workspaceNodeForPage(pageId: string): string {
    if (pageId === TAB_MAPS && selectedMap.value !== null) {
        const mapNode = "map:" + selectedMap.value;
        if (workspaceNodes.value.some((node) => node.id === mapNode)) return mapNode;
    }
    if (pageId === TAB_STORAGES && selectedStorage.value !== null) {
        const storageNode = "storage:" + selectedStorage.value;
        if (workspaceNodes.value.some((node) => node.id === storageNode)) return storageNode;
    }
    return workspaceNodes.value.some((node) => node.id === pageId) ? pageId : TAB_MAPS;
}

function syncWorkspaceNode(pageId: string | undefined): void {
    if (pageId === undefined) return;
    activeWorkspaceNode.value = workspaceNodeForPage(pageId);
}

function queueWorkspaceNodeSync(): void {
    void nextTick(() => syncWorkspaceNode(tabsNav.value?.activePage?.id as string | undefined));
}

/**
 * Tree clicks already reveal the equivalent section. The inverse matters just as much:
 * TabbedNavigation can select a page through its keyboard routes, finder, or restored workspace
 * without touching this tree. Queue an authoritative read after those routes have completed so
 * aria-current never lags behind the tab strip.
 */
onMounted(queueWorkspaceNodeSync);

function selectMap(value: string | null): void {
    selectedMap.value = value;
    if (tabsNav.value?.activePage?.id === TAB_MAPS) syncWorkspaceNode(TAB_MAPS);
}

function selectStorage(value: string | null): void {
    selectedStorage.value = value;
    if (tabsNav.value?.activePage?.id === TAB_STORAGES) syncWorkspaceNode(TAB_STORAGES);
}

function revealWorkspaceNode(node: WorkspaceNode): void {
    activeWorkspaceNode.value = node.id;
    if (node.mapId !== undefined) selectMap(node.mapId);
    if (node.storageId !== undefined) selectStorage(node.storageId);
    tabsNav.value?.revealPage(node.page);
}

/**
 * This rail names both requests the editor resolves: the structured desktop-bridge request,
 * which carries the project map bodies and bridge-only options, and the standalone CLI flag
 * model. The command preview uses only existing config resolver functions, so force and
 * fix-edges precedence cannot drift from the CLI.
 */
const enabledMaps = computed(() => maps.value.filter((map) => map.enabled));

const canResolveStandaloneCliPreview = computed(
    () =>
        selectedRenderRoute.value === "local" &&
        enabledMaps.value.length > 0 &&
        problems.value.length === 0,
);

const cliInvocation = computed<CliInvocation>(() => {
    const ready = canResolveStandaloneCliPreview.value;
    return {
        ...EMPTY_INVOCATION,
        render: ready,
        forceRender: ready && props.project.render.force,
        fixEdges: ready && props.project.render.fixEdges,
        maps: ready ? enabledMaps.value.map((map) => map.id) : null,
    };
});

const resolvedCliActions = computed<ResolvedCliActions>(() =>
    resolveCliActions(cliInvocation.value),
);

const resolvedCliCommand = computed<string | null>(() => {
    if (resolvedCliActions.value.render === null) return null;
    return ["bluemap-cli", ...buildCliArgs(cliInvocation.value)].join(" ");
});

const resolvedCliSummary = computed(() => {
    const render = resolvedCliActions.value.render;
    if (render === null) return null;

    const maps =
        render.maps === null
            ? t("project.context.cliAllMaps", "every map")
            : t("project.context.cliOnlyMaps", { maps: render.maps.join(", ") }, "only {maps}");
    const force =
        render.force === "all"
            ? t("project.context.cliForceAll", "re-rendering everything")
            : render.force === "edge"
              ? t(
                    "project.context.cliForceEdges",
                    "re-rendering changed chunks and their edges",
                )
              : t("project.context.cliForceChanged", "rendering only changed chunks");
    return t(
        "project.context.cliSummary",
        { maps, force },
        "The standalone CLI resolves to rendering {maps}, {force}.",
    );
});

const resolvedCliUnavailableReason = computed(() =>
    selectedRenderRoute.value === "github-actions"
        ? t(
              "project.context.cliActionsRoute",
              "GitHub Actions owns this start, so the local CLI resolver has no command to show.",
          )
        : t(
              "project.context.cliNeedsMap",
              "Choose a valid enabled map on this computer before a standalone CLI preview can be resolved.",
          ),
);

const resolvedRunRows = computed(() => [
    {
        label: t("project.context.route", "Route"),
        value:
            selectedRenderRoute.value === "github-actions"
                ? t("project.context.routeActions", "GitHub Actions workflow")
                : t("project.context.routeLocal", "Desktop render bridge"),
    },
    {
        label: t("project.context.maps", "Enabled maps"),
        value:
            enabledMaps.value.length === 0
                ? t("project.context.noEnabledMaps", "None")
                : enabledMaps.value.map((map) => map.id).join(", "),
    },
    {
        label: t("project.context.projectFile", "Project source"),
        value: `${PROJECT_FILE_NAME} · ${props.world}`,
    },
]);

const savePlan = computed(() => [
    {
        verb: isDirty.value
            ? t("project.context.savePlan.write", "write")
            : t("project.context.savePlan.current", "current"),
        target: PROJECT_FILE_NAME,
        detail: isDirty.value
            ? t(
                  "project.context.savePlan.pending",
                  "The editor differs from its last confirmed project state.",
              )
            : t(
                  "project.context.savePlan.noPending",
                  "The editor matches its last confirmed project state.",
              ),
    },
    {
        verb: t("project.context.savePlan.record", "record"),
        target: t("project.context.savePlan.history", "local project history"),
        detail: t(
            "project.context.savePlan.historyDetail",
            "A revision is recorded only after a successful project-file write changes its bytes.",
        ),
    },
]);

const consequenceRows = computed(() => {
    if (problemTexts.value.length > 0) return problemTexts.value;
    if (isRendering.value)
        return [
            t(
                "project.context.rendering",
                "A render is already running, so a second start remains unavailable.",
            ),
        ];
    if (enabledMaps.value.length === 0)
        return [t("project.context.noMaps", "No enabled map will be sent to a render yet.")];
    return [
        t(
            "project.context.ready",
            { maps: enabledMaps.value.length },
            "{maps} enabled map(s) are ready for the selected route.",
        ),
    ];
});

watch(
    pages,
    (list) => {
        for (const page of list) tabsNav.value?.renamePage(page.id, page.label);
    },
    { deep: true },
);

/* -------------------------------------------------------------------------- */
/* The four singletons                                                        */
/* -------------------------------------------------------------------------- */

function singletonFile(kind: SingletonKind) {
    return openSingletonFile(props.project, kind);
}

function onSingletonSet(kind: SingletonKind, field: FieldMeta, value: PlainValue): void {
    emit(
        "update:project",
        withSingleton(props.project, kind, setFieldValue(singletonFile(kind), field, value).text),
    );
}

function onSingletonClear(kind: SingletonKind, field: FieldMeta): void {
    emit(
        "update:project",
        withSingleton(props.project, kind, clearFieldValue(singletonFile(kind), field).text),
    );
}

function onSingletonText(kind: SingletonKind, text: string): void {
    emit(
        "update:project",
        withSingleton(props.project, kind, replaceText(singletonFile(kind), text).text),
    );
}

/* -------------------------------------------------------------------------- */
/* How the render is run                                                      */
/* -------------------------------------------------------------------------- */

/**
 * This tab's own search, over its own rows.
 *
 * Every settings surface carries one, and a surface is not exempt for being small: somebody
 * who remembers the word "threads" should be able to type it anywhere settings live and
 * land on the control. Plain text stays the default and the anchored builder comes with the
 * shared field.
 */
const runQuery = ref("");
const runRegex = ref(false);
const runFlags = ref("im");

const runMatcher = computed(() =>
    createSettingMatcher(runQuery.value, runRegex.value, runFlags.value),
);

interface RunRow {
    readonly id: "route" | "threads" | "force" | "fixEdges" | "metrics" | "outputFolder";
    readonly label: string;
    readonly hint: string;
}

const runRows = computed<RunRow[]>(() => [
    {
        id: "route",
        label: t("project.render.route", "Where this project renders"),
        hint: t(
            "project.render.routeHint",
            "Use this computer for a local render, or GitHub Actions for a click-and-run render that keeps going after this computer is off.",
        ),
    },
    {
        id: "threads",
        label: t("project.render.threads", "Render threads"),
        hint: t(
            "project.render.threadsHint",
            "How many chunks are drawn at once. Left empty, BlueMap decides from the machine it is on, which is usually the right answer.",
        ),
    },
    {
        id: "force",
        label: t("project.render.force", "Draw everything again"),
        hint: t(
            "project.render.forceHint",
            "Redraws every chunk rather than only the ones that changed. Slow, and what you want after changing how the map looks.",
        ),
    },
    {
        id: "fixEdges",
        label: t("project.render.fixEdges", "Redraw the edges too"),
        hint: t(
            "project.render.fixEdgesHint",
            "Redraws the boundary between chunks as well as the chunks themselves, which is what fixes seams left by an interrupted render.",
        ),
    },
    {
        id: "metrics",
        label: t("project.render.metrics", "Send BlueMap's anonymous usage report"),
        hint: t(
            "project.render.metricsHint",
            "Off unless deliberately turned on. Nothing about your world is in it.",
        ),
    },
    {
        id: "outputFolder",
        label: t("project.render.outputFolder", "Where the rendered map is written"),
        hint: t(
            "project.render.outputFolderHint",
            "Left empty, the app writes into the folder chosen during setup. This is the one absolute path a project carries, because the output belongs outside the world the file lives in.",
        ),
    },
]);

const visibleRunRows = computed(() =>
    runRows.value.filter((row) => runMatcher.value.test(`${row.label}\n${row.id}\n${row.hint}`)),
);

function showsRun(id: RunRow["id"]): boolean {
    return visibleRunRows.value.some((row) => row.id === id);
}

const runSummary = computed(() =>
    runMatcher.value.error !== null
        ? t("project.render.badPattern", "The pattern is not valid, so nothing is shown.")
        : runMatcher.value.active
          ? t(
                "project.render.searchSummary",
                { shown: visibleRunRows.value.length, total: runRows.value.length },
                "{shown} of {total} settings match.",
            )
          : "",
);

const runSample = computed(() => runRows.value.map((row) => `${row.label} ${row.hint}`).join("\n"));

/**
 * The lightweight default indicator these five render options never had.
 *
 * Every real config setting shown elsewhere in this editor - a map's fields, a storage's
 * fields, the four whole-file singletons - already goes through `../config/ConfigField.vue`,
 * which has carried a "this is BlueMap's own default" line and a one-click reset since
 * before this task. These six (`route`, `threads`, `force`, `fixEdges`, `metrics`, `outputFolder`)
 * are project-level render options with no `FieldMeta` behind them, so they never got that
 * for free; this is that same idea, applied here.
 */
function fieldDefaultText(key: RenderFieldKey, value: PlainValue | null): string {
    if (isRenderFieldDefault(props.project, key)) {
        return t("project.fieldDefault.atDefault", "This already matches BlueMap's own default.");
    }
    const nothing = t("config.field.nothing", "nothing");
    const shown = valueToText(value ?? undefined) || nothing;
    const defaultShown = valueToText((EMPTY_RENDER[key] as PlainValue) ?? undefined) || nothing;
    return t(
        "project.fieldDefault.changed",
        { value: shown, default: defaultShown },
        "Set to {value}. BlueMap's default is {default}.",
    );
}

function resetRenderField(key: RenderFieldKey): void {
    emit("update:project", withRenderFieldDefault(props.project, key));
}

function setThreads(value: string): void {
    const trimmed = value.trim();
    if (trimmed === "") {
        emit("update:project", withRender(props.project, { threads: null }));
        return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 1) return;
    emit("update:project", withRender(props.project, { threads: Math.trunc(parsed) }));
}

function setOutputFolder(value: string): void {
    const trimmed = value.trim();
    emit(
        "update:project",
        withRender(props.project, { outputFolder: trimmed === "" ? null : trimmed }),
    );
}

const renderRouteItems = computed(() => [
    {
        title: t("project.render.routeLocal", "This computer"),
        value: "local" as const,
    },
    {
        title: t(
            "project.render.routeActions",
            "GitHub Actions (works while this computer is off)",
        ),
        value: "github-actions" as const,
    },
]);

function setRenderRoute(value: "local" | "github-actions" | null): void {
    if (value === null) return;
    emit("update:project", withRender(props.project, { route: value }));
}

const renderButtonLabel = computed(() =>
    selectedRenderRoute.value === "github-actions"
        ? t(
              "project.editor.renderCloud",
              { maps: maps.value.filter((map) => map.enabled).length },
              "Render with GitHub Actions ({maps} maps)",
          )
        : t(
              "project.editor.render",
              { maps: maps.value.filter((map) => map.enabled).length },
              "Render on this computer ({maps} maps)",
          ),
);
</script>

<template>
    <div class="mb-project-editor">
        <v-card class="mb-project-editor__head">
            <v-card-text>
                <div class="mb-project-editor__headrow">
                    <v-btn
                        :prepend-icon="mdiArrowLeft"
                        variant="text"
                        size="small"
                        @click="emit('close')"
                    >
                        {{ t("project.editor.back", "All projects") }}
                    </v-btn>
                    <v-spacer />
                    <v-chip v-if="project.fromWizard" size="small" variant="tonal">
                        {{ t("project.editor.fromWizard", "made by the guide") }}
                    </v-chip>
                    <v-chip v-if="isDirty" size="small" color="warning" variant="tonal">
                        {{ t("project.editor.unsaved", "Unsaved changes") }}
                    </v-chip>
                </div>

                <v-text-field
                    :model-value="project.name"
                    :label="t('project.editor.name', 'Project name')"
                    variant="outlined"
                    density="compact"
                    hide-details="auto"
                    class="mt-2"
                    @update:model-value="
                        (value: string) => emit('update:project', withName(project, value))
                    "
                />

                <p class="mb-project-editor__path">
                    {{ t("project.editor.world", { world }, "Lives at the root of {world}") }}
                </p>
                <p class="mb-project-editor__note">
                    {{
                        t(
                            "project.editor.blurb",
                            "Everything below is applied when this project renders, so a second render repeats the first without asking anything again. The world is wherever this file was found; moving the folder moves the project with it.",
                        )
                    }}
                </p>

                <v-progress-linear v-if="isSaving" indeterminate color="primary" class="mt-2" />

                <v-alert
                    v-if="saveFailure"
                    type="error"
                    density="compact"
                    variant="tonal"
                    class="mt-2"
                    role="alert"
                >
                    {{ saveFailure }}
                </v-alert>

                <v-alert
                    v-for="problem in problemTexts"
                    :key="problem"
                    type="warning"
                    density="compact"
                    variant="tonal"
                    class="mt-2"
                >
                    {{ problem }}
                </v-alert>

                <div class="mb-project-editor__actions">
                    <v-btn
                        :prepend-icon="mdiContentSaveOutline"
                        :disabled="!isDirty || isSaving"
                        color="primary"
                        variant="flat"
                        @click="emit('save')"
                    >
                        {{ t("project.editor.save", "Save now") }}
                    </v-btn>
                    <v-btn
                        :prepend-icon="mdiUndoVariant"
                        :disabled="!isDirty || isSaving"
                        variant="text"
                        @click="emit('revert')"
                    >
                        {{ t("project.editor.revert", "Discard these changes") }}
                    </v-btn>
                    <v-spacer />
                    <v-btn
                        :prepend-icon="mdiPlay"
                        :disabled="!canStart"
                        color="primary"
                        variant="tonal"
                        @click="emit('render')"
                    >
                        {{ renderButtonLabel }}
                    </v-btn>
                </div>

                <p v-if="!renderable" class="mb-project-editor__note">
                    {{
                        t(
                            "project.editor.noEngine",
                            "This build cannot render locally. Every setting here is real and saved to the project either way; starting a render needs the desktop app.",
                        )
                    }}
                </p>
            </v-card-text>
        </v-card>

        <div class="mb-project-editor__workspace">
            <nav
                class="mb-project-editor__navigator"
                :aria-label="t('project.workspace.label', 'Project structure')"
            >
                <div class="mb-project-editor__navigator-head">
                    <p class="mb-project-editor__eyebrow">
                        {{ t("project.workspace.heading", "Project structure") }}
                    </p>
                    <p class="mb-project-editor__navigator-note">
                        {{
                            t(
                                "project.workspace.note",
                                "Choose a record to bring its real settings into view.",
                            )
                        }}
                    </p>
                </div>
                <div class="mb-project-editor__navigator-list">
                    <button
                        v-for="node in workspaceNodes"
                        :key="node.id"
                        type="button"
                        class="mb-project-editor__navigator-node"
                        :class="[
                            `mb-project-editor__navigator-node--${node.kind}`,
                            `mb-project-editor__navigator-node--depth-${node.depth}`,
                            {
                                'mb-project-editor__navigator-node--active':
                                    activeWorkspaceNode === node.id,
                            },
                        ]"
                        :data-workspace-node="node.id"
                        :aria-current="activeWorkspaceNode === node.id ? 'page' : undefined"
                        :title="node.detail"
                        @click="revealWorkspaceNode(node)"
                    >
                        <span class="mb-project-editor__navigator-label">{{ node.label }}</span>
                        <span class="mb-project-editor__navigator-detail">{{ node.detail }}</span>
                    </button>
                </div>
            </nav>

            <section
                class="mb-project-editor__workspace-editor"
                :aria-label="t('project.workspace.editorLabel', 'Project settings editor')"
                @click="queueWorkspaceNodeSync"
                @keydown="queueWorkspaceNodeSync"
            >
                <TabbedNavigation
                    ref="tabsNav"
                    :pages="pages"
                    storage-key="worldlens-project-editor-tabs"
                    :window-label="t('project.editor.windowLabel', 'This project')"
                    :strip-label="t('project.editor.tabsLabel', 'Project sections')"
                    class="mb-project-editor__tabs"
                >
                    <template #maps>
                        <ProjectMapsPanel
                            :project="project"
                            :world="world"
                            :separator="separatorValue"
                            :default-root="defaultRootValue"
                            :selected-id="selectedMap"
                            @update:project="(value) => emit('update:project', value)"
                            @update:selected-id="selectMap"
                            @consent="emit('consent')"
                            @notify="(message) => emit('notify', message)"
                        />
                    </template>

                    <template #storages>
                        <ProjectStoragesPanel
                            :project="project"
                            :default-root="defaultRootValue"
                            :separator="separatorValue"
                            :selected-id="selectedStorage"
                            @update:project="(value) => emit('update:project', value)"
                            @update:selected-id="selectStorage"
                            @consent="emit('consent')"
                            @notify="(message) => emit('notify', message)"
                        />
                    </template>

                    <template #render>
                        <section
                            class="mb-project-editor__run"
                            :aria-label="t('project.editor.tab.render', 'How it renders')"
                        >
                            <ConfigSearchField
                                v-model="runQuery"
                                v-model:regex="runRegex"
                                v-model:flags="runFlags"
                                :label="t('project.render.search', 'Search these settings')"
                                :placeholder="
                                    t('project.render.searchHint', 'threads, edges, output')
                                "
                                :sample="runSample"
                                :summary="runSummary"
                            />

                            <v-select
                                v-if="showsRun('route')"
                                :model-value="selectedRenderRoute"
                                :items="renderRouteItems"
                                :label="t('project.render.route', 'Where this project renders')"
                                :hint="
                                    t(
                                        'project.render.routeHint',
                                        'Use this computer for a local render, or GitHub Actions for a click-and-run render that keeps going after this computer is off.',
                                    )
                                "
                                persistent-hint
                                variant="outlined"
                                density="compact"
                                class="mt-3"
                                @update:model-value="setRenderRoute"
                            />
                            <div v-if="showsRun('route')" class="mb-project-editor__fieldDefault">
                                <span>{{ fieldDefaultText("route", selectedRenderRoute) }}</span>
                                <v-btn
                                    v-if="!isRenderFieldDefault(project, 'route')"
                                    variant="text"
                                    size="x-small"
                                    density="comfortable"
                                    @click="resetRenderField('route')"
                                >
                                    {{
                                        t(
                                            "project.fieldDefault.reset",
                                            "Reset to BlueMap's default",
                                        )
                                    }}
                                </v-btn>
                            </div>

                            <v-text-field
                                v-if="showsRun('threads')"
                                :model-value="project.render.threads ?? ''"
                                :label="t('project.render.threads', 'Render threads')"
                                :hint="
                                    t(
                                        'project.render.threadsHint',
                                        'How many chunks are drawn at once. Left empty, BlueMap decides from the machine it is on, which is usually the right answer.',
                                    )
                                "
                                persistent-hint
                                type="number"
                                min="1"
                                variant="outlined"
                                density="compact"
                                class="mt-3"
                                @update:model-value="setThreads"
                            />
                            <div v-if="showsRun('threads')" class="mb-project-editor__fieldDefault">
                                <span>{{
                                    fieldDefaultText("threads", project.render.threads)
                                }}</span>
                                <v-btn
                                    v-if="!isRenderFieldDefault(project, 'threads')"
                                    variant="text"
                                    size="x-small"
                                    density="comfortable"
                                    @click="resetRenderField('threads')"
                                >
                                    {{
                                        t(
                                            "project.fieldDefault.reset",
                                            "Reset to BlueMap's default",
                                        )
                                    }}
                                </v-btn>
                            </div>

                            <v-switch
                                v-if="showsRun('force')"
                                :model-value="project.render.force"
                                :label="t('project.render.force', 'Draw everything again')"
                                :hint="
                                    t(
                                        'project.render.forceHint',
                                        'Redraws every chunk rather than only the ones that changed. Slow, and what you want after changing how the map looks.',
                                    )
                                "
                                persistent-hint
                                color="primary"
                                density="compact"
                                inset
                                @update:model-value="
                                    (value: boolean | null) =>
                                        emit(
                                            'update:project',
                                            withRender(project, { force: value === true }),
                                        )
                                "
                            />
                            <div v-if="showsRun('force')" class="mb-project-editor__fieldDefault">
                                <span>{{ fieldDefaultText("force", project.render.force) }}</span>
                                <v-btn
                                    v-if="!isRenderFieldDefault(project, 'force')"
                                    variant="text"
                                    size="x-small"
                                    density="comfortable"
                                    @click="resetRenderField('force')"
                                >
                                    {{
                                        t(
                                            "project.fieldDefault.reset",
                                            "Reset to BlueMap's default",
                                        )
                                    }}
                                </v-btn>
                            </div>

                            <v-switch
                                v-if="showsRun('fixEdges')"
                                :model-value="project.render.fixEdges"
                                :label="t('project.render.fixEdges', 'Redraw the edges too')"
                                :hint="
                                    t(
                                        'project.render.fixEdgesHint',
                                        'Redraws the boundary between chunks as well as the chunks themselves, which is what fixes seams left by an interrupted render.',
                                    )
                                "
                                persistent-hint
                                color="primary"
                                density="compact"
                                inset
                                @update:model-value="
                                    (value: boolean | null) =>
                                        emit(
                                            'update:project',
                                            withRender(project, { fixEdges: value === true }),
                                        )
                                "
                            />
                            <div
                                v-if="showsRun('fixEdges')"
                                class="mb-project-editor__fieldDefault"
                            >
                                <span>{{
                                    fieldDefaultText("fixEdges", project.render.fixEdges)
                                }}</span>
                                <v-btn
                                    v-if="!isRenderFieldDefault(project, 'fixEdges')"
                                    variant="text"
                                    size="x-small"
                                    density="comfortable"
                                    @click="resetRenderField('fixEdges')"
                                >
                                    {{
                                        t(
                                            "project.fieldDefault.reset",
                                            "Reset to BlueMap's default",
                                        )
                                    }}
                                </v-btn>
                            </div>

                            <v-switch
                                v-if="showsRun('metrics')"
                                :model-value="project.render.metrics"
                                :label="
                                    t(
                                        'project.render.metrics',
                                        'Send BlueMap\'s anonymous usage report',
                                    )
                                "
                                :hint="
                                    t(
                                        'project.render.metricsHint',
                                        'Off unless deliberately turned on. Nothing about your world is in it.',
                                    )
                                "
                                persistent-hint
                                color="primary"
                                density="compact"
                                inset
                                @update:model-value="
                                    (value: boolean | null) =>
                                        emit(
                                            'update:project',
                                            withRender(project, { metrics: value === true }),
                                        )
                                "
                            />
                            <div v-if="showsRun('metrics')" class="mb-project-editor__fieldDefault">
                                <span>{{
                                    fieldDefaultText("metrics", project.render.metrics)
                                }}</span>
                                <v-btn
                                    v-if="!isRenderFieldDefault(project, 'metrics')"
                                    variant="text"
                                    size="x-small"
                                    density="comfortable"
                                    @click="resetRenderField('metrics')"
                                >
                                    {{
                                        t(
                                            "project.fieldDefault.reset",
                                            "Reset to BlueMap's default",
                                        )
                                    }}
                                </v-btn>
                            </div>

                            <PathField
                                v-if="showsRun('outputFolder')"
                                :model-value="project.render.outputFolder ?? ''"
                                field="the render output folder"
                                semantic="folder"
                                :label="
                                    t(
                                        'project.render.outputFolder',
                                        'Where the rendered map is written',
                                    )
                                "
                                class="mt-3"
                                @update:model-value="setOutputFolder"
                            />
                            <p v-if="showsRun('outputFolder')" class="mb-project-editor__note">
                                {{
                                    t(
                                        "project.render.outputFolderHint",
                                        "Left empty, the app writes into the folder chosen during setup. This is the one absolute path a project carries, because the output belongs outside the world the file lives in.",
                                    )
                                }}
                            </p>
                            <div
                                v-if="showsRun('outputFolder')"
                                class="mb-project-editor__fieldDefault"
                            >
                                <span>{{
                                    fieldDefaultText("outputFolder", project.render.outputFolder)
                                }}</span>
                                <v-btn
                                    v-if="!isRenderFieldDefault(project, 'outputFolder')"
                                    variant="text"
                                    size="x-small"
                                    density="comfortable"
                                    @click="resetRenderField('outputFolder')"
                                >
                                    {{
                                        t(
                                            "project.fieldDefault.reset",
                                            "Reset to BlueMap's default",
                                        )
                                    }}
                                </v-btn>
                            </div>

                            <p v-if="visibleRunRows.length === 0" class="mb-project-editor__note">
                                {{
                                    t(
                                        "project.render.noMatches",
                                        "Nothing on this tab matches. The other tabs may still have results.",
                                    )
                                }}
                            </p>
                        </section>
                    </template>

                    <template #history>
                        <SimpleHistoryList
                            :title="t('project.editor.tab.history', 'History')"
                            :host="projectHistoryHost"
                        />
                    </template>

                    <template v-for="tab in singletonTabs" :key="tab.id" #[tab.id]>
                        <p class="mb-project-editor__note">
                            {{
                                tab.touched
                                    ? t(
                                          "project.editor.singletonTouched",
                                          { file: `${tab.id}.conf` },
                                          "This project carries its own {file}, so these values are used instead of BlueMap's defaults.",
                                      )
                                    : t(
                                          "project.editor.singletonAbsent",
                                          { file: `${tab.id}.conf` },
                                          "This project carries no {file} of its own, so BlueMap's own defaults apply. Change anything below and the project starts carrying one, holding only what you set.",
                                      )
                            }}
                        </p>
                        <ConfigFileForm
                            :file="singletonFile(tab.id)"
                            @set="(field, value) => onSingletonSet(tab.id, field, value)"
                            @clear="(field) => onSingletonClear(tab.id, field)"
                            @consent="emit('consent')"
                            @update:text="(text) => onSingletonText(tab.id, text)"
                        />
                    </template>
                </TabbedNavigation>
            </section>

            <aside
                class="mb-project-editor__context"
                :aria-label="t('project.context.label', 'Render consequences and save plan')"
            >
                <section class="mb-project-editor__context-section">
                    <p class="mb-project-editor__eyebrow">
                        {{ t("project.context.consequences", "Consequences") }}
                    </p>
                    <ul class="mb-project-editor__context-list">
                        <li v-for="row in consequenceRows" :key="row">{{ row }}</li>
                    </ul>
                </section>

                <section class="mb-project-editor__context-section">
                    <p class="mb-project-editor__eyebrow">
                        {{ t("project.context.cliPreview", "Resolved bluemap-cli preview") }}
                    </p>
                    <template v-if="resolvedCliCommand !== null && resolvedCliSummary !== null">
                        <pre class="mb-project-editor__cli-command" data-project-cli-command>{{
                            resolvedCliCommand
                        }}</pre>
                        <p class="mb-project-editor__context-note">{{ resolvedCliSummary }}</p>
                        <p class="mb-project-editor__context-note">
                            {{
                                t(
                                    "project.context.cliBridgeNote",
                                    "The desktop bridge still starts this project. Its map bodies, threads, metrics and output directory travel in the structured request; this preview shows only flags the CLI model actually owns.",
                                )
                            }}
                        </p>
                    </template>
                    <p v-else class="mb-project-editor__context-note">
                        {{
                            t(
                                "project.context.cliUnavailable",
                                { reason: resolvedCliUnavailableReason },
                                "No CLI preview: {reason}",
                            )
                        }}
                    </p>
                    <dl class="mb-project-editor__context-definition-list">
                        <template v-for="row in resolvedRunRows" :key="row.label">
                            <dt>{{ row.label }}</dt>
                            <dd>{{ row.value }}</dd>
                        </template>
                    </dl>
                </section>

                <section class="mb-project-editor__context-section">
                    <p class="mb-project-editor__eyebrow">
                        {{ t("project.context.savePlan", "Save plan") }}
                    </p>
                    <ol class="mb-project-editor__save-plan">
                        <li v-for="step in savePlan" :key="step.target">
                            <code
                                ><span>{{ step.verb }}</span> {{ step.target }}</code
                            >
                            <p>{{ step.detail }}</p>
                        </li>
                    </ol>
                </section>
            </aside>
        </div>
    </div>
</template>

<style>
.mb-project-editor {
    display: flex;
    flex-direction: column;
    gap: 12px;
    inline-size: 100%;
    min-inline-size: 0;
    box-sizing: border-box;
    overflow-x: clip;
    container: project-editor / inline-size;
}

.mb-project-editor__head {
    border-radius: 16px;
    min-inline-size: 0;
}

.mb-project-editor__headrow {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    min-inline-size: 0;
}

.mb-project-editor__actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-block-start: 12px;
    min-inline-size: 0;
}

.mb-project-editor__headrow .v-btn,
.mb-project-editor__actions .v-btn,
.mb-project-editor__fieldDefault .v-btn {
    min-block-size: 44px;
    block-size: auto;
    max-inline-size: 100%;
}

.mb-project-editor__headrow .v-btn .v-btn__content,
.mb-project-editor__actions .v-btn .v-btn__content,
.mb-project-editor__fieldDefault .v-btn .v-btn__content {
    white-space: normal;
    overflow-wrap: anywhere;
    text-align: start;
}

.mb-project-editor .v-field {
    min-block-size: 44px;
}

.mb-project-editor__path {
    margin-block-start: 8px;
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.6875rem;
    color: rgba(var(--v-theme-on-surface), var(--v-disabled-opacity));
    overflow-wrap: anywhere;
}

.mb-project-editor__note {
    font-size: 0.75rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-wrap: pretty;
}

.mb-project-editor__tabs {
    flex: 1 1 auto;
    min-height: 0;
    min-inline-size: 0;
    container: project-editor / inline-size;
}

.mb-project-editor__tabs .mb-tabs__panel {
    min-inline-size: 0;
}

/**
 * The redesign's project-shaped workspace. `minmax(0, …)` is intentional: a map field can
 * contain a long, unbroken world path, and a grid item with its automatic minimum would make
 * that one value widen the whole application instead of wrapping inside the editor column.
 */
.mb-project-editor__workspace {
    display: grid;
    grid-template-columns: minmax(12rem, 0.72fr) minmax(0, 2fr) minmax(17rem, 0.9fr);
    align-items: start;
    gap: 12px;
    min-inline-size: 0;
}

.mb-project-editor__navigator,
.mb-project-editor__workspace-editor,
.mb-project-editor__context {
    min-inline-size: 0;
    border: 1px solid rgba(var(--v-theme-on-surface), var(--v-border-opacity));
    border-radius: 16px;
    background: rgb(var(--v-theme-surface));
}

.mb-project-editor__navigator,
.mb-project-editor__context {
    padding: 14px;
}

.mb-project-editor__workspace-editor {
    padding: 12px;
}

.mb-project-editor__navigator-head,
.mb-project-editor__context-section {
    min-inline-size: 0;
}

.mb-project-editor__context-section + .mb-project-editor__context-section {
    margin-block-start: 18px;
    padding-block-start: 18px;
    border-block-start: 1px solid rgba(var(--v-theme-on-surface), var(--v-border-opacity));
}

.mb-project-editor__eyebrow {
    margin: 0;
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    line-height: 1.3;
    text-transform: uppercase;
    color: rgb(var(--v-theme-primary));
}

.mb-project-editor__navigator-note,
.mb-project-editor__context-note,
.mb-project-editor__save-plan p {
    margin: 6px 0 0;
    font-size: 0.75rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    overflow-wrap: anywhere;
}

.mb-project-editor__navigator-list {
    display: grid;
    gap: 4px;
    margin-block-start: 12px;
}

.mb-project-editor__navigator-node {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 2px;
    inline-size: 100%;
    min-block-size: 44px;
    padding: 8px 10px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: rgb(var(--v-theme-on-surface));
    cursor: pointer;
    text-align: start;
}

.mb-project-editor__navigator-node:hover {
    background: rgba(var(--v-theme-on-surface), 0.08);
}

.mb-project-editor__navigator-node:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}

.mb-project-editor__navigator-node--active {
    background: rgb(var(--v-theme-primary-container));
    color: rgb(var(--v-theme-on-primary-container));
}

.mb-project-editor__navigator-node--active:hover {
    background: rgb(var(--v-theme-primary-container));
}

.mb-project-editor__navigator-node--depth-1 {
    margin-inline-start: 12px;
    inline-size: calc(100% - 12px);
}

.mb-project-editor__navigator-node--section,
.mb-project-editor__navigator-node--render,
.mb-project-editor__navigator-node--history,
.mb-project-editor__navigator-node--singleton {
    margin-block-start: 5px;
}

.mb-project-editor__navigator-label {
    min-inline-size: 0;
    overflow: hidden;
    font-size: 0.8125rem;
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.mb-project-editor__navigator-detail {
    min-inline-size: 0;
    overflow: hidden;
    font-size: 0.6875rem;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-project-editor__navigator-node--active .mb-project-editor__navigator-detail {
    color: rgba(var(--v-theme-on-primary-container), var(--v-medium-emphasis-opacity));
}

.mb-project-editor__context-list,
.mb-project-editor__save-plan {
    display: grid;
    gap: 8px;
    margin: 10px 0 0;
    padding-inline-start: 18px;
    font-size: 0.75rem;
    line-height: 1.5;
}

.mb-project-editor__context-list li,
.mb-project-editor__save-plan li {
    overflow-wrap: anywhere;
}

.mb-project-editor__context-definition-list {
    display: grid;
    grid-template-columns: minmax(5rem, auto) minmax(0, 1fr);
    gap: 6px 10px;
    margin: 10px 0 0;
    font-size: 0.75rem;
    line-height: 1.45;
}

.mb-project-editor__context-definition-list dt {
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-project-editor__context-definition-list dd {
    min-inline-size: 0;
    margin: 0;
    overflow-wrap: anywhere;
}

.mb-project-editor__cli-command {
    margin: 10px 0 0;
    padding: 10px;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
    border: 1px solid rgba(var(--v-theme-on-surface), var(--v-border-opacity));
    border-radius: 10px;
    background: rgba(var(--v-theme-on-surface), 0.04);
    color: rgb(var(--v-theme-on-surface));
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.6875rem;
    line-height: 1.5;
}

.mb-project-editor__save-plan {
    list-style: none;
    padding-inline-start: 0;
}

.mb-project-editor__save-plan li {
    padding: 9px 10px;
    border: 1px solid rgba(var(--v-theme-on-surface), var(--v-border-opacity));
    border-radius: 10px;
    background: rgba(var(--v-theme-on-surface), 0.04);
}

.mb-project-editor__save-plan code {
    display: block;
    color: rgb(var(--v-theme-on-surface));
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.6875rem;
    overflow-wrap: anywhere;
}

.mb-project-editor__save-plan code span {
    color: rgb(var(--v-theme-primary));
}

.mb-project-editor__run {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-inline-size: 720px;
    inline-size: 100%;
    min-inline-size: 0;
}

.mb-project-editor__fieldDefault {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-block-start: -4px;
    font-size: 0.6875rem;
    color: rgba(var(--v-theme-on-surface), var(--v-disabled-opacity));
    min-inline-size: 0;
    overflow-wrap: anywhere;
}

@container project-editor (max-width: 42rem) {
    .mb-project-editor__actions > .v-spacer {
        flex-basis: 100%;
        block-size: 0;
    }

    .mb-project-editor__actions .v-btn {
        flex: 1 1 12rem;
    }
}

@container project-editor (max-width: 72rem) {
    .mb-project-editor__workspace {
        grid-template-columns: minmax(12rem, 0.72fr) minmax(0, 1fr);
    }

    .mb-project-editor__context {
        grid-column: 1 / -1;
    }
}

@container project-editor (max-width: 52rem) {
    .mb-project-editor__workspace {
        grid-template-columns: minmax(0, 1fr);
    }

    .mb-project-editor__navigator-list {
        grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
    }

    .mb-project-editor__navigator-node--depth-1 {
        margin-inline-start: 0;
        inline-size: 100%;
    }

    .mb-project-editor__context {
        grid-column: auto;
    }
}
</style>
