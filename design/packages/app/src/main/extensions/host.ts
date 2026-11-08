import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * Extensions: small programs, in any language, that add commands to Worldlens. Each lives in
 * its own folder with a versioned manifest, runs in its own process for one request at a time,
 * receives only the data its granted permissions cover, and is stopped at its time and size
 * limits. Nothing sensitive is ever handed over: the environment is stripped to what a program
 * needs to start, and no token, credential or path outside the request reaches it.
 *
 * The protocol is one JSON line in on standard input and one JSON line out on standard output:
 *
 *   in:  {"protocol":1,"command":"<id>","input":{...}}
 *   out: {"ok":true,"output":{"kind":"text","name":"markers.csv","text":"..."}}
 *        {"ok":false,"message":"what went wrong"}
 *
 * Anything a program prints on standard error is kept (bounded) as diagnostics.
 */

export const MANIFEST_FILE = "worldlens-extension.json";
export const PROTOCOL_VERSION = 1;

export const PERMISSIONS = ["read-markers", "read-map-summary", "produce-file"] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_TEXT: Readonly<Record<Permission, string>> = {
    "read-markers": "Read the markers of the open map: labels, positions and set names.",
    "read-map-summary": "Read the open map's name, id and how many markers each set has.",
    "produce-file": "Hand back a file for you to save; it never writes anywhere itself through Worldlens.",
};

export type InputKind = "none" | "markers" | "map-summary";

export interface ExtensionCommand {
    readonly id: string;
    readonly title: string;
    readonly input: InputKind;
}

export interface ExtensionManifest {
    readonly manifestVersion: 1;
    readonly id: string;
    readonly name: string;
    readonly version: string;
    readonly description: string;
    readonly run: { readonly command: string; readonly args: readonly string[] };
    readonly permissions: readonly Permission[];
    readonly commands: readonly ExtensionCommand[];
    readonly limits: { readonly timeoutMs: number; readonly maxOutputBytes: number };
}

export const LIMITS = { defaultTimeoutMs: 10_000, maxTimeoutMs: 60_000, defaultOutputBytes: 1024 * 1024, maxOutputBytes: 16 * 1024 * 1024, maxInputBytes: 8 * 1024 * 1024, stderrBytes: 64 * 1024 } as const;

const INPUT_NEEDS: Readonly<Record<InputKind, Permission | null>> = { none: null, markers: "read-markers", "map-summary": "read-map-summary" };

