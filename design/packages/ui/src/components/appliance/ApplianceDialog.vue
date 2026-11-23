<script setup lang="ts">
/**
 * Build an appliance: a small Linux that boots straight into a finished map.
 *
 * Four targets (VMware, VirtualBox, a bootable USB drive, an exported image file). The main
 * process does the work and reports each step; this dialog only collects the settings, shows the
 * real step list and the real result. A link is shown only after the main process has fetched it
 * from this PC, and a declined permission prompt is shown as incomplete, never as done.
 */
import { sha256Hex } from "../remote/deployWorldLensModel.js";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { VBtn, VDialog } from "vuetify/components";
import {
    buildRequest,
    defaultForm,
    formatBytes,
    formProblem,
    planLabels,
    resolveApplianceBridge,
    type ApplianceBridge,
    type ApplianceProgressView,
    type ApplianceResultView,
    type ApplianceStepView,
    type ApplianceTarget,
    type ExportFormat,
    type ToolStatusView,
    type UsbDiskView, writesDrive } from "./applianceHost.js";

const props = defineProps<{ modelValue: boolean; mapRoot: string; bridge?: ApplianceBridge | null | undefined }>();
const emit = defineEmits<{ "update:modelValue": [value: boolean] }>();
const { t } = useI18n();

const bridge = computed<ApplianceBridge | null>(() => (props.bridge !== undefined ? props.bridge : resolveApplianceBridge()));
const form = ref(defaultForm());
const tools = ref<readonly ToolStatusView[]>([]);
const usbDisks = ref<readonly UsbDiskView[]>([]);
const steps = ref<readonly ApplianceStepView[]>([]);
const result = ref<ApplianceResultView | null>(null);
const busy = ref(false);
const copied = ref(false);
let stopProgress: (() => void) | null = null;

const isVm = computed(() => form.value.target === "vmware" || form.value.target === "virtualbox");
const problem = computed(() => (bridge.value ? formProblem(form.value, props.mapRoot, usbDisks.value) : "The appliance builder is not available in this build."));
const toolFor = (id: "vmware" | "virtualbox"): ToolStatusView | undefined => tools.value.find((x) => x.id === id);

const targets = computed(() => {
    const vm = toolFor("vmware");
    const vb = toolFor("virtualbox");
    const found = (x: ToolStatusView | undefined, name: string): string => (x?.found ? `${t("appliance.found", "found")}: ${name}${x.version ? ` ${x.version}` : ""}` : `${t("appliance.missing", "not found")}: ${name}`);
    return [
        { id: "vmware" as ApplianceTarget, label: t("appliance.target.vmware", "VMware Workstation"), body: t("appliance.target.vmBody", "Creates the virtual machine and starts it."), status: found(vm, "vmrun"), ok: vm?.found === true },
        { id: "virtualbox" as ApplianceTarget, label: t("appliance.target.virtualbox", "VirtualBox"), body: t("appliance.target.vmBody", "Creates the virtual machine and starts it."), status: found(vb, "VBoxManage"), ok: vb?.found === true },
        { id: "usb" as ApplianceTarget, label: t("appliance.target.usb", "Bootable USB"), body: t("appliance.target.usbBody", "Plug into any PC, boot from USB, the map serves itself."), status: `${t("appliance.usbDrives", "removable drives")}: ${usbDisks.value.length}`, ok: true },
        { id: "rpi" as ApplianceTarget, label: t("appliance.target.rpi", "Raspberry Pi"), body: t("appliance.target.rpiBody", "Write an SD card or USB drive for a Raspberry Pi 3, 4 or 5. Plug it in, power on, the map serves itself."), status: `${t("appliance.usbDrives", "removable drives")}: ${usbDisks.value.length}`, ok: true },
        { id: "export" as ApplianceTarget, label: t("appliance.target.export", "Export image"), body: t("appliance.target.exportBody", "Save the disk image to install by hand anywhere."), status: ".img · .vmdk · .vhdx · .ova", ok: true },
    ];
});

const formats: { id: ExportFormat; label: string }[] = [
    { id: "img", label: "Raw disk (.img)" },
    { id: "vmdk", label: "VMware disk (.vmdk)" },
    { id: "vhdx", label: "Hyper-V disk (.vhdx)" },
    { id: "ova", label: "Appliance (.ova)" },
];

