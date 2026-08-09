<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiArrowLeft,
    mdiContentSaveOutline,
    mdiFolderOpenOutline,
    mdiPlay,
    mdiUndoVariant,
} from "@mdi/js";
import {
    VAlert,
    VBtn,
    VIcon,
    VProgressLinear,
    VSelect,
    VSpacer,
    VSwitch,
    VTextField,
} from "vuetify/components";
import type { FieldMeta, PlainValue, ProjectFile } from "@worldlens/config";
import PathField from "../PathField.vue";
import ConfigFileForm from "../config/ConfigFileForm.vue";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { clearFieldValue, replaceText, setFieldValue } from "../config/configModel.js";
import { valueToText } from "../config/fieldValue.js";
import { createSettingMatcher } from "../config/regexEngine.js";
import { TabbedNavigation, type TabPage } from "../tabs/index.js";
import { SimpleHistoryList } from "../history/index.js";
import ProjectMapsPanel from "./ProjectMapsPanel.vue";
import ProjectRenderOption from "./ProjectRenderOption.vue";
import ProjectStoragesPanel from "./ProjectStoragesPanel.vue";
import { resolveProjectHistoryHost } from "./projectHost.js";
import { editorSettingCount, savePlanFacts } from "./projectFacts.js";
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
    worldLeaf,
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
 *
 * That is also the one place this screen states the prototype's promise in its own words.
 * `Worldlens.dc.html` says a project "opens on BlueMap's own generated defaults" and that "a
 * value you never touch is written exactly as BlueMap would write it". The first half is
 * true here and is now said out loud, with a real count from the schema: every setting is on
 * screen, showing the value BlueMap itself would use, from the first second. The second half
 * is not true here and is not claimed - an untouched value is left out of the project
 * entirely, which renders identically and keeps the project honest about what somebody chose.
 *
 * ## What the save plan is, and what it is not
 *
 * A project is one JSON file at the root of a world folder, so the plan names that file, what
 * it will hold, and the two things a save deliberately does not touch. It is not a per-field
 * diff: this component is handed the project being edited and a `dirty` flag, never the copy
 * on disk, so a field-level list would have to be invented rather than derived. See
 * `projectFacts.ts`.
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
/* The page's own header                                                      */
/* -------------------------------------------------------------------------- */

/**
 * How many BlueMap settings this editor has on screen, counted from the schema rather than
 * written down. See `projectFacts.ts` for why the number is derived: the sentence beside it
 * claims every one of them is present and editable from the first second, and a claim about
 * a number is exactly the claim that goes quietly wrong when upstream adds a setting.
 */
const settingCount = computed(() => editorSettingCount());

/** The world's own folder name, which is what a person calls this project's world. */
const worldName = computed(() => worldLeaf(props.world));

/* -------------------------------------------------------------------------- */
/* What saving actually does                                                  */
/* -------------------------------------------------------------------------- */

const plan = computed(() =>
    savePlanFacts(props.project, props.world, separatorValue.value, isDirty.value),
);

interface PlanRow {
    readonly id: string;
    /** One word, in the mono column, so the three rows scan as a list of operations. */
    readonly verb: string;
    readonly detail: string;
}

/**
 * The three things a save does, in the order they happen.
 *
 * Every row is a real operation the application already performs: `ProjectsScreen.vue`'s
 * `save()` writes the one project file and reports the revision its history kept, and neither
 * it nor anything under it touches the world folder or the rendered tiles. The third row is
 * here precisely because that is the fear - somebody who thinks "save" might rewrite their
 * world has to be told plainly that it does not, on the surface that offers the button.
 */
