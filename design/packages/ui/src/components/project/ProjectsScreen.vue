<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiFolderOpenOutline } from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VCardActions,
    VCardText,
    VCardTitle,
    VDivider,
    VSelect,
    VSpacer,
    VTextField,
} from "vuetify/components";
import { serializeProjectFile, type ProjectFile } from "@worldlens/config";
import ProjectEditor from "./ProjectEditor.vue";
import ProjectList from "./ProjectList.vue";
import DiscoveredWorldsPanel from "./DiscoveredWorldsPanel.vue";
import {
    createProjectFromGeneratedDefaults,
    projectRenderRoute,
    projectHostingRoute,
    renderAffectingProjectSnapshot,
    projectToRenderRequest,
    renderProblems,
    touch,
    withRender,
    worldLeaf,
    type ProjectRow,
} from "./projectModel.js";
import {
    hostMissingReason,
    resolveProjectHost,
    type ProjectHost,
    type ProjectListing,
} from "./projectHost.js";
import RenderRunPanel from "../world/RenderRunPanel.vue";
import { createRenderRun } from "../world/renderRun.js";
import { consentIsAccepted, refreshConsent } from "../world/consentState.js";
import { resolveWorldCatalogBridge, type WorldCatalogBridge } from "../world/worldCatalog.js";
import {
    readStorageDirectory,
    probeWorldFolder,
    resolveOptionalWorldBridge,
    resolveWorldBridge,
    type OptionalWorldBridge,
    type SettingsTarget,
    type WorldBridge,
} from "../world/worldBridge.js";
import {
    createBridgeConfigHost,
    provideConfigHost,
    type ConfigHost,
} from "../config/configHost.js";
import { provideSettingsOpener } from "../downloads/index.js";
import { raiseNotice } from "../../stores/notices.js";
import { createJavaSetting } from "../settings/javaSetting.js";
import { globalRenderEngineDefault, resolveRenderEngine } from "../settings/engineChoice.js";
import {
    createRenderRouter,
    resolveRemoteBridge,
    resolveRuntimeBridge,
    type RemoteBridge,
    type RemoteTarget,
    type RuntimeBridge,
    type RunLocation,
} from "../remote/index.js";
import type { RenderDestinationId } from "./RenderDestinationMenu.vue";
import type { ProjectPagesState, ProjectPagesStateRecord } from "./ProjectEditor.vue";
import { canonicalWorldIdentity } from "./projectIdentity.js";
import ProjectImportDialog from "./ProjectImportDialog.vue";

/**
 * Projects: the list of them, the editor for one, and the render one starts.
 *
 * This is the surface the shell mounts. It owns the host and the render, and hands both
 * `ProjectList.vue` and `ProjectEditor.vue` values rather than letting either of them reach
 * for a bridge, so both are mountable in a test with nothing behind them.
 *
 * ## Why the render lives here rather than in the editor
 *
 * A render can be started from a row in the list without opening the project at all, which
 * is the whole promise of the feature: everything was decided once, so running it again is
 * a button rather than five steps. That means the panel following the render has to outlive
 * the editor being closed, so it belongs to the screen that contains both.
 *
 * The engine is the same `createRenderRun` the guide uses. There is one render subsystem in
 * this application, and a project is a different way of describing what to render, not a
 * different way of rendering it.
 */
const props = withDefaults(
    defineProps<{
        /**
         * Injected in tests. Left out, the Electron bridge is probed, which is why this has
         * no default: `undefined` means probe, `null` means there is deliberately none.
         */
        host?: ProjectHost | null;
        bridge?: WorldBridge | null;
        optionalBridge?: OptionalWorldBridge | null;
        /** The same world catalogue `MinecraftWorldList.vue` (the wizard) reads from. */
        worldCatalogBridge?: WorldCatalogBridge | null;
        configHost?: ConfigHost | null;
        /** Bumped by the shell when its settings surface closes. See `consentState.ts`. */
        settingsEpoch?: number;
        /**
         * A world whose project the shell wants opened as soon as this screen exists.
         *
         * A prop rather than an exposed method because this screen lives inside a tab
         * panel, and a panel that is not the active one is never rendered: the shell has no
         * component to call a method on at the moment it decides to navigate. Watching a
         * prop works whether the screen was already there or has just been created.
         */
        openWorld?: string | null;
        remoteBridge?: RemoteBridge | null;
        runtimeBridge?: RuntimeBridge | null;
        canOpenCi?: boolean;
        pagesState?: ProjectPagesStateRecord | null;
    }>(),
    { settingsEpoch: 0, openWorld: null, canOpenCi: false },
);

const emit = defineEmits<{
    /** Opens the app's own Mojang download-consent setting. */
    consent: [];
    /** Sends somebody to the setting that fixes a render failure. */
    settings: [target: SettingsTarget];
    /** A render finished and somebody asked to see it. */
    openMap: [dataRoot: string, mapIds: readonly string[]];
    /** Opens the click-and-run GitHub Actions surface with this project's world prefilled. */
    cloudRender: [world: string];
    /** Opens the existing Pages flow with a verified render selected by the host. */
    publishExisting: [record: ProjectPagesStateRecord];
    "pages-invalidated": [key: string, generation: number];
    /** Reports the editor's real serialized dirty state to process-wide restart protection. */
    "dirty-change": [dirty: boolean];
}>();

const { t } = useI18n();
const java = createJavaSetting();
const javaAvailable = computed<boolean | null>(() => {
    if (!java.supported) return null;
    if (java.state.value === "found") return true;
    if (java.state.value === "missing") return false;
    return null;
});
const renderEngineAvailable = computed<boolean | null>(() => java.renderEngineAvailable.value);
const renderEngineReason = computed<string | null>(() => java.renderEngineReason.value);
const renderEnginePath = computed<string | null>(() => java.renderEnginePath.value);

