import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { PDFDocument, degrees } from "pdf-lib";
import { replaceFileWithRetry } from "../storage/atomicReplace.js";

export type PdfOperation = "inspect" | "split" | "merge" | "extract" | "reorder" | "rotate" | "metadata";

export interface ConverterOperationRequest {
    readonly operation: PdfOperation;
    readonly inputs: readonly string[];
    readonly output: string;
    readonly overwrite: boolean;
    readonly overwriteConfirmation?: string;
    readonly pages?: readonly number[];
    readonly rotation?: 0 | 90 | 180 | 270;
    readonly metadata?: Readonly<Record<string, string>>;
    readonly outputs?: readonly string[];
    readonly signal?: AbortSignal;
}

export interface ConverterOperationResult {
    readonly ok: boolean;
    readonly output: string | null;
    readonly outputs?: readonly string[];
    readonly pages: number | null;
    readonly pageOrder?: readonly number[];
    readonly rotations?: readonly number[];
    readonly metadata: Readonly<Record<string, string>>;
    readonly message: string;
}

const PDF = Buffer.from("%PDF-");
const MAX_PDF_INPUTS = 32;
const MAX_PDF_INPUT_BYTES = 256 * 1024 * 1024;
const MAX_PDF_AGGREGATE_BYTES = 512 * 1024 * 1024;
const OVERWRITE_CONFIRMATION = "I_UNDERSTAND_OVERWRITE";

function failed(message: string): ConverterOperationResult { return { ok: false, output: null, pages: null, metadata: {}, message }; }

function assertPdf(data: Buffer, path: string): void {
    if (!data.subarray(0, PDF.byteLength).equals(PDF)) throw new Error(`${path} is not a PDF by byte signature.`);
    if (!data.includes(Buffer.from("%%EOF"))) throw new Error(`${path} does not contain a complete PDF EOF marker.`);
}

function metadataOf(document: PDFDocument): Record<string, string> {
    return { title: document.getTitle() ?? "", author: document.getAuthor() ?? "", subject: document.getSubject() ?? "", keywords: document.getKeywords() ?? "", creator: document.getCreator() ?? "", producer: document.getProducer() ?? "" };
}

function rotationsOf(document: PDFDocument): number[] { return document.getPages().map((page) => page.getRotation().angle); }

function requestedPages(document: PDFDocument, pages: readonly number[] | undefined): number[] {
    const selected = pages === undefined || pages.length === 0 ? document.getPages().map((_page, index) => index) : [...pages];
    if (selected.some((index) => !Number.isInteger(index) || index < 0 || index >= document.getPageCount())) throw new Error("A requested PDF page is outside the source document.");
    return selected;
}

async function exists(path: string): Promise<boolean> { return stat(path).then(() => true).catch(() => false); }

async function writeValidatedPdf(document: PDFDocument, outputPath: string, request: ConverterOperationRequest, expectedPages: number, expectedRotations: readonly number[], expectedMetadata: Readonly<Record<string, string>>): Promise<void> {
    const target = resolve(outputPath);
    if (await exists(target)) {
        if (!request.overwrite) throw new Error("The output already exists. Confirm overwrite before converting.");
        if (request.overwriteConfirmation !== OVERWRITE_CONFIRMATION) throw new Error("Overwriting requires the converter super-confirmation.");
    }
    const outputBytes = await document.save({ useObjectStreams: true });
    await mkdir(dirname(target), { recursive: true });
    const temp = `${target}.${process.pid}.${randomBytes(6).toString("hex")}.writing`;
    try {
        await writeFile(temp, outputBytes, { flag: "wx" });
        const reopened = await PDFDocument.load(await readFile(temp), { updateMetadata: false });
        if (reopened.getPageCount() !== expectedPages) throw new Error("The written PDF failed page-count validation.");
        const actualRotations = rotationsOf(reopened);
        if (actualRotations.some((rotation, index) => rotation !== expectedRotations[index])) throw new Error("The written PDF failed page-rotation validation.");
        const actualMetadata = metadataOf(reopened);
        for (const key of ["title", "author", "subject", "keywords"] as const) if (actualMetadata[key] !== (expectedMetadata[key] ?? "")) throw new Error(`The written PDF failed ${key} metadata validation.`);
        await replaceFileWithRetry(temp, target, rename);
    } catch (error) { await rm(temp, { force: true }).catch(() => undefined); throw error; }
    finally { await rm(temp, { force: true }).catch(() => undefined); }
}

