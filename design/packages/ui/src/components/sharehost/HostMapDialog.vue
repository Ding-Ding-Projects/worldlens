<script setup lang="ts">
/**
 * "Host the map": one dialog from a finished render to a working link.
 *
 * Follows `design/design-sources/share-and-host/HostMap.dc.html`: a target switch (this PC or
 * an SSH host), an instance name, a port that is checked as free, the maps to include, three
 * switches, a five-step progress list, and then either the ready card (link, Open, Copy, a
 * one-time access code) or the failure card (the exact command, its exit code, the last output
 * and a one-click fix).
 *
 * ## What the dialog will not do
 *
 * It never calls the map ready on its own say-so: the ready card appears only from the `ready`
 * event the main process sends after it has opened the link from this PC. The access code is
 * held in this component only until the dialog closes; it is never written to storage.
 */
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { VBtn, VDialog, VSnackbar } from "vuetify/components";
import {
    formatBytes, resolveShareHostBridge,
    type HostFailure, type HostMapEvent, type HostResult, type HostStep, type HostTarget, type MapChoice, type ShareHostBridge,
} from "./shareHostBridge.js";

const props = withDefaults(defineProps<{
    modelValue: boolean;
    renderId: string;
    /** What the render is called on screen. */
    renderLabel?: string;
    /** Saved SSH hosts to choose from. */
    sshHosts?: readonly { readonly id: string; readonly label: string }[];
    /** Injected in tests; production resolves the real bridge. */
    bridge?: ShareHostBridge | null;
}>(), { renderLabel: "", sshHosts: () => [] });
const emit = defineEmits<{ "update:modelValue": [value: boolean] }>();
const { t } = useI18n();

const bridge = computed<ShareHostBridge | null>(() => (props.bridge === undefined ? resolveShareHostBridge() : props.bridge));

type Stage = "configure" | "progress" | "ready" | "failed";
const STEPS: readonly HostStep[] = ["load-image", "pack", "copy", "start", "health"];

const stage = ref<Stage>("configure");
const kind = ref<"local" | "ssh">("local");
const sshId = ref("");
const name = ref("");
const port = ref("8100");
const maps = ref<readonly MapChoice[]>([]);
const chosen = ref<Set<string>>(new Set());
const startOnBoot = ref(true);
const accessCode = ref(true);
const lan = ref(true);
const hostNote = ref("");
const portNote = ref("");
const steps = ref<Record<string, { state: "idle" | "running" | "done" | "failed"; meta: string }>>({});
const result = ref<HostResult | null>(null);
const failure = ref<HostFailure | null>(null);
const copied = ref("");
const copiedOpen = ref(false);
let operationId: string | null = null;
let unsubscribe: (() => void) | null = null;

const stepLabel = (step: HostStep): string => ({
    "load-image": t("hostMap.step.load", "Load the bundled map server image"),
    pack: t("hostMap.step.pack", "Pack the rendered map"),
    copy: t("hostMap.step.copy", "Copy it into a private volume"),
    start: t("hostMap.step.start", "Start the container"),
    health: t("hostMap.step.health", "Check health and the network link"),
})[step];

const target = computed<HostTarget>(() => (kind.value === "local" ? { kind: "local" } : { kind: "ssh", targetId: sshId.value }));
const portNumber = computed(() => Number(port.value));
const portValid = computed(() => /^\d+$/.test(port.value) && portNumber.value >= 1 && portNumber.value <= 65535);
const canHost = computed(() => bridge.value !== null && name.value.trim() !== "" && portValid.value && chosen.value.size > 0 && (kind.value === "local" || sshId.value !== "") && stage.value !== "progress");
const whereLabel = computed(() => (kind.value === "local" ? t("hostMap.thisPc", "this PC") : props.sshHosts.find((h) => h.id === sshId.value)?.label ?? ""));
const switches = computed(() => [
    { key: "boot", label: t("hostMap.sw.boot", "Start again when the computer starts"), help: t("hostMap.sw.bootHelp", "Restarts unless you stop it."), model: startOnBoot },
    { key: "code", label: t("hostMap.sw.code", "Ask for an access code"), help: t("hostMap.sw.codeHelp", "A viewer name and generated code protect the map."), model: accessCode },
    { key: "lan", label: t("hostMap.sw.lan", "Reachable on my network"), help: t("hostMap.sw.lanHelp", "Off keeps it on this computer only."), model: lan },
]);

