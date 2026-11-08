<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiContentCopy, mdiDownload, mdiFileUploadOutline, mdiFolderOpenOutline, mdiMicrosoftVisualStudioCode, mdiRedo, mdiSwapHorizontal, mdiUndo } from "@mdi/js";
import { editorBridge } from "../editors/editorBridge.js";
import { VAlert, VBtn, VBtnToggle, VCheckbox, VNumberInput, VProgressLinear, VSelect, VSwitch, VTab, VTabs, VTextarea, VTextField } from "vuetify/components";
import InfoButton from "../info/InfoButton.vue";
import {
    buildDataUrl,
    decodedFileName,
    encodeBytes,
    parseDataUrl,
    restoredName,
    sidecarName,
    sniffMime,
    storeZip,
    type Base64Alphabet,
    type TextEncodingName,
} from "@worldlens/shared/base64";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import { playActionCue } from "../../stores/actionSounds.js";
import Base64Preview from "./Base64Preview.vue";
import { Base64History, conversionRecord, convert, sha256Hex, variantLabel, type Base64Workspace, type HistoryEntry } from "./base64Store.js";

/**
 * The Base64 toolkit. Text runs entirely in this window. Files go to the desktop's streaming
 * route, which writes `name.ext.base64.txt` beside the file and restores `name.ext` from it,
 * never overwriting and checking a SHA-256 round trip. Without the desktop bridge (a hosted
 * workspace or the site) files are read here and the result is downloaded under the same names.
 */

interface FileBridge {
    encodeFile(source: string, options: unknown, jobId?: string): Promise<FileResult>;
    decodeFile(source: string, jobId?: string): Promise<FileResult>;
    pause(jobId: string): Promise<boolean>;
    resume(jobId: string): Promise<boolean>;
    cancel(jobId: string): Promise<boolean>;
    readHead(file: string): Promise<Uint8Array>;
    saveAs(suggestedName: string, bytes: Uint8Array): Promise<{ ok: boolean; path: string | null; message: string }>;
    reveal(file: string): Promise<boolean>;
    onProgress(listener: (progress: { jobId: string; bytesDone: number; bytesTotal: number; paused: boolean }) => void): () => void;
}
interface FileResult {
    readonly ok: boolean;
    readonly cancelled: boolean;
    readonly jobId: string;
    readonly direction: "encode" | "decode";
    readonly source: string;
    readonly output: string | null;
    readonly sourceBytes: number;
    readonly outputBytes: number;
    readonly sha256: string | null;
    readonly namedFrom?: string;
    readonly message: string;
}
interface FileJob {
    readonly jobId: string;
    readonly direction: "encode" | "decode";
    readonly name: string;
    done: number;
    total: number;
    paused: boolean;
    result: FileResult | null;
    preview: Uint8Array | null;
}

const { t } = useI18n();
const w = globalThis.window as unknown as { worldlens?: { base64?: FileBridge; pathForDroppedFile?: (file: File) => string | null; dialog?: { pickFile(options: unknown): Promise<string | null> } } } | undefined;
const files = w?.worldlens?.base64 ?? null;

const tab = ref<"text" | "files" | "history">("text");
const history = new Base64History(safeStorage());
const workspace = ref<Base64Workspace>(history.current);
const tick = ref(0); // re-reads undo state after history changes
const notice = ref<{ kind: "success" | "info" | "warning" | "error"; text: string } | null>(null);
const editors = editorBridge();

/** Opens a finished file in Visual Studio Code in one action, or says why it cannot. */
async function openInVsCode(file: string): Promise<void> {
    if (!editors) return;
    const answer = await editors.openInVsCode(file);
    notice.value = { kind: answer.ok ? "success" : "warning", text: answer.message + (answer.downloadUrl ? ` ${answer.downloadUrl}` : "") };
}
const keepInputs = ref(history.keepInputs);
const includePayload = ref(false);

function safeStorage(): Storage | null {
    try {
        return globalThis.localStorage ?? null;
    } catch {
        return null;
    }
}

const result = computed(() => convert(workspace.value));
const canUndo = computed(() => (tick.value, history.canUndo));
const canRedo = computed(() => (tick.value, history.canRedo));
const entries = computed<readonly HistoryEntry[]>(() => (tick.value, history.entries));

let lastWasTyping = false;
/** Records a change. A run of typing is one undo step; any other change starts a new one. */
function update(patch: Partial<Base64Workspace>, typing = false): void {
    workspace.value = { ...workspace.value, ...patch };
    history.change(workspace.value, typing && lastWasTyping);
    lastWasTyping = typing;
    tick.value += 1;
}
function onInput(value: string): void {
    update({ input: value }, true);
}
function undo(): void {
    workspace.value = history.undo();
    tick.value += 1;
}
function redo(): void {
    workspace.value = history.redo();
    tick.value += 1;
}
function swap(): void {
    const r = result.value;
    update({ direction: workspace.value.direction === "encode" ? "decode" : "encode", input: r.ok ? r.output : workspace.value.input });
}

