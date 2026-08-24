import { runBuiltInTransform } from "./transforms.js";
import { runPdfOperation } from "./operations.js";

interface WorkerRequest { readonly kind: "transform" | "pdf"; readonly source?: string; readonly target?: string; readonly adapterId?: string; readonly request?: Record<string, unknown>; }

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => { input += chunk; if (input.length > 2 * 1024 * 1024) { process.stdout.write(JSON.stringify({ ok: false, message: "The isolated adapter request exceeded the safety limit." })); process.exitCode = 1; } });
process.stdin.on("end", async () => {
    try {
        const request = JSON.parse(input) as WorkerRequest;
        if (request.kind === "transform" && typeof request.source === "string" && typeof request.target === "string" && typeof request.adapterId === "string") process.stdout.write(JSON.stringify({ ok: true, result: await runBuiltInTransform(request.source, request.target, request.adapterId) }));
        else if (request.kind === "pdf" && request.request !== undefined) process.stdout.write(JSON.stringify({ ok: true, result: await runPdfOperation(request.request as never) }));
        else throw new Error("The isolated adapter request was invalid.");
    } catch (error) { process.stdout.write(JSON.stringify({ ok: false, message: error instanceof Error ? error.message : String(error) })); process.exitCode = 1; }
});