const planRows = computed<PlanRow[]>(() => [
    {
        id: "write",
        verb: t("project.editor.planVerbWrite", "write"),
        detail: plan.value.changed
            ? t(
                  "project.editor.planFileDetail",
                  {
                      path: plan.value.file,
                      maps: plan.value.maps,
                      storages: plan.value.storages,
                      singletons: plan.value.singletons,
                  },
                  "{path}, holding {maps} maps, {storages} storages and {singletons} whole-file configs",
              )
            : t(
                  "project.editor.planNothing",
                  "nothing. The file on disk already says what this screen says.",
              ),
    },
    {
        id: "record",
        verb: t("project.editor.planVerbRecord", "record"),
        detail: t(
            "project.editor.planHistory",
            "one revision in this project's own local history, which the History tab reads back",
        ),
    },
    {
        id: "untouched",
        verb: t("project.editor.planVerbUntouched", "untouched"),
        detail: t(
            "project.editor.planUntouched",
            "the world folder itself, and every tile a previous render already wrote",
        ),
    },
]);

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
    /**
     * What changing this costs in work already done, or null when it costs nothing.
     *
     * Only two of the six do. `force` is a cost by definition - it is the switch that throws
     * away the "only what changed" optimisation - and `outputFolder` is the one people are
     * caught by, because pointing a project at a fresh folder silently leaves every rendered
     * tile behind in the old one and the next render starts from nothing. The other four are
     * genuinely cheap and are not decorated with a warning they have not earned.
     */
    readonly cost: string | null;
}

const runRows = computed<RunRow[]>(() => [
    {
        id: "route",
        label: t("project.render.route", "Where this project renders"),
        hint: t(
            "project.render.routeHint",
            "Use this computer for a local render, or GitHub Actions for a click-and-run render that keeps going after this computer is off.",
        ),
        cost: null,
    },
    {
        id: "threads",
        label: t("project.render.threads", "Render threads"),
        hint: t(
            "project.render.threadsHint",
            "How many chunks are drawn at once. Left empty, BlueMap decides from the machine it is on, which is usually the right answer.",
        ),
        cost: null,
    },
    {
        id: "force",
        label: t("project.render.force", "Draw everything again"),
        hint: t(
            "project.render.forceHint",
            "Redraws every chunk rather than only the ones that changed. Slow, and what you want after changing how the map looks.",
        ),
        cost: t(
            "project.render.forceCost",
            "With this on, the next render draws every tile again rather than only the ones that changed, so a world that took an hour takes that hour again.",
        ),
    },
    {
        id: "fixEdges",
        label: t("project.render.fixEdges", "Redraw the edges too"),
        hint: t(
            "project.render.fixEdgesHint",
            "Redraws the boundary between chunks as well as the chunks themselves, which is what fixes seams left by an interrupted render.",
        ),
        cost: null,
    },
    {
        id: "metrics",
        label: t("project.render.metrics", "Send BlueMap's anonymous usage report"),
        hint: t(
            "project.render.metricsHint",
            "Off unless deliberately turned on. Nothing about your world is in it.",
        ),
        cost: null,
    },
    {
        id: "outputFolder",
        label: t("project.render.outputFolder", "Where the rendered map is written"),
        hint: t(
            "project.render.outputFolderHint",
            "Left empty, the app writes into the folder chosen during setup. This is the one absolute path a project carries, because the output belongs outside the world the file lives in.",
        ),
        cost: t(
            "project.render.outputFolderCost",
            "Pointing this somewhere else leaves every tile already rendered behind in the old folder, so the next render draws the whole map from nothing into the new one.",
        ),
    },
]);

const visibleRunRows = computed(() =>
    runRows.value.filter((row) =>
        runMatcher.value.test(`${row.label}\n${row.id}\n${row.hint}\n${row.cost ?? ""}`),
    ),
);

function showsRun(id: RunRow["id"]): boolean {
    return visibleRunRows.value.some((row) => row.id === id);
}

function costOf(id: RunRow["id"]): string | null {
    return runRows.value.find((row) => row.id === id)?.cost ?? null;
}

const costBadge = computed(() => t("project.render.reRender", "re-renders tiles"));

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

/**
 * The revert action's label, naming the value it would restore.
 *
 * "Revert to default" is the version of this button that says nothing: it tells somebody a
 * default exists, which they can already see in the line beside it, and leaves them to press
 * it to find out what it is. "Revert to off" and "Revert to This computer" are answers.
 *
 * The route is the one option whose stored value and its label differ - the file says `local`
 * and the control says "This computer" - so the label is what the button names, because a
 * button that promises a value the control never shows is a button that lies twice.
 */