const host = props.host === undefined ? resolveProjectHost() : props.host;
const bridge = props.bridge === undefined ? resolveWorldBridge() : props.bridge;
const optional =
    props.optionalBridge === undefined ? resolveOptionalWorldBridge() : props.optionalBridge;
const worldCatalogBridge =
    props.worldCatalogBridge === undefined ? resolveWorldCatalogBridge() : props.worldCatalogBridge;
const configHost = props.configHost === undefined ? createBridgeConfigHost() : props.configHost;
const remote = props.remoteBridge === undefined ? resolveRemoteBridge() : props.remoteBridge;
const runtime = props.runtimeBridge === undefined ? resolveRuntimeBridge() : props.runtimeBridge;
provideConfigHost(configHost);

/**
 * The route from a failure inside a settings form to the setting that fixes it, provided
 * here rather than threaded through every panel between. A surface mounted without this
 * offer says the setting's name in words instead of showing a button that goes nowhere.
 */
provideSettingsOpener((target) => emit("settings", target));

/** The destination selected from the project editor's split button. */
const renderLocation = ref<RunLocation>("local");
const renderTarget = ref<RemoteTarget | null>(null);
const remotePreflightPassed = ref(false);
const preflightTargetId = ref<string | null>(null);
const preflightContextKey = ref<string | null>(null);
const preflightContextGeneration = ref<number | null>(null);
const renderModes = ref<readonly string[]>(["local"]);
const importOpen = ref(false);
const projectPagesState = ref<ProjectPagesState>("off");
const pagesFailure = ref<string | null>(null);
const publicationGeneration = ref(0);
const renderContextGeneration = ref(0);
const verifiedRenders = ref<Record<string, { world: string; projectId: string; renderId: string; projectSnapshot: string }>>({});

async function loadRenderModes(): Promise<void> {
    if (runtime === null) return;
    try {
        renderModes.value = await runtime.renderModes();
    } catch {
        renderModes.value = ["local"];
    }
}

const router = createRenderRouter(bridge, remote, () => ({
    location: renderLocation.value,
    target: renderTarget.value,
}));
const run = createRenderRun(router ?? bridge, { route: () => renderLocation.value });

const separator = computed(() => configHost?.separator ?? "/");

/* -------------------------------------------------------------------------- */
/* The list                                                                   */
/* -------------------------------------------------------------------------- */

const listing = ref<ProjectListing>({ projects: [], scanned: 0, problems: [] });
const busy = ref(false);
const listFailure = ref<string | null>(null);
const defaultRoot = ref("");

const rows = computed<ProjectRow[]>(() =>
    listing.value.projects.map((summary) => ({
        world: summary.world,
        file: summary.file,
        id: summary.id,
        name: summary.name,
        maps: summary.maps,
        createdAt: summary.createdAt,
        updatedAt: summary.updatedAt,
        fromWizard: summary.fromWizard,
        worldName: summary.worldName,
        problem: summary.problem,
    })),
);

/** Every project's world, so a discovered world already carrying one is left off that list. */
const projectWorldPaths = computed(() => rows.value.map((row) => row.world));

async function reload(): Promise<void> {
    if (host === null) return;
    busy.value = true;
    listFailure.value = null;
    try {
        listing.value = await host.listProjects();
    } catch (error) {
        listFailure.value = error instanceof Error ? error.message : String(error);
    } finally {
        busy.value = false;
    }
}

/**
 * The settings surface closing is the moment consent can have changed.
 *
 * Rendering a project needs the Mojang download to have been accepted, and this screen
 * offers the same **Open the setting** remedy the guide does. Without this the remedy would
 * be the same dead end it used to be there: the setting opens, accepting it works, and the
 * screen goes on refusing. See `../world/consentState.ts` for why this is an event rather
 * than the shared store it should eventually be.
 */
watch(
    () => props.settingsEpoch,
    () => void refreshConsent(bridge),
);

onMounted(async () => {
    void reload();
    void refreshConsent(bridge);
    void java.load();
    void loadRenderModes();
    try {
        const directory = await readStorageDirectory(optional);
        defaultRoot.value = directory?.current ?? "";
    } catch {
        defaultRoot.value = "";
    }
});

onBeforeUnmount(() => {
    run.dispose();
    router?.dispose();
});

/* -------------------------------------------------------------------------- */
/* The one that is open                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The project being edited, and the copy of it that is on disk.
 *
 * Two refs rather than one plus a dirty flag, because "has this changed" is a question
 * about the two texts and a flag is a third thing that can disagree with both. Serialising
 * both is cheap and exact: the file writer orders its keys, so two projects that differ by
 * nothing serialise identically.
 */
const openWorld = ref<string | null>(null);
const openProject = ref<ProjectFile | null>(null);

/**
 * Whether the editor is the thing on screen, rather than the two lists.
 *
 * Named here rather than repeated in the template because the class it drives decides the page
 * measure, and a measure derived from an inline expression is one nobody finds when they later
 * wonder why the editor is wider than everything else.
 */
const editorOpen = computed(() => openProject.value !== null && openWorld.value !== null);
const savedProject = ref<ProjectFile | null>(null);
const openFailure = ref<string | null>(null);
const saving = ref(false);
const saveFailure = ref<string | null>(null);

const dirty = computed(
    () =>
        openProject.value !== null &&
        (savedProject.value === null ||
            serializeProjectFile(openProject.value) !== serializeProjectFile(savedProject.value)),
);

const renderContextKey = computed(() =>
    openWorld.value === null || openProject.value === null
        ? null
        : `${canonicalWorldIdentity(openWorld.value)}\0${openProject.value.id}`,
);
const currentVerifiedRender = computed(() => {
    if (renderContextKey.value === null || openProject.value === null) return null;
    const record = verifiedRenders.value[renderContextKey.value];
    return record !== undefined && record.projectSnapshot === renderAffectingProjectSnapshot(openProject.value)
        ? record
        : null;
});
const shellPagesState = computed<ProjectPagesState>(() => {
    const record = props.pagesState;
    if (
        record !== null &&
        record !== undefined &&
        record.key === renderContextKey.value &&
        openProject.value !== null &&
        record.projectSnapshot === renderAffectingProjectSnapshot(openProject.value) &&
        (currentVerifiedRender.value === null || record.renderId === currentVerifiedRender.value.renderId)
    ) {
        return record.state;
    }
    return projectPagesState.value;
});

