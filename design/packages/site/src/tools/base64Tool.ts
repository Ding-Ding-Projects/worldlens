import {
    buildDataUrl,
    decodedFileName,
    encodeBytes,
    hexDump,
    parseDataUrl,
    previewKind,
    restoredName,
    sidecarName,
    sniffMime,
    type Base64Alphabet,
    type TextEncodingName,
} from "@worldlens/shared/base64";
import { Base64History, convert, sha256Hex, variantLabel, type Base64Workspace } from "@worldlens/shared/base64Workspace";
import "./base64Tool.css";
import type { I18n } from "../i18n/I18n.js";
import type { StringKey } from "../i18n/strings.js";

/**
 * The site's Base64 toolkit, mounted inside its article. It runs the same shared code as the
 * desktop job: text conversion, strict offsets, history and unlimited undo. A web page cannot
 * write beside a file, so files are read here and downloaded as `name.ext.base64.txt` or the
 * restored `name.ext`. Nothing is sent anywhere.
 */
export function mountBase64Tool(i18n: I18n, storage: Storage | null = safeStorage()): HTMLElement {
    const history = new Base64History(storage);
    let workspace: Base64Workspace = history.current;
    let lastWasTyping = false;

    const root = el("section", "mb-tool mb-b64");
    root.setAttribute("aria-label", i18n.t("tool.base64.title"));

    const bar = el("div", "mb-tool-row");
    const direction = el("div", "mb-tool-seg");
    direction.setAttribute("role", "radiogroup");
    i18n.bindAttr(direction, "aria-label", "tool.base64.direction");
    const encodeBtn = button(i18n, "tool.base64.encode");
    const decodeBtn = button(i18n, "tool.base64.decode");
    direction.append(encodeBtn, decodeBtn);
    for (const [btn, value] of [[encodeBtn, "encode"], [decodeBtn, "decode"]] as const) {
        btn.setAttribute("role", "radio");
        btn.addEventListener("click", () => change({ direction: value }));
    }

    const alphabet = select(i18n, "tool.base64.alphabet", [
        ["standard", "tool.base64.alphabet.standard"],
        ["url", "tool.base64.alphabet.url"],
        ["mime", "tool.base64.alphabet.mime"],
    ]);
    alphabet.control.addEventListener("change", () => {
        const v = alphabet.control.value as Base64Alphabet;
        change({ alphabet: v, lineLength: v === "mime" ? 76 : 0 });
    });
    const encoding = select(i18n, "tool.base64.encoding", [
        ["utf-8", "UTF-8"],
        ["utf-16le", "UTF-16 LE"],
        ["utf-16be", "UTF-16 BE"],
        ["latin1", "Latin-1"],
    ]);
    encoding.control.addEventListener("change", () => change({ encoding: encoding.control.value as TextEncodingName }));
    const lineLength = field(i18n, "tool.base64.lineLength", "number");
    lineLength.control.min = "0";
    lineLength.control.addEventListener("change", () => change({ lineLength: Math.max(0, Math.floor(Number(lineLength.control.value) || 0)) }));
    const padding = checkbox(i18n, "tool.base64.padding");
    padding.control.addEventListener("change", () => change({ padding: padding.control.checked }));
    const strict = checkbox(i18n, "tool.base64.strict");
    strict.control.addEventListener("change", () => change({ strict: strict.control.checked }));
    const undoBtn = button(i18n, "tool.base64.undo");
    const redoBtn = button(i18n, "tool.base64.redo");
    undoBtn.addEventListener("click", () => {
        workspace = history.undo();
        lastWasTyping = false;
        render();
    });
    redoBtn.addEventListener("click", () => {
        workspace = history.redo();
        lastWasTyping = false;
        render();
    });
    bar.append(direction, alphabet.wrap, encoding.wrap, lineLength.wrap, padding.wrap, strict.wrap, undoBtn, redoBtn);

    const io = el("div", "mb-tool-io");
    const inputWrap = el("label", "mb-tool-box");
    const inputLabel = el("span", "mb-tool-label");
    const input = el("textarea", "mb-tool-mono") as HTMLTextAreaElement;
    input.rows = 8;
    input.spellcheck = false;
    const inputCount = el("span", "mb-tool-hint");
    inputWrap.append(inputLabel, input, inputCount);
    input.addEventListener("input", () => change({ input: input.value }, true));

    const outputWrap = el("div", "mb-tool-box");
    const outputLabel = el("span", "mb-tool-label");
    const output = el("output", "mb-tool-out mb-tool-mono");
    output.setAttribute("aria-live", "polite");
    const error = el("div", "mb-tool-error");
    error.setAttribute("role", "alert");
    const outputCount = el("span", "mb-tool-hint");
    const actions = el("div", "mb-tool-row");
    const copyBtn = button(i18n, "tool.base64.copy");
    const dataUrlBtn = button(i18n, "tool.base64.copyDataUrl");
    const saveBtn = button(i18n, "tool.base64.saveFile");
    actions.append(outputCount, dataUrlBtn, saveBtn, copyBtn);
    outputWrap.append(outputLabel, output, error, actions);
    io.append(inputWrap, outputWrap);

    const preview = el("figure", "mb-tool-preview");
    const status = el("p", "mb-tool-hint");
    status.setAttribute("role", "status");

    const files = el("div", "mb-tool-targets");
    for (const dir of ["encode", "decode"] as const) {
        const target = el("label", "mb-tool-drop");
        const title = el("strong", "");
        i18n.bindText(title, dir === "encode" ? "tool.base64.encode" : "tool.base64.decode");
        const sample = el("span", "mb-tool-mono");
        sample.textContent = dir === "encode" ? "report.pdf → report.pdf.base64.txt" : "report.pdf.base64.txt → report.pdf";
        const picker = el("input", "mb-tool-sr") as HTMLInputElement;
        picker.type = "file";
        picker.multiple = true;
        i18n.bindAttr(picker, "aria-label", dir === "encode" ? "tool.base64.pickEncode" : "tool.base64.pickDecode");
        picker.addEventListener("change", () => {
            void handleFiles(dir, Array.from(picker.files ?? []));
            picker.value = "";
        });
        target.addEventListener("dragover", (e) => e.preventDefault());
        target.addEventListener("drop", (e) => {
            e.preventDefault();
            void handleFiles(dir, Array.from(e.dataTransfer?.files ?? []));
        });
        target.append(title, sample, picker);
        files.append(target);
    }

    root.append(bar, io, preview, files, status);

    function change(patch: Partial<Base64Workspace>, typing = false): void {
        workspace = { ...workspace, ...patch };
        history.change(workspace, typing && lastWasTyping);
        lastWasTyping = typing;
        render();
    }

    function render(): void {
        const result = convert(workspace);
        const encodeMode = workspace.direction === "encode";
        encodeBtn.setAttribute("aria-checked", String(encodeMode));
        decodeBtn.setAttribute("aria-checked", String(!encodeMode));
        alphabet.control.value = workspace.alphabet;
        encoding.control.value = workspace.encoding;
        lineLength.control.value = String(workspace.lineLength);
        lineLength.control.disabled = !encodeMode;
        padding.control.checked = workspace.padding;
        padding.control.disabled = !encodeMode;
        strict.control.checked = workspace.strict;
        strict.control.disabled = encodeMode;
        undoBtn.disabled = !history.canUndo;
        redoBtn.disabled = !history.canRedo;
        if (input.value !== workspace.input) input.value = workspace.input;
        i18n.bindText(inputLabel, encodeMode ? "tool.base64.text" : "tool.base64.base64");
        i18n.bindText(outputLabel, encodeMode ? "tool.base64.base64" : "tool.base64.text");
        inputCount.textContent = i18n.t("tool.base64.bytes", { n: result.ok ? result.inputBytes : workspace.input.length });
        for (const btn of [copyBtn, dataUrlBtn, saveBtn]) btn.disabled = !result.ok;
        error.replaceChildren();
        error.hidden = true;
        output.hidden = false;
        if (result.ok) {
            output.textContent = result.output || i18n.t("tool.base64.notText", { encoding: workspace.encoding });
            outputCount.textContent = i18n.t("tool.base64.bytes", { n: result.outputBytes });
        } else if (result.reason === "empty") {
            output.textContent = i18n.t("tool.base64.empty");
            outputCount.textContent = "";
        } else {
            output.hidden = true;
            error.hidden = false;
            const head = el("strong", "");
            head.textContent = result.reason === "encoding" ? i18n.t("tool.base64.notInEncoding") : i18n.t("tool.base64.invalid");
            const msg = el("span", "");
            msg.textContent = result.message;
            error.append(head, msg);
            if (result.offset !== null) {
                const code = el("code", "mb-tool-mono");
                const start = Math.max(0, result.offset - 12);
                const mark = el("mark", "");
                mark.textContent = workspace.input.slice(result.offset, result.offset + 1) || "∅";
                code.append(workspace.input.slice(start, result.offset), mark, workspace.input.slice(result.offset + 1, result.offset + 13));
                error.append(code);
            }
            outputCount.textContent = "";
        }
        renderPreview(!encodeMode && result.ok ? result.bytes : null);
    }

    let previewUrl: string | null = null;
    function renderPreview(bytes: Uint8Array | null): void {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = null;
        preview.replaceChildren();
        preview.hidden = !bytes;
        if (!bytes) return;
        const { mime } = sniffMime(bytes);
        const kind = previewKind(mime);
        const caption = el("figcaption", "mb-tool-hint");
        caption.textContent = i18n.t("tool.base64.detected", { mime, bytes: bytes.length });
        preview.append(caption);
        if (kind === "image" || kind === "audio" || kind === "video") {
            previewUrl = URL.createObjectURL(new Blob([bytes as unknown as ArrayBuffer], { type: mime }));
            const media = el(kind === "image" ? "img" : kind, "mb-tool-media") as HTMLImageElement | HTMLMediaElement;
            media.src = previewUrl;
            if (kind === "image") (media as HTMLImageElement).alt = i18n.t("tool.base64.imageAlt");
            else (media as HTMLMediaElement).controls = true;
            preview.append(media);
            return;
        }
        const pre = el("pre", "mb-tool-out mb-tool-mono");
        let text = "";
        if (kind === "text") {
            try {
                text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.slice(0, 64 * 1024));
            } catch {
                text = "";
            }
        }
        pre.textContent = text || hexDump(bytes);
        preview.append(pre);
    }

    async function record(direction: "encode" | "decode", name: string, inBytes: number, outName: string | null, outBytes: number, hash: string | null): Promise<void> {
        history.record({ kind: outName ? "file" : "text", direction, variant: variantLabel(workspace), inputName: name, inputBytes: inBytes, outputName: outName, outputBytes: outBytes, sha256: hash, ok: true, message: "" });
    }

    copyBtn.addEventListener("click", () => {
        const r = convert(workspace);
        if (r.ok) void copy(r.output, r.bytes);
    });
    dataUrlBtn.addEventListener("click", () => {
        const r = convert(workspace);
        if (r.ok) void copy(buildDataUrl(sniffMime(r.bytes).mime, r.bytes), r.bytes);
    });
    saveBtn.addEventListener("click", () => {
        const r = convert(workspace);
        if (!r.ok) return;
        const encodeMode = workspace.direction === "encode";
        const name = encodeMode ? "text.base64.txt" : decodedFileName("decoded.txt", null, r.bytes).name;
        download(name, encodeMode ? new TextEncoder().encode(r.output) : r.bytes);
    });

    async function copy(text: string, bytes: Uint8Array): Promise<void> {
        try {
            await navigator.clipboard.writeText(text);
            status.textContent = i18n.t("tool.base64.copied");
            await record(workspace.direction, i18n.t("tool.base64.typed"), bytes.length, null, text.length, await sha256Hex(bytes));
        } catch {
            status.textContent = i18n.t("tool.base64.noClipboard");
        }
    }

    async function handleFiles(dir: "encode" | "decode", list: readonly File[]): Promise<void> {
        for (const file of list) {
            if (file.size > 256 * 1024 * 1024) {
                status.textContent = i18n.t("tool.base64.tooBig", { name: file.name });
                continue;
            }
            const bytes = new Uint8Array(await file.arrayBuffer());
            if (dir === "encode") {
                const lineLengthValue = workspace.alphabet === "mime" && workspace.lineLength === 0 ? 76 : workspace.lineLength;
                const text = encodeBytes(bytes, { alphabet: workspace.alphabet, padding: workspace.padding, lineLength: lineLengthValue });
                const out = new TextEncoder().encode(text);
                download(sidecarName(file.name), out);
                status.textContent = i18n.t("tool.base64.downloaded", { name: sidecarName(file.name) });
                await record("encode", file.name, file.size, sidecarName(file.name), out.length, await sha256Hex(bytes));
            } else {
                const text = new TextDecoder("latin1").decode(bytes);
                const parsed = text.trimStart().startsWith("data:") ? parseDataUrl(text) : null;
                const decoded = parsed ? (parsed.ok ? { ok: true as const, bytes: parsed.bytes } : { ok: false as const, message: parsed.message }) : convert({ ...workspace, direction: "decode", strict: false, input: text.replace(/-/gu, "+").replace(/_/gu, "/") });
                if (!decoded.ok) {
                    status.textContent = `${file.name}: ${decoded.message}`;
                    continue;
                }
                const name = restoredName(file.name) ?? decodedFileName(file.name, parsed?.ok ? parsed.mime : null, decoded.bytes).name;
                download(name, decoded.bytes);
                renderPreview(decoded.bytes.slice(0, 256 * 1024));
                status.textContent = i18n.t("tool.base64.downloaded", { name });
                await record("decode", file.name, file.size, name, decoded.bytes.length, await sha256Hex(decoded.bytes));
            }
        }
    }

    render();
    // Counts, messages and the preview caption are written with `t`, so redraw them when the
    // language or tone changes, and stop once the article is gone.
    const stop = i18n.subscribe(() => (root.isConnected ? render() : stop()));
    return root;
}

