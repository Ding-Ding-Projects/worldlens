import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { bootstrapManagedMapHost, createManagedMapHost } from "./host.js";
import type { HostedAdministrator } from "../bridge/ManagedHostedAccess.js";

async function main(): Promise<void> {
    const argument = (name: string): string | undefined => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
    const dataRoot = argument("--data-root") ?? process.env.WORLDLENS_HOST_DATA;
    if (!dataRoot) throw new Error("Set WORLDLENS_HOST_DATA to private writable host storage.");
    if (process.argv.includes("--bootstrap")) {
        const chunks: Buffer[] = []; let size = 0;
        for await (const chunk of process.stdin) { const data = Buffer.from(chunk as Uint8Array); size += data.length; if (size > 4096) throw new Error("Protected bootstrap input exceeds its limit."); chunks.push(data); }
        await bootstrapManagedMapHost(dataRoot, JSON.parse(Buffer.concat(chunks).toString("utf8")) as HostedAdministrator);
        process.stdout.write(JSON.stringify({ state: "provisioned" }) + "\n"); return;
    }
    const origin = argument("--origin") ?? process.env.WORLDLENS_HOST_ORIGIN;
    if (!origin) throw new Error("Set WORLDLENS_HOST_ORIGIN to the exact HTTPS hosting origin.");
    const port = Number(argument("--port") || process.env.WORLDLENS_HOST_PORT || new URL(origin).port || (new URL(origin).protocol === "https:" ? 443 : 80));
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Hosting port is invalid.");
    const keyPath = argument("--tls-key") ?? process.env.WORLDLENS_HOST_TLS_KEY; const certPath = argument("--tls-cert") ?? process.env.WORLDLENS_HOST_TLS_CERT;
    const tls = keyPath && certPath ? { key: await readFile(keyPath, "utf8"), cert: await readFile(certPath, "utf8") } : undefined;
    const operationId = argument("--operation-id") ?? process.env.WORLDLENS_HOST_OPERATION ?? randomUUID();
    const contextFingerprint = argument("--context-fingerprint") ?? process.env.WORLDLENS_HOST_CONTEXT;
    const { server } = await createManagedMapHost({ mapRoot: argument("--map-root") ?? process.env.WORLDLENS_HOST_MAP ?? fileURLToPath(new URL("./map/", import.meta.url)), dataRoot, origin, operationId, ...(contextFingerprint ? { contextFingerprint } : {}), ...(tls ? { tls } : {}) });
    const bind = process.env.WORLDLENS_HOST_BIND ?? (origin.startsWith("https:") ? "0.0.0.0" : "127.0.0.1");
    if (!origin.startsWith("https:") && !["127.0.0.1", "::1", "localhost"].includes(bind)) throw new Error("Plain HTTP hosting must bind only to loopback.");
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, bind, () => resolve()); });
    process.stdout.write(JSON.stringify({ state: "listening", origin, authentication: "required" }) + "\n");
    const close = (): void => { server.close(() => process.exit(0)); };
    process.once("SIGTERM", close); process.once("SIGINT", close);
}
void main().catch(() => { process.stderr.write("Managed map host did not start. Check protected bootstrap, TLS and host configuration.\n"); process.exitCode = 1; });
