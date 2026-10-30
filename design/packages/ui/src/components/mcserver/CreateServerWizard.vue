<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, useId, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    VAlert,
    VBtn,
    VCard,
    VCardActions,
    VCardText,
    VCardTitle,
    VChip,
    VDialog,
    VDivider,
    VIcon,
    VLabel,
    VNumberInput,
    VProgressCircular,
    VProgressLinear,
    VRadio,
    VRadioGroup,
    VSlider,
    VSpacer,
    VSwitch,
    VSelect,
    VTextField,
} from "vuetify/components";
import {
    mdiCheck,
    mdiCheckCircle,
    mdiClose,
    mdiCloudDownloadOutline,
    mdiOpenInNew,
    mdiRefresh,
} from "@mdi/js";
import PathField from "../PathField.vue";
import SshProcessReadinessPanel from "./SshProcessReadinessPanel.vue";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import SearchableOptionPicker from "./SearchableOptionPicker.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import {
    releaseDateLabel,
    wikiArticleStateFor,
    wikiArticleStateLabel,
    wikiUrlFor,
} from "./versionPresentation.js";
import { useServerStore } from "./useServers.js";
import {
    validateMemoryMb,
    validatePort,
    validateServerId,
    validateServerName,
    type ServerFlavour,
    type TransportRef,
} from "./serverModel.js";
import type {
    CatalogueSnapshot,
    CatalogueVersionEntry,
    JavaProvisionProgress,
    JavaResolution,
    WikiArticleState,
    HostProfileRecord,
} from "./serverStore.js";
import {
    FLAVOUR_CARDS,
    RUNTIME_OPTIONS,
    WIZARD_STEPS,
    filterVersions,
    versionSearchError,
    groupVersions,
    memorySliderMax,
    DEFAULT_MODS_DIRECTORY,
    isModLoaderFlavour,
    recommendedMemoryMb,
    validateModsDirectory,
    type WhereItRuns,
    runtimeOptions,
} from "./wizardModel.js";

/**
 * A real multi-step wizard over the whole `mcserver` create surface: which flavour, which
 * real catalogue version, where it runs, whether Java is ready, how much memory and which
 * port, a new or imported world, and a review that never writes `eula=true` without the
 * user explicitly agreeing to it.
 *
 * Every step reads from the store's optional namespaces and says plainly when this build
 * has not wired one up yet, rather than pretending the step does not exist.
 */
const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{
    "update:modelValue": [value: boolean];
    created: [id: string];
    "open-aws": [id: string];
    "open-remote-adoption": [hostId: string];
}>();

const { t } = useI18n();
const store = useServerStore();

const open = computed<boolean>({
    get: () => props.modelValue,
    set: (value) => emit("update:modelValue", value),
});

const step = ref<(typeof WIZARD_STEPS)[number]>("flavour");

/* -------------------------------------------------------------------------- */
/* Step 1: flavour                                                            */
/* -------------------------------------------------------------------------- */

const flavour = ref<ServerFlavour>("paper");
const visibleSteps = computed(() =>
    WIZARD_STEPS.filter(
        (candidate) => candidate !== "mod-loader" || isModLoaderFlavour(flavour.value),
    ),
);
const stepNumber = computed(() => visibleSteps.value.indexOf(step.value) + 1);

/** The stepper's own words for each step, as the design names them. */
const STEP_LABELS: Record<(typeof WIZARD_STEPS)[number], string> = {
    flavour: "Flavour",
    version: "Version",
    "mod-loader": "Mod loader",
    runtime: "Where it runs",
    java: "Java",
    resources: "Memory and port",
    world: "World",
    review: "Review",
};
/** A finished step can be revisited from the stepper; a later one is reached through Next. */
function goToStep(target: (typeof WIZARD_STEPS)[number]): void {
    if (visibleSteps.value.indexOf(target) < visibleSteps.value.indexOf(step.value)) {
        step.value = target;
    }
}

/* -------------------------------------------------------------------------- */
/* Step 2: version, from the real catalogue                                   */
/* -------------------------------------------------------------------------- */

const catalogue = ref<CatalogueSnapshot | null>(null);
const catalogueLoading = ref(false);
/** Set only when the search box itself is what emptied the list. */
const versionQueryError = computed(() =>
    versionSearchError(versionQuery.value, versionUseRegex.value, versionFlags.value),
);
const catalogueFailure = ref<string | null>(null);
const versionQuery = ref("");
const versionUseRegex = ref(false);
const versionFlags = ref("i");
const minecraftVersion = ref("");
const wikiStates = ref<Record<string, WikiArticleState>>({});
const expandedFamilies = ref<Record<string, boolean>>({});
const MAX_RENDERED_VERSION_ROWS = 500;
const versionPage = ref(0);
const versionDescriptionPrefix = useId();

function versionDetailsId(version: string, field: "metadata" | "availability"): string {
    return `${versionDescriptionPrefix}-${version}-${field}`;
}

function familyStorageKey(): string {
    return `worldlens.mcserver.version-families.v1:${flavour.value}`;
}