function revertLabel(key: RenderFieldKey): string {
    if (key === "route") {
        return t(
            "project.render.revert",
            { value: t("project.render.routeLocal", "This computer") },
            "Revert to {value}",
        );
    }
    const shown = valueToText((EMPTY_RENDER[key] as PlainValue) ?? undefined);
    return shown === ""
        ? t("project.render.revertEmpty", "Revert to empty")
        : t("project.render.revert", { value: shown }, "Revert to {value}");
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
        <!--
            The page header the editor simply did not have. `Worldlens.dc.html` opens a project
            on a 40px folder tile, the project's own name as the page title, a line of meta
            under it, and only then the controls - and the absence of all of that is most of
            why this screen still read as the previous application while everything around it
            had been rebuilt. A card with a back button in it is a dialog; a title with a lede
            under it is a page.
        -->
        <header class="mb-project-editor__header">
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
                <span v-if="project.fromWizard" class="mb-badge-pill">
                    {{ t("project.editor.fromWizard", "made by the guide") }}
                </span>
                <span v-if="isDirty" class="mb-badge-pill mb-project-editor__dirtyBadge">
                    {{ t("project.editor.unsaved", "waiting to auto-save") }}
                </span>
            </div>

            <div class="mb-project-editor__title">
                <span class="mb-icon-tile" aria-hidden="true">
                    <v-icon :icon="mdiFolderOpenOutline" size="21" />
                </span>
                <div class="mb-project-editor__titleText">
                    <h1>{{ project.name }}</h1>
                    <p class="mb-meta">
                        {{
                            t(
                                "project.editor.headMeta",
                                {
                                    maps: maps.length,
                                    storages: project.storages.length,
                                    world: worldName,
                                },
                                "{maps} maps and {storages} storages, in the world {world}",
                            )
                        }}
                    </p>
                </div>
            </div>

            <p class="mb-lede">
                {{
                    t(
                        "project.editor.defaults",
                        { settings: settingCount },
                        "This project opens on BlueMap's own generated defaults. All {settings} settings a map, a storage and the four whole-file configs carry are on screen and editable from the first second, each showing the value BlueMap itself would use. A setting you never touch is left out of the project, so BlueMap's own default is what renders.",
                    )
                }}
            </p>
            <p class="mb-footnote">
                {{
                    t(
                        "project.editor.blurb",
                        "Everything below is applied when this project renders, so a second render repeats the first without asking anything again. The world is wherever this file was found; moving the folder moves the project with it.",
                    )
                }}
            </p>

            <v-text-field
                :model-value="project.name"
                :label="t('project.editor.name', 'Project name')"
                variant="outlined"
                density="compact"
                hide-details="auto"
                @update:model-value="
                    (value: string) => emit('update:project', withName(project, value))
                "
            />

            <p class="mb-meta mb-project-editor__where">
                {{ t("project.editor.world", { world }, "Lives at the root of {world}") }}
            </p>
            <p class="mb-path" :title="plan.file">{{ plan.file }}</p>

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

            <p v-if="!renderable" class="mb-footnote mb-project-editor__engineNote">
                {{
                    t(
                        "project.editor.noEngine",
                        "This build cannot render locally. Every setting here is real and saved to the project either way; starting a render needs the desktop app.",
                    )
                }}
            </p>
        </header>

        <!--
            The prototype's right-hand rail, laid across the page rather than down its side.
            It is the same content and the same three operations; what moved is where it sits,
            because this editor is hosted inside a 900px measure rather than the prototype's
            full-width shell, and a 286px column taken out of that would leave the maps panel
            too narrow to edit a map in. The information is the point, not the column.
        -->
        <section
            class="mb-project-editor__plan"
            :aria-label="t('project.editor.plan', 'Save plan')"
        >
            <div class="mb-section-rule">
                <span class="mb-section-label">{{ t("project.editor.plan", "Save plan") }}</span>
            </div>
            <p class="mb-footnote mb-project-editor__planLede">
                {{
                    t(
                        "project.editor.nothingWritten",
                        "Nothing reaches the disk until you save. When you do, exactly this happens and nothing else.",
                    )
                }}
            </p>
            <ul class="mb-project-editor__planRows">
                <li v-for="row in planRows" :key="row.id" class="mb-project-editor__planRow">
                    <span class="mb-project-editor__planVerb">{{ row.verb }}</span>
                    <span class="mb-project-editor__planDetail">{{ row.detail }}</span>
                </li>
            </ul>
        </section>

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
                    @update:selected-id="(value) => (selectedMap = value)"
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
                    @update:selected-id="(value) => (selectedStorage = value)"
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
                        :placeholder="t('project.render.searchHint', 'threads, edges, output')"
                        :sample="runSample"
                        :summary="runSummary"
                    />

                    <div class="mb-section-rule">
                        <span class="mb-section-label">{{
                            t("project.render.options", "Render options")
                        }}</span>
                    </div>

                    <ProjectRenderOption
                        v-if="showsRun('route')"
                        path="render.route"
                        :cost="costOf('route')"
                        :cost-badge="costBadge"
                        :state="fieldDefaultText('route', selectedRenderRoute)"
                        :at-default="isRenderFieldDefault(project, 'route')"
                        :revert-label="revertLabel('route')"
                        @revert="resetRenderField('route')"
                    >
                        <v-select
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
                            @update:model-value="setRenderRoute"
                        />
                    </ProjectRenderOption>

                    <ProjectRenderOption
                        v-if="showsRun('threads')"
                        path="render.threads"
                        :cost="costOf('threads')"
                        :cost-badge="costBadge"
                        :state="fieldDefaultText('threads', project.render.threads)"
                        :at-default="isRenderFieldDefault(project, 'threads')"
                        :revert-label="revertLabel('threads')"
                        @revert="resetRenderField('threads')"
                    >
                        <v-text-field
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
                            @update:model-value="setThreads"
                        />
                    </ProjectRenderOption>

                    <ProjectRenderOption
                        v-if="showsRun('force')"
                        path="render.force"
                        :cost="costOf('force')"
                        :cost-badge="costBadge"
                        :state="fieldDefaultText('force', project.render.force)"
                        :at-default="isRenderFieldDefault(project, 'force')"
                        :revert-label="revertLabel('force')"
                        @revert="resetRenderField('force')"
                    >
                        <v-switch
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
                    </ProjectRenderOption>

                    <ProjectRenderOption
                        v-if="showsRun('fixEdges')"
                        path="render.fixEdges"
                        :cost="costOf('fixEdges')"
                        :cost-badge="costBadge"
                        :state="fieldDefaultText('fixEdges', project.render.fixEdges)"
                        :at-default="isRenderFieldDefault(project, 'fixEdges')"
                        :revert-label="revertLabel('fixEdges')"
                        @revert="resetRenderField('fixEdges')"
                    >
                        <v-switch
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
                    </ProjectRenderOption>

                    <ProjectRenderOption
                        v-if="showsRun('metrics')"
                        path="render.metrics"
                        :cost="costOf('metrics')"
                        :cost-badge="costBadge"
                        :state="fieldDefaultText('metrics', project.render.metrics)"
                        :at-default="isRenderFieldDefault(project, 'metrics')"
                        :revert-label="revertLabel('metrics')"
                        @revert="resetRenderField('metrics')"
                    >
                        <v-switch
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
                    </ProjectRenderOption>

                    <ProjectRenderOption
                        v-if="showsRun('outputFolder')"
                        path="render.outputFolder"
                        :cost="costOf('outputFolder')"
                        :cost-badge="costBadge"
                        :state="fieldDefaultText('outputFolder', project.render.outputFolder)"
                        :at-default="isRenderFieldDefault(project, 'outputFolder')"
                        :revert-label="revertLabel('outputFolder')"
                        @revert="resetRenderField('outputFolder')"
                    >
                        <PathField
                            :model-value="project.render.outputFolder ?? ''"
                            field="the render output folder"
                            semantic="folder"
                            :label="
                                t(
                                    'project.render.outputFolder',
                                    'Where the rendered map is written',
                                )
                            "
                            @update:model-value="setOutputFolder"
                        />
                        <p class="mb-project-editor__hint">
                            {{
                                t(
                                    "project.render.outputFolderHint",
                                    "Left empty, the app writes into the folder chosen during setup. This is the one absolute path a project carries, because the output belongs outside the world the file lives in.",
                                )
                            }}
                        </p>
                    </ProjectRenderOption>

                    <p v-if="visibleRunRows.length === 0" class="mb-footnote">
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
                <p class="mb-footnote">
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

/*
 * A page rather than a card. The prototype draws no bordered, tinted container around a
 * project's own heading: the title sits directly on the surface with the gutter around it,
 * which is the difference between "this application has a Projects page" and "this
 * application opened a settings dialog".
 */
.mb-project-editor__header {
    margin-block-end: 8px;
    min-inline-size: 0;
}

.mb-project-editor__headrow {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    min-inline-size: 0;
    margin-block-end: 12px;
}

/*
 * The unsaved badge is the one badge here that carries a state rather than a kind, so it is
 * the one that overrides the shared pill's tint. Tertiary rather than a warning colour: this
 * project has unsaved work, which is the ordinary condition of an editor somebody is typing
 * in, and colouring it as a problem would cry wolf on every keystroke. `warning` is also not
 * one of the roles `colorRoles.ts` defines, and inventing a colour here is exactly what that
 * file exists to stop.
 */
.mb-project-editor__dirtyBadge {
    background: rgb(var(--v-theme-tertiary-container));
    color: rgb(var(--v-theme-on-tertiary-container));
}

.mb-project-editor__title {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-block-end: 6px;
    min-inline-size: 0;
}

.mb-project-editor__titleText {
    min-inline-size: 0;
}

.mb-project-editor__titleText h1 {
    overflow-wrap: anywhere;
}

.mb-project-editor__where {
    margin-block-start: 8px;
    overflow-wrap: anywhere;
}

.mb-project-editor__engineNote {
    margin-block: 8px 0;
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
.mb-project-editor__actions .v-btn {
    min-block-size: 44px;
    block-size: auto;
    max-inline-size: 100%;
}

.mb-project-editor__headrow .v-btn .v-btn__content,
.mb-project-editor__actions .v-btn .v-btn__content {
    white-space: normal;
    overflow-wrap: anywhere;
    text-align: start;
}

.mb-project-editor .v-field {
    min-block-size: 44px;
}

/* ---------------------------------------------------------------------------
 * The save plan.
 *
 * Monospace and one operation per row, exactly as the prototype draws it: the point of the
 * panel is that it can be read in a glance and checked against what the person expected, and
 * a paragraph would be read once and never again.
 * ------------------------------------------------------------------------- */
.mb-project-editor__plan {
    margin-block-end: 8px;
    min-inline-size: 0;
}

.mb-project-editor__planLede {
    margin-block-end: 10px;
}

.mb-project-editor__planRows {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
    min-inline-size: 0;
}

.mb-project-editor__planRow {
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
    padding: 9px 11px;
    border-radius: 9px;
    background: rgb(var(--v-theme-surface-container));
    border: 1px solid rgb(var(--v-theme-outline-variant));
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.6875rem;
    line-height: 1.6;
    min-inline-size: 0;
    overflow-wrap: anywhere;
}

.mb-project-editor__planVerb {
    color: rgb(var(--v-theme-primary));
    flex: 0 0 auto;
}

.mb-project-editor__planDetail {
    color: rgb(var(--v-theme-on-surface-variant));
    min-inline-size: 0;
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

.mb-project-editor__run {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-inline-size: 720px;
    inline-size: 100%;
    min-inline-size: 0;
}

.mb-project-editor__hint {
    margin-block-start: 6px;
    font-size: 0.75rem;
    line-height: 1.45;
    color: rgb(var(--v-theme-on-surface-variant));
    text-wrap: pretty;
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
</style>
