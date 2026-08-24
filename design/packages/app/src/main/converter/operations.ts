import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { PDFDocument, degrees } from "pdf-lib";
import { replaceFileWithRetry } from "../storage/atomicReplace.js";

export type PdfOperation = "inspect" | "split" | "merge" | "extract" | "reorder" | "rotate" | "metadata";

export interface ConverterOperationRequest {
    readonly operation: PdfOperation;
    readonly inputs: readonly string[];
    readonly output: string;
    readonly overwrite: boolean;
    readonly pages?: readonly number[];
    readonly rotation?: 0 | 90 | 180 | 270;
    readonly metadata?: Readonly<Record<string, string>>;
}

export interface ConverterOperationResult {
    readonly ok: boolean;
    readonly output: string | null;
    readonly pages: number | null;
    readonly message: string;
    readonly metadata: Readonly<Record<string, string>>;
}

const PDF = Buffer.from("%PDF-");

function assertPdf(data: Buffer, path: string): void {
    if (!data.subarray(0, PDF.byteLength).equals(PDF)) throw new Error(`${path} is not a PDF by byte signature.`);
    if (!data.includes(Buffer.from("%%EOF"))) throw new Error(`${path} does not contain a complete PDF EOF marker.`);
}

/**
 * Conservative PDF adapter boundary. It validates signatures and writes atomically through a
 * temporary sibling. Full page rewriting belongs to a bundled PDF engine, never to a random
 * command found on PATH. The result therefore refuses unsupported mutation instead of writing
 * a guessed or corrupt file.
 */
export async function runPdfOperation(request: ConverterOperationRequest): Promise<ConverterOperationResult> {
    if (request.inputs.length === 0 || request.output.trim() === "") return { ok: false, output: null, pages: null, metadata: {}, message: "Choose at least one PDF and an output path." };
    if (!request.overwrite && await stat(request.output).then(() => true).catch(() => false)) return { ok: false, output: null, pages: null, metadata: {}, message: "The output already exists. Confirm overwrite before converting." };
    const buffers = await Promise.all(request.inputs.map(async (input) => { const data = await readFile(input); if (data.byteLength > 256 * 1024 * 1024) throw new Error(`${input} exceeds the PDF adapter safety limit.`); return data; }));
    buffers.forEach((data, index) => assertPdf(data, request.inputs[index]!));
    const documents = await Promise.all(buffers.map((buffer) => PDFDocument.load(buffer, { updateMetadata: false })));
    const first = documents[0]!;
    const metadata = { title: first.getTitle() ?? "", author: first.getAuthor() ?? "", subject: first.getSubject() ?? "", keywords: first.getKeywords() ?? "", creator: first.getCreator() ?? "", producer: first.getProducer() ?? "" };
    if (request.operation === "inspect") return { ok: true, output: null, pages: first.getPageCount(), metadata, message: `Inspected ${first.getPageCount()} page${first.getPageCount() === 1 ? "" : "s"}.` };
    const outputDocument = await PDFDocument.create();
    const indices = request.pages && request.pages.length > 0 ? request.pages : first.getPages().map((_page, index) => index);
    const addFrom = async (document: PDFDocument, selected: readonly number[]) => { const pages = await outputDocument.copyPages(document, [...selected]); pages.forEach((page) => outputDocument.addPage(page)); };
    if (request.operation === "merge") for (const document of documents) await addFrom(document, document.getPages().map((_page, index) => index));
    else await addFrom(first, indices);
    if (request.operation === "rotate") outputDocument.getPages().forEach((page) => page.setRotation(degrees(request.rotation ?? 90)));
    if (request.operation === "metadata") { const values = request.metadata ?? {}; if (values.title !== undefined) outputDocument.setTitle(values.title); if (values.author !== undefined) outputDocument.setAuthor(values.author); if (values.subject !== undefined) outputDocument.setSubject(values.subject); if (values.keywords !== undefined) outputDocument.setKeywords(values.keywords.split(",").map((value) => value.trim()).filter(Boolean)); }
    const outputBytes = await outputDocument.save({ useObjectStreams: true });
    await mkdir(dirname(resolve(request.output)), { recursive: true });
    const temp = `${resolve(request.output)}.${process.pid}.${randomBytes(6).toString("hex")}.writing`;
    try { await writeFile(temp, outputBytes, { flag: "wx" }); const reopened = await PDFDocument.load(await readFile(temp), { updateMetadata: false }); if (reopened.getPageCount() !== outputDocument.getPageCount()) throw new Error("The written PDF failed page-count validation."); await replaceFileWithRetry(temp, resolve(request.output), rename); } catch (error) { await rm(temp, { force: true }).catch(() => undefined); throw error; } finally { await rm(temp, { force: true }).catch(() => undefined); }
    return { ok: true, output: resolve(request.output), pages: outputDocument.getPageCount(), metadata, message: `Wrote and reopened ${request.operation} output with ${outputDocument.getPageCount()} page${outputDocument.getPageCount() === 1 ? "" : "s"}.` };
}