function loadFamilyExpansion(): void {
    try {
        const raw = localStorage.getItem(familyStorageKey());
        const parsed = raw === null ? null : (JSON.parse(raw) as unknown);
        expandedFamilies.value =
            typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
                ? Object.fromEntries(
                      Object.entries(parsed).filter(
                          (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
                      ),
                  )
                : {};
    } catch {
        expandedFamilies.value = {};
    }
}

function persistFamilyExpansion(): void {
    try {
        localStorage.setItem(familyStorageKey(), JSON.stringify(expandedFamilies.value));
    } catch {
        // Private preference storage can be unavailable in a restricted profile.
    }
}

function familyKey(stability: string, family: string): string {
    return `${stability}:${family}`;
}

function familyIsExpanded(stability: string, family: string): boolean {
    if (versionQuery.value.trim() !== "") return true;
    const stored = expandedFamilies.value[familyKey(stability, family)];
    if (stored !== undefined) return stored;
    const first = versionGroups.value[0]?.families[0];
    return first?.stability === stability && first.family === family;
}

function toggleFamily(stability: string, family: string): void {
    const key = familyKey(stability, family);
    const expanding = !familyIsExpanded(stability, family);
    if (expanding) {
        const first = versionPage.value * MAX_RENDERED_VERSION_ROWS;
        let offset = 0;
        for (const candidate of versionGroups.value.flatMap((group) => group.families)) {
            if (candidate.stability === stability && candidate.family === family) {
                const end = offset + candidate.versions.length;
                if (
                    candidate.versions.length > 0 &&
                    (end <= first || offset >= first + MAX_RENDERED_VERSION_ROWS)
                ) {
                    // Headers remain discoverable across pages. Opening one must
                    // reveal its entries rather than an empty paginated subset.
                    versionPage.value = Math.floor(offset / MAX_RENDERED_VERSION_ROWS);
                }
                break;
            }
            offset += candidate.versions.length;
        }
    }
    expandedFamilies.value = {
        ...expandedFamilies.value,
        [key]: expanding,
    };
}

async function selectVersion(version: string): Promise<void> {
    minecraftVersion.value = version;
    if (!store.hasCatalogue) return;
    const result = await store.catalogueVerifyWiki(version);
    if (result.ok && result.value)
        wikiStates.value = { ...wikiStates.value, [version]: result.value.state };
}

const renderedVersionGroups = computed(() => {
    const first = versionPage.value * MAX_RENDERED_VERSION_ROWS;
    let seen = 0;
    return versionGroups.value.map((group) => ({
        ...group,
        families: group.families.map((family) => {
            const versions = family.versions.filter((_entry, index) => {
                const globalIndex = seen + index;
                return globalIndex >= first && globalIndex < first + MAX_RENDERED_VERSION_ROWS;
            });
            seen += family.versions.length;
            return { ...family, versions };
        }),
    }));
});

watch(flavour, loadFamilyExpansion, { immediate: true });
watch(expandedFamilies, persistFamilyExpansion, { deep: true });

async function loadCatalogue(): Promise<void> {
    if (!store.hasCatalogue) return;
    catalogueLoading.value = true;
    const result = await store.catalogueList();
    if (result.ok && result.value) {
        catalogue.value = result.value;
        catalogueFailure.value = null;
    } else {
        catalogueFailure.value =
            result.failure?.message ??
            t("mcserver.wizard.catalogueFailed", "The version list could not be loaded.");
    }
    catalogueLoading.value = false;
}

async function refreshCatalogue(): Promise<void> {
    if (!store.hasCatalogue) return;
    catalogueLoading.value = true;
    const result = await store.catalogueRefresh();
    if (result.ok && result.value) {
        catalogue.value = result.value;
        catalogueFailure.value = null;
    } else {
        catalogueFailure.value =
            result.failure?.message ??
            t("mcserver.wizard.catalogueFailed", "The version list could not be refreshed.");
    }
    catalogueLoading.value = false;
}

const flavourVersions = computed<readonly CatalogueVersionEntry[]>(() => {
    const card = FLAVOUR_CARDS.find((c) => c.id === flavour.value);
    if (card?.cataloguedId === null || card === undefined) return [];
    const entry = catalogue.value?.flavours.find((f) => f.flavour === card.cataloguedId);
    return entry?.versions ?? [];
});
const selectedFlavourCatalogue = computed(() => {
    const card = FLAVOUR_CARDS.find((candidate) => candidate.id === flavour.value);
    return catalogue.value?.flavours.find((entry) => entry.flavour === card?.cataloguedId) ?? null;
});
const selectedCatalogueFailures = computed(() => {
    const selectedId = selectedFlavourCatalogue.value?.flavour;
    return selectedId === undefined || catalogue.value === null
        ? []
        : catalogue.value.failures.filter((failure) => failure.flavour === selectedId);
});

/**
 * Whether the user has deliberately asked to type a version the catalogue does not list.
 *
 * Off by default, so the version is chosen from real fetched data rather than typed. The
 * escape hatch stays because a snapshot can be published before the catalogue this build
 * reads has caught up, and refusing to install it would be worse than a text field - but it
 * is something you switch on, not the first thing you land in.
 */
const typeVersionByHand = ref(false);

/**
 * Whether the version has to be entered rather than chosen.
 *
 * True when the user asked for it, and also whenever nothing could be fetched for the
 * chosen flavour - an empty picker is not a choice, and offering one beside a message
 * saying there is nothing to pick is the interface arguing with itself.
 */
const versionEnteredByHand = computed(
    // `flavourVersions`, not the search-filtered list: a query that happens to match
    // nothing means "no results", not "this flavour publishes nothing", and swapping the
    // picker for a text field mid-search would be the interface changing shape under the
    // person using it.
    () => typeVersionByHand.value || flavourVersions.value.length === 0,
);

/** Every catalogued version for the chosen flavour, as options for the picker. */
/** The wiki page for whichever version is chosen, or null when none is chosen yet. */
const selectedWikiUrl = computed(() =>
    minecraftVersion.value.trim() === "" ? null : wikiUrlFor(minecraftVersion.value),
);
const selectedWikiState = computed(
    () => wikiStates.value[minecraftVersion.value] ?? wikiArticleStateFor(minecraftVersion.value),
);

const versionOptions = computed(() =>
    filteredVersions.value.map((entry) => {
        const released = releaseDateLabel(entry.releasedAt);
        const java = t("mcserver.wizard.needsJava", { n: entry.javaFeature }, "Needs Java {n}");
        return {
            value: entry.version,
            title: entry.version,
            subtitle: released === null ? java : `${java} · ${released}`,
        };
    }),
);

const filteredVersions = computed(() =>
    filterVersions(
        flavourVersions.value,
        versionQuery.value,
        versionUseRegex.value,
        versionFlags.value,
    ),
);
const versionGroups = computed(() => groupVersions(filteredVersions.value));
const versionPageCount = computed(() =>
    Math.max(1, Math.ceil(filteredVersions.value.length / MAX_RENDERED_VERSION_ROWS)),
);
watch([versionQuery, versionUseRegex, versionFlags, flavour], () => {
    versionPage.value = 0;
});
const versionSample = computed(() => flavourVersions.value.map((v) => v.version).join("\n"));

const selectedVersionEntry = computed<CatalogueVersionEntry | undefined>(() =>
    flavourVersions.value.find((v) => v.version === minecraftVersion.value),
);

const modLoaderCatalogue = computed(() => {
    const card = FLAVOUR_CARDS.find((c) => c.id === flavour.value);
    const entry = catalogue.value?.flavours.find((f) => f.flavour === card?.cataloguedId);
    return entry;
});
const modLoaderVersions = computed<readonly string[]>(() => {
    const explicit = modLoaderCatalogue.value?.loaderVersions;
    if (explicit && explicit.length > 0) return explicit;
    // Fabric's existing catalogue entries are loader builds. Keep them usable as the
    // dedicated picker until the upstream catalogue supplies a separate field.
    return flavour.value === "fabric" ? flavourVersions.value.map((entry) => entry.version) : [];
});
const commonApiLibraries = computed<readonly string[]>(
    () => modLoaderCatalogue.value?.commonApiLibraries ?? [],
);
const modLoaderVersion = ref("");
const fabricGameVersion = ref("");
const fabricGameOptions = computed(() =>
    (catalogue.value?.flavours.find((entry) => entry.flavour === "vanilla")?.versions ?? []).map(
        (entry) => ({ title: entry.version, value: entry.version }),
    ),
);
watch(minecraftVersion, (value) => {
    if (flavour.value === "fabric" || flavour.value === "neoforge") modLoaderVersion.value = value;
    if (flavour.value === "forge")
        modLoaderVersion.value =
            /^((?:1\.[0-9]+|[0-9]{2}\.[0-9]+)(?:\.[0-9]+)?)-(.+)$/.exec(value)?.[2] ?? "";
});
const modsDirectory = ref(DEFAULT_MODS_DIRECTORY);
const preinstallApiLibraries = ref<string[]>([]);
const modLoaderMemoryRecommendation = computed(() => recommendedMemoryMb(flavour.value));
const isModLoader = computed(() => isModLoaderFlavour(flavour.value));

function setApiLibraryEnabled(library: string, enabled: boolean): void {
    preinstallApiLibraries.value = enabled
        ? [...new Set([...preinstallApiLibraries.value, library])]
        : preinstallApiLibraries.value.filter((item) => item !== library);
}

watch(flavour, () => {
    minecraftVersion.value = "";
    modLoaderVersion.value = "";
    preinstallApiLibraries.value = [];
    memoryMb.value = recommendedMemoryMb(flavour.value);
});

/* -------------------------------------------------------------------------- */
/* Step 3: where it runs                                                      */
/* -------------------------------------------------------------------------- */

const whereItRuns = ref<WhereItRuns>("local-process");
const serverDir = ref("");
const sshHost = ref("");
const dockerContainerRef = ref("");
const dockerImage = ref("itzg/minecraft-server:java21");
const advancedDockerImage = ref(false);
const dockerImageEdited = ref(false);
const dockerImageRepository = computed(() =>
    flavour.value === "velocity" ? "itzg/mc-proxy" : "itzg/minecraft-server",
);
const dockerImageOptions = computed(() =>
    (flavour.value === "velocity" ? [8, 17, 21, 25] : [8, 11, 16, 17, 21, 25]).map((version) => ({
        title: `${flavour.value === "velocity" ? "Velocity proxy" : "Minecraft server"} · Java ${version}`,
        value: `${dockerImageRepository.value}:java${version}`,
    })),
);
const selectedHostProfile = computed(() =>
    hostProfiles.value.find((profile) => profile.hostId === sshHost.value),
);
const selectedDockerImage = computed(() =>
    whereItRuns.value === "ssh-docker"
        ? (selectedHostProfile.value?.target.image ?? "")
        : dockerImage.value.trim(),
);
const dockerImageError = computed(() => {
    const image = selectedDockerImage.value;
    const guided = /^itzg\/(minecraft-server|mc-proxy):java(8|11|16|17|21|25)$/.exec(image);
    if (!guided && !/^[A-Za-z0-9][A-Za-z0-9/_.:-]*@sha256:[a-f0-9]{64}$/.test(image))
        return t(
            "mcserver.wizard.pinnedImageRequired",
            "Choose a listed server image or supply its published digest. SSH images come from the saved host profile.",
        );
    if (
        image.startsWith("itzg/") &&
        !image.startsWith(`${dockerImageRepository.value}${guided ? ":" : "@"}`)
    )
        return t(
            "mcserver.wizard.imageFamilyMismatch",
            "This image family cannot run the selected server flavour. Choose the matching server or proxy image.",
        );
    if (guided && Number(guided[2]) < requiredJavaFeature.value)
        return t(
            "mcserver.wizard.imageJavaMismatch",
            { n: requiredJavaFeature.value },
            "This version needs Java {n} or newer. Choose a compatible image before continuing.",
        );
    return null;
});
const hostProfiles = ref<readonly HostProfileRecord[]>([]);
const hostProfileQuery = ref("");
const hostProfileRegex = ref(false);
const hostProfileFlags = ref("i");
const hostProfileFailure = ref<string | null>(null);
const hostProfileLoading = ref(false);
const hostProfileMatcher = computed(() =>
    createSettingMatcher(hostProfileQuery.value, hostProfileRegex.value, hostProfileFlags.value),
);
const filteredHostProfiles = computed(() =>
    hostProfiles.value.filter((profile) =>
        hostProfileMatcher.value.test(
            `${profile.hostId} ${profile.target.label} ${profile.target.host}`,
        ),
    ),
);

async function loadHostProfiles(): Promise<void> {
    hostProfileLoading.value = true;
    hostProfileFailure.value = null;
    const result = await store.hostProfiles.list();
    if (result.ok) hostProfiles.value = result.value ?? [];
    else
        hostProfileFailure.value =
            result.failure?.message ??
            t("mcserver.wizard.hostProfilesFailed", "SSH host profiles could not be loaded.");
    hostProfileLoading.value = false;
}

const awsAvailable = computed(() => {
    const bridge = (globalThis as { worldlens?: { mcserver?: { aws?: unknown } } }).worldlens;
    return bridge?.mcserver?.aws !== undefined && bridge.mcserver.aws !== null;
});
const runtimeOptionsForWizard = computed(() =>
    runtimeOptions(awsAvailable.value).map((option) =>
        option.id === "ssh-process"
            ? {
                  ...option,
                  name: t("mcserver.sshReadiness.runtime"),
                  description: t("mcserver.sshReadiness.explanation"),
              }
            : option,
    ),
);

interface RuntimeAvailability {
    checking: boolean;
    available: boolean | null;
    message: string;
}

const dockerAvailability = reactive<RuntimeAvailability>({
    checking: false,
    available: null,
    message: "",
});
const dockerStarting = ref(false);

async function probeDocker(): Promise<void> {
    const bridge = (globalThis as { worldlens?: { dockerRuntime?: () => Promise<unknown> } })
        .worldlens;
    if (bridge?.dockerRuntime === undefined) {
        dockerAvailability.available = false;
        dockerAvailability.message = t(
            "mcserver.wizard.dockerNoBridge",
            "This build cannot check for Docker.",
        );
        return;
    }
    dockerAvailability.checking = true;
    try {
        const summary = (await bridge.dockerRuntime()) as { available?: boolean; message?: string };
        dockerAvailability.available = summary.available ?? false;
        dockerAvailability.message = summary.message ?? "";
    } finally {
        dockerAvailability.checking = false;
    }
}

async function startDocker(): Promise<void> {
    const bridge = (globalThis as { worldlens?: { startDockerRuntime?: () => Promise<unknown> } })
        .worldlens;
    if (bridge?.startDockerRuntime === undefined) return;
    dockerStarting.value = true;
    try {
        const result = (await bridge.startDockerRuntime()) as {
            outcome?: string;
            message?: string;
        };
        dockerAvailability.message = result.message ?? "";
        dockerAvailability.available =
            result.outcome === "started" || result.outcome === "already-running";
    } finally {
        dockerStarting.value = false;
    }
    await probeDocker();
}

watch(whereItRuns, (value) => {
    if (value === "local-docker" && dockerAvailability.available === null) {
        void probeDocker();
    }
    if ((value === "ssh-docker" || value === "ssh-process") && hostProfiles.value.length === 0) {
        void loadHostProfiles();
    }
});

/* -------------------------------------------------------------------------- */
/* Step 4: Java                                                               */
/* -------------------------------------------------------------------------- */

const javaResolution = ref<JavaResolution | null>(null);
const javaChecking = ref(false);
const javaProvisioning = ref(false);
const javaProgress = ref<JavaProvisionProgress | null>(null);
const javaFailure = ref<string | null>(null);
let unsubscribeJavaProgress: (() => void) | null = null;
type JavaOperation = {
    kind: "check" | "provision";
    generation: number;
    /** Settles when this operation has finished and released the lock. */
    readonly settled: Promise<void>;
};

/** Releases {@link javaOperation}'s promise. Set beside every operation that takes the lock. */
let releaseJavaOperation: (() => void) | null = null;

function takeJavaLock(kind: "check" | "provision", generation: number): JavaOperation {
    let release = (): void => {};
    const settled = new Promise<void>((resolve) => {
        release = resolve;
    });
    releaseJavaOperation = release;
    const operation: JavaOperation = { kind, generation, settled };
    javaOperation = operation;
    return operation;
}

function freeJavaLock(): void {
    const release = releaseJavaOperation;
    javaOperation = null;
    releaseJavaOperation = null;
    release?.();
}

let javaGeneration = 0;
let javaOperation: JavaOperation | null = null;
let queuedJavaGeneration: number | null = null;
let javaDisposed = false;

const requiredJavaFeature = computed(() =>
    flavour.value === "fabric" ||
    (flavour.value === "neoforge" && Number(minecraftVersion.value.split(".")[0]) >= 26)
        ? (catalogue.value?.flavours
              .find((entry) => entry.flavour === "vanilla")
              ?.versions.find((entry) => entry.version === fabricGameVersion.value)?.javaFeature ??
          21)
        : (selectedVersionEntry.value?.javaFeature ?? 21),
);
watch(
    [requiredJavaFeature, dockerImageRepository],
    () => {
        if (dockerImageEdited.value || advancedDockerImage.value) return;
        const compatible = dockerImageOptions.value.find(
            (option) =>
                Number(/java([0-9]+)$/.exec(option.value)?.[1]) >= requiredJavaFeature.value,
        );
        if (compatible) dockerImage.value = compatible.value;
    },
    { immediate: true },
);
const javaNotRequired = computed(
    () => whereItRuns.value === "ssh-docker" || whereItRuns.value === "local-docker",
);

async function checkJava(): Promise<void> {
    if (!store.hasJava || javaNotRequired.value || javaDisposed) return;
    if (javaOperation !== null) {
        if (step.value === "java") queuedJavaGeneration = javaGeneration;
        return;
    }
    const generation = javaGeneration;
    queuedJavaGeneration = null;
    // Held rather than discarded. takeJavaLock reassigns the module-level javaOperation,
    // which TypeScript cannot see through the call -- so after the `javaOperation !== null`
    // early return above it still believes the variable is null, and the guard in the
    // `finally` below typed as `never`. The guard is real at runtime: the lock was taken
    // here and another operation may have replaced it across the awaits. Comparing against
    // the returned operation says that outright instead of relying on narrowing that is
    // unsound in exactly the direction that hides a live check.
    const operation = takeJavaLock("check", generation);
    javaChecking.value = true;
    javaFailure.value = null;
    try {
        const result = await store.javaResolve(String(requiredJavaFeature.value));
        if (generation !== javaGeneration || javaDisposed) return;
        if (result.ok && result.value) {
            javaResolution.value = result.value;
            javaFailure.value = null;
        } else {
            javaResolution.value = null;
            javaFailure.value =
                result.failure?.message ??
                t("mcserver.wizard.javaCheckFailed", "The Java check could not finish.");
        }
    } catch (error) {
        if (generation !== javaGeneration || javaDisposed) return;
        javaResolution.value = null;
        javaFailure.value = error instanceof Error ? error.message : String(error);
    } finally {
        if (javaOperation === operation) {
            freeJavaLock();
            javaChecking.value = false;
        }
        if (
            !javaDisposed &&
            queuedJavaGeneration === javaGeneration &&
            step.value === "java" &&
            !javaNotRequired.value
        ) {
            queuedJavaGeneration = null;
            void checkJava();
        }
    }
}

async function provisionJava(): Promise<void> {
    if (!store.hasJava || javaNotRequired.value || javaDisposed) return;
    // A person pressed a button, so this never returns silently. The lock is held by the
    // Java check that runs when the step opens, and simply returning here meant a click
    // landing during that check did nothing at all, said nothing at all, and looked exactly
    // like a broken button. Wait for the check instead, then take the lock.
    if (javaOperation !== null) {
        // Which kind is holding the lock decides what to do after it lets go, and this used
        // to ignore that. Waiting for a *check* and then provisioning is the point: a click
        // landing during the check that runs when the step opens used to do nothing at all
        // and look exactly like a broken button. Waiting for a *provision* and then
        // provisioning again is a second install of something that was just installed - a
        // double click ran the whole download twice, and the second run's promise never
        // settled because the first had already taken the answer, so the spinner stayed up
        // for good.
        const waitingFor = javaOperation.kind;
        javaProvisioning.value = true;
        try {
            await javaOperation.settled;
        } finally {
            javaProvisioning.value = false;
        }
        if (javaDisposed || javaNotRequired.value) return;
        // The provision we were queued behind has finished and applied its result. There is
        // nothing left for this click to do, and doing it anyway is the bug above.
        if (waitingFor === "provision") return;
        if (javaOperation !== null) {
            javaFailure.value = t("mcserver.wizard.javaBusy", "Wait for the Java check to finish.");
            return;
        }
    }
    const generation = javaGeneration;
    queuedJavaGeneration = null;
    // Held rather than discarded. takeJavaLock reassigns the module-level javaOperation,
    // which TypeScript cannot see through the call -- so after the `javaOperation !== null`
    // early return above it still believes the variable is null, and the guard in the
    // `finally` below typed as `never`. The guard is real at runtime: the lock was taken
    // here and another operation may have replaced it across the awaits. Comparing against
    // the returned operation says that outright instead of relying on narrowing that is
    // unsound in exactly the direction that hides a live check.
    const operation = takeJavaLock("provision", generation);
    javaProvisioning.value = true;
    javaProgress.value = null;
    javaFailure.value = null;
    try {
        const result = await store.javaProvision(String(requiredJavaFeature.value));
        if (generation !== javaGeneration || javaDisposed) return;
        if (result.ok && result.value) {
            javaResolution.value = result.value;
            javaFailure.value = null;
        } else {
            javaResolution.value = null;
            javaFailure.value =
                result.failure?.message ??
                t("mcserver.wizard.javaProvisionFailed", "Java could not be installed.");
        }
    } catch (error) {
        if (generation !== javaGeneration || javaDisposed) return;
        javaResolution.value = null;
        javaFailure.value = error instanceof Error ? error.message : String(error);
    } finally {
        if (javaOperation === operation) {
            freeJavaLock();
            javaProvisioning.value = false;
        }
        if (
            !javaDisposed &&
            queuedJavaGeneration === javaGeneration &&
            step.value === "java" &&
            !javaNotRequired.value
        ) {
            queuedJavaGeneration = null;
            void checkJava();
        } else if (!javaDisposed && generation === javaGeneration && javaFailure.value === null) {
            // The provision response is not proof that the executable is discoverable
            // through the same route a later server start will use.
            await checkJava();
        }
    }
}

watch(step, (value) => {
    if (
        value === "java" &&
        javaResolution.value === null &&
        store.hasJava &&
        !javaNotRequired.value
    ) {
        void checkJava();
    }
});

watch([flavour, minecraftVersion, whereItRuns], () => {
    javaGeneration += 1;
    javaResolution.value = null;
    javaFailure.value = null;
    javaProgress.value = null;
    javaChecking.value = false;
    javaProvisioning.value = false;
    if (javaOperation !== null) {
        queuedJavaGeneration = javaGeneration;
    } else if (step.value === "java" && !javaNotRequired.value && store.hasJava) {
        void checkJava();
    }
});

onMounted(() => {
    javaDisposed = false;
    unsubscribeJavaProgress = store.onJavaProgress((progress) => {
        if (javaOperation?.kind !== "provision" || javaOperation.generation !== javaGeneration)
            return;
        javaProgress.value = progress;
        if (progress.phase === "failed") javaFailure.value = progress.message;
    });
    if (open.value) {
        void loadCatalogue();
        resetWizard();
        void fillSuggestedFolder();
    }
});
onUnmounted(() => {
    unsubscribeJavaProgress?.();
    javaDisposed = true;
    javaGeneration += 1;
    queuedJavaGeneration = null;
    javaChecking.value = false;
    javaProvisioning.value = false;
    javaProgress.value = null;
});

const canAutoProvisionJava = computed(() => store.hasJava && !javaNotRequired.value);

/* -------------------------------------------------------------------------- */
/* Step 5: resources                                                          */
/* -------------------------------------------------------------------------- */

// This build has no bridge call exposing the host's real physical memory to the
// renderer, so the slider is bounded against a conservative fixed ceiling rather than
// a live probe. Widening it to a real machine reading is tracked as a follow-up.
const MACHINE_MEMORY_CEILING_MB = 16384;
const memoryMb = ref(2048);
const memorySliderCap = computed(() => memorySliderMax(MACHINE_MEMORY_CEILING_MB));
const port = ref(25565);
const portChecking = ref(false);
const portAvailable = ref<boolean | null>(null);

async function checkPort(): Promise<void> {
    // No dedicated port-availability bridge call exists; this stays a client-side bounds
    // check plus the explicit port field, which is the honest limit of what this build
    // can verify before the server is actually created.
    portChecking.value = false;
    portAvailable.value = validatePort(port.value) === null ? null : false;
}
watch(port, () => void checkPort());

/* -------------------------------------------------------------------------- */
/* Step 6: world                                                              */
/* -------------------------------------------------------------------------- */

const worldMode = ref<"new" | "import">("new");
const seed = ref("");
const levelType = ref("minecraft:normal");
const generateStructures = ref(true);
const importedWorldDir = ref("");

const LEVEL_TYPES = [
    { title: "Default", value: "minecraft:normal" },
    { title: "Superflat", value: "minecraft:flat" },
    { title: "Large biomes", value: "minecraft:large_biomes" },
    { title: "Amplified", value: "minecraft:amplified" },
    { title: "Single biome", value: "minecraft:single_biome_surface" },
];

/* -------------------------------------------------------------------------- */
/* Step 7: review + EULA                                                      */
/* -------------------------------------------------------------------------- */

const serverId = ref("");
const serverName = ref("");
/**
 * Whether the person actually typed in these fields.
 *
 * "The field is not empty" was standing in for this, and the suggestion itself is what
 * makes it non-empty - so after the first arrival at review the derivation could never run
 * again. Going back and changing the flavour left `paper-26-2` on a vanilla server, and
 * these values are persisted verbatim, so the record was genuinely wrong rather than just
 * the label. Vuetify emits `update:model-value` only for real user input, never for a
 * programmatic assignment, which is exactly the distinction that was missing.
 */
const serverIdEdited = ref(false);
const serverNameEdited = ref(false);
const eulaAccepted = ref(false);
const creating = ref(false);
const createFailure = ref<string | null>(null);

/**
 * A failed create stops describing the wizard the moment the wizard changes.
 *
 * It was cleared only by submitting again or by resetting, and rendered unconditionally, so
 * going back and changing the flavour left the previous refusal sitting under the new
 * choice - which reads as "still broken" for a combination that was never tried.
 */
watch([flavour, minecraftVersion, whereItRuns, serverId, serverName], () => {
    createFailure.value = null;
});

const idError = computed(() =>
    validateServerId(
        serverId.value,
        store.servers.value.map((s) => s.id),
    ),
);
const nameError = computed(() => validateServerName(serverName.value));
const memoryError = computed(() => validateMemoryMb(memoryMb.value));
const portError = computed(() => validatePort(port.value));
const folderError = computed(() =>
    whereItRuns.value === "local-process" && serverDir.value.trim() === ""
        ? t("mcserver.wizard.folderRequired", "Choose a folder for this server.")
        : null,
);
const dockerContainerError = computed(() =>
    whereItRuns.value === "local-docker"
        ? validateServerId(
              dockerContainerRef.value,
              store.servers.value.map((server) => server.id),
          )
        : null,
);

const canCreate = computed(
    () =>
        idError.value === null &&
        nameError.value === null &&
        memoryError.value === null &&
        portError.value === null &&
        folderError.value === null &&
        dockerContainerError.value === null &&
        eulaAccepted.value &&
        minecraftVersion.value.trim() !== "" &&
        (whereItRuns.value !== "ssh-docker" || sshHost.value.trim() !== ""),
);

function transportRef(): TransportRef {
    if (whereItRuns.value === "local-docker") {
        return {
            kind: "local-docker",
            containerRef: dockerContainerRef.value.trim(),
            serverDir: serverDir.value,
        };
    }
    if (whereItRuns.value === "ssh-docker") {
        return {
            kind: "ssh-docker",
            hostId: sshHost.value,
            containerRef: serverId.value,
            serverDir: serverDir.value,
        };
    }
    if (whereItRuns.value === "aws") {
        // The provisioning panel fills the instance details after the record is created.
        // Keep the record typed and routable while that existing flow does its work.
        return {
            kind: "aws",
            region: "",
            instanceId: "",
            publicIp: "",
            sshUser: "ec2-user",
            identityFile: null,
            containerRef: serverId.value,
            serverDir: serverDir.value || "~",
        };
    }
    return { kind: "local-process", serverDir: serverDir.value };
}

async function create(): Promise<void> {
    if (
        creating.value ||
        !canCreate.value ||
        !canAdvanceFromRuntime.value ||
        !canAdvanceFromJava.value ||
        !canAdvanceFromModLoader.value
    )
        return;
    creating.value = true;
    createFailure.value = null;

    if (!store.hasCreate) {
        creating.value = false;
        createFailure.value = t(
            "mcserver.wizard.createUnavailable",
            "This build cannot create a server through its verified host route, so no server was saved.",
        );
        return;
    }

    const loaderVersion = modLoaderVersion.value.trim();
    let result;
    try {
        result = await store.createServer({
            id: serverId.value,
            name: serverName.value,
            flavour: flavour.value,
            version: minecraftVersion.value,
            memoryMb: memoryMb.value,
            port: port.value,
            ...(flavour.value === "fabric" || flavour.value === "neoforge"
                ? { gameVersion: fabricGameVersion.value }
                : {}),
            acceptedEula: eulaAccepted.value,
            transport: transportRef(),
            ...(javaNotRequired.value
                ? {
                      dockerPlan: {
                          image: selectedDockerImage.value,
                          imageVerified: selectedDockerImage.value.includes("@sha256:"),
                          containerRef:
                              whereItRuns.value === "local-docker"
                                  ? dockerContainerRef.value.trim()
                                  : serverId.value,
                          serverDir: flavour.value === "velocity" ? "/server" : "/data",
                          ports: [{ host: port.value, container: 25565 }],
                      },
                  }
                : {}),
            provisionJavaIfMissing: !javaNotRequired.value,
            ...(isModLoader.value
                ? {
                      ...(loaderVersion ? { loaderVersion } : {}),
                      modsDirectory: modsDirectory.value.trim() || DEFAULT_MODS_DIRECTORY,
                      preinstallApiLibraries: [...preinstallApiLibraries.value],
                  }
                : {}),
        });
    } catch (error) {
        createFailure.value = error instanceof Error ? error.message : String(error);
        return;
    } finally {
        creating.value = false;
    }
    creating.value = false;
    if (result.ok) {
        emit("created", serverId.value);
        if (whereItRuns.value === "aws") emit("open-aws", serverId.value);
        open.value = false;
        resetWizard();
        return;
    }
    createFailure.value =
        result.failure?.message ??
        t("mcserver.wizard.createFailed", "The server could not be created.");
}

/**
 * Fills the server folder with the location this app would choose anyway.
 *
 * The field used to open empty, which asked every user to type or browse to a path the app
 * already had an answer for - and an empty value was also what made the wizard
 * unfinishable. It stays fully editable, with its own browse button; this only means
 * nobody has to supply it by hand to get started.
 *
 * A host that cannot suggest one leaves the field empty rather than receiving a guess, and
 * a suggestion never overwrites a folder the user has already chosen.
 */
/**
 * Proposes an id and a display name from the choices already made.
 *
 * The review step used to open with both empty, so the wizard could not be finished without
 * typing - and the app already knew everything needed to propose one: the flavour, the
 * version, and which ids are taken. Demanding it anyway is exactly the rule this project is
 * built on, broken at the last step.
 *
 * Both stay fully editable. A suggestion is a starting point, not a decision, and it never
 * overwrites something already typed.
 */
function suggestIdentity(): void {
    const taken = new Set(store.servers.value.map((server) => server.id));
    // The game version rather than the build: `1.21.4#123` is a build reference, and a
    // hyphenated hash in an id reads as a mistake.
    const game = minecraftVersion.value.split("#")[0] ?? "";
    const stem = `${flavour.value}-${game}`
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
    const base = stem === "" ? "server" : stem;

    if (!serverIdEdited.value) {
        let candidate = base;
        // A second Vanilla 26.2 is an ordinary thing to want, so the suffix counts up
        // rather than refusing.
        for (let n = 2; taken.has(candidate); n += 1) candidate = `${base}-${n}`;
        serverId.value = candidate;
    }
    if (!serverNameEdited.value) {
        const label =
            FLAVOUR_CARDS.find((card) => card.id === flavour.value)?.name ?? flavour.value;
        serverName.value = game === "" ? label : `${label} ${game}`;
    }
}

async function fillSuggestedFolder(): Promise<void> {
    if (serverDir.value.trim() !== "") return;
    const suggested = await store.suggestFolder(serverName.value.trim() || serverId.value.trim());
    if (suggested !== null && serverDir.value.trim() === "") serverDir.value = suggested;
}

function resetWizard(): void {
    invalidateJavaSession();
    serverIdEdited.value = false;
    serverNameEdited.value = false;
    step.value = "flavour";
    flavour.value = "paper";
    minecraftVersion.value = "";
    whereItRuns.value = "local-process";
    serverDir.value = "";
    sshHost.value = "";
    dockerContainerRef.value = "";
    dockerImage.value = "itzg/minecraft-server:java21";
    advancedDockerImage.value = false;
    dockerImageEdited.value = false;
    fabricGameVersion.value = "";
    javaResolution.value = null;
    memoryMb.value = 2048;
    modLoaderVersion.value = "";
    modsDirectory.value = DEFAULT_MODS_DIRECTORY;
    preinstallApiLibraries.value = [];
    port.value = 25565;
    worldMode.value = "new";
    seed.value = "";
    serverId.value = "";
    serverName.value = "";
    eulaAccepted.value = false;
    javaProgress.value = null;
    javaFailure.value = null;
    createFailure.value = null;
}

function invalidateJavaSession(): void {
    javaGeneration += 1;
    queuedJavaGeneration = null;
    javaResolution.value = null;
    javaProgress.value = null;
    javaFailure.value = null;
    javaChecking.value = false;
    javaProvisioning.value = false;
}

watch(
    open,
    (isOpen) => {
        if (isOpen) {
            void loadCatalogue();
            resetWizard();
            // After the reset, so it is not immediately cleared again.
            void fillSuggestedFolder();
        } else {
            invalidateJavaSession();
        }
    },
    // Immediate, because a wizard mounted already open would otherwise never load its
    // catalogue at all: the watcher fires on a change, and there is no change when the
    // dialog is open from the first render. Every version list would be empty and the step
    // would say no versions could be fetched, which is a sentence about the network rather
    // than about a callback that never ran.
    { immediate: true },
);

function next(): void {
    const idx = WIZARD_STEPS.indexOf(step.value);
    // Proposed on arrival at review rather than at open, so it reflects the flavour and
    // version actually chosen instead of whatever the wizard defaulted to.
    if (WIZARD_STEPS[idx + 1] === "review") suggestIdentity();
    for (let nextIdx = idx + 1; nextIdx < WIZARD_STEPS.length; nextIdx += 1) {
        const candidate = WIZARD_STEPS[nextIdx]!;
        if (candidate !== "mod-loader" || isModLoader.value) {
            step.value = candidate;
            return;
        }
    }
}
function back(): void {
    const idx = WIZARD_STEPS.indexOf(step.value);
    for (let previousIdx = idx - 1; previousIdx >= 0; previousIdx -= 1) {
        const candidate = WIZARD_STEPS[previousIdx]!;
        if (candidate !== "mod-loader" || isModLoader.value) {
            step.value = candidate;
            return;
        }
    }
}

const canAdvanceFromFlavour = computed(() => flavour.value !== null);
const canAdvanceFromVersion = computed(() => minecraftVersion.value.trim() !== "");
const canAdvanceFromModLoader = computed(
    () =>
        !isModLoader.value ||
        (modLoaderVersion.value.trim() !== "" &&
            ((flavour.value !== "fabric" &&
                !(
                    flavour.value === "neoforge" &&
                    Number(minecraftVersion.value.split(".")[0]) >= 26
                )) ||
                fabricGameVersion.value !== "") &&
            validateModsDirectory(modsDirectory.value) === null),
);
const canAdvanceFromRuntime = computed(() => {
    if (whereItRuns.value === "ssh-process") return false;
    // The server folder field lives on THIS step, so this step is where a missing one has
    // to stop you. It used to let you straight past and the resources step refused to
    // advance instead - with the folder field nowhere on screen and nothing saying why,
    // which is a dead end rather than a validation message.
    if (folderError.value !== null) return false;
    if (whereItRuns.value === "local-process") return true;
    if (whereItRuns.value === "local-docker") {
        return (
            store.canCreateLocalDocker &&
            dockerAvailability.available === true &&
            dockerContainerError.value === null &&
            dockerImageError.value === null
        );
    }
    if (whereItRuns.value === "aws") return awsAvailable.value;
    return selectedHostProfile.value !== undefined && dockerImageError.value === null;
});
const canAdvanceFromJava = computed(
    () =>
        javaNotRequired.value ||
        (store.hasCreate && !store.hasJava && !javaChecking.value && !javaProvisioning.value) ||
        (javaResolution.value?.found === true && !javaChecking.value && !javaProvisioning.value),
);
const canAdvanceFromResources = computed(
    () => memoryError.value === null && portError.value === null && folderError.value === null,
);
const canAdvanceFromWorld = computed(
    () => worldMode.value === "new" || importedWorldDir.value.trim() !== "",
);

/**
 * Why Next cannot be pressed, in words, or null when it can.
 *
 * A disabled button with no stated reason reads as broken software. This names the exact
 * unmet condition beside the control, which is what the surrounding rules require of every
 * disabled control.
 */
const advanceBlockedReason = computed<string | null>(() => {
    switch (step.value) {
        case "flavour":
            return flavour.value === null
                ? t("mcserver.wizard.pickFlavour", "Choose the kind of server first.")
                : null;
        case "version":
            return minecraftVersion.value.trim() === ""
                ? t("mcserver.wizard.pickVersion", "Choose a Minecraft version first.")
                : null;
        case "mod-loader":
            return canAdvanceFromModLoader.value
                ? null
                : (validateModsDirectory(modsDirectory.value) ??
                      t("mcserver.wizard.pickModLoader", "Choose a loader version first."));
        case "runtime":
            if (whereItRuns.value === "ssh-process")
                return t("mcserver.sshReadiness.installUnavailable");
            if (folderError.value !== null) return folderError.value;
            if (javaNotRequired.value && dockerImageError.value !== null)
                return dockerImageError.value;
            if (whereItRuns.value === "local-docker" && dockerAvailability.available !== true) {
                return t(
                    "mcserver.wizard.dockerUnavailable",
                    "Docker is not usable on this computer yet.",
                );
            }
            if (whereItRuns.value === "ssh-docker" && sshHost.value.trim() === "") {
                return t("mcserver.wizard.needHost", "Enter the host this server runs on.");
            }
            if (whereItRuns.value === "aws" && !awsAvailable.value) {
                return t(
                    "mcserver.wizard.awsUnavailable",
                    "AWS hosting is not available in this build.",
                );
            }
            if (whereItRuns.value === "local-docker" && !store.canCreateLocalDocker) {
                return t(
                    "mcserver.wizard.dockerCreateUnavailable",
                    "This build can inspect Docker but cannot create a Docker server yet. Choose Local process until the typed Docker create capability is available.",
                );
            }
            if (whereItRuns.value === "local-docker" && dockerContainerError.value !== null) {
                return dockerContainerError.value;
            }
            return null;
        case "java":
            if (javaNotRequired.value) return null;
            if (javaChecking.value || javaProvisioning.value) {
                return t("mcserver.wizard.javaBusy", "Wait for the Java check to finish.");
            }
            if (!store.hasJava) {
                if (!store.hasCreate) {
                    return t(
                        "mcserver.wizard.javaUnavailableNoCreate",
                        "This build cannot verify Java and cannot create a server, so this route is unavailable.",
                    );
                }
                return t(
                    "mcserver.wizard.javaOnCreate",
                    "This build cannot check Java here. Create will provision the required runtime automatically.",
                );
            }
            if (javaFailure.value !== null) return javaFailure.value;
            if (javaResolution.value?.found !== true) {
                return t(
                    "mcserver.wizard.javaRequired",
                    "A suitable Java runtime must be found before this wizard can continue.",
                );
            }
            return null;
        case "resources":
            return memoryError.value ?? portError.value ?? folderError.value;
        case "world":
            return canAdvanceFromWorld.value
                ? null
                : t("mcserver.wizard.pickWorld", "Choose the world folder to import.");
        default:
            return null;
    }
});

const canAdvance = computed(() => {
    switch (step.value) {
        case "flavour":
            return canAdvanceFromFlavour.value;
        case "version":
            return canAdvanceFromVersion.value;
        case "mod-loader":
            return canAdvanceFromModLoader.value;
        case "runtime":
            return canAdvanceFromRuntime.value;
        case "java":
            return canAdvanceFromJava.value;
        case "resources":
            return canAdvanceFromResources.value;
        case "world":
            return canAdvanceFromWorld.value;
        default:
            return true;
    }
});
</script>

<template>
    <VDialog v-model="open" max-width="1080" scrollable persistent>
        <VCard class="wl-mcserver-wizard">
            <VCardTitle class="wl-mcserver-wizard__title">
                <span>{{ t("mcserver.wizard.title", "New Minecraft server") }}</span>
                <span class="wl-mcserver-wizard__count">{{
                    t(
                        "mcserver.wizard.stepCount",
                        { n: stepNumber, total: visibleSteps.length },
                        "Step {n} of {total}",
                    )
                }}</span>
                <VSpacer />
                <VBtn
                    :icon="mdiClose"
                    variant="text"
                    size="small"
                    :aria-label="t('common.cancel', 'Cancel')"
                    @click="open = false"
                />
            </VCardTitle>
            <nav
                class="wl-mcserver-wizard__stepper"
                :aria-label="t('mcserver.wizard.progress', 'Wizard progress')"
            >
                <VBtn
                    v-for="(s, idx) in visibleSteps"
                    :key="s"
                    variant="text"
                    size="small"
                    class="wl-mcserver-wizard__stepper-item"
                    :class="{
                        'wl-mcserver-wizard__stepper-item--active': s === step,
                        'wl-mcserver-wizard__stepper-item--done': stepNumber > idx + 1,
                    }"
                    :aria-current="s === step ? 'step' : undefined"
                    :disabled="stepNumber <= idx + 1 && s !== step"
                    @click="goToStep(s)"
                >
                    <span class="wl-mcserver-wizard__stepper-dot" aria-hidden="true">
                        <VIcon v-if="stepNumber > idx + 1" :icon="mdiCheck" size="14" />
                        <template v-else>{{ idx + 1 }}</template>
                    </span>
                    {{ t(`mcserver.wizard.step.${s}`, STEP_LABELS[s]) }}
                </VBtn>
            </nav>
            <VCardText class="wl-mcserver-wizard__body">
                <!-- Step 1: flavour -->
                <div v-if="step === 'flavour'" class="wl-mcserver-wizard__step">
                    <p class="wl-mcserver-wizard__intro">
                        {{
                            t(
                                "mcserver.wizard.flavourIntro",
                                "What kind of server this is. It decides which versions are catalogued, whether plugins or mods load, and whether a mod-loader step appears at all.",
                            )
                        }}
                    </p>
                    <div
                        class="wl-mcserver-wizard__flavours"
                        role="radiogroup"
                        :aria-label="t('mcserver.wizard.flavour', 'Flavour')"
                    >
                        <VCard
                            v-for="card in FLAVOUR_CARDS"
                            :key="card.id"
                            :variant="flavour === card.id ? 'flat' : 'outlined'"
                            :color="flavour === card.id ? 'primary-container' : undefined"
                            class="wl-mcserver-wizard__flavour-card"
                            rounded="lg"
                            :class="{
                                'wl-mcserver-wizard__flavour-card--selected': flavour === card.id,
                            }"
                            role="radio"
                            :aria-checked="flavour === card.id"
                            :aria-pressed="flavour === card.id"
                            tabindex="0"
                            @click="flavour = card.id"
                            @keydown.enter.prevent="flavour = card.id"
                            @keydown.space.prevent="flavour = card.id"
                        >
                            <div class="wl-mcserver-wizard__flavour-name">
                                <span class="wl-mcserver-wizard__flavour-title">{{
                                    card.name
                                }}</span>
                                <span class="wl-mcserver-wizard__flavour-tagline">{{
                                    card.tagline
                                }}</span>
                                <VSpacer />
                                <span class="wl-mcserver-wizard__flavour-catalogue">{{
                                    card.cataloguedId === null
                                        ? t(
                                              "mcserver.wizard.noCatalogue",
                                              "Publishes no downloadable builds",
                                          )
                                        : t("mcserver.wizard.liveCatalogue", "live catalogue")
                                }}</span>
                                <VIcon
                                    v-if="flavour === card.id"
                                    :icon="mdiCheckCircle"
                                    size="18"
                                />
                            </div>
                            <div class="wl-mcserver-wizard__flavour-desc">
                                {{ card.description }}
                            </div>
                        </VCard>
                    </div>
                </div>

                <!-- Step 2: version -->
                <div v-else-if="step === 'version'" class="wl-mcserver-wizard__step">
                    <VAlert
                        v-if="!store.hasCatalogue"
                        type="info"
                        variant="tonal"
                        density="compact"
                    >
                        {{
                            t(
                                "mcserver.wizard.noCatalogueHost",
                                "This build cannot reach the server-version catalogue, so the version has to be entered below.",
                            )
                        }}
                    </VAlert>
                    <VAlert
                        v-else-if="catalogueFailure"
                        type="warning"
                        variant="tonal"
                        density="compact"
                    >
                        {{ catalogueFailure }}
                        <template #append>
                            <VBtn
                                size="small"
                                variant="text"
                                :prepend-icon="mdiRefresh"
                                @click="refreshCatalogue"
                            >
                                {{ t("common.retry", "Retry") }}
                            </VBtn>
                        </template>
                    </VAlert>
                    <template v-else>
                        <VAlert
                            v-if="catalogue?.stale"
                            type="warning"
                            variant="tonal"
                            density="compact"
                        >
                            {{
                                t(
                                    "mcserver.wizard.catalogueStale",
                                    "This version list was fetched a while ago and may be missing newer releases.",
                                )
                            }}
                            <template #append>
                                <VBtn
                                    size="small"
                                    variant="text"
                                    :prepend-icon="mdiRefresh"
                                    :loading="catalogueLoading"
                                    @click="refreshCatalogue"
                                >
                                    {{ t("mcserver.wizard.refresh", "Refresh") }}
                                </VBtn>
                            </template>
                        </VAlert>
                        <VAlert
                            v-if="selectedFlavourCatalogue?.stale"
                            type="warning"
                            variant="tonal"
                            density="compact"
                        >
                            {{
                                t(
                                    "mcserver.wizard.flavourCatalogueStale",
                                    {
                                        flavour,
                                        at: selectedFlavourCatalogue.lastFetchedAt ?? "unknown",
                                        reason:
                                            selectedFlavourCatalogue.failure ?? "unknown reason",
                                    },
                                    "The {flavour} list is from {at} and could not be refreshed: {reason}",
                                )
                            }}
                            <template #append>
                                <span class="text-caption">{{
                                    selectedFlavourCatalogue.failure
                                }}</span>
                            </template>
                        </VAlert>
                        <ConfigSearchField
                            v-model="versionQuery"
                            v-model:regex="versionUseRegex"
                            v-model:flags="versionFlags"
                            :label="t('mcserver.wizard.searchVersions', 'Search versions')"
                            :sample="versionSample"
                        />
                        <!--
                          While the catalogue is being fetched, every other branch on this
                          step is false: `catalogue` is null so the status line is hidden,
                          there is no failure yet, the version list is empty, and the empty
                          caption below is suppressed by `!catalogueLoading`. The result was
                          a completely blank pane on first launch - and because the fetch
                          walks roughly a thousand versions, it stayed blank long enough that
                          people reported the dialog as broken. Say what is happening.
                        -->
                        <div
                            v-if="catalogueLoading && flavourVersions.length === 0"
                            class="wl-mcserver-wizard__versions-loading"
                            data-test="version-catalogue-loading"
                            role="status"
                            aria-live="polite"
                        >
                            <VProgressCircular indeterminate size="20" width="2" />
                            <span class="text-caption">{{
                                t(
                                    "mcserver.wizard.catalogueLoading",
                                    "Fetching the Minecraft version list. The first time takes longest, and it is kept for next time.",
                                )
                            }}</span>
                        </div>
                        <div
                            v-if="versionQueryError !== null"
                            class="text-caption text-error"
                            data-test="version-search-error"
                            role="status"
                            aria-live="polite"
                        >
                            {{
                                t(
                                    "mcserver.wizard.versionSearchInvalid",
                                    { reason: versionQueryError },
                                    "That search pattern is not valid, so nothing can match it: {reason}",
                                )
                            }}
                        </div>
                        <div
                            v-else-if="flavourVersions.length === 0 && !catalogueLoading"
                            class="text-caption text-medium-emphasis"
                        >
                            {{
                                t(
                                    "mcserver.wizard.noVersionsForFlavour",
                                    "No versions could be fetched for this flavour, so there is nothing to choose from. Enter the version below instead.",
                                )
                            }}
                        </div>
                        <p
                            v-if="catalogue"
                            class="text-caption text-medium-emphasis"
                            data-test="version-catalogue-status"
                        >
                            {{
                                t(
                                    "mcserver.wizard.catalogueStatus",
                                    {
                                        fetchedAt: catalogue.fetchedAt,
                                        completeness:
                                            selectedCatalogueFailures.length === 0
                                                ? t("mcserver.wizard.catalogueComplete", "complete")
                                                : t(
                                                      "mcserver.wizard.catalogueIncomplete",
                                                      "incomplete",
                                                  ),
                                    },
                                    "Catalogue refreshed {fetchedAt}; {completeness} for this flavour.",
                                )
                            }}
                        </p>
                        <div
                            :id="`mcserver-version-families-${group.stability}`"
                            v-for="group in renderedVersionGroups"
                            :key="group.stability"
                            class="wl-mcserver-wizard__version-group"
                        >
                            <div class="text-caption text-medium-emphasis text-uppercase">
                                {{
                                    group.stability === "release"
                                        ? t("mcserver.wizard.releases", "Releases")
                                        : group.stability === "snapshot"
                                          ? t("mcserver.wizard.snapshots", "Snapshots")
                                          : group.stability === "old_beta"
                                            ? t("mcserver.wizard.historicalBeta", "Historical beta")
                                            : t(
                                                  "mcserver.wizard.historicalAlpha",
                                                  "Historical alpha",
                                              )
                                }}
                            </div>
                            <section
                                v-for="family in group.families"
                                :key="family.family"
                                class="wl-mcserver-wizard__family"
                                data-test="version-family"
                            >
                                <VBtn
                                    variant="text"
                                    block
                                    class="wl-mcserver-wizard__family-row"
                                    :aria-expanded="
                                        familyIsExpanded(group.stability, family.family)
                                    "
                                    :aria-controls="`mcserver-version-family-${family.key.replace(/[^a-z0-9]+/gi, '-')}`"
                                    :aria-label="
                                        t(
                                            'mcserver.wizard.toggleFamily',
                                            { family: family.family, n: family.count },
                                            '{family}, {n} exact versions',
                                        )
                                    "
                                    @click="toggleFamily(group.stability, family.family)"
                                >
                                    <span>{{ family.family }}</span>
                                    <VChip size="small" variant="tonal">{{ family.count }}</VChip>
                                    <VChip
                                        v-if="family.recommended"
                                        size="small"
                                        color="primary"
                                        variant="tonal"
                                    >
                                        {{ t("mcserver.wizard.recommended", "Recommended") }}
                                    </VChip>
                                    <span class="text-caption text-medium-emphasis ml-auto">
                                        {{ family.latestVersion }}
                                    </span>
                                </VBtn>
                                <div
                                    v-if="familyIsExpanded(group.stability, family.family)"
                                    :id="`mcserver-version-family-${family.key.replace(/[^a-z0-9]+/gi, '-')}`"
                                    class="wl-mcserver-wizard__family-versions"
                                >
                                    <div
                                        v-for="entry in family.versions"
                                        :key="entry.version"
                                        class="wl-mcserver-wizard__version-row-wrap"
                                        data-test="version-entry"
                                    >
                                        <div class="wl-mcserver-wizard__version-details">
                                            <VBtn
                                                variant="text"
                                                class="wl-mcserver-wizard__version-row"
                                                :disabled="
                                                    entry.availability === 'missing-server-artifact'
                                                "
                                                :title="entry.availabilityReason ?? undefined"
                                                :class="{
                                                    'wl-mcserver-wizard__version-row--selected':
                                                        minecraftVersion === entry.version,
                                                }"
                                                :aria-label="entry.version"
                                                :aria-describedby="
                                                    versionDetailsId(entry.version, 'metadata') +
                                                    (entry.availability ===
                                                    'missing-server-artifact'
                                                        ? ' ' +
                                                          versionDetailsId(
                                                              entry.version,
                                                              'availability',
                                                          )
                                                        : '')
                                                "
                                                @click="selectVersion(entry.version)"
                                            >
                                                <span>{{ entry.version }}</span>
                                                <span
                                                    :id="
                                                        versionDetailsId(entry.version, 'metadata')
                                                    "
                                                    class="text-caption text-medium-emphasis"
                                                >
                                                    {{
                                                        t(
                                                            "mcserver.wizard.needsJava",
                                                            { n: entry.javaFeature },
                                                            "Needs Java {n}",
                                                        )
                                                    }}
                                                    <template
                                                        v-if="releaseDateLabel(entry.releasedAt)"
                                                    >
                                                        &#183;
                                                        {{ releaseDateLabel(entry.releasedAt) }}
                                                    </template>
                                                </span>
                                            </VBtn>
                                            <p
                                                v-if="
                                                    entry.availability === 'missing-server-artifact'
                                                "
                                                :id="
                                                    versionDetailsId(entry.version, 'availability')
                                                "
                                                class="wl-mcserver-wizard__version-reason text-caption text-error"
                                            >
                                                {{
                                                    entry.availabilityReason ??
                                                    t(
                                                        "mcserver.wizard.missingServerArtifact",
                                                        "Server download unavailable",
                                                    )
                                                }}
                                            </p>
                                        </div>
                                        <a
                                            v-if="wikiUrlFor(entry.version)"
                                            :href="wikiUrlFor(entry.version) ?? undefined"
                                            target="_blank"
                                            rel="noreferrer noopener"
                                            class="wl-mcserver-wizard__wiki-action"
                                            :aria-label="`${entry.version}: ${wikiArticleStateLabel(wikiStates[entry.version] ?? entry.wikiState ?? wikiArticleStateFor(entry.version))}`"
                                        >
                                            <VIcon :icon="mdiOpenInNew" size="x-small" />
                                            <span>{{ t("mcserver.wizard.wiki", "Wiki") }}</span>
                                            <span class="text-caption">{{
                                                wikiArticleStateLabel(
                                                    wikiStates[entry.version] ??
                                                        entry.wikiState ??
                                                        wikiArticleStateFor(entry.version),
                                                )
                                            }}</span>
                                        </a>
                                        <span v-else class="text-caption text-medium-emphasis">
                                            {{ wikiArticleStateLabel("unavailable") }}
                                        </span>
                                    </div>
                                </div>
                            </section>
                        </div>
                        <div
                            v-if="filteredVersions.length > MAX_RENDERED_VERSION_ROWS"
                            class="wl-mcserver-wizard__version-pages"
                        >
                            <span class="text-caption text-medium-emphasis">
                                {{
                                    t(
                                        "mcserver.wizard.versionRenderLimit",
                                        {
                                            shown: Math.min(
                                                MAX_RENDERED_VERSION_ROWS,
                                                filteredVersions.length -
                                                    versionPage * MAX_RENDERED_VERSION_ROWS,
                                            ),
                                            total: filteredVersions.length,
                                        },
                                        "Showing {shown} of {total} matching versions.",
                                    )
                                }}
                            </span>
                            <VBtn
                                size="small"
                                variant="text"
                                :disabled="versionPage === 0"
                                aria-controls="mcserver-version-families-release mcserver-version-families-snapshot mcserver-version-families-old_beta mcserver-version-families-old_alpha"
                                @click="versionPage -= 1"
                            >
                                {{ t("common.previous", "Previous") }}
                            </VBtn>
                            <span class="text-caption" aria-live="polite">
                                {{ versionPage + 1 }} / {{ versionPageCount }}
                            </span>
                            <VBtn
                                size="small"
                                variant="text"
                                :disabled="versionPage + 1 >= versionPageCount"
                                aria-controls="mcserver-version-families-release mcserver-version-families-snapshot mcserver-version-families-old_beta mcserver-version-families-old_alpha"
                                @click="versionPage += 1"
                            >
                                {{ t("common.next", "Next") }}
                            </VBtn>
                        </div>
                    </template>
                    <SearchableOptionPicker
                        v-if="!versionEnteredByHand"
                        v-model="minecraftVersion"
                        @update:model-value="selectVersion"
                        :options="
                            versionOptions.map((option) => ({
                                title: option.title,
                                value: option.value,
                                subtitle: option.subtitle,
                            }))
                        "
                        :label="t('mcserver.wizard.version', 'Minecraft version')"
                        :sample="versionSample"
                        :no-match-text="
                            t(
                                'mcserver.wizard.noVersions',
                                'No versions were fetched for this flavour.',
                            )
                        "
                    />
                    <VTextField
                        v-if="versionEnteredByHand"
                        v-model="minecraftVersion"
                        :label="t('mcserver.wizard.versionByHand', 'Version not in the list')"
                        :hint="
                            t(
                                'mcserver.wizard.versionByHandHint',
                                'Only needed for a version published after this catalogue was fetched.',
                            )
                        "
                        persistent-hint
                    />
                    <!--
                        The address is built from the version name rather than looked up, so the
                        wording promises a page for this version and not that one exists yet - a
                        version published minutes ago may not have an article.
                    -->
                    <a
                        v-if="selectedWikiUrl"
                        class="text-caption d-inline-flex align-center ga-1"
                        :href="selectedWikiUrl"
                        target="_blank"
                        rel="noreferrer noopener"
                    >
                        <VIcon :icon="mdiOpenInNew" size="x-small" />
                        {{
                            t(
                                "mcserver.wizard.wikiLink",
                                { v: minecraftVersion },
                                "Read about {v} on the Minecraft Wiki",
                            )
                        }}
                        <span class="text-caption ml-1">{{
                            wikiArticleStateLabel(selectedWikiState)
                        }}</span>
                    </a>
                    <div
                        v-else-if="minecraftVersion.trim() !== ''"
                        class="text-caption text-medium-emphasis"
                    >
                        {{ wikiArticleStateLabel("unavailable") }}
                    </div>
                    <VSwitch
                        v-if="flavourVersions.length > 0"
                        v-model="typeVersionByHand"
                        density="compact"
                        :label="
                            t(
                                'mcserver.wizard.versionByHandToggle',
                                'Enter a version that is not listed',
                            )
                        "
                    />
                </div>

                <!-- Step 3: mod-loader profile (modded flavours only) -->
                <div v-else-if="step === 'mod-loader'" class="wl-mcserver-wizard__step">
                    <SearchableOptionPicker
                        v-if="
                            flavour === 'fabric' ||
                            (flavour === 'neoforge' && Number(minecraftVersion.split('.')[0]) >= 26)
                        "
                        v-model="fabricGameVersion"
                        :options="fabricGameOptions"
                        :label="
                            t('mcserver.wizard.loaderGame', 'Minecraft version for this loader')
                        "
                        :sample="
                            fabricGameOptions
                                .map((option) => option.title)
                                .join(String.fromCharCode(10))
                        "
                        :no-match-text="
                            t(
                                'mcserver.wizard.noFabricGames',
                                'No Minecraft versions are available. Refresh the catalogue.',
                            )
                        "
                    />
                    <VAlert type="info" variant="tonal" density="compact">
                        {{
                            t(
                                "mcserver.wizard.modLoaderIntro",
                                "Modded servers usually need more memory and a dedicated mods folder.",
                            )
                        }}
                        {{
                            t(
                                "mcserver.wizard.modLoaderMemoryHint",
                                { n: modLoaderMemoryRecommendation },
                                "We recommend at least {n} MB for this loader.",
                            )
                        }}
                    </VAlert>
                    <SearchableOptionPicker
                        v-if="modLoaderVersions.length > 0"
                        v-model="modLoaderVersion"
                        :options="modLoaderVersions.map((value) => ({ title: value, value }))"
                        :label="t('mcserver.wizard.loaderVersion', 'Mod-loader version')"
                        :hint="
                            t(
                                'mcserver.wizard.loaderVersionHint',
                                'Choose a published loader build.',
                            )
                        "
                        persistent-hint
                        :sample="modLoaderVersions.join('\n')"
                        :no-match-text="
                            t('mcserver.wizard.noLoaderVersions', 'No matching loader versions.')
                        "
                    />
                    <VTextField
                        v-else
                        v-model="modLoaderVersion"
                        :label="t('mcserver.wizard.loaderVersion', 'Mod-loader version')"
                        :hint="
                            t(
                                'mcserver.wizard.loaderVersionUnavailable',
                                'Enter the loader version published for this Minecraft version.',
                            )
                        "
                        persistent-hint
                    />
                    <VTextField
                        v-model="modsDirectory"
                        :label="t('mcserver.wizard.modsDirectory', 'Mods directory')"
                        :error-messages="validateModsDirectory(modsDirectory) ?? null"
                        :hint="
                            t(
                                'mcserver.wizard.modsDirectoryHint',
                                'The folder inside the server directory where mods are installed.',
                            )
                        "
                        persistent-hint
                    />
                    <VSwitch
                        v-for="library in commonApiLibraries"
                        :key="library"
                        :model-value="preinstallApiLibraries.includes(library)"
                        :label="
                            t('mcserver.wizard.preinstallApi', { library }, 'Pre-install {library}')
                        "
                        @update:model-value="
                            (enabled) => setApiLibraryEnabled(library, enabled === true)
                        "
                    />
                </div>

                <!-- Step 4: where it runs -->
                <div v-else-if="step === 'runtime'" class="wl-mcserver-wizard__step">
                    <p class="wl-mcserver-wizard__intro">
                        {{
                            t(
                                "mcserver.wizard.runtimeIntro",
                                "Where this server runs. The choices are capability-driven: a build whose shell does not expose a bridge keeps that option out entirely rather than offering a button that can never do anything.",
                            )
                        }}
                    </p>
                    <VRadioGroup
                        v-model="whereItRuns"
                        :aria-label="t('mcserver.wizard.whereItRuns', 'Where it runs')"
                        hide-details
                        class="wl-mcserver-wizard__runtime-group"
                    >
                        <VCard
                            v-for="option in runtimeOptionsForWizard"
                            :key="option.id"
                            :variant="whereItRuns === option.id ? 'flat' : 'outlined'"
                            :color="whereItRuns === option.id ? 'primary-container' : undefined"
                            class="wl-mcserver-wizard__runtime-option"
                            rounded="lg"
                            :class="{
                                'wl-mcserver-wizard__runtime-option--disabled':
                                    option.id === 'local-docker' && !store.canCreateLocalDocker,
                            }"
                        >
                            <VRadio
                                :value="option.id"
                                :label="option.name"
                                :disabled="
                                    option.id === 'local-docker' && !store.canCreateLocalDocker
                                "
                            />
                            <div class="wl-mcserver-wizard__runtime-desc">
                                {{ option.description }}
                            </div>
                            <div
                                v-if="option.id === 'local-docker' && !store.canCreateLocalDocker"
                                class="wl-mcserver-wizard__runtime-desc wl-mcserver-wizard__runtime-desc--blocked"
                            >
                                {{
                                    t(
                                        "mcserver.wizard.dockerCreateUnavailable",
                                        "This build can inspect Docker but cannot create a Docker server yet. Choose Local process until the typed Docker create capability is available.",
                                    )
                                }}
                            </div>
                        </VCard>
                    </VRadioGroup>

                    <template v-if="whereItRuns === 'local-process'">
                        <PathField
                            v-model="serverDir"
                            field="server folder"
                            :label="t('mcserver.wizard.folder', 'Server folder')"
                            semantic="folder"
                            :error="folderError"
                        />
                    </template>

                    <template v-else-if="whereItRuns === 'local-docker'">
                        <VAlert
                            :type="dockerAvailability.available ? 'success' : 'warning'"
                            variant="tonal"
                            density="compact"
                        >
                            <span v-if="dockerAvailability.checking">{{
                                t(
                                    "mcserver.wizard.checkingDocker",
                                    "Checking whether Docker is available…",
                                )
                            }}</span>
                            <span v-else-if="dockerAvailability.available"
                                >{{ t("mcserver.wizard.dockerReady", "Docker is available.") }}
                                {{ dockerAvailability.message }}</span
                            >
                            <span v-else>{{
                                dockerAvailability.message ||
                                t("mcserver.wizard.dockerUnavailable", "Docker is not available.")
                            }}</span>
                            <template #append>
                                <VBtn
                                    v-if="!dockerAvailability.available"
                                    size="small"
                                    variant="tonal"
                                    :loading="dockerStarting"
                                    @click="startDocker"
                                >
                                    {{ t("mcserver.wizard.startDocker", "Start Docker") }}
                                </VBtn>
                            </template>
                        </VAlert>
                        <VTextField
                            v-model="dockerContainerRef"
                            label="Docker container name"
                            hint="Use lower-case letters, numbers, and hyphens."
                            :error-messages="dockerContainerError ?? null"
                            persistent-hint
                            data-test="docker-container-ref"
                        />
                        <p>
                            {{
                                t(
                                    "mcserver.wizard.containerFolder",
                                    "A new folder beneath the application server directory is mounted at /data. Existing folders are never reused.",
                                )
                            }}
                        </p>
                        <SearchableOptionPicker
                            v-if="!advancedDockerImage"
                            v-model="dockerImage"
                            @update:model-value="dockerImageEdited = true"
                            :options="dockerImageOptions"
                            :label="t('mcserver.wizard.containerImage', 'Minecraft server image')"
                            :sample="
                                dockerImageOptions
                                    .map((option) => option.title)
                                    .join(String.fromCharCode(10))
                            "
                            :no-match-text="
                                t('mcserver.wizard.noContainerImage', 'No matching runtime image.')
                            "
                        />
                        <VSwitch
                            v-model="advancedDockerImage"
                            :label="
                                t('mcserver.wizard.advancedImage', 'Enter a published image digest')
                            "
                        />
                        <p>
                            {{
                                t(
                                    "mcserver.wizard.imageDownload",
                                    "Create downloads the selected itzg Minecraft server image and verifies its registry digest before creating the container. Choose the Java version required by the selected server.",
                                )
                            }}
                        </p>
                        <VTextField
                            v-if="advancedDockerImage"
                            v-model="dockerImage"
                            @update:model-value="dockerImageEdited = true"
                            data-test="docker-image"
                            :label="
                                t(
                                    'mcserver.wizard.dockerImage',
                                    'Digest-pinned Minecraft server image',
                                )
                            "
                            :hint="
                                t(
                                    'mcserver.wizard.dockerImageHint',
                                    'Use a Minecraft server image compatible with TYPE, VERSION and /data, such as itzg/minecraft-server, followed by its published SHA-256 digest. A new folder is created beneath the application server directory.',
                                )
                            "
                            :error-messages="dockerImageError ?? []"
                            persistent-hint
                        />
                    </template>

                    <template
                        v-else-if="whereItRuns === 'ssh-docker' || whereItRuns === 'ssh-process'"
                    >
                        <ConfigSearchField
                            v-if="hostProfiles.length > 0"
                            v-model="hostProfileQuery"
                            v-model:regex="hostProfileRegex"
                            v-model:flags="hostProfileFlags"
                            :label="
                                t('mcserver.wizard.hostProfileSearch', 'Search SSH host profiles')
                            "
                            :sample="
                                hostProfiles
                                    .map(
                                        (profile) =>
                                            `${profile.hostId} ${profile.target.label} ${profile.target.host}`,
                                    )
                                    .join(String.fromCharCode(10))
                            "
                        />
                        <VSelect
                            v-model="sshHost"
                            :items="
                                filteredHostProfiles.map((profile) => ({
                                    title: `${profile.target.label} · ${profile.target.user}@${profile.target.host}`,
                                    value: profile.hostId,
                                }))
                            "
                            item-title="title"
                            item-value="value"
                            :label="t('mcserver.wizard.sshHost', 'SSH host profile')"
                            :loading="hostProfileLoading"
                            :hint="
                                t(
                                    whereItRuns === 'ssh-process'
                                        ? 'mcserver.sshReadiness.explanation'
                                        : 'mcserver.wizard.sshCreateHostHint',
                                    whereItRuns === 'ssh-process'
                                        ? 'Choose a saved host profile. Readiness checks inspect that host without creating a server.'
                                        : 'Choose a saved profile with a digest-pinned Minecraft server image and an absolute server parent folder. Create makes a new container and a unique data folder on that host.',
                                )
                            "
                            persistent-hint
                        >
                            <template #prepend-item>
                                <div class="pa-2" @click.stop>
                                    <ConfigSearchField
                                        v-model="hostProfileQuery"
                                        v-model:regex="hostProfileRegex"
                                        v-model:flags="hostProfileFlags"
                                        :label="
                                            t(
                                                'mcserver.wizard.hostProfileDropdownSearch',
                                                'Search this host list',
                                            )
                                        "
                                        :sample="
                                            hostProfiles
                                                .map(
                                                    (profile) =>
                                                        `${profile.hostId} ${profile.target.label} ${profile.target.host}`,
                                                )
                                                .join(String.fromCharCode(10))
                                        "
                                    />
                                </div>
                            </template>
                        </VSelect>
                        <VAlert
                            v-if="selectedHostProfile && whereItRuns === 'ssh-docker'"
                            type="info"
                            variant="tonal"
                            data-test="ssh-create-plan"
                        >
                            {{ selectedHostProfile.target.image }} ·
                            {{ selectedHostProfile.target.workDir }}
                            <p v-if="dockerImageError">{{ dockerImageError }}</p>
                        </VAlert>
                        <SshProcessReadinessPanel
                            v-if="whereItRuns === 'ssh-process'"
                            :host-id="sshHost"
                            :minecraft-version="minecraftVersion.split('#', 1)[0] ?? ''"
                        />
                        <VAlert v-if="hostProfileFailure" type="warning" variant="tonal">{{
                            hostProfileFailure
                        }}</VAlert>
                        <VAlert
                            v-else-if="!hostProfileLoading && hostProfiles.length === 0"
                            type="info"
                            variant="tonal"
                        >
                            {{
                                t(
                                    "mcserver.wizard.noHostProfiles",
                                    "No SSH host profiles are saved yet. Close this wizard and add one from the server list first.",
                                )
                            }}
                        </VAlert>
                    </template>
                    <VAlert v-else type="info" variant="tonal">
                        {{
                            t(
                                "mcserver.wizard.awsRoute",
                                "AWS hosting is available. Finish this wizard to open the AWS EC2 provisioning panel, which shows the plan and asks for confirmation before creating anything.",
                            )
                        }}
                    </VAlert>
                </div>

                <!-- Step 4: Java -->
                <div v-else-if="step === 'java'" class="wl-mcserver-wizard__step">
                    <VAlert
                        v-if="javaNotRequired"
                        type="info"
                        variant="tonal"
                        density="compact"
                        data-test="java-remote-skip"
                    >
                        {{
                            t(
                                "mcserver.wizard.remoteJava",
                                "This remote-container flow uses Java on the existing server host. The local Java check is skipped.",
                            )
                        }}
                    </VAlert>
                    <div class="text-body-2">
                        {{
                            t(
                                "mcserver.wizard.javaIntro",
                                { n: requiredJavaFeature },
                                "This version needs Java {n}.",
                            )
                        }}
                    </div>
                    <VAlert
                        v-if="!javaNotRequired && !store.hasJava"
                        type="info"
                        variant="tonal"
                        density="compact"
                    >
                        {{
                            t(
                                "mcserver.wizard.noJavaHost",
                                "This build cannot check for Java. It will be checked again when the server starts.",
                            )
                        }}
                    </VAlert>
                    <template v-else-if="!javaNotRequired && store.hasJava">
                        <VAlert
                            v-if="javaChecking"
                            type="info"
                            variant="tonal"
                            density="compact"
                            data-test="java-checking"
                        >
                            {{ t("mcserver.wizard.checkingJava", "Looking for a suitable Java…") }}
                        </VAlert>
                        <VAlert
                            v-if="javaFailure"
                            type="error"
                            variant="tonal"
                            density="compact"
                            data-test="java-failure"
                        >
                            {{ javaFailure }}
                            <template #append>
                                <VBtn
                                    size="small"
                                    variant="tonal"
                                    :disabled="javaChecking || javaProvisioning"
                                    :loading="javaChecking"
                                    :prepend-icon="mdiRefresh"
                                    data-test="retry-java"
                                    @click="checkJava"
                                >
                                    {{ t("common.retry", "Retry") }}
                                </VBtn>
                            </template>
                        </VAlert>
                        <VAlert
                            v-else-if="javaResolution?.found"
                            type="success"
                            variant="tonal"
                            density="compact"
                            data-test="java-found"
                        >
                            {{
                                t(
                                    "mcserver.wizard.javaFound",
                                    { v: javaResolution.version, source: javaResolution.source },
                                    "Found Java {v} ({source}).",
                                )
                            }}
                        </VAlert>
                        <VAlert
                            v-else-if="javaResolution"
                            type="warning"
                            variant="tonal"
                            density="compact"
                            data-test="java-missing"
                        >
                            {{ javaResolution.message }}
                            <template #append>
                                <VBtn
                                    v-if="canAutoProvisionJava"
                                    size="small"
                                    variant="tonal"
                                    color="primary"
                                    :prepend-icon="mdiCloudDownloadOutline"
                                    :loading="javaProvisioning"
                                    data-test="install-java"
                                    @click="provisionJava"
                                >
                                    {{
                                        t(
                                            "mcserver.wizard.installJava",
                                            { n: requiredJavaFeature },
                                            "Install Java {n}",
                                        )
                                    }}
                                </VBtn>
                            </template>
                        </VAlert>
                        <div
                            v-if="javaProvisioning"
                            class="wl-mcserver-wizard__progress"
                            data-test="java-progress"
                        >
                            <VProgressLinear
                                :model-value="
                                    javaProgress && javaProgress.totalBytes
                                        ? (javaProgress.receivedBytes / javaProgress.totalBytes) *
                                          100
                                        : 0
                                "
                                :indeterminate="!javaProgress?.totalBytes"
                                color="primary"
                                height="8"
                                rounded
                            />
                            <div class="text-caption">
                                {{
                                    javaProgress?.message ??
                                    t("mcserver.wizard.installingJava", "Installing Java…")
                                }}
                            </div>
                        </div>
                    </template>
                </div>

                <!-- Step 5: resources -->
                <div v-else-if="step === 'resources'" class="wl-mcserver-wizard__step">
                    <VCard rounded="lg" variant="outlined" class="wl-mcserver-wizard__setting">
                        <div class="wl-mcserver-wizard__setting-head">
                            <VLabel
                                class="wl-mcserver-wizard__setting-name"
                                for="wl-mcserver-memory"
                            >
                                {{ t("mcserver.wizard.memory", "Memory (MB)") }}
                            </VLabel>
                            <span class="wl-mcserver-wizard__setting-value">{{ memoryMb }} MB</span>
                            <span class="wl-mcserver-wizard__setting-note">{{
                                t(
                                    "mcserver.wizard.memoryNote",
                                    "bounded to what a Minecraft server can actually use",
                                )
                            }}</span>
                        </div>
                        <VSlider
                            id="wl-mcserver-memory"
                            v-model="memoryMb"
                            :min="512"
                            :max="memorySliderCap"
                            :step="256"
                            color="primary"
                            thumb-label
                            hide-details
                            :aria-label="t('mcserver.wizard.memory', 'Memory (MB)')"
                        />
                        <div class="wl-mcserver-wizard__setting-bounds">
                            <span>512</span>
                            <span>{{ memorySliderCap }}</span>
                        </div>
                        <div v-if="memoryError" class="text-caption text-error">
                            {{ memoryError }}
                        </div>
                    </VCard>
                    <VCard
                        rounded="lg"
                        variant="outlined"
                        class="wl-mcserver-wizard__setting wl-mcserver-wizard__setting--row"
                    >
                        <div class="wl-mcserver-wizard__setting-doc">
                            <div class="wl-mcserver-wizard__setting-name">
                                {{ t("mcserver.wizard.port", "Server port") }}
                            </div>
                            <div class="wl-mcserver-wizard__setting-note">
                                {{ t("mcserver.wizard.portHint", "Ports run from 1 to 65535.") }}
                            </div>
                        </div>
                        <VNumberInput
                            v-model="port"
                            :min="1"
                            :max="65535"
                            :step="1"
                            control-variant="split"
                            variant="outlined"
                            density="comfortable"
                            class="wl-mcserver-wizard__port"
                            :label="t('mcserver.wizard.port', 'Server port')"
                            :error-messages="portError ? [portError] : []"
                            :hide-details="!portError"
                        />
                    </VCard>
                    <PathField
                        v-if="whereItRuns !== 'local-process'"
                        v-model="serverDir"
                        field="server folder"
                        :label="t('mcserver.wizard.folder', 'Server folder')"
                        semantic="folder"
                        :error="folderError"
                    />
                </div>

                <!-- Step 6: world -->
                <div v-else-if="step === 'world'" class="wl-mcserver-wizard__step">
                    <VRadioGroup
                        v-model="worldMode"
                        :label="t('mcserver.wizard.worldMode', 'World')"
                        inline
                    >
                        <VRadio
                            value="new"
                            :label="t('mcserver.wizard.worldNew', 'Generate a new world')"
                        />
                        <VRadio
                            value="import"
                            :label="t('mcserver.wizard.worldImport', 'Import an existing world')"
                        />
                    </VRadioGroup>
                    <template v-if="worldMode === 'new'">
                        <VTextField
                            v-model="seed"
                            :label="t('mcserver.wizard.seed', 'Seed (optional)')"
                            :placeholder="
                                t(
                                    'mcserver.wizard.seedPlaceholder',
                                    'Leave blank for a random world',
                                )
                            "
                        />
                        <SearchableOptionPicker
                            v-model="levelType"
                            :options="LEVEL_TYPES"
                            :label="t('mcserver.wizard.levelType', 'World type')"
                            :sample="LEVEL_TYPES.map((option) => option.title).join('\n')"
                            :no-match-text="
                                t('mcserver.wizard.noWorldTypes', 'No matching world types.')
                            "
                        />
                        <VSwitch
                            v-model="generateStructures"
                            :label="t('mcserver.wizard.generateStructures', 'Generate structures')"
                            color="primary"
                        />
                    </template>
                    <template v-else>
                        <PathField
                            v-model="importedWorldDir"
                            field="world folder"
                            :label="t('mcserver.wizard.worldFolder', 'World folder to import')"
                            semantic="folder"
                        />
                    </template>
                </div>

                <!-- Step 7: review + EULA -->
                <div v-else class="wl-mcserver-wizard__step">
                    <VTextField
                        v-model="serverId"
                        @update:model-value="serverIdEdited = true"
                        :label="t('mcserver.wizard.id', 'Server id')"
                        :error-messages="idError ? [idError] : []"
                        hint="lowercase, letters, digits, hyphens"
                        persistent-hint
                    />
                    <VTextField
                        v-model="serverName"
                        @update:model-value="serverNameEdited = true"
                        :label="t('mcserver.wizard.name', 'Display name')"
                        :error-messages="nameError ? [nameError] : []"
                    />
                    <dl class="wl-mcserver-wizard__summary">
                        <dt>{{ t("mcserver.wizard.flavour", "Flavour") }}</dt>
                        <dd>{{ flavour }}</dd>
                        <dt>{{ t("mcserver.wizard.version", "Version") }}</dt>
                        <dd>{{ minecraftVersion || t("common.notSet", "Not set") }}</dd>
                        <template v-if="isModLoader">
                            <dt>{{ t("mcserver.wizard.loaderVersion", "Mod-loader version") }}</dt>
                            <dd>{{ modLoaderVersion || t("common.notSet", "Not set") }}</dd>
                            <dt>{{ t("mcserver.wizard.modsDirectory", "Mods directory") }}</dt>
                            <dd>{{ modsDirectory }}</dd>
                        </template>
                        <dt>{{ t("mcserver.wizard.whereItRuns", "Where it runs") }}</dt>
                        <dd>{{ whereItRuns }}</dd>
                        <dt>{{ t("mcserver.wizard.memory", "Memory (MB)") }}</dt>
                        <dd>{{ memoryMb }}</dd>
                        <dt>{{ t("mcserver.wizard.port", "Port") }}</dt>
                        <dd>{{ port }}</dd>
                        <dt>{{ t("mcserver.wizard.worldMode", "World") }}</dt>
                        <dd>
                            {{
                                worldMode === "new"
                                    ? t("mcserver.wizard.worldNew", "New world")
                                    : importedWorldDir
                            }}
                        </dd>
                    </dl>
                    <VCard rounded="lg" variant="flat" class="wl-mcserver-wizard__eula">
                        <div class="wl-mcserver-wizard__eula-title">
                            {{
                                t(
                                    "mcserver.wizard.eulaTitle",
                                    "The EULA is never accepted as a side effect",
                                )
                            }}
                        </div>
                        <p class="wl-mcserver-wizard__eula-body">
                            {{
                                t(
                                    "mcserver.wizard.eulaBody",
                                    "Nothing in this flow writes eula=true on your behalf. It is written only when you agree here, by an explicit action.",
                                )
                            }}
                        </p>
                        <div class="wl-mcserver-wizard__eula-row">
                            <VSwitch
                                v-model="eulaAccepted"
                                color="primary"
                                hide-details
                                :label="
                                    t(
                                        'mcserver.wizard.eulaAgree',
                                        'I have read and accept the Minecraft EULA',
                                    )
                                "
                            />
                            <a
                                href="https://www.minecraft.net/en-us/eula"
                                target="_blank"
                                rel="noopener"
                                class="wl-mcserver-wizard__eula-link"
                            >
                                {{ t("mcserver.wizard.eulaLink", "Read the Minecraft EULA") }}
                                <VIcon :icon="mdiOpenInNew" size="14" />
                            </a>
                        </div>
                    </VCard>
                    <VAlert v-if="createFailure" type="error" variant="tonal" density="compact">{{
                        createFailure
                    }}</VAlert>
                </div>
            </VCardText>
            <VDivider />
            <VCardActions class="wl-mcserver-wizard__actions">
                <VBtn variant="text" color="primary" @click="open = false">{{
                    t("common.cancel", "Cancel")
                }}</VBtn>
                <VSpacer />
                <span v-if="advanceBlockedReason" class="wl-mcserver-wizard__blocked">
                    {{ advanceBlockedReason }}
                </span>
                <VBtn
                    v-if="step !== 'flavour'"
                    variant="outlined"
                    color="on-surface"
                    @click="back"
                    >{{ t("common.back", "Back") }}</VBtn
                >
                <VBtn
                    v-if="step !== 'review'"
                    color="primary"
                    variant="flat"
                    :disabled="!canAdvance"
                    :title="advanceBlockedReason ?? undefined"
                    @click="next"
                >
                    {{ t("common.next", "Next") }}
                </VBtn>
                <VBtn
                    v-else
                    color="primary"
                    variant="flat"
                    :disabled="!canCreate"
                    :loading="creating"
                    :title="
                        !eulaAccepted
                            ? t('mcserver.wizard.eulaRequired', 'Accept the EULA to continue.')
                            : undefined
                    "
                    @click="create"
                >
                    {{ t("mcserver.wizard.create", "Create") }}
                </VBtn>
            </VCardActions>
        </VCard>
    </VDialog>