function download(name: string, bytes: Uint8Array): void {
    const url = URL.createObjectURL(new Blob([bytes as unknown as ArrayBuffer]));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeStorage(): Storage | null {
    try {
        return globalThis.localStorage ?? null;
    } catch {
        return null;
    }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    return node;
}

function button(i18n: I18n, key: StringKey): HTMLButtonElement {
    const b = el("button", "mb-tool-btn");
    b.type = "button";
    i18n.bindText(b, key);
    return b;
}

function select(i18n: I18n, labelKey: StringKey, options: readonly (readonly [string, string])[]): { wrap: HTMLLabelElement; control: HTMLSelectElement } {
    const wrap = el("label", "mb-tool-field");
    const label = el("span", "mb-tool-label");
    i18n.bindText(label, labelKey);
    const control = el("select", "");
    for (const [value, text] of options) {
        const option = el("option", "");
        option.value = value;
        if (text.startsWith("tool.")) i18n.bindText(option, text as StringKey);
        else option.textContent = text;
        control.append(option);
    }
    wrap.append(label, control);
    return { wrap, control };
}

function field(i18n: I18n, labelKey: StringKey, type: string): { wrap: HTMLLabelElement; control: HTMLInputElement } {
    const wrap = el("label", "mb-tool-field");
    const label = el("span", "mb-tool-label");
    i18n.bindText(label, labelKey);
    const control = el("input", "");
    control.type = type;
    wrap.append(label, control);
    return { wrap, control };
}

function checkbox(i18n: I18n, labelKey: StringKey): { wrap: HTMLLabelElement; control: HTMLInputElement } {
    const wrap = el("label", "mb-tool-check");
    const control = el("input", "");
    control.type = "checkbox";
    const label = el("span", "");
    i18n.bindText(label, labelKey);
    wrap.append(control, label);
    return { wrap, control };
}
