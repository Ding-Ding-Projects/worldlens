<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
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
    VListItem,
    VLabel,
    VProgressLinear,
    VRadio,
    VRadioGroup,
    VSelect,
    VSlider,
    VSpacer,
    VSwitch,
    VTextField,
} from "vuetify/components";
import { mdiCheckCircle, mdiCloudDownloadOutline, mdiOpenInNew, mdiRefresh } from "@mdi/js";
import PathField from "../PathField.vue";
import ConfigSearchField from "../config/ConfigSearchField.vue";
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
} from "./serverStore.js";
import {
    FLAVOUR_CARDS,
    RUNTIME_OPTIONS,
    WIZARD_STEPS,
    filterVersions,
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

/* -------------------------------------------------------------------------- */
/* Step 2: version, from the real catalogue                                   */
/* -------------------------------------------------------------------------- */

const catalogue = ref<CatalogueSnapshot | null>(null);
const catalogueLoading = ref(false);
const catalogueFailure = ref<string | null>(null);
const versionQuery = ref("");
const versionUseRegex = ref(false);
const versionFlags = ref("i");
const minecraftVersion = ref("");
const expandedFamilies = ref<Record<string, boolean>>({});
const MAX_RENDERED_VERSION_ROWS = 500;

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
    return expandedFamilies.value[familyKey(stability, family)] ?? true;
}

function toggleFamily(stability: string, family: string): void {
    const key = familyKey(stability, family);
    expandedFamilies.value = {
        ...expandedFamilies.value,
        [key]: !familyIsExpanded(stability, family),
    };
}