function resetRenderDestination(previousKey: string | null): void {
    renderContextGeneration.value += 1;
    publicationGeneration.value += 1;
    if (previousKey !== null) emit("pages-invalidated", previousKey, publicationGeneration.value);
    renderLocation.value = "local";
    renderTarget.value = null;
    remotePreflightPassed.value = false;
    preflightTargetId.value = null;
    preflightContextKey.value = null;
    preflightContextGeneration.value = null;
}

watch(
    renderContextKey,
    (_next, previous) => resetRenderDestination(previous),
    { flush: "sync" },
);

watch(
    () => (openProject.value === null ? null : renderAffectingProjectSnapshot(openProject.value)),
    (next, previous) => {
        if (next === null || previous === undefined || next === previous) return;
        renderContextGeneration.value += 1;
        const key = renderContextKey.value;
        publicationGeneration.value += 1;
        if (key !== null) emit("pages-invalidated", key, publicationGeneration.value);
        preflightTargetId.value = null;
        preflightContextKey.value = null;
        preflightContextGeneration.value = null;
        remotePreflightPassed.value = false;
    },
);

/**
 * Every in-memory edit is queued for the main process's quiet autosave scheduler, which
 * debounces bursts into one write and records one revision per write - the same path Save
 * uses, just without anyone having to remember to press it. The unedited case costs
 * nothing: the scheduler compares against what it last wrote and treats a no-change
 * notification as a cancellation.
 */
watch(openProject, (project) => {
    if (project === null || openWorld.value === null || !dirty.value) return;
    // `notifyAutosaveChange` only *schedules* a write - its own result says whether the
    // request reached the scheduler, and a completed attempt (quiet or flushed, ok or not)
    // is reported separately through `onAutosaveEvent` below. What is missing without a
    // `.catch()` here is the request itself failing before the scheduler ever sees it - the
    // bridge boundary threw (a payload Electron's structured clone refused, say) rather than
    // the write it would have scheduled. That failure has nowhere else to go: no autosave was
    // ever queued, so no `onAutosaveEvent` is coming, and an unhandled rejection is invisible
    // to whoever is looking at the screen. Naming the call is what turns "An object could not
    // be cloned." from a mystery back into something the next report can act on.
    host?.notifyAutosaveChange?.(openWorld.value, project)?.catch((error: unknown) => {
        saveFailure.value = describeBridgeFailure("notifyAutosaveChange", error);
    });
});

/**
 * An autosave that landed *is* a save: the written project becomes the baseline the dirty
 * badge compares against, so "Unsaved changes" means exactly "not yet on disk" and clears
 * itself the moment the scheduler writes. A failed autosave surfaces where a failed manual
 * save does, because the person's next question is the same either way.
 */
let stopAutosave: (() => void) | undefined;

onBeforeUnmount(() => {
    stopAutosave?.();
    stopAutosave = undefined;
});

onMounted(() => {
    stopAutosave = host?.onAutosaveEvent?.((event) => {
        if (event.worldFolder !== openWorld.value) return;
        if (event.result.ok) {
            savedProject.value = event.result.project;
            if (saveFailure.value !== null) saveFailure.value = null;
        } else {
            saveFailure.value = event.result.reason;
        }
    });
});

// This is the same comparison that drives Save and the transition guard. Reporting a second
// inferred flag from the shell would let the update guard disagree with the editor exactly when
// the visible edit exists only in renderer memory.
watch(dirty, (value) => emit("dirty-change", value), { immediate: true });

/**
 * Stops a transition that would hide, replace, or render edits that only exist in memory.
 *
 * The redesign contract is intentionally manual: opening or changing a project must not write
 * into a world folder until someone presses Save. A transition is therefore a prompt to use the
 * existing Save or Revert controls, never a reason for this screen to write behind their back.
 */
function blockUnsavedTransition(action: string): boolean {
    if (!dirty.value) return false;
    // With autosave wired, a boundary is a flush rather than a wall: whatever is pending
    // is written through the same path Save uses, and the transition proceeds. The block
    // below remains only for a host without the autosave scheduler (the browser preview),
    // where proceeding really would abandon the edit.
    if (
        host?.flushAutosave !== undefined &&
        openWorld.value !== null &&
        openProject.value !== null
    ) {
        const world = openWorld.value;
        const project = openProject.value;
        // `savedProject` is set below the moment the transition is allowed to proceed, ahead
        // of the notify+flush actually landing - the transition itself (closing the editor,
        // opening another project) is not something a slow disk write should hold up. That
        // makes the `.catch()` below the *only* place a failure in this exact chain can ever
        // be seen: nothing downstream is still watching `dirty` or `saveFailure` for this
        // world once the transition has moved on, so swallowing the rejection here would
        // make the failure disappear rather than merely be reported late.
        void (async (): Promise<void> => {
            try {
                await host.notifyAutosaveChange?.(world, project);
                const result = await host.flushAutosave?.(world, "boundary");
                if (result !== undefined && result !== null && !result.ok) {
                    saveFailure.value = describeBridgeFailure(
                        "flushAutosave",
                        new Error(result.message),
                    );
                }
            } catch (error) {
                // Either call in this pair can be the one that threw - `notifyAutosaveChange`
                // failing before the write was ever scheduled, or `flushAutosave` failing to
                // write what had been. Naming the pair rather than guessing which is honest
                // about what this handler can actually tell apart.
                saveFailure.value = describeBridgeFailure(
                    "notifyAutosaveChange/flushAutosave",
                    error,
                );
            }
        })();
        savedProject.value = project;
        return false;
    }
    raiseNotice(
        "warning",
        t(
            "project.unsaved.transitionBlocked",
            { action },
            "This project has unsaved changes. Save it, or Revert the changes, before you {action}. Nothing has been written automatically.",
        ),
    );
    return true;
}