function resetRun(): void {
    steps.value = Object.fromEntries(STEPS.map((s) => [s, { state: "idle", meta: "" }]));
    result.value = null;
    failure.value = null;
}

async function loadContext(): Promise<void> {
    const b = bridge.value;
    if (b === null) return;
    try {
        maps.value = await b.maps(props.renderId);
        chosen.value = new Set(maps.value.map((m) => m.id));
    } catch { maps.value = []; }
    await refreshTarget();
}

async function refreshTarget(): Promise<void> {
    const b = bridge.value;
    if (b === null) return;
    if (kind.value === "ssh" && sshId.value === "") { hostNote.value = t("hostMap.chooseSsh", "Choose a saved SSH host."); return; }
    try {
        const check = await b.check(target.value);
        hostNote.value = check.ok
            ? kind.value === "local"
                ? t("hostMap.dockerLocal", { version: check.dockerVersion ?? "" }, "Docker on this PC: running {version}. The map server image ships inside Worldlens.")
                : t("hostMap.dockerSsh", { version: check.dockerVersion ?? "", arch: check.arch ?? "" }, "Docker on that host: found {version} {arch}.")
            : check.message;
    } catch (error) { hostNote.value = error instanceof Error ? error.message : String(error); }
    await refreshPort();
}

async function refreshPort(): Promise<void> {
    const b = bridge.value;
    if (b === null || !portValid.value) { portNote.value = ""; return; }
    try {
        const check = await b.checkPort(target.value, portNumber.value);
        portNote.value = check.free
            ? t("hostMap.portFree", "free: checked")
            : t("hostMap.portTaken", { port: String(check.suggested) }, "in use, {port} is free");
    } catch { portNote.value = ""; }
}

watch(() => props.modelValue, (open) => {
    if (open) {
        stage.value = "configure";
        resetRun();
        if (name.value === "") name.value = props.renderLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "map";
        void loadContext();
    } else dispose();
}, { immediate: true });

watch(kind, () => { void refreshTarget(); });
watch(sshId, () => { void refreshTarget(); });

function onEvent(id: string, event: HostMapEvent): void {
    if (id !== operationId) return;
    if (event.type === "step") steps.value = { ...steps.value, [event.step]: { state: event.state, meta: event.meta } };
}

async function hostNow(): Promise<void> {
    const b = bridge.value;
    if (b === null || !canHost.value) return;
    resetRun();
    stage.value = "progress";
    operationId = `host-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`;
    unsubscribe?.();
    unsubscribe = b.onEvent(onEvent);
    try {
        const outcome = await b.host({
            renderId: props.renderId, target: target.value, name: name.value.trim(), port: portNumber.value,
            maps: [...chosen.value], startOnBoot: startOnBoot.value, accessCode: accessCode.value, lan: lan.value,
        }, operationId);
        if (outcome.ok) { result.value = outcome.result; stage.value = "ready"; }
        else { failure.value = outcome.failure; stage.value = "failed"; }
    } catch (error) {
        failure.value = { step: "check", message: error instanceof Error ? error.message : String(error), command: null, exitCode: null, output: "", fix: null };
        stage.value = "failed";
    }
}

async function cancel(): Promise<void> {
    if (operationId !== null) await bridge.value?.cancel(operationId);
}

async function applyFix(): Promise<void> {
    const fix = failure.value?.fix;
    if (fix === null || fix === undefined) return;
    port.value = String(fix.port);
    await hostNow();
}

async function copyText(text: string, what: string): Promise<void> {
    try {
        await navigator.clipboard.writeText(text);
        copied.value = what;
        copiedOpen.value = true;
    } catch { copied.value = ""; }
}

function failureText(f: HostFailure): string {
    return [f.command ?? "", f.exitCode === null ? "" : `exit ${String(f.exitCode)}`, f.output].filter(Boolean).join("\n");
}

function open(): void {
    const url = result.value?.link;
    if (url === undefined) return;
    if (bridge.value?.openExternal) bridge.value.openExternal(url);
    else window.open(url, "_blank", "noopener,noreferrer");
}

function toggleMap(id: string): void {
    const next = new Set(chosen.value);
    if (next.has(id)) next.delete(id); else next.add(id);
    chosen.value = next;
}