const renderedVersionGroups = computed(() => {
    let remaining = MAX_RENDERED_VERSION_ROWS;
    return versionGroups.value.map((group) => ({
        ...group,
        families: group.families.map((family) => {
            const versions = family.versions.slice(0, Math.max(0, remaining));
            remaining -= versions.length;
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
const selectedWikiState = computed(() => wikiArticleStateFor(minecraftVersion.value));

const versionOptions = computed(() =>
    filteredVersions.value.map((entry) => {
        const released = releaseDateLabel(entry.releasedAt);
        const java = t("mcserver.wizard.needsJava", { n: entry.javaFeature }, "Needs Java {n}");
        return {
            value: entry.version,
            title: entry.version,
            // The date is only mentioned when there is one. An upstream API that publishes
            // no date leaves the version dateless rather than dated approximately.
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

const awsAvailable = computed(() => {
    const bridge = (globalThis as { worldlens?: { mcserver?: { aws?: unknown } } }).worldlens;
    return bridge?.mcserver?.aws !== undefined && bridge.mcserver.aws !== null;
});
const runtimeOptionsForWizard = computed(() => runtimeOptions(awsAvailable.value));

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
});

/* -------------------------------------------------------------------------- */
/* Step 4: Java                                                               */
/* -------------------------------------------------------------------------- */

const javaResolution = ref<JavaResolution | null>(null);
const javaChecking = ref(false);
const javaProvisioning = ref(false);
const javaProgress = ref<JavaProvisionProgress | null>(null);
let unsubscribeJavaProgress: (() => void) | null = null;

const requiredJavaFeature = computed(() => selectedVersionEntry.value?.javaFeature ?? 21);

async function checkJava(): Promise<void> {
    if (!store.hasJava) return;
    javaChecking.value = true;
    const result = await store.javaResolve(String(requiredJavaFeature.value));
    if (result.ok && result.value) javaResolution.value = result.value;
    javaChecking.value = false;
}

async function provisionJava(): Promise<void> {
    javaProvisioning.value = true;
    javaProgress.value = null;
    const result = await store.javaProvision(String(requiredJavaFeature.value));
    if (result.ok && result.value) javaResolution.value = result.value;
    javaProvisioning.value = false;
}

watch(step, (value) => {
    if (value === "java" && javaResolution.value === null && store.hasJava) void checkJava();
});

onMounted(() => {
    unsubscribeJavaProgress = store.onJavaProgress((progress) => {
        javaProgress.value = progress;
    });
});
onUnmounted(() => {
    unsubscribeJavaProgress?.();
});

const canAutoProvisionJava = computed(() => store.hasJava);

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
const eulaAccepted = ref(false);
const creating = ref(false);
const createFailure = ref<string | null>(null);

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

const canCreate = computed(
    () =>
        idError.value === null &&
        nameError.value === null &&
        memoryError.value === null &&
        portError.value === null &&
        folderError.value === null &&
        eulaAccepted.value &&
        minecraftVersion.value.trim() !== "",
);

function transportRef(): TransportRef {
    if (whereItRuns.value === "local-docker") {
        return { kind: "local-docker", containerRef: serverId.value, serverDir: serverDir.value };
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
    if (!canCreate.value) return;
    creating.value = true;
    createFailure.value = null;

    if (store.hasCreate) {
        const result = await store.createServer({
            id: serverId.value,
            name: serverName.value,
            flavour: flavour.value,
            version: minecraftVersion.value,
            memoryMb: memoryMb.value,
            acceptedEula: eulaAccepted.value,
            provisionJavaIfMissing: true,
            ...(isModLoader.value
                ? {
                      loaderVersion: modLoaderVersion.value.trim() || undefined,
                      modsDirectory: modsDirectory.value.trim() || DEFAULT_MODS_DIRECTORY,
                      preinstallApiLibraries: [...preinstallApiLibraries.value],
                  }
                : {}),
        });
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
        return;
    }

    // No dedicated `create` namespace on this build's bridge: fall back to registering
    // the record directly, exactly as the pre-wizard form did, so the wizard still works
    // end to end against an older shell.
    const now = new Date().toISOString();
    const result = await store.save({
        id: serverId.value,
        name: serverName.value,
        flavour: flavour.value,
        minecraftVersion:
            minecraftVersion.value.trim() === "" ? null : minecraftVersion.value.trim(),
        ref: transportRef(),
        origin: "created",
        createdAt: now,
        updatedAt: now,
        hasRconSecret: false,
        rconPort: port.value,
        writeScope: [],
    });
    creating.value = false;
    if (result.ok) {
        emit("created", serverId.value);
        if (whereItRuns.value === "aws") emit("open-aws", serverId.value);
        open.value = false;
        resetWizard();
    } else {
        createFailure.value =
            result.failure?.message ??
            t("mcserver.wizard.createFailed", "The server could not be created.");
    }
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
async function fillSuggestedFolder(): Promise<void> {
    if (serverDir.value.trim() !== "") return;
    const suggested = await store.suggestFolder(serverName.value.trim() || serverId.value.trim());
    if (suggested !== null && serverDir.value.trim() === "") serverDir.value = suggested;
}

function resetWizard(): void {
    step.value = "flavour";
    flavour.value = "paper";
    minecraftVersion.value = "";
    whereItRuns.value = "local-process";
    serverDir.value = "";
    sshHost.value = "";
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
    createFailure.value = null;
}

watch(open, (isOpen) => {
    if (isOpen) {
        void loadCatalogue();
        resetWizard();
        // After the reset, so it is not immediately cleared again.
        void fillSuggestedFolder();
    }
});

function next(): void {
    const idx = WIZARD_STEPS.indexOf(step.value);
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
            validateModsDirectory(modsDirectory.value) === null),
);
const canAdvanceFromRuntime = computed(() => {
    // The server folder field lives on THIS step, so this step is where a missing one has
    // to stop you. It used to let you straight past and the resources step refused to
    // advance instead - with the folder field nowhere on screen and nothing saying why,
    // which is a dead end rather than a validation message.
    if (folderError.value !== null) return false;
    if (whereItRuns.value === "local-process") return true;
    if (whereItRuns.value === "local-docker") return dockerAvailability.available === true;
    if (whereItRuns.value === "aws") return awsAvailable.value;
    return sshHost.value.trim() !== "";
});
const canAdvanceFromJava = computed(() => true);
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
            if (folderError.value !== null) return folderError.value;
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
    <VDialog v-model="open" max-width="720" scrollable persistent>
        <VCard>
            <VCardTitle>{{ t("mcserver.wizard.title", "New Minecraft server") }}</VCardTitle>
            <VCardText class="wl-mcserver-wizard__body">
                <nav
                    class="wl-mcserver-wizard__stepper"
                    :aria-label="t('mcserver.wizard.progress', 'Wizard progress')"
                >
                    <VChip
                        v-for="(s, idx) in visibleSteps"
                        :key="s"
                        size="small"
                        :variant="s === step ? 'flat' : stepNumber > idx + 1 ? 'tonal' : 'outlined'"
                        :color="
                            s === step ? 'primary' : stepNumber > idx + 1 ? 'success' : undefined
                        "
                    >
                        {{ idx + 1 }}. {{ t(`mcserver.wizard.step.${s}`, s) }}
                    </VChip>
                </nav>

                <!-- Step 1: flavour -->
                <div v-if="step === 'flavour'" class="wl-mcserver-wizard__step">
                    <div class="text-body-2">
                        {{
                            t(
                                "mcserver.wizard.flavourIntro",
                                "Choose the kind of server this will be.",
                            )
                        }}
                    </div>
                    <div class="wl-mcserver-wizard__flavours">
                        <VBtn
                            v-for="card in FLAVOUR_CARDS"
                            :key="card.id"
                            variant="text"
                            block
                            rounded="lg"
                            class="wl-mcserver-wizard__flavour-card"
                            :class="{
                                'wl-mcserver-wizard__flavour-card--selected': flavour === card.id,
                            }"
                            :aria-pressed="flavour === card.id"
                            @click="flavour = card.id"
                        >
                            <div class="wl-mcserver-wizard__flavour-name">
                                {{ card.name }}
                                <VIcon
                                    v-if="flavour === card.id"
                                    :icon="mdiCheckCircle"
                                    size="18"
                                    color="primary"
                                />
                            </div>
                            <div class="text-caption text-medium-emphasis">{{ card.tagline }}</div>
                            <div class="text-caption">{{ card.description }}</div>
                            <VChip
                                v-if="card.cataloguedId === null"
                                size="x-small"
                                variant="tonal"
                                color="warning"
                            >
                                {{ t("mcserver.wizard.noCatalogue", "No live version list yet") }}
                            </VChip>
                        </VBtn>
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
                        <ConfigSearchField
                            v-model="versionQuery"
                            v-model:regex="versionUseRegex"
                            v-model:flags="versionFlags"
                            :label="t('mcserver.wizard.searchVersions', 'Search versions')"
                            :sample="versionSample"
                        />
                        <div
                            v-if="flavourVersions.length === 0 && !catalogueLoading"
                            class="text-caption text-medium-emphasis"
                        >
                            {{
                                t(
                                    "mcserver.wizard.noVersionsForFlavour",
                                    "No versions could be fetched for this flavour, so there is nothing to choose from. Enter the version below instead.",
                                )
                            }}
                        </div>
                        <div
                            v-for="group in renderedVersionGroups"
                            :key="group.stability"
                            class="wl-mcserver-wizard__version-group"
                        >
                            <div class="text-caption text-medium-emphasis text-uppercase">
                                {{
                                    group.stability === "release"
                                        ? t("mcserver.wizard.releases", "Releases")
                                        : t("mcserver.wizard.snapshots", "Snapshots")
                                }}
                            </div>
                            <section
                                v-for="family in group.families"
                                :key="family.family"
                                class="wl-mcserver-wizard__family"
                            >
                                <VBtn
                                    variant="text"
                                    block
                                    class="wl-mcserver-wizard__family-row"
                                    :aria-expanded="
                                        familyIsExpanded(group.stability, family.family)
                                    "
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
                                    class="wl-mcserver-wizard__family-versions"
                                >
                                    <div
                                        v-for="entry in family.versions"
                                        :key="entry.version"
                                        class="wl-mcserver-wizard__version-row-wrap"
                                    >
                                        <VBtn
                                            variant="text"
                                            class="wl-mcserver-wizard__version-row"
                                            :class="{
                                                'wl-mcserver-wizard__version-row--selected':
                                                    minecraftVersion === entry.version,
                                            }"
                                            :aria-label="entry.version"
                                            @click="minecraftVersion = entry.version"
                                        >
                                            <span>{{ entry.version }}</span>
                                            <span class="text-caption text-medium-emphasis">
                                                {{
                                                    t(
                                                        "mcserver.wizard.needsJava",
                                                        { n: entry.javaFeature },
                                                        "Needs Java {n}",
                                                    )
                                                }}
                                                <template v-if="releaseDateLabel(entry.releasedAt)">
                                                    &#183; {{ releaseDateLabel(entry.releasedAt) }}
                                                </template>
                                            </span>
                                        </VBtn>
                                        <a
                                            v-if="wikiUrlFor(entry.version)"
                                            :href="wikiUrlFor(entry.version) ?? undefined"
                                            target="_blank"
                                            rel="noreferrer noopener"
                                            class="wl-mcserver-wizard__wiki-action"
                                            :aria-label="`${entry.version}: ${wikiArticleStateLabel(entry.wikiState ?? wikiArticleStateFor(entry.version))}`"
                                        >
                                            <VIcon :icon="mdiOpenInNew" size="x-small" />
                                            <span>{{ t("mcserver.wizard.wiki", "Wiki") }}</span>
                                            <span class="text-caption">{{
                                                wikiArticleStateLabel(
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
                            v-if="flavourVersions.length > MAX_RENDERED_VERSION_ROWS"
                            class="text-caption text-medium-emphasis"
                        >
                            {{
                                t(
                                    "mcserver.wizard.versionRenderLimit",
                                    { n: MAX_RENDERED_VERSION_ROWS },
                                    "Showing the first {n} matching versions. Search to narrow the list.",
                                )
                            }}
                        </div>
                    </template>
                    <VSelect
                        v-if="!versionEnteredByHand"
                        v-model="minecraftVersion"
                        :items="versionOptions"
                        item-title="title"
                        item-value="value"
                        :label="t('mcserver.wizard.version', 'Minecraft version')"
                        :hint="
                            t(
                                'mcserver.wizard.versionHint',
                                'Chosen from the versions this flavour actually publishes.',
                            )
                        "
                        persistent-hint
                        :no-data-text="
                            t(
                                'mcserver.wizard.noVersions',
                                'No versions were fetched for this flavour.',
                            )
                        "
                    >
                        <template #item="{ props: itemProps, item }">
                            <VListItem v-bind="itemProps" :subtitle="item.raw.subtitle" />
                        </template>
                    </VSelect>
                    <VTextField
                        v-else
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
                    <VSelect
                        v-if="modLoaderVersions.length > 0"
                        v-model="modLoaderVersion"
                        :items="modLoaderVersions"
                        :label="t('mcserver.wizard.loaderVersion', 'Mod-loader version')"
                        :hint="
                            t(
                                'mcserver.wizard.loaderVersionHint',
                                'Choose a published loader build.',
                            )
                        "
                        persistent-hint
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
                    <VRadioGroup
                        v-model="whereItRuns"
                        :label="t('mcserver.wizard.whereItRuns', 'Where it runs')"
                    >
                        <div
                            v-for="option in runtimeOptionsForWizard"
                            :key="option.id"
                            class="wl-mcserver-wizard__runtime-option"
                        >
                            <VRadio :value="option.id" :label="option.name" />
                            <div
                                class="text-caption text-medium-emphasis wl-mcserver-wizard__runtime-desc"
                            >
                                {{ option.description }}
                            </div>
                        </div>
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
                        <PathField
                            v-model="serverDir"
                            field="server folder"
                            :label="
                                t(
                                    'mcserver.wizard.folder',
                                    'Server folder (mounted into the container)',
                                )
                            "
                            semantic="folder"
                        />
                    </template>

                    <template v-else-if="whereItRuns === 'ssh-docker'">
                        <VTextField
                            v-model="sshHost"
                            :label="t('mcserver.wizard.sshHost', 'SSH host id')"
                            :hint="
                                t(
                                    'mcserver.wizard.sshHostHint',
                                    'The remote host this container will run on.',
                                )
                            "
                            persistent-hint
                        />
                        <PathField
                            v-model="serverDir"
                            field="server folder"
                            :label="t('mcserver.wizard.folder', 'Server folder on the remote host')"
                            semantic="folder"
                        />
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
                    <div class="text-body-2">
                        {{
                            t(
                                "mcserver.wizard.javaIntro",
                                { n: requiredJavaFeature },
                                "This version needs Java {n}.",
                            )
                        }}
                    </div>
                    <VAlert v-if="!store.hasJava" type="info" variant="tonal" density="compact">
                        {{
                            t(
                                "mcserver.wizard.noJavaHost",
                                "This build cannot check for Java. It will be checked again when the server starts.",
                            )
                        }}
                    </VAlert>
                    <template v-else>
                        <VAlert v-if="javaChecking" type="info" variant="tonal" density="compact">
                            {{ t("mcserver.wizard.checkingJava", "Looking for a suitable Java…") }}
                        </VAlert>
                        <VAlert
                            v-else-if="javaResolution?.found"
                            type="success"
                            variant="tonal"
                            density="compact"
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
                        <div v-if="javaProvisioning" class="wl-mcserver-wizard__progress">
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
                    <div>
                        <VLabel class="text-caption" for="wl-mcserver-memory">
                            {{ t("mcserver.wizard.memory", "Memory (MB)") }}: {{ memoryMb }}
                        </VLabel>
                        <VSlider
                            id="wl-mcserver-memory"
                            v-model="memoryMb"
                            :min="512"
                            :max="memorySliderCap"
                            :step="256"
                            thumb-label
                            :aria-label="t('mcserver.wizard.memory', 'Memory (MB)')"
                        />
                        <div v-if="memoryError" class="text-caption text-error">
                            {{ memoryError }}
                        </div>
                    </div>
                    <VTextField
                        v-model.number="port"
                        type="number"
                        :min="1"
                        :max="65535"
                        :label="t('mcserver.wizard.port', 'Server port')"
                        :error-messages="portError ? [portError] : []"
                        :hint="t('mcserver.wizard.portHint', 'Ports run from 1 to 65535.')"
                        persistent-hint
                    />
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
                        <VSelect
                            v-model="levelType"
                            :items="LEVEL_TYPES"
                            :label="t('mcserver.wizard.levelType', 'World type')"
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
                        :label="t('mcserver.wizard.id', 'Server id')"
                        :error-messages="idError ? [idError] : []"
                        hint="lowercase, letters, digits, hyphens"
                        persistent-hint
                    />
                    <VTextField
                        v-model="serverName"
                        :label="t('mcserver.wizard.name', 'Display name')"
                        :error-messages="nameError ? [nameError] : []"
                    />
                    <VDivider />
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
                    <VDivider />
                    <VSwitch
                        v-model="eulaAccepted"
                        color="primary"
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
                    <VAlert v-if="createFailure" type="error" variant="tonal" density="compact">{{
                        createFailure
                    }}</VAlert>
                </div>
            </VCardText>
            <VCardActions>
                <VBtn variant="text" @click="open = false">{{ t("common.cancel", "Cancel") }}</VBtn>
                <VSpacer />
                <VBtn v-if="step !== 'flavour'" variant="text" @click="back">{{
                    t("common.back", "Back")
                }}</VBtn>
                <span v-if="advanceBlockedReason" class="text-caption text-medium-emphasis mr-2">
                    {{ advanceBlockedReason }}
                </span>
                <VBtn
                    v-if="step !== 'review'"
                    color="primary"
                    variant="tonal"
                    :disabled="!canAdvance"
                    :title="advanceBlockedReason ?? undefined"
                    @click="next"
                >
                    {{ t("common.next", "Next") }}
                </VBtn>
                <VBtn
                    v-else
                    color="primary"
                    variant="tonal"
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
.wl-mcserver-wizard__body {
    display: flex;
    flex-direction: column;
    gap: 12px;
}
.wl-mcserver-wizard__stepper {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}
.wl-mcserver-wizard__step {
    display: flex;
    flex-direction: column;
    gap: 12px;
}
.wl-mcserver-wizard__flavours {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 10px;
}
.wl-mcserver-wizard__flavour-card {
    text-align: left;
    border: 1px solid rgb(var(--v-border-color));
    /*
     * The corner comes from the `rounded="lg"` prop on the button, not from here.
     *
     * A plain `border-radius` in this block cannot win: Vuetify's radius utilities are
     * `!important`, and the design system's component defaults make every button
     * `corner-full` (9999px). On an ordinary short button that is the intended pill. On this
     * card, once it was given `height: auto` to fit four stacked blocks, a 9999px radius
     * turned each one into an ellipse, with the corners of the text clipped outside the oval.
     *
     * `docs/design-system.md` records the same trap being sprung by the window caption
     * buttons, and the same answer: spend the token through the `rounded` prop.
     */
    padding: 10px;
    background: transparent;
    cursor: pointer;

    /*
     * A `VBtn` puts its slot inside `.v-btn__content`, and that element, not this one, is
     * what lays the card out. Left alone it is a centred row with `white-space: nowrap`
     * inside a button of fixed height, so this card's four stacked blocks (name, tagline,
     * description, catalogue chip) were drawn on one line, refused to wrap, and printed
     * straight through each other. Every flavour then overflowed into its neighbour and the
     * step grew a horizontal scrollbar.
     *
     * The rules below therefore belong on the content element rather than here: setting
     * `flex-direction: column` on the button root did nothing at all, which is exactly why
     * the breakage was invisible in the stylesheet and obvious on screen.
     */
    height: auto;
    min-height: 0;
    padding-block: 10px;
}

.wl-mcserver-wizard__flavour-card :deep(.v-btn__content) {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    inline-size: 100%;
    min-inline-size: 0;
    /* The description is prose. It has to be allowed to break. */
    white-space: normal;
    text-align: left;
}
.wl-mcserver-wizard__flavour-card--selected {
    border-color: rgb(var(--v-theme-primary));
    background: rgba(var(--v-theme-primary), 0.08);
}
.wl-mcserver-wizard__flavour-name {
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 6px;
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
.wl-mcserver-wizard__family-row {
    min-height: 48px;
    justify-content: flex-start;
    gap: 8px;
    text-align: left;
}
.wl-mcserver-wizard__family-versions {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-inline-start: 12px;
}
.wl-mcserver-wizard__version-row-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 48px;
}
.wl-mcserver-wizard__version-row {
    display: flex;
    justify-content: space-between;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 48px;
    padding: 6px 8px;
    border-radius: 6px;
    background: transparent;
    border: 1px solid transparent;
    cursor: pointer;
    text-align: left;
}
.wl-mcserver-wizard__wiki-action {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 48px;
    min-width: 48px;
    padding-inline: 8px;
    color: rgb(var(--v-theme-primary));
    text-decoration: none;
}
.wl-mcserver-wizard__wiki-action:hover,
.wl-mcserver-wizard__wiki-action:focus-visible {
    text-decoration: underline;
}
.wl-mcserver-wizard__version-row--selected {
    border-color: rgb(var(--v-theme-primary));
    background: rgba(var(--v-theme-primary), 0.08);
}
.wl-mcserver-wizard__runtime-option {
    margin-bottom: 6px;
}
.wl-mcserver-wizard__runtime-desc {
    margin-left: 32px;
    margin-top: -6px;
}
.wl-mcserver-wizard__progress {
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.wl-mcserver-wizard__summary {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 12px;
    font-size: 0.875rem;
}
.wl-mcserver-wizard__summary dt {
    color: rgb(var(--v-theme-on-surface-variant));
}
.wl-mcserver-wizard__eula-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.8rem;
}
</style>