async function open(world: string): Promise<void> {
    if (host === null) return;
    if (world !== openWorld.value && blockUnsavedTransition("open another project")) return;
    openFailure.value = null;
    saveFailure.value = null;
    busy.value = true;
    try {
        const answer = await host.readProject(world);
        if (!answer.ok) {
            openFailure.value = describeFailure(answer.failure);
            return;
        }
        openWorld.value = world;
        openProject.value = answer.project;
        savedProject.value = answer.project;
        projectPagesState.value = projectHostingRoute(answer.project) === "github-pages" ? "published" : "off";
        pagesFailure.value = null;
    } catch (error) {
        openFailure.value = error instanceof Error ? error.message : String(error);
    } finally {
        busy.value = false;
    }
}

/**
 * The shell asking for one project in particular, from the guide or from the palette.
 *
 * `immediate` because the usual case is this screen being created *by* the navigation that
 * carries the request, so the prop already holds its value by the time the watcher runs.
 * Declared here rather than beside the other watcher above because it reads `open` and
 * `dirty`, and an immediate watcher written above their declarations runs while both are
 * still in the temporal dead zone.
 *
 * An unsaved project already open is left alone rather than replaced: losing somebody's
 * unsaved edits to honour a navigation is not a trade this makes on its own.
 */
watch(
    () => props.openWorld,
    (world) => {
        if (world === null || world === "" || world === openWorld.value) return;
        void open(world);
    },
    { immediate: true },
);

/**
 * Names which bridge call actually failed, alongside whatever it failed with.
 *
 * A thrown `DataCloneError` crosses `ipcRenderer.invoke` as a bare `Error` whose message is
 * exactly `"An object could not be cloned."` - Electron's own text for a payload its
 * structured-clone step refused, with no indication of which of the several project-shaped
 * calls this screen makes (`writeProject`, `notifyAutosaveChange`, `flushAutosave`) produced
 * it. The prior version of this banner just showed that sentence verbatim, which is exactly
 * how a Vue-reactive-proxy-vs-structured-clone bug went undiagnosed long enough to need a
 * screenshot: the message was real, and it named nothing. Every catch site in this file that
 * can see a bridge call throw goes through this so the next person gets a call name for free
 * instead of re-deriving one from a stack trace.
 */
function describeBridgeFailure(call: string, error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return `${call}: ${message}`;
}

/**
 * Every way a project file can refuse to be read, in words somebody can act on.
 *
 * `too-new` in particular is a refusal rather than a failure: an older application meeting
 * a newer file must say so and stop rather than guess, because the failure mode of guessing
 * is silently discarding the settings it did not understand the moment it saves.
 */
function describeFailure(failure: {
    kind: string;
    message?: string;
    version?: number;
    problems?: readonly string[];
}): string {
    switch (failure.kind) {
        case "absent":
            return t(
                "project.open.absent",
                "There is no project file in that world folder any more.",
            );
        case "too-new":
            return t(
                "project.open.tooNew",
                { version: String(failure.version ?? "") },
                "That project was written by a newer version of this app (format {version}). Opening it here could silently drop the settings this build does not understand, so it is left alone. Update the app and try again.",
            );
        case "invalid":
            return t(
                "project.open.invalid",
                { problems: (failure.problems ?? []).join("; ") },
                "That project file does not say what a project says: {problems}",
            );
        case "not-json":
            return t(
                "project.open.notJson",
                { message: failure.message ?? "" },
                "That project file is not readable as JSON: {message}",
            );
        default:
            return (
                failure.message ??
                t("project.open.unreadable", "That project file could not be read.")
            );
    }
}

function closeEditor(): void {
    if (blockUnsavedTransition("close the editor")) return;
    openWorld.value = null;
    openProject.value = null;
    savedProject.value = null;
    saveFailure.value = null;
}

function revert(): void {
    if (savedProject.value === null) {
        openWorld.value = null;
        openProject.value = null;
    } else {
        openProject.value = savedProject.value;
    }
    saveFailure.value = null;
}

async function save(): Promise<void> {
    const world = openWorld.value;
    const project = openProject.value;
    if (host === null || world === null || project === null || saving.value) return;

    saving.value = true;
    saveFailure.value = null;
    // `touch` is what clears `fromWizard`: the moment somebody saves an edit, the claim
    // that the guide wrote this and nothing has touched it stops being true.
    const stamped = touch(project);
    try {
        const answer = await host.writeProject(world, stamped);
        if (!answer.ok) {
            saveFailure.value = answer.message;
            return;
        }
        openProject.value = stamped;
        savedProject.value = stamped;
        raiseNotice(
            "success",
            t("project.save.done", { file: answer.file }, "Saved the project to {file}."),
        );
        // The file write above is the thing somebody asked for by pressing Save, and it
        // already succeeded - `answer.ok` said so. `historyOk` is a second, independent
        // promise: that a revision of this save was kept in the local history. When that one
        // breaks, the save itself must still read as the success it was, so this is a
        // second, separate notice rather than folding a failure into the sentence above -
        // and it persists until dismissed, because a broken safety net is not something an
        // auto-dismissing toast should be allowed to say once and forget.
        if (answer.historyOk === false) {
            raiseNotice(
                "warning",
                t(
                    "project.save.historyFailed",
                    { message: answer.historyMessage ?? "" },
                    "The project was saved, but its local history could not be kept: {message}",
                ),
            );
        }
        void reload();
    } catch (error) {
        // `writeProject` is sanitized at the bridge boundary (see `plainProjectForBridge` in
        // projectHost.ts), so this catch should be unreachable for the Vue-reactive-proxy
        // class of `DataCloneError` that used to land here unlabelled. It is kept anyway,
        // and still names the call: a boundary that is safe today is not a promise that
        // every future project-shaped payload crossing it will be too, and "writeProject: An
        // object could not be cloned." is the one sentence that tells the next person exactly
        // which sanitizer to go check first, instead of leaving them to rediscover this file.
        saveFailure.value = describeBridgeFailure("writeProject", error);
    } finally {
        saving.value = false;
    }
}