/** Validates a manifest strictly; every problem is named, nothing is guessed. */
export function parseManifest(value: unknown): { manifest: ExtensionManifest; problems: [] } | { manifest: null; problems: string[] } {
    const problems: string[] = [];
    const v = (value ?? {}) as Record<string, unknown>;
    if (v["manifestVersion"] !== 1) problems.push("manifestVersion must be 1.");
    const id = typeof v["id"] === "string" && /^[a-z][a-z0-9-]{1,63}$/u.test(v["id"]) ? v["id"] : null;
    if (!id) problems.push("id must be 2 to 64 lowercase letters, digits or hyphens, starting with a letter.");
    const name = typeof v["name"] === "string" && v["name"].trim() && v["name"].length <= 80 ? v["name"].trim() : null;
    if (!name) problems.push("name is required (up to 80 characters).");
    const version = typeof v["version"] === "string" && /^\d+\.\d+\.\d+([-+][\w.]+)?$/u.test(v["version"]) ? v["version"] : null;
    if (!version) problems.push("version must look like 1.0.0.");
    const run = v["run"] as { command?: unknown; args?: unknown } | undefined;
    const command = typeof run?.command === "string" ? run.command : null;
    if (!command || path.isAbsolute(command) || command.includes("..")) problems.push("run.command must be node, python, python3 or a program inside the extension folder.");
    const args = Array.isArray(run?.args) && run.args.every((a) => typeof a === "string" && a.length < 512) ? (run.args as string[]) : run?.args === undefined ? [] : null;
    if (!args) problems.push("run.args must be a list of strings.");
    const permissions = Array.isArray(v["permissions"]) ? (v["permissions"] as unknown[]) : [];
    const unknown = permissions.filter((p) => !PERMISSIONS.includes(p as Permission));
    if (unknown.length) problems.push(`Unknown permissions: ${unknown.join(", ")}.`);
    const commands = Array.isArray(v["commands"]) ? (v["commands"] as Record<string, unknown>[]) : [];
    if (commands.length === 0 || commands.length > 32) problems.push("commands must list 1 to 32 commands.");
    const parsedCommands: ExtensionCommand[] = [];
    for (const c of commands) {
        const cid = typeof c["id"] === "string" && /^[a-z][a-z0-9-]{0,63}$/u.test(c["id"]) ? c["id"] : null;
        const title = typeof c["title"] === "string" && c["title"].trim() ? c["title"].trim().slice(0, 80) : null;
        const input = (c["input"] ?? "none") as InputKind;
        if (!cid || !title || !(input in INPUT_NEEDS)) {
            problems.push(`Command ${String(c["id"])} needs an id, a title and an input of none, markers or map-summary.`);
            continue;
        }
        const need = INPUT_NEEDS[input];
        if (need && !permissions.includes(need)) problems.push(`Command ${cid} reads ${input} and must declare the ${need} permission.`);
        parsedCommands.push({ id: cid, title, input });
    }
    const limits = (v["limits"] ?? {}) as { timeoutMs?: unknown; maxOutputBytes?: unknown };
    const timeoutMs = typeof limits.timeoutMs === "number" ? Math.min(LIMITS.maxTimeoutMs, Math.max(500, Math.round(limits.timeoutMs))) : LIMITS.defaultTimeoutMs;
    const maxOutputBytes = typeof limits.maxOutputBytes === "number" ? Math.min(LIMITS.maxOutputBytes, Math.max(1024, Math.round(limits.maxOutputBytes))) : LIMITS.defaultOutputBytes;
    if (problems.length || !id || !name || !version || !command || !args) return { manifest: null, problems };
    return {
        manifest: {
            manifestVersion: 1,
            id,
            name,
            version,
            description: typeof v["description"] === "string" ? v["description"].slice(0, 400) : "",
            run: { command, args },
            permissions: permissions as Permission[],
            commands: parsedCommands,
            limits: { timeoutMs, maxOutputBytes },
        },
        problems: [],
    };
}

/** A fingerprint of what the person consented to: the permission set, sorted. */
export const permissionKey = (permissions: readonly Permission[]): string => createHash("sha256").update([...permissions].sort().join(",")).digest("hex").slice(0, 16);

/** The environment a program receives: enough to start, and nothing that identifies or authorises. */
export function strippedEnvironment(env: NodeJS.ProcessEnv, extra: Record<string, string> = {}): Record<string, string> {
    const keep = ["PATH", "Path", "SystemRoot", "SYSTEMROOT", "TEMP", "TMP", "TMPDIR", "LANG", "LC_ALL", "PATHEXT", "COMSPEC", "WINDIR"];
    const out: Record<string, string> = {};
    for (const key of keep) if (typeof env[key] === "string") out[key] = env[key]!;
    return { ...out, WORLDLENS_EXTENSION_PROTOCOL: String(PROTOCOL_VERSION), PYTHONIOENCODING: "utf-8", ...extra };
}

export interface RunOutcome {
    readonly ok: boolean;
    readonly message: string;
    readonly output?: { readonly kind: "text"; readonly name: string; readonly text: string };
    readonly stderr: string;
    readonly ms: number;
}

export interface Program {
    readonly file: string;
    readonly args: readonly string[];
    readonly env: Record<string, string>;
}