const cta = computed(() => (form.value.target === "export" ? t("appliance.ctaExport", "Build and save the image") : form.value.target === "usb" ? t("appliance.ctaUsb", "Build and write the USB drive") : form.value.target === "rpi" ? t("appliance.ctaRpi", "Build and write the Raspberry Pi drive") : t("appliance.ctaVm", "Build and start")));
const confirmName = computed(() => usbDisks.value.find((d) => d.number === form.value.usbDiskNumber)?.name ?? "");
const readyTitle = computed(() => {
    const r = result.value;
    if (!r?.ok) return "";
    if (r.target === "export") return t("appliance.readyExport", "The image is saved");
    if (r.target === "usb") return t("appliance.readyUsb", "The USB drive is ready");
    if (r.target === "rpi") return t("appliance.readyRpi", "The Raspberry Pi drive is ready. Put it in the Pi and power it on.");
    return r.target === "vmware" ? t("appliance.readyVmware", "The appliance is up in VMware") : t("appliance.readyVirtualbox", "The appliance is up in VirtualBox");
});
const shown = computed(() => result.value?.link ?? result.value?.path ?? "");

async function refresh(): Promise<void> {
    const b = bridge.value;
    if (!b) return;
    tools.value = await b.tools().catch(() => []);
    usbDisks.value = await b.usbDisks().catch(() => []);
}

function resetSteps(): void {
    steps.value = planLabels(form.value.target).map((s) => ({ ...s, state: "pending" as const, meta: "" }));
}

watch(
    () => props.modelValue,
    (open) => {
        if (open) {
            result.value = null;
            resetSteps();
            void refresh();
            stopProgress?.();
            stopProgress = bridge.value?.onProgress((p: ApplianceProgressView) => {
                steps.value = p.steps;
            }) ?? null;
        } else {
            stopProgress?.();
            stopProgress = null;
        }
    },
    { immediate: true },
);
watch(() => form.value.target, () => {
    if (!busy.value) {
        result.value = null;
        resetSteps();
    }
});
onBeforeUnmount(() => stopProgress?.());

function pick(id: ApplianceTarget): void {
    if (!busy.value) form.value.target = id;
}

async function run(): Promise<void> {
    const b = bridge.value;
    if (!b || problem.value || busy.value) return;
    busy.value = true;
    result.value = null;
    resetSteps();
    try {
        const request = buildRequest(form.value, props.mapRoot);
        if (form.value.runApp) request.workload = { kind: "app", image: form.value.appImage.trim(), passwordSha256: await sha256Hex(form.value.appPassword) };
        if (form.value.runServer) request.workload = { kind: "minecraft", serverImage: form.value.serverImage.trim(), siteImage: form.value.siteImage.trim(), eulaAccepted: form.value.eulaAccepted, memoryGb: form.value.serverMemoryGb };
        result.value = await b.build(request);
        steps.value = result.value.steps.length ? result.value.steps : steps.value;
    } catch (error) {
        result.value = { ok: false, cancelled: false, target: form.value.target, link: null, path: null, message: error instanceof Error ? error.message : String(error), steps: steps.value };
    } finally {
        busy.value = false;
    }
}

async function browse(): Promise<void> {
    const dir = await bridge.value?.pickFolder?.();
    if (dir) form.value.exportDir = dir;
}

async function copy(): Promise<void> {
    try {
        await navigator.clipboard.writeText(shown.value);
        copied.value = true;
        setTimeout(() => (copied.value = false), 1800);
    } catch {
        copied.value = false;
    }
}

function open(): void {
    const r = result.value;
    if (!r) return;
    if (r.link) window.open(r.link, "_blank", "noopener");
    else if (r.path) void bridge.value?.reveal(r.path);
}
</script>

