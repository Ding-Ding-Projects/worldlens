import { randomBytes } from "node:crypto";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, extname } from "node:path";
import { replaceFileWithRetry } from "../storage/atomicReplace.js";

const MAX_BYTES = 1024 * 1024 * 1024;
const extension = (path: string): string => extname(path).toLowerCase().slice(1);
const escapeHtml = (value: string): string => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

function jsonToYaml(value: unknown, depth = 0): string {
    const indent = "  ".repeat(depth);
    if (Array.isArray(value)) return value.map((item) => `${indent}- ${jsonToYaml(item, depth + 1).trimStart()}`).join("\n");
    if (typeof value === "object" && value !== null) return Object.entries(value).map(([key, item]) => `${indent}${key}: ${typeof item === "object" && item !== null ? `\n${jsonToYaml(item, depth + 1)}` : String(item)}`).join("\n");
    return JSON.stringify(value);
}

export async function runBuiltInTransform(source: string, target: string, adapterId: string): Promise<{ readonly bytes: number; readonly message: string }> {
    const input = await readFile(source);
    if (input.byteLength > MAX_BYTES) throw new Error("The input exceeds the converter safety limit.");
    const sourceExt = extension(source); const targetExt = extension(target);
    let output: Buffer;
    if (adapterId === "data-json") {
        let value: unknown; try { value = JSON.parse(input.toString("utf8")); } catch { throw new Error("The JSON input is malformed and was left untouched."); }
        if (targetExt === "yaml" || targetExt === "yml") output = Buffer.from(`${jsonToYaml(value)}\n`, "utf8");
        else if (targetExt === "csv") {
            if (!Array.isArray(value) || !value.every((row) => typeof row === "object" && row !== null && !Array.isArray(row))) throw new Error("JSON to CSV needs an array of objects.");
            const rows = value as Record<string, unknown>[]; const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
            const quote = (cell: unknown) => `"${String(cell ?? "").replaceAll('"', '""')}"`;
            output = Buffer.from([keys.map(quote).join(","), ...rows.map((row) => keys.map((key) => quote(row[key])).join(","))].join("\r\n") + "\r\n", "utf8");
        } else output = Buffer.from(JSON.stringify(value, null, 2) + "\n", "utf8");
        if (sourceExt !== "json") throw new Error("The JSON adapter only accepts a JSON source by byte and parse validation.");
    } else if (adapterId === "text-markdown") {
        const text = input.toString("utf8");
        output = targetExt === "html" ? Buffer.from(`<article><pre>${escapeHtml(text)}</pre></article>\n`, "utf8") : Buffer.from(text, "utf8");
    } else if (adapterId === "binary-base64") {
        if (sourceExt === "b64") { const normalized = input.toString("ascii").replace(/\s+/g, ""); if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 === 1) throw new Error("The Base64 input is malformed."); output = targetExt === "bin" ? Buffer.from(normalized, "base64") : Buffer.from(normalized + "\n", "ascii"); }
        else output = targetExt === "b64" ? Buffer.from(input.toString("base64") + "\n", "ascii") : Buffer.from(input);
    } else throw new Error(`Adapter ${adapterId} has no built-in transform.`);
    if (await access(target).then(() => true).catch(() => false)) throw new Error("The output already exists. Confirm overwrite before converting.");
    await mkdir(dirname(target), { recursive: true });
    const temp = `${target}.${process.pid}.${randomBytes(6).toString("hex")}.writing`;
    try { await writeFile(temp, output, { flag: "wx" }); if (targetExt === "json") JSON.parse(output.toString("utf8")); if (targetExt === "b64") Buffer.from(output.toString("ascii").trim(), "base64"); await replaceFileWithRetry(temp, target, rename); } finally { await rm(temp, { force: true }).catch(() => undefined); }
    return { bytes: output.byteLength, message: `Converted ${sourceExt || "file"} to ${targetExt || "file"} with the built-in adapter.` };
}