/** Resolves the manifest's command to a program; node runs on this app's own runtime. */
export function resolveProgram(manifest: ExtensionManifest, folder: string, nodeRuntime: string, env: NodeJS.ProcessEnv): Program | null {
    const base = strippedEnvironment(env);
    const command = manifest.run.command;
    if (command === "node") return { file: nodeRuntime, args: manifest.run.args, env: { ...base, ELECTRON_RUN_AS_NODE: "1" } };
    if (command === "python" || command === "python3" || command === "py") return { file: command, args: manifest.run.args, env: base };
    const inside = path.resolve(folder, command);
    if (!inside.startsWith(path.resolve(folder) + path.sep) || !existsSync(inside)) return null;
    return { file: inside, args: manifest.run.args, env: base };
}

/** Runs one request with the time and size limits; never resolves before the program is gone. */
export function runOnce(program: Program, folder: string, request: unknown, limits: ExtensionManifest["limits"]): Promise<RunOutcome> {
    const started = Date.now();
    const line = JSON.stringify(request);
    if (Buffer.byteLength(line) > LIMITS.maxInputBytes) return Promise.resolve({ ok: false, message: "The input is larger than 8 MB.", stderr: "", ms: 0 });
    return new Promise((resolve) => {
        let stdout = Buffer.alloc(0);
        let stderr = "";
        let settled = false;
        let reason: string | null = null;
        const child = spawn(program.file, [...program.args], { cwd: folder, env: program.env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true, shell: false });
        const stop = (why: string): void => {
            if (reason === null) reason = why;
            child.kill("SIGKILL");
        };
        const timer = setTimeout(() => stop(`It did not answer within ${Math.round(limits.timeoutMs / 1000)} seconds and was stopped.`), limits.timeoutMs);
        child.stdout.on("data", (chunk: Buffer) => {
            stdout = Buffer.concat([stdout, chunk]);
            if (stdout.length > limits.maxOutputBytes) stop(`Its answer passed the ${Math.round(limits.maxOutputBytes / 1024)} KB limit and it was stopped.`);
        });
        child.stderr.on("data", (chunk: Buffer) => {
            if (stderr.length < LIMITS.stderrBytes) stderr += chunk.toString("utf8").slice(0, LIMITS.stderrBytes - stderr.length);
        });
        const finish = (outcome: Omit<RunOutcome, "stderr" | "ms">): void => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve({ ...outcome, stderr, ms: Date.now() - started });
        };
        child.on("error", (error) => finish({ ok: false, message: `It could not start: ${error.message}` }));
        child.on("close", (code) => {
            if (reason) return finish({ ok: false, message: reason });
            const text = stdout.toString("utf8").trim().split("\n").filter(Boolean).at(-1) ?? "";
            let answer: { ok?: unknown; message?: unknown; output?: { kind?: unknown; name?: unknown; text?: unknown } };
            try {
                answer = JSON.parse(text) as typeof answer;
            } catch {
                return finish({ ok: false, message: code === 0 ? "It answered with something that is not one JSON line." : `It exited with code ${code} without an answer.` });
            }
            if (answer.ok !== true) return finish({ ok: false, message: typeof answer.message === "string" ? answer.message.slice(0, 600) : "It reported a failure without a message." });
            const out = answer.output;
            if (!out) return finish({ ok: true, message: typeof answer.message === "string" ? answer.message.slice(0, 600) : "Done." });
            if (out.kind !== "text" || typeof out.text !== "string") return finish({ ok: false, message: "Its output must be {\"kind\":\"text\",\"name\":...,\"text\":...}." });
            const name = typeof out.name === "string" ? path.basename(out.name).replace(/[^\w.() -]/gu, "_").slice(0, 80) || "output.txt" : "output.txt";
            finish({ ok: true, message: typeof answer.message === "string" ? answer.message.slice(0, 600) : "Done.", output: { kind: "text", name, text: out.text } });
        });
        child.stdin.on("error", () => undefined);
        child.stdin.end(`${line}\n`);
    });
}

export interface ExtensionRecord {
    readonly manifest: ExtensionManifest | null;
    readonly folder: string;
    readonly builtIn: boolean;
    readonly problems: readonly string[];
    readonly enabled: boolean;
    /** True when the permissions differ from what was consented to, or nothing was. */
    readonly needsConsent: boolean;
}