<template>
    <VDialog :model-value="modelValue" max-width="1180" scrollable @update:model-value="emit('update:modelValue', $event)">
        <div class="wl-appliance" role="dialog" aria-modal="true" :aria-label="t('appliance.title', 'Build an appliance')">
            <header class="wl-appliance__head">
                <h2>{{ t("appliance.title", "Build an appliance") }}</h2>
                <p>{{ t("appliance.subtitle", "A small Linux that boots straight into this map. Everything it needs ships inside Worldlens.") }}</p>
                <VBtn variant="text" class="wl-appliance__close" :aria-label="t('appliance.close', 'Close')" @click="emit('update:modelValue', false)">{{ t("appliance.close", "Close") }}</VBtn>
            </header>

            <div class="wl-appliance__targets" role="radiogroup" :aria-label="t('appliance.where', 'Where the appliance runs')">
                <button
                    v-for="target in targets"
                    :key="target.id"
                    type="button"
                    role="radio"
                    class="wl-appliance__tile"
                    :class="{ 'is-on': form.target === target.id }"
                    :aria-checked="form.target === target.id"
                    :disabled="busy"
                    :data-target="target.id"
                    @click="pick(target.id)"
                >
                    <span class="wl-appliance__tile-title">{{ target.label }}</span>
                    <span class="wl-appliance__tile-body">{{ target.body }}</span>
                    <span class="wl-appliance__tile-status" :class="{ 'is-missing': !target.ok }">{{ target.status }}</span>
                </button>
            </div>

            <div class="wl-appliance__body">
                <form class="wl-appliance__form" :aria-label="t('appliance.settings', 'Appliance settings')" @submit.prevent="run">
                    <template v-if="isVm">
                        <div class="wl-appliance__row">
                            <label>{{ t("appliance.vmName", "Virtual machine name") }}<input v-model="form.vmName" data-field="vmName" :disabled="busy" /></label>
                            <label>
                                {{ t("appliance.network", "Network") }}
                                <select v-model="form.network" data-field="network" :disabled="busy">
                                    <option value="bridged">{{ t("appliance.bridged", "Bridged: Ethernet (LAN)") }}</option>
                                    <option value="nat">{{ t("appliance.nat", "NAT with port forward") }}</option>
                                </select>
                            </label>
                        </div>
                        <label>
                            {{ t("appliance.memory", "Memory") }}: {{ form.memoryMb }} MB
                            <input v-model.number="form.memoryMb" type="range" min="256" max="4096" step="256" data-field="memory" :disabled="busy" />
                        </label>
                        <label>
                            {{ t("appliance.cpus", "Processors") }}: {{ form.cpus }}
                            <input v-model.number="form.cpus" type="range" min="1" max="8" step="1" data-field="cpus" :disabled="busy" />
                        </label>
                    </template>

                    <template v-if="writesDrive(form.target)">
                        <label>
                            {{ t("appliance.usbPick", "USB drive (removable disks only)") }}
                            <select v-model.number="form.usbDiskNumber" data-field="usbDisk" :disabled="busy" @focus="refresh">
                                <option :value="null">{{ t("appliance.usbChoose", "Choose a drive…") }}</option>
                                <option v-for="d in usbDisks" :key="d.number" :value="d.number">{{ d.name }} · {{ formatBytes(d.sizeBytes) }} · disk {{ d.number }}</option>
                            </select>
                        </label>
                        <div class="wl-appliance__danger" role="note">
                            {{ t("appliance.erase", "Everything on the chosen drive is erased. To confirm, type its name:") }}
                            <code>{{ confirmName || "…" }}</code>
                            <input v-model="form.usbConfirmName" :aria-label="t('appliance.eraseConfirm', 'Type the drive name to confirm')" :placeholder="confirmName" data-field="usbConfirm" :disabled="busy" />
                        </div>
                        <p class="wl-appliance__hint">{{ t("appliance.usbNote", "Writing a disk asks Windows for administrator approval once. The written image is read back and checked before it says done.") }}</p>
                    </template>

                    <template v-if="form.target === 'export'">
                        <fieldset class="wl-appliance__formats">
                            <legend>{{ t("appliance.format", "Image format") }}</legend>
                            <label v-for="f in formats" :key="f.id" class="wl-appliance__radio">
                                <input v-model="form.exportFormat" type="radio" name="fmt" :value="f.id" :disabled="busy" /> {{ f.label }}
                            </label>
                        </fieldset>
                        <label>
                            {{ t("appliance.saveTo", "Save to") }}
                            <span class="wl-appliance__path">
                                <input v-model="form.exportDir" data-field="exportDir" :disabled="busy" />
                                <VBtn v-if="bridge?.pickFolder" variant="outlined" :disabled="busy" @click="browse">{{ t("appliance.browse", "Browse") }}</VBtn>
                            </span>
                        </label>
                    </template>

                    <div class="wl-appliance__row">
                        <label>{{ t("appliance.host", "Host name") }}<input v-model="form.hostName" data-field="hostName" :disabled="busy" /></label>
                        <label>{{ t("appliance.port", "Web port") }}<input v-model="form.port" inputmode="numeric" data-field="port" :disabled="busy" /></label>
                    </div>
                    <label class="wl-appliance__check"><input v-model="form.askAccessCode" type="checkbox" data-field="askCode" :disabled="busy" /> {{ t("appliance.askCode", "Ask for an access code") }}</label>
                    <label v-if="form.askAccessCode">
                        {{ t("appliance.code", "Access code") }}
                        <input v-model="form.accessCode" type="password" autocomplete="new-password" data-field="accessCode" :disabled="busy" />
                    </label>

                    <label class="wl-appliance__check"><input v-model="form.runApp" type="checkbox" data-field="runApp" :disabled="busy" /> {{ t("appliance.runApp", "Run the whole WorldLens app, not only the map") }}</label>
                    <template v-if="form.runApp">
                        <label>
                            {{ t("appliance.appImage", "WorldLens app image (pinned by digest)") }}
                            <input v-model="form.appImage" data-field="appImage" autocomplete="off" placeholder="ghcr.io/ding-ding-projects/worldlens-hosted@sha256:…" :disabled="busy" />
                        </label>
                        <label>
                            {{ t("appliance.appPassword", "Password for the app") }}
                            <input v-model="form.appPassword" type="password" autocomplete="new-password" data-field="appPassword" :disabled="busy" />
                        </label>
                        <p class="wl-appliance__hint">{{ t("appliance.appNote", "The first start downloads the app, so the appliance needs internet once. The map is offered to the app read-only. Only a SHA-256 of the password is written to the image.") }}</p>
                    </template>
                    <label class="wl-appliance__check"><input v-model="form.runServer" type="checkbox" data-field="runServer" :disabled="busy" /> {{ t("appliance.runServer", "Run a Minecraft server with its management site") }}</label>
                    <template v-if="form.runServer">
                        <label>
                            {{ t("appliance.serverImage", "Minecraft server image (pinned by digest)") }}
                            <input v-model="form.serverImage" data-field="serverImage" autocomplete="off" :disabled="busy" />
                        </label>
                        <label>
                            {{ t("appliance.siteImage", "Management site image (pinned by digest)") }}
                            <input v-model="form.siteImage" data-field="siteImage" autocomplete="off" placeholder="ghcr.io/ding-ding-projects/worldlens-server-site@sha256:…" :disabled="busy" />
                        </label>
                        <label>
                            {{ t("appliance.serverMemory", { gb: form.serverMemoryGb }, "Server memory: {gb} GB") }}
                            <input v-model.number="form.serverMemoryGb" type="range" min="1" max="16" step="1" data-field="serverMemory" :disabled="busy" />
                        </label>
                        <label class="wl-appliance__check"><input v-model="form.eulaAccepted" type="checkbox" data-field="eula" :disabled="busy" /> {{ t("appliance.eula", "I accept the Minecraft EULA (minecraft.net/eula)") }}</label>
                        <p class="wl-appliance__hint">{{ t("appliance.serverNote", "Players join on port 25565 (Java) and 19132 (Bedrock). The management site opens on the web port; the first person to open it becomes the owner.") }}</p>
                    </template>
                    <p v-if="problem" class="wl-appliance__hint" data-role="problem">{{ problem }}</p>
                    <button type="submit" class="wl-appliance__cta" data-action="build" :disabled="busy || !!problem">{{ busy ? t("appliance.working", "Working…") : cta }}</button>
                </form>

                <section class="wl-appliance__progress" :aria-label="t('appliance.progress', 'Build progress')">
                    <ol class="wl-appliance__steps">
                        <li v-for="s in steps" :key="s.id" :data-state="s.state">
                            <span class="wl-appliance__dot" :class="`is-${s.state}`" aria-hidden="true" />
                            <span class="wl-appliance__step-label">{{ s.label }}</span>
                            <span class="wl-appliance__step-meta">{{ s.state === "running" ? t("appliance.stepWorking", "working…") : s.state === "failed" ? t("appliance.stepFailed", "failed") : s.meta }}</span>
                        </li>
                    </ol>

                    <div v-if="result?.ok" class="wl-appliance__ready" role="status" aria-live="polite" data-role="ready">
                        <strong>{{ readyTitle }}</strong>
                        <div class="wl-appliance__ready-row">
                            <code data-role="link">{{ shown }}</code>
                            <VBtn color="primary" @click="open">{{ t("appliance.open", "Open") }}</VBtn>
                            <VBtn variant="outlined" data-action="copy" @click="copy">{{ copied ? t("appliance.copied", "Copied") : result.link ? t("appliance.copyLink", "Copy link") : t("appliance.copyPath", "Copy path") }}</VBtn>
                        </div>
                        <span class="wl-appliance__hint">{{ result.link ? t("appliance.readyNote", "Address reported by the appliance and checked from this PC.") : t("appliance.exportNote", "SHA256SUMS and INSTALL.txt sit beside it. Open shows the folder; Copy copies the path.") }}</span>
                    </div>
                    <div v-else-if="result" class="wl-appliance__failed" role="alert" data-role="failed">
                        <strong>{{ result.cancelled ? t("appliance.declined", "Not done: the Windows permission prompt was declined") : t("appliance.failed", "Not done") }}</strong>
                        <span>{{ result.message }}</span>
                    </div>
                </section>
            </div>
        </div>
    </VDialog>
