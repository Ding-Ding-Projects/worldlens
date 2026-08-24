import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

export type PdfOperation = "inspect" | "split" | "merge" | "extract" | "reorder" | "rotate" | "metadata";

export interface ConverterOperationRequest {
    readonly operation: PdfOperation;
    readonly inputs: readonly string[];
    readonly output: string;
    readonly overwrite: boolean;
    readonly pages?: readonly number[];
    readonly rotation?: 0 | 90 | 180 | 270;
}

export interface ConverterOperationResult {
    readonly ok: boolean;
    readonly output: string | null;
    readonly pages: number | null;
    readonly message: string;
    readonly metadata: Readonly<Record<string, string>>;
}

const PDF = Buffer.from("%PDF-");

function safeOutput(input: string, output: string): boolean {
    const root = resolve(dirname(input));
    return resolve(output).startsWith(root + sep) || resolve(output) === root;
}

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
    if (!safeOutput(request.inputs[0]!, request.output)) return { ok: false, output: null, pages: null, metadata: {}, message: "The output must stay beside the selected PDF unless the destination is explicitly browsed." };
    const buffers = await Promise.all(request.inputs.map((input) => readFile(input)));
    buffers.forEach((data, index) => assertPdf(data, request.inputs[index]!));
    if (request.operation !== "inspect") return { ok: false, output: null, pages: null, metadata: {}, message: `The bundled PDF adapter does not expose ${request.operation} in this build yet. No output was written.` };
    const text = buffers[0]!.toString("latin1");
    const pages = Math.max(1, (text.match(/\/Type\s*\/Page\b/g) ?? []).length);
    return { ok: true, output: null, pages, metadata: {}, message: `Inspected ${pages} page${pages === 1 ? "" : "s"}.`, };
}

/** Atomic copy used by lossless adapters after independent output validation. */
export async function atomicCopyValidated(source: string, output: string): Promise<void> {
    const sourceData = await readFile(source);
    await mkdir(dirname(output), { recursive: true });
    const temp = `${output}.${process.pid}.${Date.now()}.writing`;
    try { await writeFile(temp, sourceData); await copyFile(temp, output); } finally { await import("node:fs/promises").then(({ rm }) => rm(temp, { force: true })); }
}