interface Consent {
    readonly enabled: boolean;
    readonly key: string | null;
}

/** Finds extensions, keeps consent, and runs commands under the granted permissions. */
export class ExtensionHost {
    constructor(
        private readonly folders: { readonly builtIn: string; readonly user: string },
        private readonly stateFile: string,
        private readonly nodeRuntime: string = process.execPath,
        private readonly env: NodeJS.ProcessEnv = process.env,
    ) {}

    private async consent(): Promise<Record<string, Consent>> {
        try {
            return JSON.parse(await fs.readFile(this.stateFile, "utf8")) as Record<string, Consent>;
        } catch {
            return {};
        }
    }

    private async saveConsent(next: Record<string, Consent>): Promise<void> {
        await fs.mkdir(path.dirname(this.stateFile), { recursive: true });
        await fs.writeFile(this.stateFile, JSON.stringify(next, null, 2), "utf8");
    }

    async list(): Promise<ExtensionRecord[]> {
        const consent = await this.consent();
        const out: ExtensionRecord[] = [];
        for (const [root, builtIn] of [[this.folders.builtIn, true], [this.folders.user, false]] as const) {
            const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
            for (const entry of entries) {
                if (!entry.isDirectory()) continue;
                const folder = path.join(root, entry.name);
                let parsed: ReturnType<typeof parseManifest>;
                try {
                    parsed = parseManifest(JSON.parse(await fs.readFile(path.join(folder, MANIFEST_FILE), "utf8")));
                } catch (error) {
                    parsed = { manifest: null, problems: [`${MANIFEST_FILE} could not be read: ${error instanceof Error ? error.message : String(error)}`] };
                }
                const m = parsed.manifest;
                const c = m ? consent[m.id] : undefined;
                const key = m ? permissionKey(m.permissions) : null;
                // A built-in extension is consented to by shipping it; a changed permission set
                // on anything else switches it off until the person agrees again.
                const agreed = builtIn || (c?.key !== undefined && c.key === key);
                out.push({ manifest: m, folder, builtIn, problems: parsed.problems, enabled: !!m && agreed && (c?.enabled ?? builtIn), needsConsent: !!m && !agreed });
            }
        }
        return out;
    }

    /** Turning an extension on records consent to exactly the permissions it declares now. */
    async setEnabled(id: string, enabled: boolean): Promise<ExtensionRecord | null> {
        const record = (await this.list()).find((r) => r.manifest?.id === id);
        if (!record?.manifest) return null;
        const consent = await this.consent();
        consent[id] = { enabled, key: enabled ? permissionKey(record.manifest.permissions) : (consent[id]?.key ?? null) };
        await this.saveConsent(consent);
        return (await this.list()).find((r) => r.manifest?.id === id) ?? null;
    }

    /** Runs a command. The input is trimmed to what the command's input kind allows. */
    async run(id: string, commandId: string, input: unknown): Promise<RunOutcome> {
        const record = (await this.list()).find((r) => r.manifest?.id === id);
        const m = record?.manifest;
        if (!record || !m) return { ok: false, message: "That extension is not installed.", stderr: "", ms: 0 };
        if (record.needsConsent) return { ok: false, message: "Its permissions changed. Turn it on again to agree to them.", stderr: "", ms: 0 };
        if (!record.enabled) return { ok: false, message: "Turn the extension on first.", stderr: "", ms: 0 };
        const command = m.commands.find((c) => c.id === commandId);
        if (!command) return { ok: false, message: "That command is not in the extension's manifest.", stderr: "", ms: 0 };
        const program = resolveProgram(m, record.folder, this.nodeRuntime, this.env);
        if (!program) return { ok: false, message: "Its program is not inside the extension folder.", stderr: "", ms: 0 };
        return await runOnce(program, record.folder, { protocol: PROTOCOL_VERSION, command: command.id, input: command.input === "none" ? null : input ?? null }, m.limits);
    }
}