function dispose(): void {
    unsubscribe?.();
    unsubscribe = null;
    // The access code is shown once: closing the dialog is the end of it.
    result.value = null;
}

function close(): void { emit("update:modelValue", false); }
onBeforeUnmount(dispose);
</script>

<template>
    <v-dialog :model-value="modelValue" max-width="1080" scrollable @update:model-value="emit('update:modelValue', $event)">
        <div class="hm" role="dialog" aria-modal="true" :aria-label="t('hostMap.title', 'Host the map')" data-testid="host-map">
            <header class="hm__head">
                <h2 class="hm__title">{{ t("hostMap.title", "Host the map") }}</h2>
                <span v-if="renderLabel" class="hm__sub">{{ renderLabel }}</span>
                <v-btn class="hm__close" variant="text" @click="close">{{ t("hostMap.close", "Close") }}</v-btn>
            </header>

            <p v-if="bridge === null" class="hm__note" role="alert">
                {{ t("hostMap.unavailable", "Hosting is not available in this build.") }}
            </p>

            <div v-else class="hm__body">
                <form class="hm__form" :aria-label="t('hostMap.formLabel', 'Hosting settings')" @submit.prevent="hostNow">
                    <fieldset class="hm__group">
                        <legend>{{ t("hostMap.where", "Where it runs") }}</legend>
                        <div class="hm__seg" role="radiogroup" :aria-label="t('hostMap.where', 'Where it runs')">
                            <button type="button" role="radio" :aria-checked="kind === 'local'" :class="{ on: kind === 'local' }" data-testid="target-local" @click="kind = 'local'">{{ t("hostMap.thisPc", "this PC") }}</button>
                            <button type="button" role="radio" :aria-checked="kind === 'ssh'" :class="{ on: kind === 'ssh' }" data-testid="target-ssh" @click="kind = 'ssh'">{{ t("hostMap.ssh", "SSH host") }}</button>
                        </div>
                        <label v-if="kind === 'ssh'" class="hm__field">
                            <span>{{ t("hostMap.sshHost", "SSH host (saved targets)") }}</span>
                            <select v-model="sshId" data-testid="ssh-select">
                                <option value="" disabled>{{ t("hostMap.chooseSsh", "Choose a saved SSH host.") }}</option>
                                <option v-for="h in sshHosts" :key="h.id" :value="h.id">{{ h.label }}</option>
                            </select>
                        </label>
                        <span class="hm__hint" data-testid="host-note">{{ hostNote }}</span>
                    </fieldset>

                    <div class="hm__pair">
                        <label class="hm__field"><span>{{ t("hostMap.name", "Instance name") }}</span><input v-model="name" maxlength="40" data-testid="name"></label>
                        <label class="hm__field"><span>{{ t("hostMap.port", "Port") }} <em data-testid="port-note">({{ portNote }})</em></span><input v-model="port" inputmode="numeric" class="mono" data-testid="port" @change="refreshPort"></label>
                    </div>

                    <fieldset class="hm__group">
                        <legend>{{ t("hostMap.maps", "Maps to include") }}</legend>
                        <label v-for="m in maps" :key="m.id" class="hm__check">
                            <input type="checkbox" :checked="chosen.has(m.id)" :data-testid="`map-${m.id}`" @change="toggleMap(m.id)">
                            {{ m.id }} · {{ formatBytes(m.bytes) }}
                        </label>
                        <span v-if="maps.length === 0" class="hm__hint">{{ t("hostMap.noMaps", "This render has no maps to host.") }}</span>
                    </fieldset>

                    <div v-for="s in switches" :key="s.key" class="hm__switch">
                        <span class="hm__switchText"><span>{{ s.label }}</span><span class="hm__hint">{{ s.help }}</span></span>
                        <button type="button" role="switch" :aria-checked="s.model.value" :aria-label="s.label" class="hm__toggle" :class="{ on: s.model.value }" :data-testid="`switch-${s.key}`" @click="s.model.value = !s.model.value"><span /></button>
                    </div>

                    <div class="hm__actions">
                        <v-btn v-if="stage === 'progress'" variant="outlined" data-testid="cancel" @click="cancel">{{ t("hostMap.cancel", "Cancel") }}</v-btn>
                        <v-btn color="primary" type="submit" size="large" :disabled="!canHost" data-testid="host-now">{{ t("hostMap.hostNow", "Host now") }}</v-btn>
                    </div>
                </form>

                <section class="hm__side" :aria-label="t('hostMap.progress', 'Progress and result')">
                    <ol class="hm__steps">
                        <li v-for="s in STEPS" :key="s" :data-state="steps[s]?.state ?? 'idle'">
                            <span class="hm__dot" aria-hidden="true" />
                            <span class="hm__stepLabel">{{ stepLabel(s) }}</span>
                            <span class="hm__meta">{{ steps[s]?.state === "running" ? t("hostMap.working", "working…") : steps[s]?.meta }}</span>
                        </li>
                    </ol>

                    <div v-if="stage === 'ready' && result" class="hm__ready" role="status" aria-live="polite" data-testid="ready">
                        <strong>{{ t("hostMap.ready", { where: result.where }, "The map is up on {where}") }}</strong>
                        <div class="hm__linkRow">
                            <code data-testid="link">{{ result.link }}</code>
                            <v-btn color="primary" data-testid="open" @click="open">{{ t("hostMap.open", "Open") }}</v-btn>
                            <v-btn variant="outlined" data-testid="copy-link" @click="copyText(result.link, t('hostMap.copiedLink', 'Link copied'))">{{ t("hostMap.copyLink", "Copy link") }}</v-btn>
                        </div>
                        <div v-if="result.accessCode" class="hm__linkRow hm__small">
                            <span>{{ t("hostMap.viewer", "Viewer name") }} <code>{{ result.accessName }}</code> · {{ t("hostMap.code", "access code") }}</span>
                            <code data-testid="code">{{ result.accessCode }}</code>
                            <v-btn size="small" variant="outlined" data-testid="copy-code" @click="copyText(result.accessCode ?? '', t('hostMap.copiedCode', 'Access code copied'))">{{ t("hostMap.copyCode", "Copy code") }}</v-btn>
                            <span class="hm__hint">{{ t("hostMap.shownOnce", "Shown once.") }}</span>
                        </div>
                    </div>

                    <div v-if="stage === 'failed' && failure" class="hm__failed" role="alert" data-testid="failed">
                        <strong>{{ t("hostMap.failed", "Hosting did not finish") }}</strong>
                        <p>{{ failure.message }}</p>
                        <pre v-if="failure.command || failure.output" data-testid="failure-detail">{{ failureText(failure) }}</pre>
                        <div class="hm__actions">
                            <v-btn v-if="failure.fix" data-testid="fix" @click="applyFix">{{ failure.fix.label }}</v-btn>
                            <v-btn variant="outlined" data-testid="copy-details" @click="copyText(failureText(failure), t('hostMap.copiedDetails', 'Details copied'))">{{ t("hostMap.copyDetails", "Copy details") }}</v-btn>
                        </div>
                    </div>
                </section>
            </div>
            <v-snackbar v-model="copiedOpen" :timeout="2500">{{ copied }}</v-snackbar>
        </div>
    </v-dialog>
