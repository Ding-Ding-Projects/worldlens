<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiContentCopy, mdiDatabaseArrowDownOutline, mdiFolderOpenOutline, mdiHarddisk, mdiPackageDown, mdiPlus, mdiRefresh } from "@mdi/js";
import { VAlert, VBtn, VBtnToggle, VCheckbox, VChip, VNumberInput, VProgressLinear, VSelect, VSwitch, VTab, VTabs, VTextarea, VTextField } from "vuetify/components";
import {
    COMPACT_MODES,
    GIB,
    MIB,
    TIB,
    attachScript,
    compactScript,
    createScript,
    detachScript,
    devDriveScript,
    formatBytes,
    formatLabel,
    growScript,
    isDroppableDisk,
    mapDiskSize,
    mergeScript,
    nativeBootScript,
    powerShellEquivalent,
    routeLabel,
    routesFor,
    validateCreate,
    type CompactMode,
    type CreateRequest,
    type VirtualDiskOperation,
    type VirtualDiskRoute,
    type VirtualDiskType,
} from "@worldlens/shared/virtualDisk";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import { playActionCue } from "../../stores/actionSounds.js";
import {
    virtualDiskBridge,
    type VirtualDiskEntry,
    type VirtualDiskHistoryEntry,
    type VirtualDiskPackProgress,
    type VirtualDiskPackResult,
    type VirtualDiskStatus,
} from "./vdiskBridge.js";

/**
 * The virtual disk manager: a library of every VHD, VHDX, VHD Set and ISO attached or added,
 * operations through whichever route this PC has (each naming the route that did the work and
 * showing the exact script), a create form that enforces the format limits before anything is
 * written, Quick pack, and the option to keep a rendered map inside one VHDX.
 *
 * Everything that changes a disk runs in the main process behind the Windows permission prompt.
 * A declined prompt is shown as cancelled, never as done. Outside Windows the screen says plainly
 * that it needs Windows and still shows the create form and scripts, which are useful to read.
 */

const { t } = useI18n();
const bridge = virtualDiskBridge();
const status = ref<VirtualDiskStatus | null>(null);
const disks = ref<readonly VirtualDiskEntry[]>([]);
const history = ref<readonly VirtualDiskHistoryEntry[]>([]);
const selectedPath = ref<string | null>(null);
const notice = ref<{ readonly kind: "success" | "info" | "warning" | "error"; readonly text: string } | null>(null);
const busy = ref(false);
const tab = ref<"library" | "create" | "pack" | "map">("library");

const query = ref("");
const regex = ref(false);
const flags = ref("i");
type Filter = "all" | "attached" | "vhdx" | "vhd" | "vhdset" | "iso";
const filter = ref<Filter>("all");
const filters = computed<readonly { readonly id: Filter; readonly label: string }[]>(() => [
    { id: "all", label: t("vdisk.filter.all", "All") },
    { id: "attached", label: t("vdisk.filter.attached", "Attached") },
    { id: "vhdx", label: "VHDX" },
    { id: "vhd", label: "VHD" },
    { id: "vhdset", label: "VHD Set" },
    { id: "iso", label: "ISO" },
]);

const visible = computed(() =>
    disks.value.filter((disk) => {
        if (filter.value === "attached" && !disk.attached) return false;
        if (filter.value !== "all" && filter.value !== "attached" && disk.format !== filter.value) return false;
        const needle = query.value.trim();
        if (!needle) return true;
        const haystack = `${disk.path} ${disk.letters.join(" ")} ${disk.format ?? ""}`;
        try {
            return regex.value ? new RegExp(needle, flags.value).test(haystack) : haystack.toLowerCase().includes(needle.toLowerCase());
        } catch {
            return false;
        }
    }),
);
const selected = computed(() => disks.value.find((d) => d.path === selectedPath.value) ?? null);
const routes = computed(() => status.value?.routes ?? { virtdisk: false, storage: false, diskpart: false, hyperv: false });

async function refresh(): Promise<void> {
    if (!bridge) return;
    status.value = await bridge.status();
    disks.value = await bridge.list();
    history.value = await bridge.history();
    if (selectedPath.value === null && disks.value[0]) selectedPath.value = disks.value[0].path;
}

async function addFiles(paths: readonly string[]): Promise<void> {
    if (!bridge || paths.length === 0) return;
    const answer = await bridge.addToLibrary(paths);
    if (answer.refused.length) notice.value = { kind: "warning", text: t("vdisk.notice.refused", { count: answer.refused.length }, "{count} file(s) are not virtual disks and were not added.") };
    await refresh();
    selectedPath.value = answer.added[0] ?? selectedPath.value;
}

async function pickFile(): Promise<void> {
    const path = await globalThis.window?.worldlens?.dialog.pickFile({ title: t("vdisk.pick.disk", "Choose a virtual disk"), extensions: ["vhd", "vhdx", "vhds", "avhd", "avhdx", "iso"] });
    if (path) await addFiles([path]);
}

/* ---------------- Operations ---------------- */

type Op = Exclude<VirtualDiskOperation, "create">;
const op = ref<Op>("attach");
const route = ref<VirtualDiskRoute | null>(null);
const readOnly = ref(false);
const sizeGb = ref(80);
const extendLetter = ref("");
const compactMode = ref<CompactMode>("Full");
const mergeDepth = ref(1);
const destination = ref("");
const lastScript = ref("");
const smallestSafe = ref(true);
const targetType = ref<"fixed" | "dynamic">("dynamic");
const parentPath = ref("");
const metadataAction = ref<"list" | "set" | "delete">("list");
const metadataKey = ref("");
const metadataValue = ref("");
const trackingAction = ref<"enable" | "disable" | "query">("query");
const trackingId = ref("");
const checkpointAction = ref<"take" | "apply" | "delete">("take");
const checkpointId = ref("");
const devDriveLabel = ref("DevDrive");
const bootImage = ref("");
const bootIndex = ref(1);
/** What the last run reported (sizes, identifiers, metadata, changed ranges). */
const lastDetails = ref<Readonly<Record<string, unknown>> | null>(null);

const operations = computed<readonly { readonly id: Op; readonly label: string }[]>(() => [
    { id: "describe", label: t("vdisk.op.describe", "Read details") },
    { id: "attach", label: t("vdisk.op.attach", "Attach") },
    { id: "detach", label: t("vdisk.op.detach", "Detach") },
    { id: "grow", label: t("vdisk.op.grow", "Grow") },
    { id: "shrink", label: t("vdisk.op.shrink", "Shrink") },
    { id: "compact", label: t("vdisk.op.compact", "Compact") },
    { id: "convert", label: t("vdisk.op.convert", "Convert") },
    { id: "merge", label: t("vdisk.op.merge", "Merge into parent") },
    { id: "reparent", label: t("vdisk.op.reparent", "Change parent") },
    { id: "identity", label: t("vdisk.op.identity", "New disk identifier") },
    { id: "metadata", label: t("vdisk.op.metadata", "Metadata") },
    { id: "changeTracking", label: t("vdisk.op.changeTracking", "Change tracking") },
    { id: "checkpoint", label: t("vdisk.op.checkpoint", "VHD Set checkpoints") },
    { id: "mirror", label: t("vdisk.op.mirror", "Mirror to a new file") },
    { id: "devdrive", label: t("vdisk.op.devdrive", "Make a Dev Drive") },
    { id: "nativeboot", label: t("vdisk.op.nativeboot", "Prepare for native boot") },
]);
const routeChoices = computed(() => routesFor(op.value, routes.value));
watch([op, routeChoices], () => {
    const first = routeChoices.value.find((c) => c.usable);
    route.value = first?.route ?? null;
    lastDetails.value = null;
});
const destructive = computed(
    () =>
        op.value === "shrink" ||
        op.value === "merge" ||
        op.value === "identity" ||
        op.value === "reparent" ||
        op.value === "devdrive" ||
        op.value === "nativeboot" ||
        (op.value === "metadata" && metadataAction.value === "delete") ||
        (op.value === "checkpoint" && checkpointAction.value !== "take"),
);