const alphabets = computed(() => [
    { title: t("base64.alphabet.standard", "Standard"), value: "standard" },
    { title: t("base64.alphabet.url", "URL-safe"), value: "url" },
    { title: t("base64.alphabet.mime", "MIME, 76 per line"), value: "mime" },
]);
const encodings = computed(() => [
    { title: "UTF-8", value: "utf-8" },
    { title: "UTF-16 LE", value: "utf-16le" },
    { title: "UTF-16 BE", value: "utf-16be" },
    { title: "Latin-1", value: "latin1" },
]);

const errorSnippet = computed(() => {
    const r = result.value;
    if (r.ok || r.offset === null) return null;
    const input = workspace.value.input;
    const start = Math.max(0, r.offset - 12);
    return { before: input.slice(start, r.offset), bad: input.slice(r.offset, r.offset + 1) || "∅", after: input.slice(r.offset + 1, r.offset + 13) };
});

async function recordText(): Promise<void> {
    const r = result.value;
    if (!r.ok) return;
    history.record({
        kind: "text",
        direction: workspace.value.direction,
        variant: variantLabel(workspace.value),
        inputName: t("base64.history.typed", "Typed text"),
        inputBytes: r.inputBytes,
        outputName: null,
        outputBytes: r.outputBytes,
        sha256: await sha256Hex(r.bytes),
        ok: true,
        message: "",
    });
    tick.value += 1;
}

async function copy(text: string, label: string): Promise<void> {
    try {
        await navigator.clipboard.writeText(text);
        notice.value = { kind: "success", text: t("base64.notice.copied", { what: label }, "Copied {what}.") };
        playActionCue("success");
        await recordText();
    } catch {
        notice.value = { kind: "error", text: t("base64.notice.noClipboard", "The clipboard is not available here. Select the text and copy it by hand.") };
    }
}
const copyOutput = (): Promise<void> => (result.value.ok ? copy(result.value.output, t("base64.what.output", "the result")) : Promise.resolve());
const copyDataUrl = (): Promise<void> => {
    const r = result.value;
    if (!r.ok) return Promise.resolve();
    return copy(buildDataUrl(sniffMime(r.bytes).mime, r.bytes), t("base64.what.dataUrl", "a data: URL"));
};

async function pasteClipboard(): Promise<void> {
    try {
        const text = await navigator.clipboard.readText();
        const parsed = text.startsWith("data:") ? parseDataUrl(text) : null;
        update(parsed?.ok ? { direction: "decode", input: encodeBytes(parsed.bytes) } : { input: text });
    } catch {
        notice.value = { kind: "error", text: t("base64.notice.noClipboard", "The clipboard is not available here. Select the text and copy it by hand.") };
    }
}

async function download(name: string, bytes: Uint8Array): Promise<void> {
    if (files) {
        const answer = await files.saveAs(name, bytes);
        notice.value = { kind: answer.ok ? "success" : "info", text: answer.message };
        if (answer.ok) playActionCue("save");
        return;
    }
    const url = URL.createObjectURL(new Blob([bytes as unknown as ArrayBuffer]));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function saveOutput(): Promise<void> {
    const r = result.value;
    if (!r.ok) return;
    const bytes = workspace.value.direction === "encode" ? new TextEncoder().encode(r.output) : r.bytes;
    const name = workspace.value.direction === "encode" ? "text.base64.txt" : decodedFileName("decoded.txt", null, r.bytes).name;
    await download(name, bytes);
    await recordText();
}

const importInput = ref<HTMLInputElement | null>(null);
async function importFile(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 32 * 1024 * 1024) {
        notice.value = { kind: "warning", text: t("base64.notice.tooBigForText", "That file is over 32 MB. Use the Files tab, which streams it without loading it all.") };
        return;
    }
    const text = await file.text();
    const parsed = text.startsWith("data:") ? parseDataUrl(text) : null;
    update(parsed?.ok ? { direction: "decode", input: encodeBytes(parsed.bytes) } : { direction: "decode", input: text });
    (event.target as HTMLInputElement).value = "";
}

/* ---------------- Files ---------------- */

const jobs = ref<FileJob[]>([]);
const fileOptions = computed(() => ({ alphabet: workspace.value.alphabet, padding: workspace.value.padding, lineLength: workspace.value.alphabet === "mime" && workspace.value.lineLength === 0 ? 76 : workspace.value.lineLength }));
let unsubscribe: (() => void) | null = null;

function newJob(direction: "encode" | "decode", name: string): FileJob {
    const job: FileJob = { jobId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, direction, name, done: 0, total: 0, paused: false, result: null, preview: null };
    jobs.value = [job, ...jobs.value];
    return jobs.value[0]!;
}