/* -------------------------------------------------------------------------- */
/* Starting a new one                                                         */
/* -------------------------------------------------------------------------- */

const createOpen = ref(false);
const createWorld = ref("");
const createRoute = ref<"local" | "github-actions">("local");

const createRouteItems = computed(() => [
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

const createProblem = computed(() => {
    const path = createWorld.value.trim();
    if (path === "")
        return t("project.create.needWorld", "Choose the world folder this project belongs to.");
    if (!/^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(path)) {
        return t(
            "project.create.relative",
            "That path is relative, so where it points depends on where the app was started. Use a full path.",
        );
    }
    if (
        rows.value.some(
            (row) =>
                row.world.replace(/\\/g, "/").toLowerCase() ===
                path.replace(/\\/g, "/").toLowerCase(),
        )
    ) {
        return t(
            "project.create.exists",
            "That world already has a project. Open it rather than starting a second one, because a world holds exactly one project file.",
        );
    }
    return null;
});

async function pickWorld(): Promise<void> {
    if (configHost === null) return;
    const chosen = await configHost.pickDirectory({
        title: t("project.create.pickWorld", "Choose the world folder"),
    });
    if (chosen !== null) createWorld.value = chosen;
}

/**
 * A new project exists in the editor before it exists on disk.
 *
 * Deliberately: somebody who starts one and changes their mind has written nothing into
 * their world folder, and the Save button is what puts it there. That is also why the list
 * does not show it until it has been saved - a row for a file that is not there would be
 * the list asserting something untrue.
 */
function openNewProjectFor(world: string, route: "local" | "github-actions" = "local"): boolean {
    if (blockUnsavedTransition("start another project")) return false;
    const project = withRender(
        createProjectFromGeneratedDefaults(worldLeaf(world), {
            world,
            separator: separator.value,
            engine: resolveRenderEngine(
                globalRenderEngineDefault(),
                javaAvailable.value === true,
                renderEngineAvailable.value === true,
            ),
        }),
        { route },
    );

    openWorld.value = world;
    openProject.value = project;
    savedProject.value = null;
    saveFailure.value = null;
    projectPagesState.value = "off";
    pagesFailure.value = null;

    raiseNotice(
        "info",
        t(
            "project.create.started",
            "The full BlueMap-generated project is open in memory. Review or change its maps and settings, then choose Save when you are ready to write it into the world folder.",
        ),
    );
    return true;
}

function confirmCreate(): void {
    if (createProblem.value !== null) return;
    const world = createWorld.value.trim();
    const route = createRoute.value;
    if (openNewProjectFor(world, route)) {
        createOpen.value = false;
        createWorld.value = "";
        createRoute.value = "local";
    }
}

function setProjectRenderRoute(project: ProjectFile, route: "local" | "github-actions"): void {
    openProject.value = withRender(project, { route });
}

function pagesRecord(state: ProjectPagesState, renderId: string): ProjectPagesStateRecord | null {
    if (renderContextKey.value === null || openProject.value === null) return null;
    return {
        key: renderContextKey.value,
        state,
        renderId,
        projectSnapshot: renderAffectingProjectSnapshot(openProject.value),
        generation: publicationGeneration.value,
    };
}

/**
 * The editor's destination menu is a dispatch surface, not a second render implementation.
 * Local, Docker and SSH update the live router; GitHub opens the existing full wizard; import
 * uses the native folder/file pickers and then the same schema-validating ProjectHost reader.
 */
function chooseDestination(destination: RenderDestinationId): void {
    switch (destination) {
        case "local":
            renderLocation.value = "local";
            if (openProject.value !== null) setProjectRenderRoute(openProject.value, "local");
            return;
        case "docker":
            renderLocation.value = "docker";
            if (openProject.value !== null) setProjectRenderRoute(openProject.value, "local");
            return;
        case "remote":
            renderLocation.value = "remote";
            if (openProject.value !== null) setProjectRenderRoute(openProject.value, "local");
            return;
        case "github-actions":
            renderLocation.value = "local";
            if (openProject.value !== null) setProjectRenderRoute(openProject.value, "github-actions");
            if (openWorld.value !== null) emit("cloudRender", openWorld.value);
            return;
        case "import-project":
            importOpen.value = true;
            return;
        case "publish-existing":
            projectPagesState.value = "pending";
            pagesFailure.value = null;
            if (currentVerifiedRender.value !== null) {
                const record = pagesRecord("pending", currentVerifiedRender.value.renderId);
                if (record !== null) emit("publishExisting", record);
            }
            return;
    }
}

async function acceptImportedWorld(world: string): Promise<void> {
    importOpen.value = false;
    await open(world);
}

/* -------------------------------------------------------------------------- */
/* Starting one from a world the catalogue already found                     */
/* -------------------------------------------------------------------------- */

/**
 * One discovered world, chosen to start a project from.
 *
 * The one-click route the contract asks for: no typing, no browsing for the path, straight
 * into the same unsaved-editor state {@link confirmCreate} produces, ready to add maps and
 * save. An unsaved project already open is left alone rather than replaced, exactly as the
 * `openWorld` prop watcher above already treats a navigation request - losing somebody's
 * unsaved edits to honour a click elsewhere in the same tab is not a trade this makes.
 */
function useDiscoveredWorld(world: string): void {
    openNewProjectFor(world);
}

/**
 * A selected discovery still opens a project through the editor rather than writing defaults.
 *
 * The old bulk route created files nobody had reviewed. That conflicts with the contract that
 * a project is an in-memory proposal until its explicit Save. One selected world can therefore
 * open directly; a multi-selection explains why it cannot silently create several files.
 */
function useDiscoveredWorlds(worlds: readonly string[]): void {
    if (worlds.length === 0) return;
    if (worlds.length === 1) {
        const world = worlds[0];
        if (world !== undefined) openNewProjectFor(world);
        return;
    }
    raiseNotice(
        "warning",
        t(
            "project.discovered.multiNeedsReview",
            { count: worlds.length },
            "{count} worlds are selected. Projects are saved one at a time so you can review each world before Save writes anything. Choose one world to open its editor.",
        ),
    );
}

/* -------------------------------------------------------------------------- */
/* Removing one                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Takes project files off the disk. Reached only from behind the two-key gate in
 * `ProjectList.vue`, which names every file and states that the world and its tiles are
 * untouched before either of these runs.
 *
 * Failures are reported per world rather than as one "something went wrong": a batch where
 * three of five were removed has to say which three, or the person has no idea what state
 * their machine is in.
 */
async function forget(worlds: readonly string[]): Promise<void> {
    if (openWorld.value !== null && worlds.includes(openWorld.value) && dirty.value) {
        raiseNotice(
            "warning",
            t(
                "project.forget.unsavedInTheWay",
                "This project has unsaved changes. Save it, or Revert the changes, before removing its saved project file.",
            ),
        );
        return;
    }
    // Called through the host rather than through a local alias on purpose.
    // `components/confirm/superConfirmPolicy.test.ts` finds destructive call sites by name,
    // and a `remove.call(host, world)` would slip past it - which would leave the one
    // deletion in this feature undeclared in the inventory that exists to catch exactly that.
    const remover = host;
    if (remover === null || remover.deleteProject === undefined || worlds.length === 0) return;

    busy.value = true;
    const failures: string[] = [];
    let gone = 0;
    for (const world of worlds) {
        try {
            const answer = await remover.deleteProject(world);
            if (answer.ok) gone += 1;
            else failures.push(`${world}: ${answer.message}`);
        } catch (error) {
            failures.push(`${world}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    busy.value = false;

    if (openWorld.value !== null && worlds.includes(openWorld.value)) closeEditor();

    if (gone > 0) {
        raiseNotice(
            "success",
            t(
                "project.forget.done",
                { gone },
                "Removed {gone} project files. The worlds themselves are untouched.",
            ),
        );
    }
    for (const failure of failures) {
        raiseNotice(
            "error",
            t("project.forget.failed", { failure }, "This one was not removed: {failure}"),
        );
    }
    void reload();
}

/* -------------------------------------------------------------------------- */
/* Rendering one                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Renders a project with its own settings.
 *
 * The request is built from the file rather than from a form, which is what makes a second
 * render repeat the first without asking anything again. Nothing is asked here at all: the
 * decisions were made in the editor and this reads them.
 */
async function startRender(world: string, project: ProjectFile): Promise<void> {
    if (projectRenderRoute(project) === "github-actions") {
        emit("cloudRender", world);
        return;
    }
    if (run.active.value) return;

    if (renderLocation.value === "docker" && !renderModes.value.includes("docker")) {
        raiseNotice(
            "error",
            t(
                "project.render.dockerUnavailable",
                "Docker is not an active render channel in this build. The render was not sent to this computer as a fallback.",
            ),
        );
        return;
    }
    if (
        renderLocation.value === "remote" &&
        (remote === null ||
            renderTarget.value === null ||
            !remotePreflightPassed.value ||
            preflightTargetId.value !== renderTarget.value.id ||
            preflightContextKey.value !== renderContextKey.value ||
            preflightContextGeneration.value !== renderContextGeneration.value)
    ) {
        raiseNotice(
            "warning",
            t(
                "project.render.remoteNeedsPreflight",
                "Choose an SSH machine and complete its host-key, Docker and disk checks before sending this world.",
            ),
        );
        return;
    }

    const problems = renderProblems(project);
    if (problems.length > 0) {
        const first = problems[0];
        if (first !== undefined)
            raiseNotice("warning", t(first.key, first.vars ?? {}, first.fallback));
        return;
    }

    if (!consentIsAccepted.value) {
        raiseNotice(
            "warning",
            t(
                "project.render.consentMissing",
                "BlueMap builds its blocks from the Minecraft client files, which are downloaded from Mojang. That download has not been accepted, so this render would stop before it started.",
            ),
            {
                actions: [
                    {
                        id: "open-consent",
                        label: t("project.render.consentAction", "Open the setting"),
                        run: () => emit("consent"),
                    },
                ],
            },
        );
        emit("consent");
        return;
    }

    const result = await run.start(projectToRenderRequest(project, world));
    if (result?.ok === true) {
        verifiedRenders.value = {
            ...verifiedRenders.value,
            [`${canonicalWorldIdentity(world)}\0${project.id}`]: {
                world,
                projectId: project.id,
                renderId: result.renderId,
                projectSnapshot: renderAffectingProjectSnapshot(project),
            },
        };
    }
    if (result === null && run.failure.value === null) {
        raiseNotice(
            "error",
            t(
                "project.render.noBridge",
                "This build cannot start a render. Local rendering needs the desktop app.",
            ),
        );
    }
}

/** Renders the project that is open, without re-reading it. */
async function renderOpen(): Promise<void> {
    const world = openWorld.value;
    const project = openProject.value;
    if (world === null || project === null) return;
    if (blockUnsavedTransition("render the open project")) return;
    await startRender(world, project);
}

/**
 * Renders a project straight from its row.
 *
 * The file is read again rather than rendered from the row's summary, because a row knows a
 * name and a count and a render needs every setting. Reading it also means a project that
 * has been edited by hand since the list was built renders as it now is rather than as the
 * list remembers it.
 */
async function renderRow(world: string): Promise<void> {
    if (host === null) return;
    const answer = await host.readProject(world);
    if (!answer.ok) {
        raiseNotice("error", describeFailure(answer.failure));
        return;
    }
    void startRender(world, answer.project);
}

function notify(level: "info" | "success" | "warning" | "error", message: string): void {
    raiseNotice(level, message);
}

async function handlePagesToggle(enabled: boolean): Promise<void> {
    if (!enabled) {
        projectPagesState.value = "off";
        pagesFailure.value = null;
        publicationGeneration.value += 1;
        if (renderContextKey.value !== null) {
            emit("pages-invalidated", renderContextKey.value, publicationGeneration.value);
        }
        return;
    }
    if (currentVerifiedRender.value === null || openWorld.value === null || openProject.value === null) {
        projectPagesState.value = "failed";
        pagesFailure.value = "Pages setup needs a verified finished render for this project first.";
        return;
    }

    const world = openWorld.value;
    const project = openProject.value;
    try {
        const pending = await host?.notifyAutosaveChange?.(world, project);
        const flushed = await host?.flushAutosave?.(world, "boundary");
        if (flushed !== undefined && flushed !== null && !flushed.ok) {
            throw new Error(flushed.message);
        }
        if (host?.flushAutosave === undefined && host?.writeProject !== undefined) {
            const written = await host.writeProject(world, project);
            if (!written.ok) throw new Error(written.message);
        } else if (host === null || (host.flushAutosave === undefined && pending === undefined)) {
            throw new Error("The project host could not persist the Pages setting.");
        }
        savedProject.value = project;
        projectPagesState.value = "pending";
        pagesFailure.value = null;
        const record = pagesRecord("pending", currentVerifiedRender.value.renderId);
        if (record !== null) emit("publishExisting", record);
    } catch (error) {
        projectPagesState.value = "failed";
        pagesFailure.value = error instanceof Error ? error.message : String(error);
    }
}
</script>

<template>
    <!--
        The 900px measure is for the *lists*, and only for them.

        A line of prose that runs the full width of a 1440px window is a line nobody reads, which
        is why the gutter and the measure exist at all. An editor is not prose: the prototype lays
        it out as three columns - a navigation tree, the fields, and a rail carrying the save plan
        and the render mask - and 900px cannot hold that. Applied indiscriminately, the measure
        silently decided the editor's layout, and the only visible symptom was an editor that had
        to put its rail's content in a stack down the page.

        So the class comes off while the editor is open. This is one boolean rather than a second
        component because the alternative - the editor mounting itself somewhere else in the tree -
        would put the project's dirty state, its save path and its render in two places.
    -->
    <div class="mb-projects-screen" :class="{ 'mb-projects-screen--editing': editorOpen }">
        <!--
            The render outlives the editor being closed, so it sits above both rather than
            inside either. It renders nothing at all while no render has been started.
        -->
        <RenderRunPanel
            :run="run"
            @open="(dataRoot, mapIds) => emit('openMap', dataRoot, mapIds)"
            @settings="(target) => emit('settings', target)"
            @again="run.reset"
        />

        <v-alert
            v-if="listFailure"
            type="error"
            density="compact"
            variant="tonal"
            class="mb-2"
            role="alert"
        >
            {{ listFailure }}
        </v-alert>

        <v-alert
            v-if="openFailure"
            type="error"
            density="compact"
            variant="tonal"
            class="mb-2"
            role="alert"
        >
            {{ openFailure }}
        </v-alert>

        <ProjectEditor
            v-if="openProject && openWorld !== null"
            :project="openProject"
            :world="openWorld"
            :dirty="dirty"
            :saving="saving"
            :save-failure="saveFailure"
            :can-render="bridge !== null || projectRenderRoute(openProject) === 'github-actions'"
            :rendering="run.active.value"
            :consent-accepted="consentIsAccepted"
            :java-available="javaAvailable"
            :java-version="java.report.value?.installation?.version.version ?? null"
            :render-engine-available="renderEngineAvailable"
            :render-engine-reason="renderEngineReason"
            :render-engine-path="renderEnginePath"
            :separator="separator"
            :default-root="defaultRoot"
            :render-location="renderLocation"
            :render-target="renderTarget"
            :remote-bridge="remote"
            :runtime-bridge="runtime"
            :can-render-in-docker="renderModes.includes('docker')"
            :can-render-remotely="remote !== null"
            :remote-preflight-passed="remotePreflightPassed"
            :render-context-generation="renderContextGeneration"
            :can-open-ci="props.canOpenCi ?? false"
            :can-import-project="host !== null && configHost !== null"
            :can-publish-existing="currentVerifiedRender !== null"
            :pages-state="shellPagesState"
            :pages-failure="pagesFailure"
            @update:project="(value) => (openProject = value)"
            @update:render-location="(value: RunLocation) => (renderLocation = value)"
            @update:render-target="(value: RemoteTarget | null) => {
                renderTarget = value
                remotePreflightPassed = false
                preflightTargetId = null
                preflightContextKey = null
                preflightContextGeneration = null
            }"
            @update:render-preflight="(value: boolean) => {
                remotePreflightPassed = value
                preflightTargetId = value ? renderTarget?.id ?? null : null
                preflightContextKey = value ? renderContextKey : null
                preflightContextGeneration = value ? renderContextGeneration : null
            }"
            @destination="chooseDestination"
            @pages-toggle="handlePagesToggle"
            @save="save"
            @revert="revert"
            @close="closeEditor"
            @render="renderOpen"
            @consent="emit('consent')"
            @notify="(message) => notify('info', message)"
        />

        <template v-else>
            <!--
                The page's own header, which this screen simply did not have.
                `Worldlens.dc.html` opens Projects on a title, a paragraph saying what a project
                *is*, and a smaller line promising nothing here has to be typed - and the absence
                of all three is most of why the screen still read as the previous application even
                after the shell around it was rebuilt. A list that starts with no explanation is
                the old app's habit; naming what the reader is looking at is the new one.
            -->
            <header class="mb-projects-screen__header">
                <h1>{{ t("projects.page.title", "Start a project") }}</h1>
                <p class="mb-lede">
                    {{
                        t(
                            "projects.page.lede",
                            "A project is one file at the root of a Minecraft world, holding every map, storage and setting that world renders with. Starting one writes nothing until you save.",
                        )
                    }}
                </p>
                <p class="mb-footnote">
                    {{
                        t(
                            "projects.page.footnote",
                            "Nothing here is a path you have to type. Everything below was found on this machine, or fetches the world for you.",
                        )
                    }}
                </p>
            </header>

            <!--
                Worlds this computer already found, that nobody has started a project for
                yet - above the established list, so a brand new install shows something
                ready to work with instead of only "no projects yet". See
                `DiscoveredWorldsPanel.vue` and `discoveredWorlds.ts` for the discovered/
                project distinction and why it is drawn this way.
            -->
            <DiscoveredWorldsPanel
                :bridge="worldCatalogBridge"
                :project-worlds="projectWorldPaths"
                :probe="(folder: string) => probeWorldFolder(optional, folder)"
                @use="useDiscoveredWorld"
                @use-many="useDiscoveredWorlds"
                @use-direct="useDiscoveredWorld"
                @notify="notify"
            />

            <ProjectList
                :rows="rows"
                :busy="busy"
                :host-name="host?.name ?? null"
                :can-delete="host?.canDelete ?? false"
                :scanned="listing.scanned"
                :problems="listing.problems"
                @open="open"
                @render="renderRow"
                @forget="(world) => forget([world])"
                @forget-many="forget"
                @refresh="reload"
                @create="createOpen = true"
                @notify="notify"
            />
        </template>

        <!-- Starting one asks for a folder, so it is a decision dialog rather than a notice. -->
        <v-card v-if="createOpen" class="mb-projects-screen__create">
            <v-card-title>{{
                t("project.create.title", "Start a project for a world")
            }}</v-card-title>
            <v-card-text>
                <p class="mb-projects-screen__note">
                    {{
                        t(
                            "project.create.blurb",
                            "The project file lives at the root of the world folder, so the world carries its settings wherever it goes. The editor starts in memory; Save is the action that writes it.",
                        )
                    }}
                </p>
                <div class="mb-projects-screen__pick">
                    <v-text-field
                        v-model="createWorld"
                        :label="t('project.create.world', 'World folder')"
                        :error-messages="createProblem ? [createProblem] : []"
                        variant="outlined"
                        density="compact"
                        spellcheck="false"
                        hide-details="auto"
                    />
                    <v-btn
                        :prepend-icon="mdiFolderOpenOutline"
                        :disabled="configHost === null"
                        variant="tonal"
                        @click="pickWorld"
                    >
                        {{ t("project.create.browse", "Browse") }}
                    </v-btn>
                </div>
                <v-select
                    v-model="createRoute"
                    :items="createRouteItems"
                    :label="t('project.create.route', 'Render this project on')"
                    :hint="
                        t(
                            'project.create.routeHint',
                            'You can change this later. GitHub Actions installs BlueMap and its dependencies inside the workflow.',
                        )
                    "
                    persistent-hint
                    variant="outlined"
                    density="compact"
                    class="mt-4"
                />
                <p v-if="configHost === null" class="mb-projects-screen__note">
                    {{ hostMissingReason() }}
                </p>
            </v-card-text>
            <v-divider />
            <v-card-actions>
                <v-btn variant="text" @click="createOpen = false">{{
                    t("project.create.cancel", "Cancel")
                }}</v-btn>
                <v-spacer />
                <v-btn
                    color="primary"
                    variant="flat"
                    :disabled="createProblem !== null"
                    @click="confirmCreate"
                >
                    {{ t("project.create.confirm", "Start the project") }}
                </v-btn>
            </v-card-actions>
        </v-card>

        <ProjectImportDialog
            v-if="importOpen"
            :config-host="configHost"
            :project-host="host"
            :remote-bridge="remote"
            @close="importOpen = false"
            @imported="acceptImportedWorld"
        />
    </div>
</template>

<style>
/*
 * `.v-card-title` defaults to `overflow: hidden; white-space: nowrap;
 * text-overflow: ellipsis`. This card's title is a translated string that grows
 * past a single line in bilingual mode and in playful Cantonese, so left unset
 * it was silently cut off with no ellipsis painted (same clipping already
 * fixed in DependencyInstallerPanel.vue). This card is inline, not a `v-dialog`,
 * so the descendant selector below reaches it without a teleport boundary.
 */
.mb-projects-screen__create .v-card-title {
    white-space: normal;
    overflow-wrap: anywhere;
}

/*
 * The prototype's page gutter and measure, rather than a 12px pad on a 1100px column.
 *
 * 30px top / 40px side / 48px bottom, content held to 900px: prose that runs the full width of a
 * 1440px window is prose nobody reads, and the old measurement is what made every screen in this
 * application look like a settings dialog that had been stretched.
 */
.mb-projects-screen {
    display: flex;
    flex-direction: column;
    gap: 8px;
    inline-size: 100%;
    max-inline-size: 900px;
    margin-inline: auto;
    padding: 30px 40px 48px;
}

/*
 * The editor gets the room the prototype lays it out in.
 *
 * 1400px rather than no cap at all, because an unbounded editor on a 3840px display is the
 * opposite failure: a field label at one end of the screen and its control at the other. This is
 * the width the prototype's own three columns add up to, so it is a measurement rather than a
 * guess.
 */
.mb-projects-screen--editing {
    max-inline-size: 1400px;
}

@media (max-width: 900px) {
    .mb-projects-screen {
        padding: 20px 16px 32px;
    }
}

.mb-projects-screen__header {
    margin-block-end: 18px;
}

.mb-projects-screen__create {
    border-radius: 16px;
}

.mb-projects-screen__pick {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-block-start: 8px;
}

.mb-projects-screen__pick .v-text-field {
    flex: 1 1 auto;
    min-inline-size: 0;
}

.mb-projects-screen__note {
    font-size: 0.75rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-wrap: pretty;
}
</style>