/** UTF-8 text as base64, for a metadata value. */
function utf8Base64(text: string): string {
    let binary = "";
    for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function newMetadataKey(): void {
    metadataKey.value = globalThis.crypto.randomUUID();
}

const request = computed(() => {
    const path = selected.value?.path ?? "";
    return {
        operation: op.value,
        path,
        ...(route.value ? { route: route.value } : {}),
        readOnly: readOnly.value,
        sizeBytes: Math.round(sizeGb.value * GIB),
        extendVolume: extendLetter.value.trim() || null,
        mode: compactMode.value,
        depth: mergeDepth.value,
        ...(destination.value ? { destination: destination.value } : {}),
        smallestSafe: op.value === "shrink" && route.value === "virtdisk" && smallestSafe.value,
        targetType: targetType.value,
        ...(parentPath.value ? { parentPath: parentPath.value } : {}),
        metadata: { action: metadataAction.value, ...(metadataKey.value ? { key: metadataKey.value } : {}), ...(metadataAction.value === "set" ? { valueBase64: utf8Base64(metadataValue.value) } : {}) },
        changeTracking: { action: trackingAction.value, ...(trackingId.value ? { changeTrackingId: trackingId.value } : {}) },
        checkpoint: { action: checkpointAction.value, ...(checkpointId.value ? { checkpointId: checkpointId.value } : {}) },
        devDriveLabel: devDriveLabel.value,
        ...(bootImage.value ? { nativeBoot: { imageFile: bootImage.value, imageIndex: bootIndex.value } } : {}),
    };
});

/** What can be checked for native boot before anything runs, from the file itself. */
const bootChecks = computed(() => {
    const path = selected.value?.path ?? "";
    const vhdx = path.toLowerCase().endsWith(".vhdx");
    const local = !path.startsWith("\\\\");
    return [
        { ok: vhdx, text: vhdx ? t("vdisk.boot.vhdx", "VHDX format.") : t("vdisk.boot.notVhdx", "Native boot needs a VHDX file.") },
        { ok: local, text: local ? t("vdisk.boot.local", "The file is on a local disk.") : t("vdisk.boot.share", "The file is on a network share; native boot needs a local disk.") },
        { ok: bootImage.value !== "", text: bootImage.value ? t("vdisk.boot.image", "Windows image chosen.") : t("vdisk.boot.noImage", "Choose an install.wim or install.esd from Windows setup media.") },
    ];
});

/** Scripts the screen can write itself, for the browser build and while the desktop answer loads. */
function localScript(): string {
    const path = selected.value?.path;
    if (!path) return "";
    const bytes = Math.round(sizeGb.value * GIB);
    if (route.value === "virtdisk") return t("vdisk.script.virtdisk", "# Runs through the VirtDisk API in the desktop app. The complete script appears here there.");
    switch (op.value) {
        case "attach":
            return route.value === "storage" ? powerShellEquivalent("attach", path, { readOnly: readOnly.value }) : attachScript(path, readOnly.value);
        case "detach":
            return route.value === "storage" ? powerShellEquivalent("detach", path) : detachScript(path);
        case "grow":
            return route.value === "hyperv" ? powerShellEquivalent("grow", path, { sizeBytes: bytes }) : growScript(path, bytes, extendLetter.value.trim() || null);
        case "shrink":
            return powerShellEquivalent("shrink", path, { sizeBytes: bytes }).replace("# Hyper-V module equivalent\n", "");
        case "compact":
            return route.value === "hyperv" ? powerShellEquivalent("compact", path, { mode: compactMode.value }).replace("# Hyper-V module equivalent\n", "") : compactScript(path);
        case "convert":
            return powerShellEquivalent("convert", path, { destination: destination.value || path }).replace("# Hyper-V module equivalent\n", "");
        case "merge":
            return route.value === "hyperv" ? powerShellEquivalent("merge", path).replace("# Hyper-V module equivalent\n", "") : mergeScript(path, mergeDepth.value);
        case "devdrive":
            return devDriveScript(path, devDriveLabel.value);
        case "nativeboot":
            return bootImage.value ? nativeBootScript({ path, imageFile: bootImage.value, imageIndex: bootIndex.value, bcdBackupPath: "<app data>\\bcd-backup.bcd" }) : `# ${t("vdisk.boot.noImage", "Choose an install.wim or install.esd from Windows setup media.")}`;
        case "identity":
            return `Set-VHD -Path '${path.replace(/'/gu, "''")}' -ResetDiskIdentifier`;
        default:
            return "";
    }
}

const script = ref<{ full: string; preview: string }>({ full: "", preview: "" });
let scriptAsk = 0;
watch(
    [request, route],
    async () => {
        const mine = ++scriptAsk;
        let text: string;
        try {
            text = localScript();
        } catch (error) {
            text = `# ${error instanceof Error ? error.message : String(error)}`;
        }
        script.value = { full: text, preview: text };
        if (!bridge || !selected.value || !route.value) return;
        const answer = await bridge.script(JSON.parse(JSON.stringify(request.value)), route.value).catch(() => null);
        if (answer && mine === scriptAsk) script.value = answer;
    },
    { immediate: true, deep: true },
);
const scriptPreview = computed(() => script.value.preview);

async function browseDestination(): Promise<void> {
    const folder = await globalThis.window?.worldlens?.dialog.pickFolder({ title: t("vdisk.pick.folder", "Choose a folder for the new disk") });
    const name = selected.value?.path.split(/[\\/]/u).pop()?.replace(/\.[^.]+$/u, "") ?? "Disk";
    if (folder) destination.value = `${folder}\\${name} (${op.value === "mirror" ? "mirror" : "copy"}).vhdx`;
}

async function browseParent(): Promise<void> {
    const file = await globalThis.window?.worldlens?.dialog.pickFile({ title: t("vdisk.pick.parent", "Choose the parent disk"), extensions: ["vhd", "vhdx", "avhd", "avhdx"] });
    if (file) parentPath.value = file;
}

async function browseBootImage(): Promise<void> {
    const file = await globalThis.window?.worldlens?.dialog.pickFile({ title: t("vdisk.pick.image", "Choose a Windows image"), extensions: ["wim", "esd"] });
    if (file) bootImage.value = file;
}

function detailText(value: unknown): string {
    if (typeof value === "number" && value > 1024 * 1024) return `${formatBytes(value)} (${value})`;
    return typeof value === "string" ? value : JSON.stringify(value);
}

async function copyText(text: string): Promise<void> {
    try {
        await navigator.clipboard.writeText(text);
        notice.value = { kind: "success", text: t("vdisk.notice.copied", "Copied.") };
    } catch {
        notice.value = { kind: "error", text: t("vdisk.notice.copyFailed", "The clipboard is not available here. Select the text and copy it by hand.") };
    }
}

async function runOperation(): Promise<void> {
    if (!bridge || !selected.value || !route.value) return;
    busy.value = true;
    try {
        const result = await bridge.run(JSON.parse(JSON.stringify(request.value)));
        lastScript.value = result.script;
        lastDetails.value = result.details ?? null;
        notice.value = {
            kind: result.ok ? "success" : result.cancelled ? "info" : "error",
            text: result.ok && op.value === "describe" ? t("vdisk.notice.read", "Read the disk details.") : result.ok ? t("vdisk.notice.done", { route: result.route ? routeLabel(result.route as VirtualDiskRoute) : "" }, "Done through {route}.") : result.message,
        };
        playActionCue(result.ok ? "success" : "error");
        await refresh();
    } finally {
        busy.value = false;
    }
}

/* ---------------- Create ---------------- */

const createFormat = ref<"vhdx" | "vhd" | "vhdset">("vhdx");
const createType = ref<VirtualDiskType>("dynamic");
const createSize = ref(64);
const createUnit = ref<"MB" | "GB" | "TB">("GB");
const createPath = ref("");
const createParent = ref("");
const createBlockMb = ref<number | null>(null);
const createFs = ref<"ntfs" | "refs" | "exfat" | "fat32">("ntfs");
const createLabel = ref("Data");
const createLetter = ref("");
const createFormatVolume = ref(true);

const presets = computed(() => [
    { id: "portable", label: t("vdisk.preset.portable", "Portable data disk"), apply: () => { createFormat.value = "vhdx"; createType.value = "dynamic"; createSize.value = 64; createUnit.value = "GB"; createFs.value = "ntfs"; createLabel.value = "Data"; } },
    { id: "devdrive", label: t("vdisk.preset.devdrive", "Dev Drive"), apply: () => { createFormat.value = "vhdx"; createType.value = "dynamic"; createSize.value = 80; createUnit.value = "GB"; createFs.value = "refs"; createLabel.value = "DevDrive"; } },
    { id: "boot", label: t("vdisk.preset.boot", "Native boot disk"), apply: () => { createFormat.value = "vhdx"; createType.value = "fixed"; createSize.value = 128; createUnit.value = "GB"; createFs.value = "ntfs"; createLabel.value = "Windows"; } },
    { id: "scratch", label: t("vdisk.preset.scratch", "Differencing scratch copy"), apply: () => { createFormat.value = "vhdx"; createType.value = "differencing"; createFormatVolume.value = false; } },
]);

const createRequest = computed<CreateRequest>(() => {
    const unit = createUnit.value === "TB" ? TIB : createUnit.value === "MB" ? MIB : GIB;
    return {
        path: createPath.value,
        format: createFormat.value,
        type: createType.value,
        sizeBytes: Math.round(createSize.value * unit),
        ...(createBlockMb.value ? { blockSizeBytes: createBlockMb.value * MIB } : {}),
        ...(createType.value === "differencing" ? { parentPath: createParent.value } : {}),
        ...(createFormatVolume.value && createType.value !== "differencing"
            ? { volume: { fileSystem: createFs.value, label: createLabel.value, partitionStyle: "gpt" as const, mount: createLetter.value ? { kind: "letter" as const, letter: createLetter.value } : null } }
            : {}),
    };
});
const createProblems = computed(() => (createPath.value ? validateCreate(createRequest.value) : [{ field: "path" as const, message: t("vdisk.create.needPath", "Choose where to save the disk.") }]));
const createScriptText = computed(() => {
    try {
        return createPath.value ? createScript(createRequest.value) : "";
    } catch (error) {
        return `# ${error instanceof Error ? error.message : String(error)}`;
    }
});

async function browseCreate(): Promise<void> {
    const folder = await globalThis.window?.worldlens?.dialog.pickFolder({ title: t("vdisk.pick.folder", "Choose a folder for the new disk") });
    if (folder) createPath.value = `${folder}\\${createLabel.value || "Disk"}.${createFormat.value === "vhdset" ? "vhds" : createFormat.value}`;
}

async function create(): Promise<void> {
    if (!bridge || createProblems.value.length) return;
    busy.value = true;
    try {
        const result = await bridge.run({ operation: "create", path: createPath.value, create: createRequest.value });
        notice.value = { kind: result.ok ? "success" : result.cancelled ? "info" : "error", text: result.ok ? t("vdisk.notice.created", { name: createPath.value.split(/[\\/]/u).pop() ?? "" }, "Created {name}.") : result.message };
        playActionCue(result.ok ? "save" : "error");
        if (result.ok) {
            selectedPath.value = createPath.value;
            tab.value = "library";
        }
        await refresh();
    } finally {
        busy.value = false;
    }
}

/* ---------------- Quick pack ---------------- */

const packProgress = ref<VirtualDiskPackProgress | null>(null);
const packResult = ref<VirtualDiskPackResult | null>(null);
const packing = ref(false);
const dropActive = ref(false);
let unsubscribe: (() => void) | null = null;

const phases = computed(() => [
    { id: "size", label: t("vdisk.pack.phase.size", "Size") },
    { id: "create", label: t("vdisk.pack.phase.create", "Create") },
    { id: "copy", label: t("vdisk.pack.phase.copy", "Copy") },
    { id: "verify", label: t("vdisk.pack.phase.verify", "Verify") },
    { id: "detach", label: t("vdisk.pack.phase.detach", "Detach") },
]);
const phaseIndex = computed(() => {
    const p = packProgress.value?.phase;
    if (!p) return -1;
    if (p === "done") return 5;
    return phases.value.findIndex((x) => x.id === (p === "verify" ? "copy" : p));
});
const packPercent = computed(() => {
    const p = packProgress.value;
    return p && p.bytesTotal > 0 ? Math.round((p.bytesDone / p.bytesTotal) * 100) : 0;
});

async function pack(sources: readonly string[]): Promise<void> {
    if (!bridge || sources.length === 0 || packing.value) return;
    packing.value = true;
    packResult.value = null;
    packProgress.value = null;
    try {
        packResult.value = await bridge.quickPack(sources);
        playActionCue(packResult.value.ok ? (packResult.value.partial ? "error" : "success") : "error");
        await refresh();
    } finally {
        packing.value = false;
    }
}

async function pickPackFolder(): Promise<void> {
    const folder = await globalThis.window?.worldlens?.dialog.pickFolder({ title: t("vdisk.pack.pick", "Choose a folder to pack") });
    if (folder) await pack([folder]);
}

function droppedPaths(event: DragEvent): string[] {
    const resolve = (globalThis as { worldlens?: { pathForDroppedFile?: (file: File) => string | null } }).worldlens?.pathForDroppedFile;
    const out: string[] = [];
    for (const file of Array.from(event.dataTransfer?.files ?? [])) {
        const p = resolve?.(file) ?? null;
        if (p) out.push(p);
    }
    return out;
}

async function onPackDrop(event: DragEvent): Promise<void> {
    dropActive.value = false;
    await pack(droppedPaths(event));
}

/** A disk file dropped anywhere on this screen joins the library. */
async function onScreenDrop(event: DragEvent): Promise<void> {
    if (tab.value === "pack") return;
    const paths = droppedPaths(event).filter(isDroppableDisk);
    if (paths.length) await addFiles(paths);
}

/* ---------------- Render into a VHDX ---------------- */

const mapRegions = ref(400);
const mapPath = ref("");
const mapEstimate = computed(() => mapDiskSize(mapRegions.value));

async function browseMap(): Promise<void> {
    const folder = await globalThis.window?.worldlens?.dialog.pickFolder({ title: t("vdisk.map.pick", "Choose where the map disk goes") });
    if (folder) mapPath.value = `${folder}\\Map.vhdx`;
}

async function prepareMap(): Promise<void> {
    if (!bridge || !mapPath.value) return;
    busy.value = true;
    try {
        const result = await bridge.prepareMapDisk(mapPath.value, mapEstimate.value);
        if (result.ok && result.mount) {
            const setter = (globalThis.window as unknown as { worldlens?: { setMapStorageDirectory?: (value: string) => Promise<{ ok: boolean; message?: string }> } }).worldlens?.setMapStorageDirectory;
            const set = setter ? await setter(result.mount) : { ok: false, message: t("vdisk.map.noRender", "This build cannot change the map storage folder.") };
            notice.value = set.ok ? { kind: "success", text: t("vdisk.map.ready", { name: mapPath.value.split(/[\\/]/u).pop() ?? "" }, "Renders now go into {name}.") } : { kind: "error", text: set.message ?? "" };
        } else {
            notice.value = { kind: "error", text: result.message };
        }
        await refresh();
    } finally {
        busy.value = false;
    }
}

onMounted(() => {
    void refresh();
    unsubscribe = bridge?.onProgress((p) => {
        packProgress.value = p;
    }) ?? null;
});
onBeforeUnmount(() => unsubscribe?.());

const size = (bytes: number | null): string => (bytes === null ? t("vdisk.unknown", "Unknown") : formatBytes(bytes));
</script>

<template>
    <section class="wl-vdisk" data-test="vdisk-screen" aria-labelledby="vdisk-title" @dragover.prevent @drop.prevent="onScreenDrop">
        <header class="wl-vdisk__head">
            <div>
                <h1 id="vdisk-title">{{ t("vdisk.title", "Virtual disks") }}</h1>
                <p>{{ t("vdisk.intro", "Every VHD, VHDX, VHD Set and ISO attached on this PC or added by you. Each action names the route it used and shows the script that does the same.") }}</p>
            </div>
            <div class="wl-vdisk__actions">
                <VBtn variant="text" :prepend-icon="mdiRefresh" :disabled="!bridge" @click="refresh">{{ t("vdisk.refresh", "Refresh") }}</VBtn>
                <VBtn variant="outlined" :prepend-icon="mdiFolderOpenOutline" :disabled="!bridge" @click="pickFile">{{ t("vdisk.add", "Add file") }}</VBtn>
                <VBtn color="primary" :prepend-icon="mdiPlus" @click="tab = 'create'">{{ t("vdisk.createDisk", "Create disk") }}</VBtn>
            </div>
        </header>

        <VAlert v-if="!bridge" type="info" variant="tonal">{{ t("vdisk.noBridge", "This build has no desktop bridge. Virtual disks are managed in the Windows desktop app.") }}</VAlert>
        <VAlert v-else-if="status && !status.available" type="info" variant="tonal">{{ status.reason }}</VAlert>
        <div v-else-if="status" class="wl-vdisk__routes" role="list" :aria-label="t('vdisk.routes', 'Routes found on this PC')">
            <span class="wl-vdisk__routes-label">{{ t("vdisk.routes", "Routes found on this PC") }}</span>
            <VChip v-for="r in (['virtdisk', 'storage', 'diskpart', 'hyperv'] as const)" :key="r" role="listitem" size="small" :color="routes[r] ? 'primary' : undefined" :variant="routes[r] ? 'flat' : 'outlined'">
                {{ routeLabel(r) }}{{ routes[r] ? "" : " · " + t("vdisk.routeMissing", "not installed") }}
            </VChip>
            <span v-if="!routes.hyperv" class="wl-vdisk__hint">{{ t("vdisk.homeOk", "Everything that has a Home route still works without Hyper-V.") }}</span>
        </div>

        <VAlert v-if="notice" class="mt-3" :type="notice.kind" variant="tonal" closable role="status" @click:close="notice = null">{{ notice.text }}</VAlert>

        <VTabs v-model="tab" class="mt-3" :aria-label="t('vdisk.sections', 'Virtual disk sections')">
            <VTab value="library">{{ t("vdisk.tab.library", "Library") }}</VTab>
            <VTab value="create">{{ t("vdisk.tab.create", "Create") }}</VTab>
            <VTab value="pack">{{ t("vdisk.tab.pack", "Quick pack") }}</VTab>
            <VTab value="map">{{ t("vdisk.tab.map", "Map inside a disk") }}</VTab>
        </VTabs>

        <!-- Library -->
        <div v-if="tab === 'library'" class="wl-vdisk__split">
            <section class="wl-vdisk__library" :aria-label="t('vdisk.tab.library', 'Library')">
                <ConfigSearchField v-model="query" v-model:regex="regex" v-model:flags="flags" :label="t('vdisk.search', 'Search disks by name, path or letter')" :sample="disks.map((d) => d.path).join('\n')" />
                <div class="wl-vdisk__filters" role="group" :aria-label="t('vdisk.filterLabel', 'Filter')">
                    <VChip v-for="f in filters" :key="f.id" :variant="filter === f.id ? 'flat' : 'outlined'" :aria-pressed="filter === f.id" @click="filter = f.id">{{ f.label }}</VChip>
                </div>
                <div class="wl-vdisk__table-wrap">
                    <table class="wl-vdisk__table">
                        <caption class="wl-sr-only">{{ t("vdisk.tab.library", "Library") }}</caption>
                        <thead>
                            <tr>
                                <th scope="col">{{ t("vdisk.col.file", "File") }}</th>
                                <th scope="col">{{ t("vdisk.col.format", "Format") }}</th>
                                <th scope="col" class="num">{{ t("vdisk.col.virtual", "Virtual") }}</th>
                                <th scope="col" class="num">{{ t("vdisk.col.onDisk", "On disk") }}</th>
                                <th scope="col">{{ t("vdisk.col.state", "State") }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="d in visible" :key="d.path" :class="{ 'is-selected': d.path === selectedPath }">
                                <td><button type="button" class="wl-vdisk__name" @click="selectedPath = d.path">{{ d.path.split(/[\\/]/).pop() }}</button></td>
                                <td>{{ d.format ? formatLabel(d.format as never) : "?" }}</td>
                                <td class="num">{{ size(d.virtualBytes) }}</td>
                                <td class="num">{{ size(d.fileBytes) }}</td>
                                <td>
                                    <VChip size="small" :color="d.attached ? 'primary' : undefined" :variant="d.attached ? 'flat' : 'tonal'">
                                        {{ d.missing ? t("vdisk.state.missing", "File missing") : d.attached ? t("vdisk.state.attached", "Attached") + (d.letters.length ? " " + d.letters.map((l) => l + ":").join(" ") : "") : t("vdisk.state.detached", "Detached") }}
                                    </VChip>
                                </td>
                            </tr>
                            <tr v-if="visible.length === 0">
                                <td colspan="5" class="wl-vdisk__empty">{{ disks.length ? t("vdisk.emptyFiltered", "No disk matches this search or filter.") : t("vdisk.empty", "No virtual disks yet. Add a file, drop one on this window, create one, or Quick pack a folder.") }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <aside v-if="selected" class="wl-vdisk__detail" :aria-label="t('vdisk.details', 'Disk details')">
                <h2 class="wl-vdisk__mono">{{ selected.path.split(/[\\/]/).pop() }}</h2>
                <p class="wl-vdisk__path">{{ selected.path }}</p>
                <dl class="wl-vdisk__facts">
                    <div><dt>{{ t("vdisk.col.format", "Format") }}</dt><dd>{{ selected.format ? formatLabel(selected.format as never) : "?" }}</dd></div>
                    <div><dt>{{ t("vdisk.col.virtual", "Virtual") }}</dt><dd>{{ size(selected.virtualBytes) }}</dd></div>
                    <div><dt>{{ t("vdisk.col.onDisk", "On disk") }}</dt><dd>{{ size(selected.fileBytes) }}</dd></div>
                    <div><dt>{{ t("vdisk.diskNumber", "Disk number") }}</dt><dd>{{ selected.diskNumber ?? t("vdisk.notAttached", "Not attached") }}</dd></div>
                    <div><dt>{{ t("vdisk.letters", "Drive letters") }}</dt><dd>{{ selected.letters.length ? selected.letters.map((l) => l + ":").join(" ") : t("vdisk.none", "None") }}</dd></div>
                    <div><dt>{{ t("vdisk.access", "Access") }}</dt><dd>{{ selected.readOnly ? t("vdisk.readOnly", "Read-only") : t("vdisk.readWrite", "Read and write") }}</dd></div>
                </dl>

                <VSelect v-model="op" :items="operations" item-title="label" item-value="id" :label="t('vdisk.operation', 'Operation')" density="comfortable" />
                <VSelect
                    v-model="route"
                    :items="routeChoices.map((c) => ({ title: routeLabel(c.route) + (c.usable ? '' : ' · ' + c.reason), value: c.route, props: { disabled: !c.usable } }))"
                    :label="t('vdisk.route', 'Route')"
                    density="comfortable"
                    :no-data-text="t('vdisk.noRoute', 'No route on this PC can do this.')"
                />
                <VCheckbox v-if="op === 'attach'" v-model="readOnly" :label="t('vdisk.attachReadOnly', 'Attach read-only')" density="compact" hide-details />
                <VSwitch
                    v-if="op === 'shrink' && route === 'virtdisk'"
                    v-model="smallestSafe"
                    color="primary"
                    density="compact"
                    :label="t('vdisk.smallestSafe', 'Shrink to the smallest safe size')"
                    :hint="t('vdisk.smallestSafeHint', 'Windows works out how far the disk can shrink without cutting a partition.')"
                    persistent-hint
                />
                <div v-if="op === 'grow' || (op === 'shrink' && !(route === 'virtdisk' && smallestSafe))" class="wl-vdisk__row">
                    <VTextField v-model.number="sizeGb" type="number" :label="t('vdisk.newSize', 'New virtual size (GB)')" min="1" density="comfortable" />
                    <VTextField v-if="op === 'grow'" v-model="extendLetter" :label="t('vdisk.extendLetter', 'Extend volume (letter)')" maxlength="1" density="comfortable" />
                </div>
                <VSelect v-if="op === 'compact'" v-model="compactMode" :items="COMPACT_MODES.map((m) => ({ title: m.mode + ' · ' + m.help, value: m.mode }))" :label="t('vdisk.compactMode', 'Compact mode')" density="comfortable" />
                <VTextField v-if="op === 'merge'" v-model.number="mergeDepth" type="number" min="1" :label="t('vdisk.mergeDepth', 'Levels to merge')" density="comfortable" />
                <template v-if="op === 'convert' || op === 'mirror'">
                    <div class="wl-vdisk__row">
                        <VTextField v-model="destination" :label="op === 'mirror' ? t('vdisk.mirrorTo', 'Mirror into a new file') : t('vdisk.destination', 'Save the converted copy as')" density="comfortable" />
                        <VBtn variant="tonal" :prepend-icon="mdiFolderOpenOutline" :disabled="!bridge" @click="browseDestination">{{ t("vdisk.browse", "Browse") }}</VBtn>
                    </div>
                    <VBtnToggle v-if="op === 'convert'" v-model="targetType" mandatory density="comfortable" color="primary" :aria-label="t('vdisk.type', 'Type')">
                        <VBtn value="dynamic">{{ t("vdisk.type.dynamic", "Dynamic") }}</VBtn>
                        <VBtn value="fixed">{{ t("vdisk.type.fixed", "Fixed") }}</VBtn>
                    </VBtnToggle>
                    <p class="wl-vdisk__hint">{{ op === "mirror" ? t("vdisk.mirrorHint", "Copies the disk live while it stays in use, then switches to the copy. The original file is kept.") : t("vdisk.convertHint", "Writes a new file in the format its name gives (.vhd, .vhdx). The original is kept.") }}</p>
                </template>
                <div v-if="op === 'reparent'" class="wl-vdisk__row">
                    <VTextField v-model="parentPath" :label="t('vdisk.parentPath', 'New parent disk')" density="comfortable" />
                    <VBtn variant="tonal" :prepend-icon="mdiFolderOpenOutline" :disabled="!bridge" @click="browseParent">{{ t("vdisk.browse", "Browse") }}</VBtn>
                </div>
                <template v-if="op === 'metadata'">
                    <VBtnToggle v-model="metadataAction" mandatory density="comfortable" color="primary" :aria-label="t('vdisk.op.metadata', 'Metadata')">
                        <VBtn value="list">{{ t("vdisk.meta.list", "List") }}</VBtn>
                        <VBtn value="set">{{ t("vdisk.meta.set", "Set") }}</VBtn>
                        <VBtn value="delete">{{ t("vdisk.meta.delete", "Delete") }}</VBtn>
                    </VBtnToggle>
                    <div v-if="metadataAction !== 'list'" class="wl-vdisk__row">
                        <VTextField v-model="metadataKey" class="wl-vdisk__mono" :label="t('vdisk.meta.key', 'Item identifier (GUID)')" density="comfortable" />
                        <VBtn v-if="metadataAction === 'set'" variant="tonal" @click="newMetadataKey">{{ t("vdisk.meta.newKey", "New identifier") }}</VBtn>
                    </div>
                    <VTextarea v-if="metadataAction === 'set'" v-model="metadataValue" rows="2" auto-grow :label="t('vdisk.meta.value', 'Value (stored as UTF-8)')" density="comfortable" />
                </template>
                <template v-if="op === 'changeTracking'">
                    <VBtnToggle v-model="trackingAction" mandatory density="comfortable" color="primary" :aria-label="t('vdisk.op.changeTracking', 'Change tracking')">
                        <VBtn value="query">{{ t("vdisk.track.query", "Changed ranges") }}</VBtn>
                        <VBtn value="enable">{{ t("vdisk.track.enable", "Turn on") }}</VBtn>
                        <VBtn value="disable">{{ t("vdisk.track.disable", "Turn off") }}</VBtn>
                    </VBtnToggle>
                    <VTextField v-if="trackingAction === 'query'" v-model="trackingId" class="wl-vdisk__mono" :label="t('vdisk.track.since', 'Changes since this tracking id')" :hint="t('vdisk.track.sinceHint', 'Read details shows the current id. Empty means the id from when tracking was turned on.')" persistent-hint density="comfortable" />
                </template>
                <template v-if="op === 'checkpoint'">
                    <VBtnToggle v-model="checkpointAction" mandatory density="comfortable" color="primary" :aria-label="t('vdisk.op.checkpoint', 'VHD Set checkpoints')">
                        <VBtn value="take">{{ t("vdisk.cp.take", "Take") }}</VBtn>
                        <VBtn value="apply">{{ t("vdisk.cp.apply", "Go back to") }}</VBtn>
                        <VBtn value="delete">{{ t("vdisk.cp.delete", "Delete") }}</VBtn>
                    </VBtnToggle>
                    <VTextField v-if="checkpointAction !== 'take'" v-model="checkpointId" class="wl-vdisk__mono" :label="t('vdisk.cp.id', 'Checkpoint identifier')" :hint="t('vdisk.cp.idHint', 'Take shows the new identifier; Read details lists the ones the set has.')" persistent-hint density="comfortable" />
                    <p v-if="selected && !selected.path.toLowerCase().endsWith('.vhds')" class="wl-vdisk__hint">{{ t("vdisk.cp.needSet", "Checkpoints need a VHD Set (.vhds). Create one on the Create tab.") }}</p>
                </template>
                <template v-if="op === 'devdrive'">
                    <VTextField v-model="devDriveLabel" maxlength="32" counter :label="t('vdisk.devdrive.label', 'Volume label')" density="comfortable" />
                    <p class="wl-vdisk__hint">{{ t("vdisk.devdrive.hint", "Formats an empty disk as a ReFS Dev Drive. Needs Windows 11 build 22621.2338 or later and at least 50 GB; a disk with partitions is refused.") }}</p>
                </template>
                <template v-if="op === 'nativeboot'">
                    <div class="wl-vdisk__row">
                        <VTextField v-model="bootImage" :label="t('vdisk.boot.imageLabel', 'Windows image (install.wim or install.esd)')" density="comfortable" />
                        <VBtn variant="tonal" :prepend-icon="mdiFolderOpenOutline" :disabled="!bridge" @click="browseBootImage">{{ t("vdisk.browse", "Browse") }}</VBtn>
                    </div>
                    <VNumberInput v-model="bootIndex" :min="1" :max="64" :step="1" control-variant="split" :label="t('vdisk.boot.index', 'Image index')" density="comfortable" />
                    <ul class="wl-vdisk__checks" :aria-label="t('vdisk.boot.checks', 'Before native boot')">
                        <li v-for="c in bootChecks" :key="c.text" :class="c.ok ? 'is-ok' : 'is-bad'">{{ c.ok ? "✓" : "✗" }} {{ c.text }}</li>
                    </ul>
                    <p class="wl-vdisk__hint">{{ t("vdisk.boot.hint", "Exports the boot configuration first, applies the image and adds a boot entry. The computer never restarts on its own; restart when you are ready and pick the new entry.") }}</p>
                </template>

                <div class="wl-vdisk__script-head">
                    <h3>{{ t("vdisk.script", "Same thing as a script") }}</h3>
                    <VBtn size="small" variant="text" :prepend-icon="mdiContentCopy" @click="copyText(script.full)">{{ t("vdisk.copy", "Copy") }}</VBtn>
                </div>
                <pre class="wl-vdisk__script">{{ scriptPreview }}</pre>

                <section v-if="lastDetails" class="wl-vdisk__answer" data-test="vdisk-details" :aria-label="t('vdisk.answer', 'What Windows reported')">
                    <h3>{{ t("vdisk.answer", "What Windows reported") }}</h3>
                    <dl class="wl-vdisk__facts">
                        <div v-for="(value, key) in lastDetails" :key="key">
                            <dt>{{ key }}</dt>
                            <dd class="wl-vdisk__mono">{{ detailText(value) }}</dd>
                        </div>
                    </dl>
                </section>

                <ConfigSuperConfirm
                    v-if="destructive"
                    :title="t('vdisk.confirm.title', 'Change this disk?')"
                    :action="t('vdisk.confirm.action', { operation: operations.find((o) => o.id === op)?.label ?? op, name: selected.path.split(/[\\/]/).pop() ?? '' }, 'Runs {operation} on {name}. Disks made from this one may stop working, and a power cut during the change can lose data. Make a verified copy first if in doubt.')"
                    :affected="[selected.path]"
                    :confirm-label="t('vdisk.confirm.go', 'Run it')"
                    :disabled="busy || !route || !status?.available"
                    @confirm="runOperation"
                >
                    <template #activator="{ props }">
                        <VBtn v-bind="props" color="error" block :loading="busy">{{ t("vdisk.runTwoKeys", "Run (two keys)") }}</VBtn>
                    </template>
                </ConfigSuperConfirm>
                <VBtn v-else color="primary" block :loading="busy" :disabled="!route || !status?.available" @click="runOperation">{{ t("vdisk.run", "Run · Windows asks once") }}</VBtn>
                <VBtn v-if="selected.inLibrary" variant="text" block class="mt-1" @click="bridge?.removeFromLibrary(selected.path).then(refresh)">{{ t("vdisk.forget", "Remove from the list (keeps the file)") }}</VBtn>
            </aside>
        </div>

        <!-- Create -->
        <section v-else-if="tab === 'create'" class="wl-vdisk__panel" :aria-label="t('vdisk.tab.create', 'Create')">
            <div class="wl-vdisk__filters" role="group" :aria-label="t('vdisk.presets', 'Presets')">
                <VChip v-for="p in presets" :key="p.id" variant="outlined" @click="p.apply()">{{ p.label }}</VChip>
            </div>
            <div class="wl-vdisk__grid">
                <VSelect v-model="createFormat" :items="[{ title: 'VHDX', value: 'vhdx' }, { title: 'VHD', value: 'vhd' }, { title: 'VHD Set', value: 'vhdset' }]" :label="t('vdisk.col.format', 'Format')" />
                <VSelect v-model="createType" :items="[{ title: t('vdisk.type.dynamic', 'Dynamic'), value: 'dynamic' }, { title: t('vdisk.type.fixed', 'Fixed'), value: 'fixed' }, { title: t('vdisk.type.differencing', 'Differencing'), value: 'differencing' }]" :label="t('vdisk.type', 'Type')" />
                <div class="wl-vdisk__row wl-vdisk__row--tight">
                    <VTextField v-model.number="createSize" type="number" min="0" :label="t('vdisk.size', 'Size')" :disabled="createType === 'differencing'" />
                    <VSelect v-model="createUnit" :items="['MB', 'GB', 'TB']" :label="t('vdisk.unit', 'Unit')" :disabled="createType === 'differencing'" />
                </div>
                <VSelect v-model="createBlockMb" :items="[{ title: t('vdisk.default', 'Default'), value: null }, ...[1, 2, 4, 8, 16, 32, 64, 128, 256].map((n) => ({ title: n + ' MB', value: n }))]" :label="t('vdisk.blockSize', 'Block size')" :disabled="createFormat === 'vhd'" />
                <div class="wl-vdisk__row wl-vdisk__row--path wl-vdisk__wide">
                    <VTextField v-model="createPath" :label="t('vdisk.saveAs', 'Save as')" />
                    <VBtn variant="outlined" :prepend-icon="mdiFolderOpenOutline" @click="browseCreate">{{ t("vdisk.browse", "Browse") }}</VBtn>
                </div>
                <VTextField v-if="createType === 'differencing'" v-model="createParent" class="wl-vdisk__wide" :label="t('vdisk.parent', 'Parent disk')" />
                <VCheckbox v-if="createType !== 'differencing'" v-model="createFormatVolume" class="wl-vdisk__wide" :label="t('vdisk.formatVolume', 'Initialise as GPT and format one volume')" hide-details />
                <template v-if="createFormatVolume && createType !== 'differencing'">
                    <VSelect v-model="createFs" :items="[{ title: 'NTFS', value: 'ntfs' }, { title: 'ReFS', value: 'refs' }, { title: 'exFAT', value: 'exfat' }, { title: 'FAT32', value: 'fat32' }]" :label="t('vdisk.fileSystem', 'File system')" />
                    <VTextField v-model="createLabel" :label="t('vdisk.label', 'Volume label')" maxlength="32" />
                    <VTextField v-model="createLetter" :label="t('vdisk.letter', 'Drive letter (optional)')" maxlength="1" />
                </template>
            </div>
            <ul v-if="createProblems.length" class="wl-vdisk__problems" role="status">
                <li v-for="p in createProblems" :key="p.message">{{ p.message }}</li>
            </ul>
            <p v-if="createType === 'dynamic'" class="wl-vdisk__hint">{{ t("vdisk.dynamicNote", "A dynamic disk does not reserve its full size; it can fill the host drive later if you let it grow.") }}</p>
            <div class="wl-vdisk__script-head">
                <h3>{{ t("vdisk.script", "Same thing as a script") }}</h3>
                <VBtn size="small" variant="text" :prepend-icon="mdiContentCopy" :disabled="!createScriptText" @click="copyText(createScriptText)">{{ t("vdisk.copy", "Copy") }}</VBtn>
            </div>
            <pre class="wl-vdisk__script">{{ createScriptText || t("vdisk.create.needPath", "Choose where to save the disk.") }}</pre>
            <VBtn color="primary" :prepend-icon="mdiHarddisk" :loading="busy" :disabled="createProblems.length > 0 || !status?.available" @click="create">{{ t("vdisk.createRun", "Create · Windows asks once") }}</VBtn>
        </section>

        <!-- Quick pack -->
        <section v-else-if="tab === 'pack'" class="wl-vdisk__panel" :aria-label="t('vdisk.tab.pack', 'Quick pack')">
            <p>{{ t("vdisk.pack.intro", "Drop files or folders. They are copied into one new VHDX in the folder they came from, checked file by file, and the disk is detached. Your originals are never moved, changed or deleted.") }}</p>
            <div
                class="wl-vdisk__drop"
                :class="{ 'is-active': dropActive }"
                role="button"
                tabindex="0"
                :aria-label="t('vdisk.pack.dropLabel', 'Drop files or folders here, or press Enter to choose a folder')"
                @dragenter.prevent="dropActive = true"
                @dragleave.prevent="dropActive = false"
                @dragover.prevent
                @drop.prevent.stop="onPackDrop"
                @keydown.enter.prevent="pickPackFolder"
                @click="pickPackFolder"
            >
                <svg width="32" height="32" viewBox="0 0 24 24" aria-hidden="true"><path :d="mdiPackageDown" fill="currentColor" /></svg>
                <strong>{{ t("vdisk.pack.drop", "Drop here to pack") }}</strong>
            </div>
            <div v-if="packing || packProgress" class="wl-vdisk__pack" aria-live="polite">
                <ol class="wl-vdisk__phases">
                    <li v-for="(p, i) in phases" :key="p.id" :class="{ done: i < phaseIndex, now: i === phaseIndex }">{{ p.label }}</li>
                </ol>
                <VProgressLinear :model-value="packPercent" :aria-label="t('vdisk.pack.progress', 'Packing progress')" />
                <p v-if="packProgress" class="wl-vdisk__hint">
                    {{ t("vdisk.pack.counts", { done: packProgress.filesDone, total: packProgress.filesTotal, bytes: formatBytes(packProgress.bytesDone), bytesTotal: formatBytes(packProgress.bytesTotal) }, "{done} of {total} files · {bytes} of {bytesTotal}") }}
                    <span v-if="packProgress.current" class="wl-vdisk__mono"> · {{ packProgress.current }}</span>
                </p>
                <p v-for="g in packProgress?.growths ?? []" :key="g.atFile" class="wl-vdisk__hint">{{ t("vdisk.pack.grew", { from: formatBytes(g.from), to: formatBytes(g.to), at: g.atFile }, "Grew {from} to {to} at file {at} and carried on.") }}</p>
                <VBtn v-if="packing" variant="outlined" color="error" @click="bridge?.cancelPack()">{{ t("vdisk.pack.cancel", "Cancel and remove the new VHDX") }}</VBtn>
            </div>
            <VAlert v-if="packResult" class="mt-3" :type="packResult.ok && !packResult.partial ? 'success' : packResult.cancelled ? 'info' : 'warning'" variant="tonal">
                <div>{{ packResult.message }}</div>
                <ul v-if="packResult.skipped.length" class="mt-1">
                    <li v-for="s in packResult.skipped" :key="s.path"><span class="wl-vdisk__mono">{{ s.path }}</span> · {{ s.reason }}</li>
                </ul>
            </VAlert>
        </section>

        <!-- Map inside a disk -->
        <section v-else class="wl-vdisk__panel" :aria-label="t('vdisk.tab.map', 'Map inside a disk')">
            <p>{{ t("vdisk.map.intro", "Keep a rendered map inside one VHDX instead of about a million small files: quicker to copy, back up, move or upload. Worldlens creates the disk, mounts it to a private folder without a drive letter, points map storage at it, and grows it when it fills.") }}</p>
            <div class="wl-vdisk__grid">
                <VTextField v-model.number="mapRegions" type="number" min="1" :label="t('vdisk.map.regions', 'Region files in the world')" :hint="t('vdisk.map.estimate', { size: formatBytes(mapEstimate) }, 'Starting size about {size}')" persistent-hint />
                <div class="wl-vdisk__row wl-vdisk__wide">
                    <VTextField v-model="mapPath" :label="t('vdisk.map.file', 'Virtual disk file')" />
                    <VBtn variant="outlined" :prepend-icon="mdiFolderOpenOutline" @click="browseMap">{{ t("vdisk.browse", "Browse") }}</VBtn>
                </div>
            </div>
            <VBtn color="primary" :prepend-icon="mdiDatabaseArrowDownOutline" :loading="busy" :disabled="!mapPath || !status?.available" @click="prepareMap">{{ t("vdisk.map.go", "Use this disk for map storage") }}</VBtn>
        </section>

        <section v-if="history.length" class="wl-vdisk__history" :aria-label="t('vdisk.history', 'Recent operations')">
            <h2>{{ t("vdisk.history", "Recent operations") }}</h2>
            <ul>
                <li v-for="h in history.slice(0, 12)" :key="h.at + h.path">
                    <span :class="h.ok ? 'ok' : 'bad'">{{ h.ok ? "✓" : "✕" }}</span>
                    {{ h.operation }} · <span class="wl-vdisk__mono">{{ h.path.split(/[\\/]/).pop() }}</span> · {{ h.route ? routeLabel(h.route as never) : "" }} · {{ new Date(h.at).toLocaleString() }}
                </li>
            </ul>
        </section>
    </section>
</template>

<style scoped>
.wl-vdisk { max-width: 1280px; margin: 0 auto; padding: 24px; display: flex; flex-direction: column; gap: 12px; }
.wl-vdisk__head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 16px; align-items: flex-end; }
.wl-vdisk__head h1 { margin: 0; font: var(--md-sys-typescale-headline-medium-font, 400 28px/36px Roboto, sans-serif); }
.wl-vdisk__head p { margin: 4px 0 0; color: rgb(var(--v-theme-on-surface-variant)); max-width: 72ch; }
.wl-vdisk__actions, .wl-vdisk__filters, .wl-vdisk__row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.wl-vdisk__row > * { flex: 1 1 140px; min-width: 0; }
.wl-vdisk__row > .v-btn { flex: 0 0 auto; }
.wl-vdisk__row--tight { flex-wrap: nowrap; }
.wl-vdisk__row--tight > :last-child { flex: 0 0 96px; }
.wl-vdisk__routes { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 8px 12px; border-radius: var(--md-sys-shape-corner-large, 16px); background: rgb(var(--v-theme-surface-container-low, var(--v-theme-surface))); }
.wl-vdisk__routes-label, .wl-vdisk__hint { color: rgb(var(--v-theme-on-surface-variant)); font-size: 13px; }
.wl-vdisk__checks { list-style: none; margin: 8px 0; padding: 0; display: grid; gap: 4px; font-size: 14px; }
.wl-vdisk__checks .is-ok { color: rgb(var(--v-theme-success)); }
.wl-vdisk__checks .is-bad { color: rgb(var(--v-theme-error)); }
.wl-vdisk__answer { margin-top: 12px; padding: 12px; border-radius: 16px; background: rgb(var(--v-theme-surface-variant)); }
.wl-vdisk__answer h3 { margin: 0 0 8px; font-size: 14px; }
.wl-vdisk__answer dd { overflow-wrap: anywhere; }
.wl-vdisk__split { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; margin-top: 12px; }
.wl-vdisk__library { flex: 999 1 560px; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.wl-vdisk__detail { flex: 1 1 360px; min-width: 0; display: flex; flex-direction: column; gap: 8px; padding: 20px; border-radius: var(--md-sys-shape-corner-extra-large, 28px); background: rgb(var(--v-theme-surface-container, var(--v-theme-surface))); }
.wl-vdisk__detail h2 { margin: 0; font-size: 20px; font-weight: 400; overflow-wrap: anywhere; }
.wl-vdisk__path { margin: 0; font-size: 13px; color: rgb(var(--v-theme-on-surface-variant)); overflow-wrap: anywhere; }
.wl-vdisk__facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 12px; margin: 4px 0 8px; }
.wl-vdisk__facts dt { font-size: 12px; color: rgb(var(--v-theme-on-surface-variant)); }
.wl-vdisk__facts dd { margin: 0; overflow-wrap: anywhere; }
.wl-vdisk__table-wrap { overflow-x: auto; border-radius: var(--md-sys-shape-corner-large, 16px); background: rgb(var(--v-theme-surface-container-low, var(--v-theme-surface))); }
.wl-vdisk__table { width: 100%; min-width: 560px; border-collapse: collapse; font-size: 14px; }
.wl-vdisk__table th { text-align: left; font-weight: 500; font-size: 12px; padding: 10px 12px; color: rgb(var(--v-theme-on-surface-variant)); }
.wl-vdisk__table td { padding: 8px 12px; border-top: 1px solid rgba(var(--v-theme-outline), 0.2); }
.wl-vdisk__table .num { text-align: right; font-variant-numeric: tabular-nums; }
.wl-vdisk__table tr.is-selected td { background: rgba(var(--v-theme-primary), 0.12); }
.wl-vdisk__name { border: 0; background: none; color: inherit; font: inherit; font-family: "Roboto Mono", monospace; cursor: pointer; text-align: left; padding: 0; min-height: 32px; }
.wl-vdisk__name:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.wl-vdisk__empty { text-align: center; color: rgb(var(--v-theme-on-surface-variant)); padding: 24px !important; }
.wl-vdisk__mono { font-family: "Roboto Mono", monospace; }
.wl-vdisk__script-head { display: flex; justify-content: space-between; align-items: center; }
.wl-vdisk__script-head h3 { margin: 0; font-size: 14px; font-weight: 500; }
.wl-vdisk__script { margin: 0 0 8px; padding: 12px; border-radius: var(--md-sys-shape-corner-medium, 12px); background: rgb(var(--v-theme-surface-container-lowest, var(--v-theme-background))); font: 12px/18px "Roboto Mono", monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
.wl-vdisk__panel { margin-top: 12px; display: flex; flex-direction: column; gap: 12px; padding: 20px; border-radius: var(--md-sys-shape-corner-extra-large, 28px); background: rgb(var(--v-theme-surface-container, var(--v-theme-surface))); }
.wl-vdisk__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px 16px; align-items: start; }
.wl-vdisk__wide { grid-column: 1 / -1; }
.wl-vdisk__problems { margin: 0; padding-left: 20px; color: rgb(var(--v-theme-error)); }
.wl-vdisk__drop { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 32px; border: 2px dashed rgba(var(--v-theme-outline), 0.6); border-radius: var(--md-sys-shape-corner-extra-large, 28px); cursor: pointer; transition: background-color var(--md-sys-motion-duration-short4, 200ms) var(--md-sys-motion-easing-standard, ease); }
.wl-vdisk__drop.is-active, .wl-vdisk__drop:hover { background: rgba(var(--v-theme-primary), 0.08); }
.wl-vdisk__drop:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.wl-vdisk__phases { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; list-style: none; padding: 0; margin: 0 0 8px; font-size: 12px; }
.wl-vdisk__phases li { padding-top: 6px; border-top: 4px solid rgba(var(--v-theme-outline), 0.3); color: rgb(var(--v-theme-on-surface-variant)); }
.wl-vdisk__phases li.done { border-color: rgb(var(--v-theme-primary)); color: inherit; }
.wl-vdisk__phases li.now { border-color: rgba(var(--v-theme-primary), 0.5); color: inherit; font-weight: 500; }
.wl-vdisk__history h2 { font-size: 16px; font-weight: 500; margin: 8px 0; }
.wl-vdisk__history ul { list-style: none; padding: 0; margin: 0; font-size: 13px; display: flex; flex-direction: column; gap: 4px; }
.wl-vdisk__history .ok { color: rgb(var(--v-theme-primary)); }
.wl-vdisk__history .bad { color: rgb(var(--v-theme-error)); }
.wl-sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (prefers-reduced-motion: reduce) { .wl-vdisk__drop { transition: none; } }
@media (max-width: 600px) { .wl-vdisk { padding: 12px; } }
</style>