async function runDesktop(direction: "encode" | "decode", source: string): Promise<void> {
    if (!files) return;
    const job = newJob(direction, source.split(/[\\/]/u).pop() ?? source);
    const answer = direction === "encode" ? await files.encodeFile(source, fileOptions.value, job.jobId) : await files.decodeFile(source, job.jobId);
    job.result = answer;
    if (answer.ok && answer.output && direction === "decode") job.preview = await files.readHead(answer.output);
    playActionCue(answer.ok ? "success" : answer.cancelled ? "close" : "error");
    history.record({
        kind: "file",
        direction,
        variant: direction === "encode" ? variantLabel(workspace.value) : t("base64.variant.auto", "Detected"),
        inputName: job.name,
        inputBytes: answer.sourceBytes,
        outputName: answer.output ? answer.output.split(/[\\/]/u).pop() ?? null : null,
        outputBytes: answer.outputBytes,
        sha256: answer.sha256,
        ok: answer.ok,
        message: answer.message,
    });
    tick.value += 1;
}

/** Without a desktop: read the file here and download the result under the same names. */
async function runBrowser(direction: "encode" | "decode", file: File): Promise<void> {
    const job = newJob(direction, file.name);
    job.total = file.size;
    if (file.size > 256 * 1024 * 1024) {
        job.result = { ok: false, cancelled: false, jobId: job.jobId, direction, source: file.name, output: null, sourceBytes: file.size, outputBytes: 0, sha256: null, message: t("base64.files.browserLimit", "Files over 256 MB need the desktop app, which streams them.") };
        return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    job.done = file.size;
    if (direction === "encode") {
        const text = encodeBytes(bytes, fileOptions.value);
        const out = new TextEncoder().encode(text);
        await download(sidecarName(file.name), out);
        job.result = { ok: true, cancelled: false, jobId: job.jobId, direction, source: file.name, output: sidecarName(file.name), sourceBytes: file.size, outputBytes: out.length, sha256: await sha256Hex(bytes), message: t("base64.files.downloaded", "Downloaded.") };
    } else {
        const text = new TextDecoder("latin1").decode(bytes);
        const parsed = text.trimStart().startsWith("data:") ? parseDataUrl(text) : null;
        const decoded = parsed ? (parsed.ok ? { ok: true as const, bytes: parsed.bytes } : { ok: false as const, message: parsed.message }) : convert({ ...workspace.value, direction: "decode", strict: false, input: text });
        if (!decoded.ok) {
            job.result = { ok: false, cancelled: false, jobId: job.jobId, direction, source: file.name, output: null, sourceBytes: file.size, outputBytes: 0, sha256: null, message: decoded.message };
            return;
        }
        const name = restoredName(file.name) ?? decodedFileName(file.name, parsed?.ok ? parsed.mime : null, decoded.bytes).name;
        await download(name, decoded.bytes);
        job.preview = decoded.bytes.slice(0, 256 * 1024);
        job.result = { ok: true, cancelled: false, jobId: job.jobId, direction, source: file.name, output: name, sourceBytes: file.size, outputBytes: decoded.bytes.length, sha256: await sha256Hex(decoded.bytes), message: t("base64.files.downloaded", "Downloaded.") };
    }
}

function droppedPaths(event: DragEvent): { paths: string[]; raw: File[] } {
    const raw = Array.from(event.dataTransfer?.files ?? []);
    const resolve = w?.worldlens?.pathForDroppedFile;
    const paths = files && resolve ? raw.map((f) => resolve(f)).filter((p): p is string => !!p) : [];
    return { paths, raw };
}

const dropping = ref<"encode" | "decode" | null>(null);
async function onDrop(direction: "encode" | "decode", event: DragEvent): Promise<void> {
    dropping.value = null;
    const { paths, raw } = droppedPaths(event);
    if (paths.length) for (const p of paths) await runDesktop(direction, p);
    else for (const f of raw) await runBrowser(direction, f);
}

const pickerInput = ref<HTMLInputElement | null>(null);
const pickerDirection = ref<"encode" | "decode">("encode");
async function pick(direction: "encode" | "decode"): Promise<void> {
    if (files && w?.worldlens?.dialog) {
        const path = await w.worldlens.dialog.pickFile({ title: direction === "encode" ? t("base64.files.pickEncode", "Choose a file to encode") : t("base64.files.pickDecode", "Choose a Base64 file to decode") });
        if (path) await runDesktop(direction, path);
        return;
    }
    pickerDirection.value = direction;
    pickerInput.value?.click();
}
async function onPicked(event: Event): Promise<void> {
    for (const f of Array.from((event.target as HTMLInputElement).files ?? [])) await runBrowser(pickerDirection.value, f);
    (event.target as HTMLInputElement).value = "";
}

async function togglePause(job: FileJob): Promise<void> {
    if (!files) return;
    if (job.paused) await files.resume(job.jobId);
    else await files.pause(job.jobId);
    job.paused = !job.paused;
}

const finished = computed(() => jobs.value.filter((j) => j.result?.ok));
async function exportZip(): Promise<void> {
    const enc = new TextEncoder();
    const parts: { name: string; bytes: Uint8Array }[] = [];
    for (const job of finished.value) {
        const r = job.result!;
        parts.push({ name: `records/${job.name}.json`, bytes: enc.encode(JSON.stringify({ kind: "worldlens-base64-conversion", version: 1, direction: r.direction, source: job.name, output: r.output?.split(/[\\/]/u).pop() ?? null, sourceBytes: r.sourceBytes, outputBytes: r.outputBytes, sha256: r.sha256 }, null, 2)) });
        if (files && r.output && r.outputBytes <= 256 * 1024) parts.push({ name: `outputs/${r.output.split(/[\\/]/u).pop()}`, bytes: await files.readHead(r.output) });
    }
    await download("base64-results.zip", storeZip(parts));
}

onMounted(() => {
    unsubscribe = files?.onProgress((p) => {
        const job = jobs.value.find((j) => j.jobId === p.jobId);
        if (job) {
            job.done = p.bytesDone;
            job.total = p.bytesTotal;
        }
    }) ?? null;
});
onBeforeUnmount(() => unsubscribe?.());

/* ---------------- History ---------------- */

function setKeep(value: boolean | null): void {
    keepInputs.value = value === true;
    history.setKeepInputs(keepInputs.value);
}
async function exportRecord(entry: HistoryEntry): Promise<void> {
    const r = result.value;
    const text = conversionRecord(entry, entry.kind === "text" ? workspace.value : null, includePayload.value, r.ok ? r.output : null);
    await download(`base64-${entry.id}.json`, new TextEncoder().encode(text));
}
function clearHistory(): void {
    history.clear();
    tick.value += 1;
    notice.value = { kind: "success", text: t("base64.history.cleared", "History cleared.") };
}

const size = (n: number): string => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`);
const percent = (job: FileJob): number => (job.total > 0 ? Math.round((job.done / job.total) * 100) : 0);
const directionLabel = (d: "encode" | "decode"): string => (d === "encode" ? t("base64.encode", "Encode") : t("base64.decode", "Decode"));
const alphabetModel = computed({ get: () => workspace.value.alphabet, set: (v: Base64Alphabet) => update({ alphabet: v, lineLength: v === "mime" ? 76 : 0 }) });
/* ---------------- Per-control guides ---------------- */

/** Text whose encoding uses the 62nd and 63rd characters, so the alphabets differ visibly. */
const ALPHABET_SAMPLE = "??>>~";
/** A tiny live sample for the guides: what the current options do to "Ma" and "Man". */
const sample = (patch: Partial<Base64Workspace>, input: string) => {
    const r = convert({ ...workspace.value, direction: "encode", input, ...patch });
    return r.ok ? r.output : "";
};
const guides = computed(() => ({
    alphabet: {
        purpose: t("base64.guide.alphabet.purpose", "Which 64 characters the encoded text uses."),
        choices: t("base64.guide.alphabet.choices", "Standard uses + and /. URL-safe uses - and _ so the text can sit in a web address or file name. MIME is standard with 76-character lines, as email uses."),
        defaultValue: t("base64.guide.alphabet.default", "Standard."),
        effect: t("base64.guide.alphabet.effect", "Only the 62nd and 63rd characters and the line breaks change; the bytes are the same."),
        validation: t("base64.guide.alphabet.validation", "Strict decoding refuses a character from the other alphabet and names its position."),
        recovery: t("base64.guide.alphabet.recovery", "If decoding fails on - or _, switch to URL-safe, or turn strict decoding off."),
    },
    padding: {
        purpose: t("base64.guide.padding.purpose", "Whether the encoded text is filled out to a multiple of four characters with =."),
        defaultValue: t("base64.guide.padding.default", "On, as RFC 4648 asks."),
        effect: t("base64.guide.padding.effect", "Off drops the trailing = signs, which some URLs and tokens expect."),
        validation: t("base64.guide.padding.validation", "Strict decoding refuses missing or misplaced padding."),
        recovery: t("base64.guide.padding.recovery", "A decoder that complains about length usually wants padding back on."),
    },
    strict: {
        purpose: t("base64.guide.strict.purpose", "How picky decoding is."),
        choices: t("base64.guide.strict.choices", "Strict refuses anything outside the alphabet, stray spaces and wrong padding. Lenient ignores whitespace, accepts both alphabets and missing padding."),
        defaultValue: t("base64.guide.strict.default", "On."),
        example: t("base64.guide.strict.example", "TWE decodes leniently to Ma and is refused strictly for missing padding."),
        recovery: t("base64.guide.strict.recovery", "The error names the exact character and position; fix it there or turn strict off."),
    },
    lineLength: {
        purpose: t("base64.guide.lineLength.purpose", "Breaks the encoded text into lines of this many characters."),
        defaultValue: t("base64.guide.lineLength.default", "0 (no breaks); MIME uses 76."),
        effect: t("base64.guide.lineLength.effect", "Lines end with CRLF. Decoding ignores the breaks."),
        validation: t("base64.guide.lineLength.validation", "Whole numbers from 0."),
    },
    encoding: {
        purpose: t("base64.guide.encoding.purpose", "How typed text becomes bytes before encoding, and how decoded bytes become text."),
        choices: t("base64.guide.encoding.choices", "UTF-8 for almost everything; UTF-16 LE or BE for Windows and Java strings; Latin-1 for old single-byte text."),
        defaultValue: t("base64.guide.encoding.default", "UTF-8."),
        validation: t("base64.guide.encoding.validation", "Text that cannot be written in the chosen encoding is reported, never changed."),
    },
}));

const encodingModel = computed({ get: () => workspace.value.encoding, set: (v: TextEncodingName) => update({ encoding: v }) });
</script>

<template>
    <section class="wl-b64" data-test="base64-screen" aria-labelledby="b64-title">
        <header class="wl-b64__head">
            <div>
                <h1 id="b64-title">{{ t("base64.title", "Base64") }}</h1>
                <p>{{ t("base64.intro", "Encode and decode text or files on this computer. Nothing is uploaded.") }}</p>
            </div>
            <div class="wl-b64__actions">
                <VBtn variant="text" :prepend-icon="mdiUndo" :disabled="!canUndo" aria-keyshortcuts="Control+Alt+Z" @click="undo">{{ t("base64.undo", "Undo") }}</VBtn>
                <VBtn variant="text" :prepend-icon="mdiRedo" :disabled="!canRedo" aria-keyshortcuts="Control+Alt+Y" @click="redo">{{ t("base64.redo", "Redo") }}</VBtn>
            </div>
        </header>

        <VAlert v-if="notice" :type="notice.kind" variant="tonal" closable role="status" @click:close="notice = null">{{ notice.text }}</VAlert>

        <VTabs v-model="tab" :aria-label="t('base64.sections', 'Base64 sections')">
            <VTab value="text">{{ t("base64.tab.text", "Text") }}</VTab>
            <VTab value="files">{{ t("base64.tab.files", "Files") }}</VTab>
            <VTab value="history">{{ t("base64.tab.history", "History") }}</VTab>
        </VTabs>

        <div
            v-if="tab === 'text'"
            class="wl-b64__panel"
            @keydown.ctrl.alt.z.prevent="undo"
            @keydown.ctrl.alt.y.prevent="redo"
        >
            <div class="wl-b64__options">
                <VBtnToggle :model-value="workspace.direction" mandatory variant="outlined" divided :aria-label="t('base64.direction', 'Direction')" @update:model-value="(v: 'encode' | 'decode') => update({ direction: v })">
                    <VBtn value="encode">{{ t("base64.encode", "Encode") }}</VBtn>
                    <VBtn value="decode">{{ t("base64.decode", "Decode") }}</VBtn>
                </VBtnToggle>
                <span class="wl-b64__with-info">
                    <VSelect v-model="alphabetModel" :items="alphabets" :label="t('base64.alphabet', 'Alphabet')" density="compact" hide-details />
                    <InfoButton :control="t('base64.alphabet', 'Alphabet')" :guide="guides.alphabet" resettable @reset="alphabetModel = 'standard'">
                        <template #playground>
                            <code>"{{ ALPHABET_SAMPLE }}" → {{ sample({ alphabet: alphabetModel }, ALPHABET_SAMPLE) }}</code>
                        </template>
                    </InfoButton>
                </span>
                <span class="wl-b64__with-info">
                    <VSelect v-model="encodingModel" :items="encodings" :label="t('base64.encoding', 'Text encoding')" density="compact" hide-details />
                    <InfoButton :control="t('base64.encoding', 'Text encoding')" :guide="guides.encoding" resettable @reset="encodingModel = 'utf-8'">
                        <template #playground>
                            <code>"é" → {{ sample({ encoding: encodingModel }, "é") }}</code>
                        </template>
                    </InfoButton>
                </span>
                <span class="wl-b64__with-info">
                    <VNumberInput
                        :model-value="workspace.lineLength"
                        :min="0"
                        :max="9999"
                        :step="4"
                        control-variant="split"
                        :label="t('base64.lineLength', 'Line length, 0 = none')"
                        density="compact"
                        hide-details
                        :disabled="workspace.direction === 'decode'"
                        @update:model-value="(v: number | null) => update({ lineLength: Math.max(0, Math.floor(Number(v) || 0)) })"
                    />
                    <InfoButton :control="t('base64.lineLength', 'Line length, 0 = none')" :guide="guides.lineLength" resettable @reset="update({ lineLength: workspace.alphabet === 'mime' ? 76 : 0 })" />
                </span>
                <span class="wl-b64__with-info">
                    <VCheckbox :model-value="workspace.padding" :label="t('base64.padding', 'Padding')" density="compact" hide-details :disabled="workspace.direction === 'decode'" @update:model-value="(v: boolean | null) => update({ padding: v === true })" />
                    <InfoButton :control="t('base64.padding', 'Padding')" :guide="guides.padding" resettable @reset="update({ padding: true })">
                        <template #playground>
                            <code>"Ma" → {{ sample({ padding: workspace.padding }, "Ma") }}</code>
                        </template>
                    </InfoButton>
                </span>
                <span class="wl-b64__with-info">
                    <VCheckbox :model-value="workspace.strict" :label="t('base64.strict', 'Strict decoding')" density="compact" hide-details :disabled="workspace.direction === 'encode'" @update:model-value="(v: boolean | null) => update({ strict: v === true })" />
                    <InfoButton :control="t('base64.strict', 'Strict decoding')" :guide="guides.strict" resettable @reset="update({ strict: true })" />
                </span>
                <p v-if="workspace.direction === 'decode'" class="wl-b64__reason">{{ t("base64.decodeReason", "Line length and padding apply when encoding.") }}</p>
                <p v-else class="wl-b64__reason">{{ t("base64.encodeReason", "Strict decoding applies when decoding.") }}</p>
            </div>

            <div class="wl-b64__io">
                <div class="wl-b64__box">
                    <VTextarea
                        :model-value="workspace.input"
                        :label="workspace.direction === 'encode' ? t('base64.inText', 'Text') : t('base64.inBase64', 'Base64')"
                        rows="10"
                        auto-grow
                        class="wl-b64__mono"
                        :hint="t('base64.bytes', { n: result.ok ? result.inputBytes : workspace.input.length }, '{n} bytes')"
                        persistent-hint
                        spellcheck="false"
                        @update:model-value="onInput"
                    />
                    <div class="wl-b64__row">
                        <VBtn variant="text" size="small" :prepend-icon="mdiContentCopy" @click="pasteClipboard">{{ t("base64.paste", "Paste") }}</VBtn>
                        <VBtn variant="text" size="small" :prepend-icon="mdiFileUploadOutline" @click="importInput?.click()">{{ t("base64.import", "Import file") }}</VBtn>
                        <input ref="importInput" type="file" class="wl-sr-only" :aria-label="t('base64.import', 'Import file')" @change="importFile" />
                        <VBtn variant="text" size="small" :prepend-icon="mdiSwapHorizontal" :disabled="!result.ok" @click="swap">{{ t("base64.swap", "Swap") }}</VBtn>
                    </div>
                </div>
                <div class="wl-b64__box">
                    <div class="wl-b64__label">{{ workspace.direction === "encode" ? t("base64.outBase64", "Base64") : t("base64.outText", "Text") }}</div>
                    <output v-if="result.ok" class="wl-b64__out" aria-live="polite">{{ result.output || t("base64.notText", { encoding: workspace.encoding }, "These bytes are not {encoding} text. See the preview.") }}</output>
                    <div v-else-if="result.reason === 'empty'" class="wl-b64__empty">{{ result.message }}</div>
                    <div v-else class="wl-b64__error" role="alert">
                        <strong>{{ result.reason === "encoding" ? t("base64.error.encoding", "Not in this encoding") : t("base64.error.invalid", "Not valid Base64") }}</strong>
                        <span>{{ result.message }}</span>
                        <code v-if="errorSnippet" class="wl-b64__mono">{{ errorSnippet.before }}<mark>{{ errorSnippet.bad }}</mark>{{ errorSnippet.after }}</code>
                    </div>
                    <div class="wl-b64__row">
                        <span class="wl-b64__hint">{{ result.ok ? t("base64.bytes", { n: result.outputBytes }, "{n} bytes") : "" }}</span>
                        <VBtn variant="text" size="small" :disabled="!result.ok" @click="copyDataUrl">{{ t("base64.copyDataUrl", "Copy as data: URL") }}</VBtn>
                        <VBtn variant="text" size="small" :prepend-icon="mdiDownload" :disabled="!result.ok" @click="saveOutput">{{ t("base64.saveFile", "Save as file") }}</VBtn>
                        <VBtn color="primary" size="small" :prepend-icon="mdiContentCopy" :disabled="!result.ok" @click="copyOutput">{{ t("base64.copy", "Copy") }}</VBtn>
                    </div>
                </div>
            </div>
            <Base64Preview v-if="workspace.direction === 'decode' && result.ok" :bytes="result.bytes" />
        </div>

        <div v-else-if="tab === 'files'" class="wl-b64__panel">
            <p class="wl-b64__hint">{{ files ? t("base64.files.intro", "Drop a file on Encode to write name.ext.base64.txt beside it. Drop that text file on Decode to get name.ext back. Nothing is overwritten; a taken name gets a number.") : t("base64.files.introBrowser", "Files are read in this window and the result downloads as name.ext.base64.txt, or as the restored name.ext.") }}</p>
            <div class="wl-b64__targets">
                <div
                    v-for="d in (['encode', 'decode'] as const)"
                    :key="d"
                    class="wl-b64__drop"
                    :class="{ 'is-active': dropping === d }"
                    role="button"
                    tabindex="0"
                    :aria-label="d === 'encode' ? t('base64.files.encodeTarget', 'Encode a file: drop it here or press Enter to choose') : t('base64.files.decodeTarget', 'Decode a Base64 file: drop it here or press Enter to choose')"
                    @dragenter.prevent="dropping = d"
                    @dragleave.prevent="dropping = null"
                    @dragover.prevent
                    @drop.prevent.stop="onDrop(d, $event)"
                    @click="pick(d)"
                    @keydown.enter.prevent="pick(d)"
                    @keydown.space.prevent="pick(d)"
                >
                    <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><path :d="mdiFolderOpenOutline" fill="currentColor" /></svg>
                    <strong>{{ directionLabel(d) }}</strong>
                    <span>{{ d === "encode" ? "report.pdf → report.pdf.base64.txt" : "report.pdf.base64.txt → report.pdf" }}</span>
                </div>
            </div>
            <input ref="pickerInput" type="file" multiple class="wl-sr-only" :aria-label="t('base64.files.pick', 'Choose files')" @change="onPicked" />
            <ul class="wl-b64__jobs">
                <li v-for="job in jobs" :key="job.jobId" class="wl-b64__job">
                    <div class="wl-b64__row">
                        <strong class="wl-b64__mono">{{ job.name }}</strong>
                        <span class="wl-b64__hint">{{ directionLabel(job.direction) }}</span>
                    </div>
                    <template v-if="!job.result">
                        <VProgressLinear :model-value="percent(job)" :aria-label="t('base64.files.progress', { name: job.name }, 'Converting {name}')" />
                        <div class="wl-b64__row">
                            <span class="wl-b64__hint">{{ size(job.done) }} / {{ size(job.total) }}</span>
                            <VBtn size="small" variant="text" @click="togglePause(job)">{{ job.paused ? t("base64.files.resume", "Resume") : t("base64.files.pause", "Pause") }}</VBtn>
                            <VBtn size="small" variant="text" color="error" @click="files?.cancel(job.jobId)">{{ t("base64.files.cancel", "Cancel") }}</VBtn>
                        </div>
                    </template>
                    <template v-else>
                        <VAlert :type="job.result.ok ? 'success' : job.result.cancelled ? 'info' : 'error'" variant="tonal" density="compact">
                            {{ job.result.message }}
                            <span v-if="job.result.sha256" class="wl-b64__mono wl-b64__hash"> SHA-256 {{ job.result.sha256.slice(0, 16) }}…</span>
                        </VAlert>
                        <div v-if="job.result.ok && files && job.result.output" class="wl-b64__row">
                            <VBtn size="small" variant="text" :prepend-icon="mdiFolderOpenOutline" @click="files.reveal(job.result.output)">{{ t("base64.files.reveal", "Show in folder") }}</VBtn>
                            <VBtn v-if="editors" size="small" variant="text" :prepend-icon="mdiMicrosoftVisualStudioCode" @click="openInVsCode(job.result.output)">{{ t("editors.openInVsCode", "Open in VS Code") }}</VBtn>
                        </div>
                        <Base64Preview v-if="job.preview" :bytes="job.preview" :truncated="job.result.outputBytes > job.preview.length" />
                    </template>
                </li>
            </ul>
            <VBtn v-if="finished.length" variant="outlined" :prepend-icon="mdiDownload" @click="exportZip">{{ t("base64.files.zip", "Export records and small results as .zip") }}</VBtn>
        </div>

        <div v-else class="wl-b64__panel">
            <VSwitch :model-value="keepInputs" color="primary" :label="t('base64.history.keep', 'Keep inputs on this computer so undo works after a restart')" hide-details @update:model-value="setKeep" />
            <VSwitch v-model="includePayload" color="primary" :label="t('base64.history.payload', 'Include the text itself in exported records')" hide-details />
            <p v-if="entries.length === 0" class="wl-b64__empty">{{ t("base64.history.empty", "No conversions yet. Each copy, save or file conversion is listed here by name, size and SHA-256.") }}</p>
            <ul v-else class="wl-b64__history">
                <li v-for="entry in entries" :key="entry.id">
                    <span :class="entry.ok ? 'ok' : 'bad'" aria-hidden="true">{{ entry.ok ? "✓" : "✕" }}</span>
                    <span>{{ directionLabel(entry.direction) }} · {{ entry.inputName }} ({{ size(entry.inputBytes) }}) → {{ entry.outputName ?? t("base64.history.copied", "copied") }} ({{ size(entry.outputBytes) }}) · {{ entry.variant }}</span>
                    <span class="wl-b64__hint">{{ new Date(entry.at).toLocaleString() }}</span>
                    <VBtn size="small" variant="text" @click="exportRecord(entry)">{{ t("base64.history.export", "Export JSON") }}</VBtn>
                </li>
            </ul>
            <ConfigSuperConfirm
                v-if="entries.length"
                :title="t('base64.history.clearTitle', 'Clear Base64 history?')"
                :action="t('base64.history.clearAction', { n: entries.length }, 'Removes {n} history entries and every undo step. Files already written stay where they are.')"
                :affected="entries.slice(0, 10).map((e) => e.inputName)"
                :confirm-label="t('base64.history.clearGo', 'Clear history')"
                @confirm="clearHistory"
            >
                <template #activator="{ props }">
                    <VBtn v-bind="props" color="error" variant="outlined">{{ t("base64.history.clear", "Clear history") }}</VBtn>
                </template>
            </ConfigSuperConfirm>
        </div>
    </section>
</template>

<style scoped>
.wl-b64 { max-width: 1280px; margin: 0 auto; padding: 24px; display: flex; flex-direction: column; gap: 12px; }
.wl-b64__head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 12px; }
.wl-b64__head h1 { margin: 0; font: var(--md-sys-typescale-headline-medium-font, 400 28px/36px Roboto, sans-serif); }
.wl-b64__head p { margin: 4px 0 0; color: rgb(var(--v-theme-on-surface-variant)); }
.wl-b64__actions, .wl-b64__row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.wl-b64__row .wl-b64__hint { margin-right: auto; }
.wl-b64__panel { display: flex; flex-direction: column; gap: 16px; padding: 20px; border-radius: var(--md-sys-shape-corner-extra-large, 28px); background: rgb(var(--v-theme-surface-container, var(--v-theme-surface))); }
.wl-b64__options { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; align-items: center; }
.wl-b64__io { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
.wl-b64__box { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.wl-b64__label { font-size: 12px; font-weight: 500; color: rgb(var(--v-theme-on-surface-variant)); }
.wl-b64__out { display: block; min-height: 200px; padding: 12px; border-radius: var(--md-sys-shape-corner-medium, 12px); background: rgb(var(--v-theme-surface-container-lowest, var(--v-theme-background))); font: 14px/22px "Roboto Mono", monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
.wl-b64__mono :deep(textarea), .wl-b64__mono { font-family: "Roboto Mono", monospace; }
.wl-b64__empty { color: rgb(var(--v-theme-on-surface-variant)); padding: 12px 0; }
.wl-b64__error { display: flex; flex-direction: column; gap: 6px; padding: 12px; border-radius: var(--md-sys-shape-corner-medium, 12px); background: rgba(var(--v-theme-error), 0.12); color: rgb(var(--v-theme-on-surface)); }
.wl-b64__error mark { background: rgb(var(--v-theme-error)); color: rgb(var(--v-theme-on-error)); padding: 0 2px; border-radius: 2px; }
.wl-b64__hint { font-size: 13px; color: rgb(var(--v-theme-on-surface-variant)); }
.wl-b64__targets { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
.wl-b64__drop { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 28px; text-align: center; border: 2px dashed rgba(var(--v-theme-outline), 0.6); border-radius: var(--md-sys-shape-corner-extra-large, 28px); cursor: pointer; transition: background-color var(--md-sys-motion-duration-short4, 200ms) var(--md-sys-motion-easing-standard, ease); }
.wl-b64__drop span { font: 12px "Roboto Mono", monospace; color: rgb(var(--v-theme-on-surface-variant)); }
.wl-b64__drop.is-active, .wl-b64__drop:hover { background: rgba(var(--v-theme-primary), 0.08); }
.wl-b64__drop:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.wl-b64__jobs, .wl-b64__history { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.wl-b64__job { display: flex; flex-direction: column; gap: 8px; padding: 14px; border-radius: var(--md-sys-shape-corner-large, 16px); background: rgb(var(--v-theme-surface-container-low, var(--v-theme-surface))); }
.wl-b64__hash { opacity: 0.8; }
.wl-b64__history li { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 14px; }
.wl-b64__history .ok { color: rgb(var(--v-theme-primary)); }
.wl-b64__history .bad { color: rgb(var(--v-theme-error)); }
.wl-b64__with-info { display: inline-flex; align-items: center; gap: 2px; min-width: 0; }
.wl-b64__reason { margin: 0; width: 100%; font-size: 12px; color: rgb(var(--v-theme-on-surface-variant)); }
.wl-sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (prefers-reduced-motion: reduce) { .wl-b64__drop { transition: none; } }
@media (max-width: 600px) { .wl-b64 { padding: 12px; } }
</style>