</template>

<style scoped>
.hm { background: rgb(var(--v-theme-background)); color: rgb(var(--v-theme-on-background)); border-radius: 24px; padding: 20px 24px 24px; display: flex; flex-direction: column; gap: 16px; max-height: 92vh; overflow: auto; }
.hm__head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.hm__title { margin: 0; font-size: 22px; font-weight: 500; }
.hm__sub, .hm__hint { font-size: 12px; opacity: 0.75; }
.hm__close { margin-inline-start: auto; }
.hm__body { display: grid; grid-template-columns: minmax(0, 470px) minmax(0, 1fr); gap: 24px; }
.hm__form, .hm__steps, .hm__ready, .hm__failed { background: rgb(var(--v-theme-surface)); border-radius: 16px; padding: 20px; }
.hm__form { display: flex; flex-direction: column; gap: 16px; }
.hm__group { border: 0; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.hm__group legend { font-size: 13px; font-weight: 500; margin-bottom: 8px; }
.hm__seg { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid rgb(var(--v-theme-outline, 140 145 153)); border-radius: 20px; overflow: hidden; }
.hm__seg button { height: 44px; border: 0; background: transparent; color: inherit; font: inherit; font-weight: 500; cursor: pointer; }
.hm__seg button.on { background: rgb(var(--v-theme-secondary-container, 56 73 86)); }
.hm__pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.hm__field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
.hm__field input, .hm__field select { height: 44px; border-radius: 8px; border: 1px solid rgb(var(--v-theme-outline, 140 145 153)); background: transparent; color: inherit; padding: 0 12px; font: inherit; font-size: 14px; }
.hm__field em { font-style: normal; opacity: 0.75; }
.mono, code, pre { font-family: "Roboto Mono", ui-monospace, monospace; }
.hm__check { display: flex; align-items: center; gap: 10px; min-height: 44px; font-size: 14px; }
.hm__check input { width: 20px; height: 20px; }
.hm__switch { display: flex; align-items: center; gap: 12px; }
.hm__switchText { flex: 1; display: flex; flex-direction: column; gap: 2px; font-size: 14px; }
.hm__toggle { width: 52px; height: 32px; border-radius: 16px; border: 2px solid rgb(var(--v-theme-outline, 140 145 153)); background: transparent; position: relative; cursor: pointer; flex-shrink: 0; }
.hm__toggle span { position: absolute; top: 4px; left: 4px; width: 20px; height: 20px; border-radius: 10px; background: rgb(var(--v-theme-outline, 140 145 153)); transition: left 0.2s; }
.hm__toggle.on { background: rgb(var(--v-theme-primary)); border-color: rgb(var(--v-theme-primary)); }
.hm__toggle.on span { left: 26px; background: rgb(var(--v-theme-on-primary)); }
.hm__actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; margin-top: auto; }
.hm__side { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.hm__steps { list-style: none; margin: 0; display: flex; flex-direction: column; gap: 12px; }
.hm__steps li { display: flex; align-items: center; gap: 12px; font-size: 14px; }
.hm__stepLabel { flex: 1; }
.hm__meta { font-family: "Roboto Mono", monospace; font-size: 12px; opacity: 0.75; }
.hm__dot { width: 22px; height: 22px; border-radius: 11px; border: 2px solid rgb(var(--v-theme-outline, 140 145 153)); flex-shrink: 0; }
li[data-state="done"] .hm__dot { background: rgb(var(--v-theme-primary)); border-color: rgb(var(--v-theme-primary)); }
li[data-state="failed"] .hm__dot { background: rgb(var(--v-theme-error)); border-color: rgb(var(--v-theme-error)); }
li[data-state="running"] .hm__dot { border-color: rgb(var(--v-theme-primary)); animation: hmpulse 1.4s ease-in-out infinite; }
.hm__ready { background: rgb(var(--v-theme-primary-container, 0 75 115)); color: rgb(var(--v-theme-on-primary-container, 206 229 255)); display: flex; flex-direction: column; gap: 12px; animation: hmpop 0.42s cubic-bezier(0.05, 0.7, 0.1, 1); }
.hm__failed { background: rgb(var(--v-theme-error-container, 147 0 10)); color: rgb(var(--v-theme-on-error-container, 255 218 214)); display: flex; flex-direction: column; gap: 10px; animation: hmpop 0.42s cubic-bezier(0.05, 0.7, 0.1, 1); }
.hm__failed p { margin: 0; }
.hm__failed pre { background: rgba(0, 0, 0, 0.3); padding: 10px 14px; border-radius: 10px; font-size: 13px; white-space: pre-wrap; overflow-wrap: anywhere; margin: 0; }
.hm__linkRow { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.hm__linkRow code { flex: 1 1 260px; min-width: 0; overflow-wrap: anywhere; background: rgba(0, 0, 0, 0.28); padding: 10px 14px; border-radius: 10px; font-size: 15px; }
.hm__small { font-size: 13px; }
.hm__small code { flex: 0 1 auto; padding: 4px 10px; font-size: 13px; }
.hm__note { margin: 0; }
@keyframes hmpulse { 50% { opacity: 0.45; } }
@keyframes hmpop { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
    .hm__ready, .hm__failed, li[data-state="running"] .hm__dot { animation: none; }
    .hm__toggle span { transition: none; }
}
/* On a phone the two columns stack, settings first and the result under them. */
@media (max-width: 760px) {
    .hm { padding: 16px; border-radius: 16px; }
    .hm__body { grid-template-columns: minmax(0, 1fr); gap: 16px; }
    .hm__pair { grid-template-columns: minmax(0, 1fr); }
}
.hm button:focus-visible, .hm input:focus-visible, .hm select:focus-visible { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
</style>