</template>

<style scoped>
/* `Worldlens.dc.html`'s new-server wizard: title with step count, a numbered stepper, cards. */
/*
 * The dialog is teleported to the overlay container, outside the destination layer that
 * gives every other button its Material 3 shape, so the wizard states it for its own.
 */
.wl-mcserver-wizard :deep(.v-btn) {
    text-transform: none;
    letter-spacing: 0;
    font-weight: 500;
}
.wl-mcserver-wizard .wl-mcserver-wizard__actions :deep(.v-btn) {
    min-block-size: 44px;
    padding-inline: 22px;
    border-radius: var(--md-sys-shape-corner-full);
}
.wl-mcserver-wizard .wl-mcserver-wizard__title {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 24px 28px 8px;
    font-size: var(--md-sys-typescale-headline-small-size);
    font-weight: 400;
    line-height: 32px;
}
.wl-mcserver-wizard__count {
    font-size: var(--md-sys-typescale-body-small-size);
    color: rgb(var(--v-theme-outline));
}
.wl-mcserver-wizard__stepper {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    padding: 8px 20px 4px;
}
.wl-mcserver-wizard .wl-mcserver-wizard__stepper-item {
    padding-inline: 8px;
    min-block-size: 40px;
    font-weight: 400;
    color: rgb(var(--v-theme-on-surface-variant));
}
.wl-mcserver-wizard .wl-mcserver-wizard__stepper-item.v-btn--disabled {
    opacity: 1;
}
.wl-mcserver-wizard .wl-mcserver-wizard__stepper-item--active {
    color: rgb(var(--v-theme-on-surface));
    font-weight: 500;
}
.wl-mcserver-wizard__stepper-dot {
    inline-size: 28px;
    block-size: 28px;
    margin-inline-end: 8px;
    border-radius: var(--md-sys-shape-corner-full);
    border: 1px solid rgb(var(--v-theme-outline));
    display: inline-grid;
    place-items: center;
    font-size: var(--md-sys-typescale-body-small-size);
}
.wl-mcserver-wizard__stepper-item--active .wl-mcserver-wizard__stepper-dot {
    background: rgb(var(--v-theme-primary));
    border-color: rgb(var(--v-theme-primary));
    color: rgb(var(--v-theme-on-primary));
}
.wl-mcserver-wizard__stepper-item--done .wl-mcserver-wizard__stepper-dot {
    background: rgb(var(--v-theme-secondary-container));
    border-color: rgb(var(--v-theme-secondary-container));
    color: rgb(var(--v-theme-on-secondary-container));
}
.wl-mcserver-wizard .wl-mcserver-wizard__body {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px 28px 24px;
}
.wl-mcserver-wizard .wl-mcserver-wizard__actions {
    padding: 16px 28px;
    gap: 10px;
}
.wl-mcserver-wizard__blocked {
    font-size: var(--md-sys-typescale-body-small-size);
    color: rgb(var(--v-theme-on-surface-variant));
    max-inline-size: 40ch;
}
.wl-mcserver-wizard__versions-loading {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.wl-mcserver-wizard__step {
    display: flex;
    flex-direction: column;
    gap: 12px;
}
.wl-mcserver-wizard__flavours {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
}
@media (max-width: 720px) {
    .wl-mcserver-wizard__flavours {
        grid-template-columns: minmax(0, 1fr);
    }
}
.wl-mcserver-wizard .wl-mcserver-wizard__flavour-card {
    padding: 16px 18px;
    border-radius: var(--md-sys-shape-corner-large);
    cursor: pointer;
    min-block-size: 98px;
}
.wl-mcserver-wizard .wl-mcserver-wizard__flavour-card:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}
.wl-mcserver-wizard__flavour-name {
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
}
.wl-mcserver-wizard__flavour-title {
    font-size: var(--md-sys-typescale-title-medium-size);
    font-weight: 500;
}
.wl-mcserver-wizard__flavour-tagline {
    font-size: var(--md-sys-typescale-body-small-size);
    opacity: 0.8;
}
.wl-mcserver-wizard__flavour-catalogue {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: var(--md-sys-typescale-label-small-size);
    opacity: 0.8;
}
.wl-mcserver-wizard__flavour-desc {
    margin-top: 6px;
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: 20px;
}
.wl-mcserver-wizard__version-group {
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.wl-mcserver-wizard__family {
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.wl-mcserver-wizard .wl-mcserver-wizard__family-row {
    min-height: 48px;
    justify-content: flex-start;
    gap: 8px;
    text-align: left;
    border-radius: var(--md-sys-shape-corner-medium);
}
.wl-mcserver-wizard__family-row :deep(.v-btn__content) {
    gap: 8px;
    inline-size: 100%;
    font-family: "Roboto Mono", ui-monospace, monospace;
}
.wl-mcserver-wizard__family-versions {
    display: flex;
    flex-direction: column;
    border: 1px solid rgb(var(--v-theme-outline-variant));
    border-radius: var(--md-sys-shape-corner-large);
    overflow: hidden;
    container: server-version-family / inline-size;
}
.wl-mcserver-wizard__version-row-wrap {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(120px, 200px);
    align-items: center;
    gap: 8px;
    min-height: 48px;
    padding-inline-end: 12px;
    border-bottom: 1px solid rgb(var(--v-theme-surface-container-high));
}
.wl-mcserver-wizard__version-row-wrap:last-child {
    border-bottom: 0;
}
.wl-mcserver-wizard__version-row-wrap:has(.wl-mcserver-wizard__version-row--selected) {
    background: rgb(var(--v-theme-primary-container));
    color: rgb(var(--v-theme-on-primary-container));
}
.wl-mcserver-wizard__version-pages {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    min-height: 48px;
}
.wl-mcserver-wizard .wl-mcserver-wizard__version-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    min-width: 0;
    min-height: 48px;
    height: auto;
    width: 100%;
    padding: 6px 18px;
    border-radius: 0;
    background: transparent;
    cursor: pointer;
    text-align: left;
    color: inherit;
}
.wl-mcserver-wizard__version-details {
    min-width: 0;
}
.wl-mcserver-wizard__version-reason {
    margin: 0;
    padding: 4px 8px 8px;
    overflow-wrap: anywhere;
}
.wl-mcserver-wizard__version-row :deep(.v-btn__content) {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    width: 100%;
    min-width: 0;
    white-space: normal;
    overflow-wrap: anywhere;
    text-align: start;
}
.wl-mcserver-wizard__wiki-action {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 48px;
    min-width: 48px;
    max-width: 100%;
    padding-inline: 8px;
    color: rgb(var(--v-theme-primary));
    text-decoration: none;
    overflow-wrap: anywhere;
}
@container server-version-family (max-width: 520px) {
    .wl-mcserver-wizard__version-row-wrap {
        grid-template-columns: minmax(0, 1fr);
    }
    .wl-mcserver-wizard__wiki-action {
        justify-self: start;
    }
}
.wl-mcserver-wizard__wiki-action:hover,
.wl-mcserver-wizard__wiki-action:focus-visible {
    text-decoration: underline;
}
.wl-mcserver-wizard__version-row > :deep(.v-btn__content) > span:first-child {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: var(--md-sys-typescale-body-large-size);
}
.wl-mcserver-wizard__version-row-wrap .wl-mcserver-wizard__wiki-action {
    color: inherit;
    font-size: var(--md-sys-typescale-body-small-size);
    gap: 6px;
}
.wl-mcserver-wizard__wiki-action > span:nth-of-type(1) {
    white-space: nowrap;
}
.wl-mcserver-wizard .wl-mcserver-wizard__setting {
    padding: 16px 20px;
    border-radius: var(--md-sys-shape-corner-large);
}
.wl-mcserver-wizard__setting--row {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
}
.wl-mcserver-wizard__setting-doc {
    flex: 1 1 240px;
}
.wl-mcserver-wizard__setting-head {
    display: flex;
    align-items: baseline;
    gap: 12px;
    flex-wrap: wrap;
}
.wl-mcserver-wizard .wl-mcserver-wizard__setting-name {
    font-size: var(--md-sys-typescale-body-large-size);
    font-weight: 500;
    color: rgb(var(--v-theme-on-surface));
    opacity: 1;
}
.wl-mcserver-wizard__setting-value {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: var(--md-sys-typescale-body-large-size);
    color: rgb(var(--v-theme-primary));
}
.wl-mcserver-wizard__setting-note {
    font-size: var(--md-sys-typescale-body-small-size);
    color: rgb(var(--v-theme-on-surface-variant));
}
.wl-mcserver-wizard__setting-bounds {
    display: flex;
    justify-content: space-between;
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: var(--md-sys-typescale-label-small-size);
    color: rgb(var(--v-theme-outline));
}
.wl-mcserver-wizard__port {
    flex: 0 0 240px;
    font-family: "Roboto Mono", ui-monospace, monospace;
}
.wl-mcserver-wizard__intro {
    margin: 0;
    max-inline-size: 68ch;
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: 21px;
}
.wl-mcserver-wizard__runtime-group :deep(.v-input__control) {
    inline-size: 100%;
}
.wl-mcserver-wizard__runtime-group :deep(.v-selection-control-group > *) {
    grid-area: auto;
}
.wl-mcserver-wizard__runtime-group :deep(.v-selection-control-group) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-areas: none;
    gap: 12px;
}
@media (max-width: 720px) {
    .wl-mcserver-wizard__runtime-group :deep(.v-selection-control-group) {
        grid-template-columns: minmax(0, 1fr);
    }
}
.wl-mcserver-wizard .wl-mcserver-wizard__runtime-option {
    padding: 8px 18px 16px 8px;
    border-radius: var(--md-sys-shape-corner-large);
}
.wl-mcserver-wizard__runtime-option :deep(.v-label) {
    font-size: var(--md-sys-typescale-body-large-size);
    font-weight: 500;
    opacity: 1;
}
.wl-mcserver-wizard__runtime-desc {
    margin-inline-start: 50px;
    margin-top: -4px;
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: 20px;
}
.wl-mcserver-wizard__runtime-desc--blocked {
    margin-top: 6px;
    color: rgb(var(--v-theme-error));
}
.wl-mcserver-wizard__progress {
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.wl-mcserver-wizard__summary {
    display: grid;
    grid-template-columns: minmax(140px, 0.4fr) 1fr;
    margin: 0;
    border: 1px solid rgb(var(--v-theme-outline-variant));
    border-radius: var(--md-sys-shape-corner-large);
    overflow: hidden;
    font-size: var(--md-sys-typescale-body-medium-size);
}
.wl-mcserver-wizard__summary dt,
.wl-mcserver-wizard__summary dd {
    margin: 0;
    padding: 11px 18px;
    border-bottom: 1px solid rgb(var(--v-theme-surface-container-high));
}
.wl-mcserver-wizard__summary dt {
    color: rgb(var(--v-theme-on-surface-variant));
}
.wl-mcserver-wizard__summary dd {
    font-family: "Roboto Mono", ui-monospace, monospace;
    overflow-wrap: anywhere;
}
.wl-mcserver-wizard .wl-mcserver-wizard__eula {
    padding: 18px 20px;
    border-radius: var(--md-sys-shape-corner-large);
    background: rgb(var(--v-theme-error-container));
    color: rgb(var(--v-theme-on-error-container));
}
.wl-mcserver-wizard__eula-title {
    font-size: var(--md-sys-typescale-body-large-size);
    font-weight: 500;
}
.wl-mcserver-wizard__eula-body {
    margin: 6px 0 8px;
    max-inline-size: 68ch;
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: 20px;
}
.wl-mcserver-wizard__eula-row {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
}
.wl-mcserver-wizard__eula-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: var(--md-sys-typescale-body-medium-size);
    color: inherit;
}
</style>