</template>

<style scoped>
.wl-appliance {
    background: rgb(var(--v-theme-background));
    color: rgb(var(--v-theme-on-background));
    border-radius: 20px;
    padding: 24px 28px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    overflow: auto;
    max-height: 92vh;
}
.wl-appliance__head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.wl-appliance__head h2 { margin: 0; font-size: 1.5rem; font-weight: 500; }
.wl-appliance__head p { margin: 0; flex: 1 1 280px; font-size: 0.8125rem; opacity: 0.8; }
.wl-appliance__targets { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; }
.wl-appliance__tile {
    text-align: left; display: flex; flex-direction: column; gap: 6px; padding: 14px 16px; border-radius: 16px; cursor: pointer;
    border: 1px solid rgb(var(--v-theme-outline-variant, var(--v-theme-on-surface-variant)));
    background: rgb(var(--v-theme-surface));
    color: inherit; font: inherit; min-height: 48px;
    transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1);
}
.wl-appliance__tile:hover:not(:disabled) { transform: translateY(-2px); }
.wl-appliance__tile.is-on { border: 2px solid rgb(var(--v-theme-primary)); }
.wl-appliance__tile:focus-visible, .wl-appliance input:focus-visible, .wl-appliance select:focus-visible, .wl-appliance__cta:focus-visible { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.wl-appliance__tile-title { font-size: 1rem; font-weight: 500; }
.wl-appliance__tile-body { font-size: 0.75rem; opacity: 0.8; line-height: 1.4; }
.wl-appliance__tile-status { font-family: "Roboto Mono", monospace; font-size: 0.6875rem; color: rgb(var(--v-theme-primary)); }
.wl-appliance__tile-status.is-missing { color: rgb(var(--v-theme-error)); }
.wl-appliance__body { display: flex; gap: 20px; flex-wrap: wrap; }
.wl-appliance__form { flex: 1 1 360px; max-width: 480px; background: rgb(var(--v-theme-surface)); border-radius: 16px; padding: 18px; display: flex; flex-direction: column; gap: 12px; }
.wl-appliance__progress { flex: 1 1 320px; min-width: 0; display: flex; flex-direction: column; gap: 14px; }
.wl-appliance label { display: flex; flex-direction: column; gap: 4px; font-size: 0.75rem; opacity: 0.95; }
.wl-appliance input:not([type="range"]):not([type="checkbox"]):not([type="radio"]), .wl-appliance select {
    height: 44px; border-radius: 8px; padding: 0 12px; font: inherit; font-size: 0.875rem;
    border: 1px solid rgb(var(--v-theme-outline-variant, var(--v-theme-on-surface-variant))); background: rgb(var(--v-theme-surface-variant, var(--v-theme-surface))); color: inherit;
}
.wl-appliance input[type="range"] { accent-color: rgb(var(--v-theme-primary)); min-height: 32px; }
.wl-appliance__row { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
.wl-appliance__check, .wl-appliance__radio { flex-direction: row !important; align-items: center; gap: 10px !important; font-size: 0.875rem !important; min-height: 32px; }
.wl-appliance__formats { border: 0; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 4px 12px; }
.wl-appliance__formats legend { font-size: 0.8125rem; font-weight: 500; margin-bottom: 6px; }
.wl-appliance__path { display: flex; gap: 8px; align-items: center; }
.wl-appliance__path input { flex: 1; min-width: 0; }
.wl-appliance__danger { border: 2px solid rgb(var(--v-theme-error)); border-radius: 12px; padding: 12px; font-size: 0.8125rem; display: flex; flex-direction: column; gap: 8px; }
.wl-appliance__hint { margin: 0; font-size: 0.75rem; opacity: 0.85; }
.wl-appliance__cta { height: 48px; border-radius: 24px; border: 0; background: rgb(var(--v-theme-primary)); color: rgb(var(--v-theme-on-primary)); font: inherit; font-weight: 500; font-size: 0.9375rem; cursor: pointer; margin-top: auto; }
.wl-appliance__cta:disabled { opacity: 0.5; cursor: not-allowed; }
.wl-appliance__steps { list-style: none; margin: 0; padding: 16px 18px; background: rgb(var(--v-theme-surface)); border-radius: 16px; display: flex; flex-direction: column; gap: 11px; }
.wl-appliance__steps li { display: flex; align-items: center; gap: 12px; font-size: 0.875rem; }
.wl-appliance__step-label { flex: 1; min-width: 0; }
.wl-appliance__step-meta { font-family: "Roboto Mono", monospace; font-size: 0.75rem; opacity: 0.85; }
.wl-appliance__dot { width: 22px; height: 22px; border-radius: 11px; border: 2px solid rgb(var(--v-theme-outline, var(--v-theme-on-surface-variant))); flex-shrink: 0; }
.wl-appliance__dot.is-done { background: rgb(var(--v-theme-primary)); border-color: rgb(var(--v-theme-primary)); }
.wl-appliance__dot.is-running { border-color: rgb(var(--v-theme-primary)); animation: wl-appliance-pulse 1.4s ease-in-out infinite; }
.wl-appliance__dot.is-failed { background: rgb(var(--v-theme-error)); border-color: rgb(var(--v-theme-error)); }
.wl-appliance__ready { background: rgb(var(--v-theme-primary-container, var(--v-theme-primary))); color: rgb(var(--v-theme-on-primary-container, var(--v-theme-on-primary))); border-radius: 16px; padding: 16px 18px; display: flex; flex-direction: column; gap: 10px; animation: wl-appliance-pop 0.42s cubic-bezier(0.05, 0.7, 0.1, 1); }
.wl-appliance__ready strong { font-size: 1.125rem; font-weight: 500; }
.wl-appliance__ready-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.wl-appliance__ready code { flex: 1 1 240px; min-width: 0; overflow-wrap: anywhere; background: rgba(0, 0, 0, 0.28); padding: 10px 14px; border-radius: 10px; font: 500 0.9375rem "Roboto Mono", monospace; }
.wl-appliance__failed { border: 2px solid rgb(var(--v-theme-error)); border-radius: 16px; padding: 14px 18px; display: flex; flex-direction: column; gap: 6px; font-size: 0.875rem; }
@keyframes wl-appliance-pulse { 50% { opacity: 0.45; } }
@keyframes wl-appliance-pop { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
    .wl-appliance__tile, .wl-appliance__dot, .wl-appliance__ready { animation: none !important; transition: none !important; }
}
@media (max-width: 420px) {
    .wl-appliance { padding: 16px; }
}
</style>