async function readBoundedPdfInputs(inputs: readonly string[], signal?: AbortSignal): Promise<Buffer[]> {
    if (inputs.length === 0) throw new Error("Choose at least one PDF and an output path.");
    if (inputs.length > MAX_PDF_INPUTS) throw new Error(`PDF operations accept at most ${MAX_PDF_INPUTS} input files at once.`);
    const sizes = await Promise.all(inputs.map(async (input) => {
        if (signal?.aborted) throw new Error("The PDF operation was cancelled.");
        const info = await stat(input);
        if (!info.isFile()) throw new Error(`${input} is not a regular file.`);
        if (info.size > MAX_PDF_INPUT_BYTES) throw new Error(`${input} exceeds the PDF adapter safety limit.`);
        return info.size;
    }));
    if (sizes.reduce((sum, size) => sum + size, 0) > MAX_PDF_AGGREGATE_BYTES) throw new Error("The selected PDF inputs exceed the aggregate safety limit.");
    return Promise.all(inputs.map(async (input) => {
        if (signal?.aborted) throw new Error("The PDF operation was cancelled.");
        const data = await readFile(input);
        if (data.byteLength > MAX_PDF_INPUT_BYTES) throw new Error(`${input} changed and now exceeds the PDF adapter safety limit.`);
        return data;
    }));
}

/** Bundled PDF operations have bounded preflight, atomic sibling writes, confirmation, and independent reopen validation. */
export async function runPdfOperation(request: ConverterOperationRequest): Promise<ConverterOperationResult> {
    try {
        if (request.output.trim() === "") return failed("Choose an output path.");
        const buffers = await readBoundedPdfInputs(request.inputs, request.signal);
        buffers.forEach((data, index) => assertPdf(data, request.inputs[index]!));
        const documents = await Promise.all(buffers.map((buffer) => PDFDocument.load(buffer, { updateMetadata: false })));
        const first = documents[0]!;
        if (request.operation === "inspect") return { ok: true, output: null, pages: first.getPageCount(), pageOrder: first.getPages().map((_page, index) => index), rotations: rotationsOf(first), metadata: metadataOf(first), message: `Inspected ${first.getPageCount()} page${first.getPageCount() === 1 ? "" : "s"}.` };
        const outputDocument = await PDFDocument.create();
        const pageOrder: number[] = [];
        const addFrom = async (document: PDFDocument, selected: readonly number[], offset: number): Promise<void> => {
            const pages = await outputDocument.copyPages(document, [...selected]);
            pages.forEach((_page, index) => pageOrder.push(offset + selected[index]!));
            pages.forEach((page) => outputDocument.addPage(page));
        };
        if (request.operation === "merge") { let offset = 0; for (const document of documents) { await addFrom(document, document.getPages().map((_page, index) => index), offset); offset += document.getPageCount(); } }
        else await addFrom(first, requestedPages(first, request.pages), 0);
        if (request.operation === "rotate") outputDocument.getPages().forEach((page) => page.setRotation(degrees(request.rotation ?? 90)));
        if (request.operation === "metadata") { const values = request.metadata ?? {}; if (values.title !== undefined) outputDocument.setTitle(values.title); if (values.author !== undefined) outputDocument.setAuthor(values.author); if (values.subject !== undefined) outputDocument.setSubject(values.subject); if (values.keywords !== undefined) outputDocument.setKeywords(values.keywords.split(",").map((value) => value.trim()).filter(Boolean)); }
        const expectedMetadata = metadataOf(outputDocument);
        const expectedRotations = rotationsOf(outputDocument);
        const outputPaths: string[] = [];
        if (request.operation === "split" && request.outputs !== undefined) {
            const selected = requestedPages(first, request.pages);
            if (request.outputs.length !== selected.length) throw new Error("A split operation needs exactly one output path per selected page.");
            for (let index = 0; index < selected.length; index += 1) { const one = await PDFDocument.create(); const [page] = await one.copyPages(first, [selected[index]!]); one.addPage(page!); await writeValidatedPdf(one, request.outputs[index]!, request, 1, [0], metadataOf(one)); outputPaths.push(resolve(request.outputs[index]!)); }
        } else { await writeValidatedPdf(outputDocument, request.output, request, outputDocument.getPageCount(), expectedRotations, expectedMetadata); outputPaths.push(resolve(request.output)); }
        return { ok: true, output: outputPaths[0] ?? null, outputs: outputPaths, pages: outputDocument.getPageCount(), pageOrder, rotations: expectedRotations, metadata: expectedMetadata, message: `Wrote and reopened ${request.operation} output with ${outputDocument.getPageCount()} page${outputDocument.getPageCount() === 1 ? "" : "s"}.` };
    } catch (error) { return failed(error instanceof Error ? error.message : String(error)); }
}

export function hashPdfBytes(data: Buffer): string { return createHash("sha256").update(data).digest("hex"); }
