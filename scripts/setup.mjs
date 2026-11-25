#!/usr/bin/env node
/**
 * One-command setup for the hosted WorldLens application (the container deployment).
 *
 * No install step and no dependencies: this single file runs on Node.js 18 or newer, so it can be
 * downloaded and started in one line. It asks for everything it cannot choose safely (in a small
 * terminal interface with defaults, live validation, Back and a review screen), generates
 * everything it can (a strong password, a free port, the network address), writes a Compose file
 * and a private `.env`, starts the container, waits for it to answer, and prints working links.
 *
 *   node scripts/setup.mjs                 interactive (arrow keys), or line prompts without a terminal
 *   node scripts/setup.mjs --yes ...       no questions; every value from flags or WORLDLENS_SETUP_*
 *   node scripts/setup.mjs --help          every flag and its environment variable
 *
 * The password is never written anywhere. Only its SHA-256 goes to `.env` (the form the hosted
 * server already accepts), and a generated password is printed exactly once.
 *
 * Exit codes: 0 done, 1 bad input, 2 refused to overwrite a file this setup did not create,
 * 3 files written but Docker is unavailable, 4 pull, start or health check failed, 130 cancelled.
 */
import { createHash, randomInt } from "node:crypto";
import fsp from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

/** The published hosted image, pinned by digest. Kept in step with `publishedImages.ts` by a test. */
export const HOSTED_IMAGE =
    "ghcr.io/ding-ding-projects/worldlens-hosted@sha256:a24d49d3a7d55b60848f49094b3ccdce6fe07262a1d55c84fe4e3f76e314b773";
export const DEFAULT_PORT = 8110;
export const CONTAINER_PORT = 8110;
export const DEFAULT_NAME = "worldlens-hosted";
export const MARKER = "Created by the WorldLens setup";
export const BACK = Symbol("back");

export class Cancelled extends Error {
    constructor(message = "Cancelled.") {
        super(message);
        this.name = "Cancelled";
    }
}

export const CAPABILITY_CHOICES = [
    {
        id: "docker-socket",
        label: "Docker",
        hint: "Mounts the Docker socket so WorldLens can start containers. This is close to full control of Docker on this computer.",
    },
    { id: "ssh", label: "SSH", hint: "Lets WorldLens use SSH from the container. No keys are added by this setup." },
    { id: "github", label: "GitHub", hint: "Lets WorldLens use GitHub from the container. No sign-in is added by this setup." },
];

/* ---------- pure helpers ---------- */

const PASSWORD_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

/** 20 characters from a 31-letter alphabet (about 99 bits), grouped for reading aloud. */
export function generatePassword(groups = 4, size = 5, pick = randomInt) {
    const parts = [];
    for (let g = 0; g < groups; g++) {
        let part = "";
        for (let i = 0; i < size; i++) part += PASSWORD_ALPHABET[pick(PASSWORD_ALPHABET.length)];
        parts.push(part);
    }
    return parts.join("-");
}

/** The same function the hosted server uses: SHA-256 of the UTF-8 password, as hex. */
export function hashPassword(password) {
    return createHash("sha256").update(password, "utf8").digest("hex");
}

export function validatePassword(password) {
    if (password.length < 12) return `Use at least 12 characters (${password.length} so far).`;
    if (/^\s|\s$/.test(password)) return "Leave out spaces at the start and the end.";
    if (new Set(password).size < 5) return "Use more different characters.";
    return null;
}

export function parsePort(text) {
    const trimmed = String(text).trim();
    if (!/^\d+$/.test(trimmed)) return { error: "A port is a whole number from 1 to 65535." };
    const value = Number.parseInt(trimmed, 10);
    if (value < 1 || value > 65535) return { error: "A port is a whole number from 1 to 65535." };
    return { value };
}

export function validateName(name) {
    return /^[a-z0-9][a-z0-9_.-]{0,62}$/.test(name)
        ? null
        : "Use lower-case letters, digits, dots, hyphens or underscores, starting with a letter or digit.";
}

export function validateLabel(label) {
    const trimmed = label.trim();
    if (trimmed === "") return "Give the folder a name people will recognise.";
    if (trimmed.length > 60) return "Keep the name under 60 characters.";
    if (/[,:\u0000-\u001f]/.test(trimmed)) return "The name cannot contain a comma, a colon or control characters.";
    if (trimmed === "ro" || trimmed === "rw") return `"${trimmed}" is reserved; choose another name.`;
    return null;
}

export function isPinnedImage(ref) {
    return /^[a-z0-9][a-z0-9./_:-]*@sha256:[a-f0-9]{64}$/i.test(ref);
}

export function slug(text) {
    const base = text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40);
    return /^[a-z0-9]/.test(base) ? base : base === "" ? "folder" : `f-${base}`;
}

/** A folder entry with an id that is unique among `taken` (the id names `/data/<id>` in the container). */
export function makeFolder(folderPath, label, writable, taken) {
    const used = new Set(["state", ...taken]);
    const base = slug(label);
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    return { id, path: folderPath, label: label.trim(), writable };
}

export function mountsDeclaration(folders) {
    return folders
        .map((f) => `${f.id}:/data/${f.id}${f.writable ? "" : ":ro"}:${f.label}`)
        .join(",");
}

const VIRTUAL_NAME = /^(docker|br-|veth|virbr|vboxnet|vmnet|vEthernet|lo\b|utun|awdl|llw|tailscale|zt)/i;

/** The address other computers on the network would use, or null when none is found. */
export function detectLanAddress(interfaces) {
    const found = [];
    for (const [name, list] of Object.entries(interfaces ?? {})) {
        if (VIRTUAL_NAME.test(name)) continue;
        for (const entry of list ?? []) {
            const v4 = entry.family === "IPv4" || entry.family === 4;
            if (!v4 || entry.internal || entry.address.startsWith("169.254.")) continue;
            const a = entry.address;
            const rank = a.startsWith("192.168.") ? 0 : a.startsWith("10.") ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(a) ? 2 : 3;
            found.push({ address: a, rank });
        }
    }
    found.sort((x, y) => x.rank - y.rank);
    return found[0]?.address ?? null;
}

export function isPortFree(port, host = "0.0.0.0") {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once("error", () => resolve(false));
        server.once("listening", () => server.close(() => resolve(true)));
        server.listen(port, host);
    });
}

export async function findFreePort(start, probe = isPortFree, limit = 200) {
    for (let port = start; port < start + limit && port <= 65535; port++) {
        if (await probe(port)) return port;
    }
    return null;
}

/** A small line diff (longest common subsequence). Files here are a few dozen lines. */
export function lineDiff(before, after) {
    const a = before.split("\n");
    const b = after.split("\n");
    const table = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
    for (let i = a.length - 1; i >= 0; i--)
        for (let j = b.length - 1; j >= 0; j--)
            table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    const out = [];
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
        if (a[i] === b[j]) {
            out.push(`  ${a[i]}`);
            i++;
            j++;
        } else if (table[i + 1][j] >= table[i][j + 1]) out.push(`- ${a[i++]}`);
        else out.push(`+ ${b[j++]}`);
    }
    while (i < a.length) out.push(`- ${a[i++]}`);
    while (j < b.length) out.push(`+ ${b[j++]}`);
    return out;
}

const q = (text) => JSON.stringify(text);

export function renderEnv(hash) {
    return [
        `# ${MARKER}. It holds only the SHA-256 of the password, never the password. Keep it private.`,
        `WORLDLENS_PASSWORD_SHA256=${hash}`,
        "",
    ].join("\n");
}

export function renderCompose(a) {
    const bind = a.reach === "lan" ? "" : "127.0.0.1:";
    const lines = [
        `# ${MARKER}. Run the setup again to change it; it asks before replacing a file it did not create.`,
        `name: ${a.name}`,
        "services:",
        "  worldlens:",
        `    image: ${q(a.image)}`,
        `    container_name: ${q(a.name)}`,
        "    restart: unless-stopped",
        "    ports:",
        `      - ${q(`${bind}${a.port}:${CONTAINER_PORT}`)}`,
        "    environment:",
        `      WORLDLENS_PASSWORD_SHA256: ${q("${WORLDLENS_PASSWORD_SHA256:?run the WorldLens setup again}")}`,
        `      WORLDLENS_MOUNTS: ${q(mountsDeclaration(a.folders))}`,
    ];
    if (a.capabilities.length > 0) lines.push(`      WORLDLENS_CAPABILITIES: ${q(a.capabilities.join(","))}`);
    if (a.behindTls) lines.push(`      WORLDLENS_BEHIND_TLS: ${q("1")}`);
    lines.push("    volumes:");
    for (const f of a.folders) {
        lines.push("      - type: bind", `        source: ${q(f.path)}`, `        target: ${q(`/data/${f.id}`)}`);
        if (!f.writable) lines.push("        read_only: true");
    }
    if (a.capabilities.includes("docker-socket"))
        lines.push("      - type: bind", `        source: ${q("/var/run/docker.sock")}`, `        target: ${q("/var/run/docker.sock")}`);
    lines.push("      - type: volume", `        source: ${q(`${a.name}-state`)}`, "        target: /data/state");
    lines.push("volumes:", `  ${q(`${a.name}-state`)}: {}`, "");
    return lines.join("\n");
}

export function renderState(a) {
    return `${JSON.stringify(
        {
            createdBy: "worldlens-setup",
            version: 1,
            name: a.name,
            image: a.image,
            port: a.port,
            reach: a.reach,
            behindTls: a.behindTls,
            capabilities: a.capabilities,
            folders: a.folders,
        },
        null,
        2,
    )}\n`;
}

export const FILE_NAMES = { compose: "compose.yaml", env: ".env", state: ".worldlens-setup.json" };

function sanitizeState(raw) {
    if (!raw || raw.createdBy !== "worldlens-setup" || raw.version !== 1) return null;
    if (!Number.isInteger(raw.port) || !Array.isArray(raw.folders) || !Array.isArray(raw.capabilities)) return null;
    if (validateName(String(raw.name)) !== null || !isPinnedImage(String(raw.image))) return null;
    const folders = raw.folders.filter(
        (f) => f && typeof f.id === "string" && typeof f.path === "string" && typeof f.label === "string" && typeof f.writable === "boolean",
    );
    return {
        name: raw.name,
        image: raw.image,
        port: raw.port,
        reach: raw.reach === "lan" ? "lan" : "local",
        behindTls: raw.behindTls === true,
        capabilities: raw.capabilities.filter((c) => CAPABILITY_CHOICES.some((x) => x.id === c)),
        folders,
    };
}

/** What a previous run of this setup left in `dir`, or null. A hand-made file is never treated as ours. */
export async function loadExisting(dir, fs = fsp) {
    const text = await fs.readFile(path.join(dir, FILE_NAMES.state), "utf8").catch(() => null);
    if (text === null) return null;
    let state = null;
    try {
        state = sanitizeState(JSON.parse(text));
    } catch {
        state = null;
    }
    if (state === null) return null;
    const env = await fs.readFile(path.join(dir, FILE_NAMES.env), "utf8").catch(() => "");
    const match = /^WORLDLENS_PASSWORD_SHA256=([a-f0-9]{64})$/m.exec(env);
    return { ...state, passwordHash: match ? match[1] : null };
}

/** The three files for these answers, each classified against what is already on disk. */
export async function planFiles(dir, answers, hash, fs = fsp) {
    const wanted = [
        [FILE_NAMES.compose, renderCompose(answers), (t) => t.includes(MARKER)],
        [FILE_NAMES.env, renderEnv(hash), (t) => t.includes(MARKER)],
        [FILE_NAMES.state, renderState(answers), (t) => t.includes('"createdBy": "worldlens-setup"')],
    ];
    const plan = [];
    for (const [name, content, ours] of wanted) {
        const file = path.join(dir, name);
        const current = await fs.readFile(file, "utf8").catch(() => null);
        let status = "new";
        if (current !== null) status = current === content ? "unchanged" : ours(current) ? "updated" : "foreign";
        plan.push({ name, path: file, content, status, diff: status === "foreign" || status === "updated" ? lineDiff(current, content) : null });
    }
    return plan;
}

export async function writePrivate(file, content, fs = fsp) {
    const tmp = `${file}.tmp-${process.pid}`;
    await fs.writeFile(tmp, content, { mode: 0o600 });
    await fs.chmod(tmp, 0o600).catch(() => undefined);
    await fs.rename(tmp, file);
}

/* ---------- processes, Docker, clipboard, health ---------- */

export function spawnRunner(cmd, args, opts = {}) {
    return new Promise((resolve) => {
        let child;
        try {
            child = spawn(cmd, args, { cwd: opts.cwd, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
        } catch (error) {
            resolve({ code: -1, stdout: "", stderr: String(error.message), missing: true });
            return;
        }
        let stdout = "";
        let stderr = "";
        let done = false;
        const finish = (result) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            resolve(result);
        };
        const timer = setTimeout(() => {
            child.kill();
            finish({ code: -1, stdout, stderr: `${stderr}timed out`, missing: false });
        }, opts.timeoutMs ?? 600000);
        child.stdout.on("data", (d) => (stdout += d));
        child.stderr.on("data", (d) => (stderr += d));
        child.on("error", (e) => finish({ code: -1, stdout, stderr: String(e.message), missing: e.code === "ENOENT" }));
        child.on("close", (code) => finish({ code: code ?? -1, stdout, stderr, missing: false }));
        child.stdin.on("error", () => undefined);
        child.stdin.end(opts.input ?? "");
    });
}

export async function checkDocker(run) {
    const version = await run("docker", ["--version"]);
    if (version.code !== 0) return { ok: false, reason: "missing" };
    const compose = await run("docker", ["compose", "version"]);
    if (compose.code !== 0) return { ok: false, reason: "compose-missing" };
    const info = await run("docker", ["info", "--format", "{{.ServerVersion}}"], { timeoutMs: 30000 });
    if (info.code !== 0) return { ok: false, reason: "daemon-down" };
    return { ok: true };
}

export const DOCKER_MESSAGES = {
    missing:
        "Docker is not installed or is not on PATH. This setup never installs Docker. Install Docker Desktop (Windows, macOS) or Docker Engine (Linux) from docker.com, then run the same command again; your answers are kept.",
    "compose-missing":
        "Docker is installed but the Compose plugin is missing. Install Docker Compose v2 (included with Docker Desktop), then run the same command again; your answers are kept.",
    "daemon-down":
        "Docker is installed but not running. Start Docker Desktop (or the Docker service), then run the same command again; your answers are kept.",
};

export async function copyToClipboard(run, platform, text) {
    const tools =
        platform === "win32"
            ? [["clip", []]]
            : platform === "darwin"
              ? [["pbcopy", []]]
              : [
                    ["wl-copy", []],
                    ["xclip", ["-selection", "clipboard"]],
                    ["xsel", ["--clipboard", "--input"]],
                ];
    for (const [cmd, args] of tools) {
        const result = await run(cmd, args, { input: text, timeoutMs: 5000 });
        if (result.code === 0) return true;
    }
    return false;
}

export async function waitForHealth({ fetchFn, url, timeoutMs, intervalMs = 1000, sleep, now }) {
    const deadline = now() + timeoutMs;
    let last = "no answer yet";
    for (;;) {
        try {
            const response = await fetchFn(url, { signal: AbortSignal.timeout(3000) });
            if (response.status === 200) {
                const body = await response.json().catch(() => null);
                if (body && typeof body.required === "boolean") return { ok: true };
                last = "something answered, but it did not look like WorldLens";
            } else last = `HTTP ${response.status}`;
        } catch (error) {
            last = String(error.message ?? error);
        }
        if (now() >= deadline) return { ok: false, last };
        await sleep(intervalMs);
    }
}

/* ---------- terminal interface ---------- */

const ESC = "\u001b";
const stripAnsi = (s) => s.replace(/\u001b\[[0-9;]*[A-Za-z]/g, "");

export function clip(line, width) {
    const plain = stripAnsi(line);
    if (plain.length <= width) return line;
    return `${plain.slice(0, Math.max(1, width - 1))}~`;
}

/** Keys from a real stdin in raw mode, normalised to `{ name, ch, ctrl }`. */
export function createStdinKeys(input) {
    readline.emitKeypressEvents(input);
    if (input.isTTY) input.setRawMode(true);
    input.resume();
    const queue = [];
    const waiters = [];
    const onKey = (str, key = {}) => {
        const name = key.name === "enter" ? "return" : key.name;
        const printable = typeof str === "string" && str.length > 0 && !key.ctrl && !key.meta && [...str].every((c) => c >= " " && c !== "\u007f");
        const item = { name: name === "space" ? "space" : name, ch: printable ? str : undefined, ctrl: Boolean(key.ctrl) };
        const waiter = waiters.shift();
        if (waiter) waiter(item);
        else queue.push(item);
    };
    input.on("keypress", onKey);
    return {
        next: () => (queue.length > 0 ? Promise.resolve(queue.shift()) : new Promise((resolve) => waiters.push(resolve))),
        close: () => {
            input.off("keypress", onKey);
            if (input.isTTY) input.setRawMode(false);
            input.pause();
        },
    };
}

export function createTtyUi({ keys, out, columns = 80, color = false }) {
    const paint = (code, text) => (color ? `${ESC}[${code}m${text}${ESC}[0m` : text);
    let shown = 0;
    const draw = (lines) => {
        if (shown > 0) out.write(`${ESC}[${shown}A${ESC}[0J`);
        const clipped = lines.map((l) => clip(l, columns - 1));
        out.write(`${clipped.join("\n")}\n`);
        shown = clipped.length;
    };
    const settle = (lines) => {
        draw(lines);
        shown = 0;
    };
    const quit = () => {
        settle([]);
        throw new Cancelled();
    };
    const done = (title, value) => paint("32", "v ") + title + paint("2", `  ${value}`);
    const foot = (back) => paint("2", `  Enter to confirm${back ? " | Esc or Ctrl+B to go back" : ""} | Ctrl+C to quit`);

    return {
        kind: "tty",
        print(lines) {
            out.write(`${[].concat(lines).join("\n")}\n`);
        },
        async select({ title, options, initial = 0, allowBack = true, help = [] }) {
            let index = Math.min(Math.max(initial, 0), options.length - 1);
            for (;;) {
                draw([
                    paint("1", `? ${title}`),
                    ...help.map((h) => paint("2", `  ${h}`)),
                    ...options.map((o, i) => `${i === index ? paint("36", ">") : " "} ${i === index ? paint("36", o.label) : o.label}${o.hint ? paint("2", `  ${o.hint}`) : ""}`),
                    foot(allowBack),
                ]);
                const key = await keys.next();
                if (key.ctrl && (key.name === "c")) quit();
                if (key.name === "up" || key.ch === "k") index = (index + options.length - 1) % options.length;
                else if (key.name === "down" || key.ch === "j") index = (index + 1) % options.length;
                else if (key.ch && /^[1-9]$/.test(key.ch) && Number(key.ch) <= options.length) index = Number(key.ch) - 1;
                else if (key.name === "return") {
                    settle([done(title, options[index].label)]);
                    return options[index].value;
                } else if (allowBack && (key.name === "escape" || key.name === "left" || (key.ctrl && key.name === "b"))) {
                    settle([]);
                    return BACK;
                }
            }
        },
        async multiselect({ title, options, initial = [], allowBack = true, help = [] }) {
            let index = 0;
            const chosen = new Set(initial);
            for (;;) {
                draw([
                    paint("1", `? ${title}`),
                    ...help.map((h) => paint("2", `  ${h}`)),
                    ...options.map((o, i) => `${i === index ? paint("36", ">") : " "} [${chosen.has(o.value) ? "x" : " "}] ${o.label}${o.hint ? paint("2", `  ${o.hint}`) : ""}`),
                    paint("2", `  Space to tick | Enter to confirm${allowBack ? " | Esc to go back" : ""} | Ctrl+C to quit`),
                ]);
                const key = await keys.next();
                if (key.ctrl && key.name === "c") quit();
                if (key.name === "up" || key.ch === "k") index = (index + options.length - 1) % options.length;
                else if (key.name === "down" || key.ch === "j") index = (index + 1) % options.length;
                else if (key.name === "space" || key.ch === " ") {
                    const value = options[index].value;
                    if (chosen.has(value)) chosen.delete(value);
                    else chosen.add(value);
                } else if (key.name === "return") {
                    const result = options.filter((o) => chosen.has(o.value)).map((o) => o.value);
                    settle([done(title, result.length === 0 ? "none" : result.join(", "))]);
                    return result;
                } else if (allowBack && (key.name === "escape" || (key.ctrl && key.name === "b"))) {
                    settle([]);
                    return BACK;
                }
            }
        },
        async text({ title, initial = "", validate, check, secret = false, help = [], allowBack = true }) {
            let value = initial;
            let submitError = null;
            for (;;) {
                const problem = validate ? validate(value) : null;
                const shownValue = secret ? "*".repeat(value.length) : value;
                draw([
                    paint("1", `? ${title}`),
                    ...help.map((h) => paint("2", `  ${h}`)),
                    `  > ${shownValue}${paint("2", "_")}`,
                    problem ? paint("31", `  x ${problem}`) : submitError ? paint("31", `  x ${submitError}`) : value === "" ? "" : paint("32", "  ok"),
                    foot(allowBack),
                ]);
                const key = await keys.next();
                if (key.ctrl && key.name === "c") quit();
                if (key.name === "return") {
                    if (problem) continue;
                    if (check) {
                        const error = await check(value);
                        if (error) {
                            submitError = error;
                            continue;
                        }
                    }
                    settle([done(title, secret ? "*".repeat(Math.min(value.length, 12)) : value)]);
                    return value;
                }
                if (allowBack && (key.name === "escape" || (key.ctrl && key.name === "b"))) {
                    settle([]);
                    return BACK;
                }
                submitError = null;
                if (key.name === "backspace") value = value.slice(0, -1);
                else if (key.ctrl && key.name === "u") value = "";
                else if (key.ch) value += key.ch;
            }
        },
        /** Shows a one-time secret exactly once. The copy key hands it to `onCopy`; nothing redraws it. */
        async revealOnce({ title, secret, onCopy }) {
            out.write(`${paint("1", title)}\n  ${secret}\n${paint("2", "  This is the only time it is shown. Press C to copy it, or Enter to continue.")}\n`);
            for (;;) {
                const key = await keys.next();
                if (key.ctrl && key.name === "c") throw new Cancelled();
                if (key.ch === "c" || key.ch === "C") {
                    out.write(`${(await onCopy()) ? "  Copied to the clipboard.\n" : "  The clipboard is not available here; copy it from the line above.\n"}`);
                } else if (key.name === "return") return;
            }
        },
        close() {
            keys.close?.();
        },
    };
}

export function createLineReader(input) {
    const rl = readline.createInterface({ input, crlfDelay: Infinity });
    const queue = [];
    const waiters = [];
    let closed = false;
    rl.on("line", (line) => {
        const waiter = waiters.shift();
        if (waiter) waiter(line);
        else queue.push(line);
    });
    rl.on("close", () => {
        closed = true;
        while (waiters.length > 0) waiters.shift()(null);
    });
    return {
        next: () => (queue.length > 0 ? Promise.resolve(queue.shift()) : closed ? Promise.resolve(null) : new Promise((resolve) => waiters.push(resolve))),
        close: () => rl.close(),
    };
}

/** Plain prompts: numbered choices and typed answers, one line at a time. `<` goes back. */
export function createLineUi({ lines, out }) {
    const ask = async (prompt) => {
        out.write(prompt);
        const line = await lines.next();
        if (line === null) throw new Cancelled("Input ended before the setup finished.");
        return line.replace(/\r$/, "");
    };
    return {
        kind: "line",
        print(text) {
            out.write(`${[].concat(text).join("\n")}\n`);
        },
        async select({ title, options, initial = 0, allowBack = true, help = [] }) {
            for (;;) {
                out.write(`${title}\n${help.map((h) => `  ${h}\n`).join("")}`);
                options.forEach((o, i) => out.write(`  ${i + 1}) ${o.label}${o.hint ? `  (${o.hint})` : ""}\n`));
                const answer = (await ask(`Choose 1-${options.length} [${initial + 1}]${allowBack ? ", < to go back" : ""}: `)).trim();
                if (answer === "") return options[initial].value;
                if (allowBack && answer === "<") return BACK;
                if (/^\d+$/.test(answer) && Number(answer) >= 1 && Number(answer) <= options.length) return options[Number(answer) - 1].value;
                out.write("That is not one of the choices.\n");
            }
        },
        async multiselect({ title, options, initial = [], allowBack = true, help = [] }) {
            for (;;) {
                out.write(`${title}\n${help.map((h) => `  ${h}\n`).join("")}`);
                options.forEach((o, i) => out.write(`  ${i + 1}) ${o.label}${o.hint ? `  (${o.hint})` : ""}\n`));
                const current = options.filter((o) => initial.includes(o.value)).map((o) => options.indexOf(o) + 1).join(",");
                const answer = (await ask(`Numbers separated by commas, blank for ${current === "" ? "none" : current}${allowBack ? ", < to go back" : ""}: `)).trim();
                if (allowBack && answer === "<") return BACK;
                if (answer === "") return [...initial];
                const picks = answer.split(",").map((s) => s.trim());
                if (picks.every((p) => /^\d+$/.test(p) && Number(p) >= 1 && Number(p) <= options.length))
                    return options.filter((_, i) => picks.includes(String(i + 1))).map((o) => o.value);
                out.write("Use numbers from the list.\n");
            }
        },
        async text({ title, initial = "", validate, check, secret = false, help = [], allowBack = true }) {
            for (;;) {
                out.write(`${title}\n${help.map((h) => `  ${h}\n`).join("")}`);
                if (secret) out.write("  (this plain prompt cannot hide what you type; choose a generated password if that matters)\n");
                const answer = (await ask(`${initial === "" ? "" : `[${secret ? "kept" : initial}] `}${allowBack ? "(< to go back) " : ""}> `)).trim();
                if (allowBack && answer === "<") return BACK;
                const value = answer === "" ? initial : answer;
                const problem = validate ? validate(value) : null;
                if (problem) {
                    out.write(`  ${problem}\n`);
                    continue;
                }
                const error = check ? await check(value) : null;
                if (error) {
                    out.write(`  ${error}\n`);
                    continue;
                }
                return value;
            }
        },
        async revealOnce({ title, secret }) {
            out.write(`${title}\n  ${secret}\n  This is the only time it is shown.\n`);
        },
        close() {
            lines.close?.();
        },
    };
}

/* ---------- the questions ---------- */

async function directoryCheck(ctx, value) {
    const resolved = path.resolve(ctx.cwd, value);
    const info = await ctx.fs.stat(resolved).catch(() => null);
    return info && !info.isDirectory() ? "That path is a file, not a folder." : null;
}

async function folderCheck(ctx, value) {
    if (value.trim() === "") return "Enter the folder.";
    const resolved = path.resolve(ctx.cwd, value);
    const info = await ctx.fs.stat(resolved).catch(() => null);
    if (!info) return "That folder does not exist.";
    return info.isDirectory() ? null : "That is a file; choose a folder.";
}

async function portCheck(ctx, st, value) {
    const parsed = parsePort(value);
    if (parsed.error) return parsed.error;
    if (st.existing && st.existing.port === parsed.value) return null;
    return (await ctx.isPortFree(parsed.value)) ? null : `Port ${parsed.value} is already in use. Choose another.`;
}

function folderLines(folders) {
    return folders.length === 0
        ? ["No folders added yet."]
        : folders.map((f) => `${f.label}: ${f.path} (${f.writable ? "read and write" : "read only"})`);
}

async function loadFor(ctx, st, dir) {
    if (st.loadedFor === dir) return;
    st.loadedFor = dir;
    st.existing = await loadExisting(dir, ctx.fs);
    const e = st.existing;
    st.port = e ? e.port : st.port;
    st.reach = e ? e.reach : st.reach;
    st.behindTls = e ? e.behindTls : st.behindTls;
    st.capabilities = e ? [...e.capabilities] : st.capabilities;
    st.name = e ? e.name : st.name;
    st.image = e ? e.image : st.image;
    st.folders = e ? e.folders.map((f) => ({ ...f })) : [defaultRenders(dir)];
    st.passwordMode = e && e.passwordHash ? "keep" : "generate";
}

export function buildSteps(ctx) {
    const lan = detectLanAddress(ctx.interfaces());
    const steps = [
        async (st, ui) => {
            const value = await ui.text({
                title: "Where should WorldLens keep its setup files?",
                initial: st.dir,
                help: ["A new folder is fine. Setup files only; your worlds stay where they are."],
                validate: (v) => (v.trim() === "" ? "Enter a folder." : null),
                check: (v) => directoryCheck(ctx, v),
                allowBack: false,
            });
            if (value === BACK) return BACK;
            st.dir = path.resolve(ctx.cwd, value);
            await loadFor(ctx, st, st.dir);
            if (st.existing) ui.print([`Found an earlier setup in ${st.dir}. Its answers are the defaults below.`]);
            return undefined;
        },
        async (st, ui) => {
            const options = [];
            if (st.existing?.passwordHash) options.push({ value: "keep", label: "Keep the current password" });
            options.push({ value: "generate", label: "Generate a strong password (recommended)", hint: "shown once at the end" });
            options.push({ value: "custom", label: "Type my own password" });
            const picked = await ui.select({
                title: "How should the sign-in password be set?",
                options,
                initial: Math.max(0, options.findIndex((o) => o.value === st.passwordMode)),
                help: ["Only a hash of it is stored. Everyone who knows it has full access."],
            });
            if (picked === BACK) return BACK;
            st.passwordMode = picked;
            if (picked !== "custom") return undefined;
            const first = await ui.text({ title: "Choose a password", secret: true, validate: validatePassword, initial: "" });
            if (first === BACK) return BACK;
            const second = await ui.text({
                title: "Type it again to confirm",
                secret: true,
                validate: (v) => (v === first ? null : "These two do not match yet."),
            });
            if (second === BACK) return BACK;
            st.customPassword = first;
            return undefined;
        },
        async (st, ui) => {
            if (st.port === null) st.port = (await findFreePort(DEFAULT_PORT, ctx.isPortFree)) ?? DEFAULT_PORT;
            const value = await ui.text({
                title: "Which port should WorldLens use?",
                initial: String(st.port),
                help: [`${st.existing ? "Kept from the earlier setup." : "A free port was found for you."}`],
                validate: (v) => parsePort(v).error ?? null,
                check: (v) => portCheck(ctx, st, v),
            });
            if (value === BACK) return BACK;
            st.port = parsePort(value).value;
            return undefined;
        },
        async (st, ui) => {
            const picked = await ui.select({
                title: "Who should be able to open it?",
                options: [
                    { value: "local", label: "Only this computer", hint: "http://127.0.0.1:" + st.port + "/" },
                    {
                        value: "lan",
                        label: "Other computers on my network",
                        hint: lan ? `http://${lan}:${st.port}/` : "no network address found, so only the port is opened",
                    },
                ],
                initial: st.reach === "lan" ? 1 : 0,
                help: ["Never forward this port to the Internet. The password is the only lock."],
            });
            if (picked === BACK) return BACK;
            st.reach = picked;
            return undefined;
        },
        async (st, ui) => {
            for (;;) {
                const options = [
                    { value: "read", label: "Add a folder WorldLens may only read (your worlds)" },
                    { value: "write", label: "Add a folder WorldLens may write to (renders, backups)" },
                    ...st.folders.map((f, i) => ({ value: `remove:${i}`, label: `Remove "${f.label}"` })),
                    { value: "next", label: "Continue" },
                ];
                const picked = await ui.select({
                    title: "Which folders may WorldLens use?",
                    options,
                    initial: options.length - 1,
                    help: folderLines(st.folders),
                });
                if (picked === BACK) return BACK;
                if (picked === "next") return undefined;
                if (picked.startsWith("remove:")) {
                    st.folders.splice(Number(picked.slice(7)), 1);
                    continue;
                }
                const folderPath = await ui.text({
                    title: picked === "read" ? "Path of the folder to read" : "Path of the folder to write to",
                    check: (v) => folderCheck(ctx, v),
                    validate: (v) => (v.trim() === "" ? "Enter the folder." : null),
                });
                if (folderPath === BACK) continue;
                const resolved = path.resolve(ctx.cwd, folderPath);
                const label = await ui.text({
                    title: "What should it be called?",
                    initial: path.basename(resolved) || "Folder",
                    validate: validateLabel,
                });
                if (label === BACK) continue;
                st.folders.push(makeFolder(resolved, label, picked === "write", st.folders.map((f) => f.id)));
            }
        },
        async (st, ui) => {
            const picked = await ui.multiselect({
                title: "Should WorldLens reach beyond its container?",
                options: CAPABILITY_CHOICES.map((c) => ({ value: c.id, label: c.label, hint: c.hint })),
                initial: st.capabilities,
                help: ["Each one is off unless ticked. Leave all off if unsure."],
            });
            if (picked === BACK) return BACK;
            st.capabilities = picked;
            return undefined;
        },
        async (st, ui) => {
            const picked = await ui.select({
                title: "Is HTTPS handled by a proxy or tunnel in front of it?",
                options: [
                    { value: false, label: "No, plain HTTP on my network" },
                    { value: true, label: "Yes, a proxy provides HTTPS", hint: "marks the session cookie Secure" },
                ],
                initial: st.behindTls ? 1 : 0,
            });
            if (picked === BACK) return BACK;
            st.behindTls = picked;
            return undefined;
        },
        async (st, ui) => {
            const answers = answersOf(st);
            const hash = st.passwordMode === "keep" ? st.existing.passwordHash : hashPassword("preview");
            const plan = await planFiles(st.dir, answers, hash, ctx.fs);
            const conflicts = plan.filter((p) => p.status === "foreign");
            const lines = [
                "Review",
                `  Folder:    ${st.dir}`,
                `  Port:      ${answers.port} (${answers.reach === "lan" ? "other computers on your network" : "this computer only"})`,
                `  Password:  ${st.passwordMode === "keep" ? "unchanged" : st.passwordMode === "custom" ? "the one you typed" : "a new generated one, shown once at the end"}`,
                `  Folders:   ${answers.folders.length === 0 ? "none" : answers.folders.map((f) => `${f.label} (${f.writable ? "rw" : "ro"})`).join(", ")}`,
                `  Extras:    ${answers.capabilities.length === 0 ? "none" : answers.capabilities.join(", ")}`,
                `  Image:     ${answers.image}`,
                "  Files:     " + plan.map((p) => `${p.name} (${p.status})`).join(", "),
            ];
            for (const c of conflicts) {
                lines.push("", `  ${c.name} already exists and was not created by this setup. Replacing it would change:`);
                lines.push(...c.diff.slice(0, 40).map((d) => `    ${d}`));
            }
            ui.print(lines);
            const options = conflicts.length > 0
                ? [
                      { value: "overwrite-start", label: `Replace ${conflicts.map((c) => c.name).join(", ")} and start WorldLens` },
                      { value: "overwrite", label: "Replace them and write only" },
                      { value: "cancel", label: "Cancel and change nothing" },
                  ]
                : [
                      { value: "start", label: "Write the files and start WorldLens" },
                      { value: "write", label: "Write the files only" },
                      { value: "cancel", label: "Cancel and change nothing" },
                  ];
            const picked = await ui.select({ title: "Ready?", options });
            if (picked === BACK) return BACK;
            return { final: true, action: picked };
        },
    ];
    return steps;
}

export function answersOf(st) {
    return {
        name: st.name,
        image: st.image,
        port: st.port,
        reach: st.reach,
        behindTls: st.behindTls,
        capabilities: [...st.capabilities],
        folders: st.folders.map((f) => ({ ...f })),
    };
}

export async function runWizard(steps, st, ui) {
    let i = 0;
    while (i < steps.length) {
        const result = await steps[i](st, ui);
        if (result === BACK) i = Math.max(0, i - 1);
        else if (result && result.final) return result;
        else i++;
    }
    return { final: true, action: "cancel" };
}

/* ---------- running the result ---------- */

export function composeArgs(dir, ...rest) {
    return ["compose", "--project-directory", dir, "-f", path.join(dir, FILE_NAMES.compose), ...rest];
}

/** Writes the files, starts the container and reports. Returns the exit code. */
export async function execute({ ctx, out, answers, dir, hash, plan, start, pull, overwrite, secret, reveal, healthTimeoutSec }) {
    const foreign = plan.filter((p) => p.status === "foreign");
    if (foreign.length > 0 && !overwrite) {
        out.write(`Refusing to replace ${foreign.map((f) => f.name).join(", ")}: not created by this setup.\n`);
        for (const f of foreign) out.write(`${f.name} would change like this:\n${f.diff.slice(0, 60).map((d) => `  ${d}`).join("\n")}\n`);
        out.write("Run again with --overwrite after checking the difference, or choose another folder with --dir.\n");
        return 2;
    }
    await ctx.fs.mkdir(dir, { recursive: true });
    for (const f of answers.folders) {
        if (f.createdBySetup) await ctx.fs.mkdir(f.path, { recursive: true });
    }
    for (const file of plan) {
        if (file.status === "unchanged") continue;
        await writePrivate(file.path, file.content, ctx.fs);
    }
    out.write(`Files in ${dir}: ${plan.map((p) => `${p.name} (${p.status === "foreign" ? "replaced" : p.status})`).join(", ")}\n`);
    if (ctx.platform !== "win32") {
        for (const file of plan) {
            const info = await ctx.fs.stat(file.path);
            if ((info.mode & 0o077) !== 0) out.write(`Warning: ${file.name} is readable by other users; run chmod 600 on it.\n`);
        }
    } else out.write("On Windows the files inherit the permissions of their folder; keep that folder private.\n");

    let code = 0;
    let running = false;
    if (!start) out.write("Not starting WorldLens (files only).\n");
    else {
        const docker = await checkDocker(ctx.run);
        if (!docker.ok) {
            out.write(`${DOCKER_MESSAGES[docker.reason]}\n`);
            code = 3;
        } else {
            if (pull) {
                out.write("Pulling the image...\n");
                const pulled = await ctx.run("docker", composeArgs(dir, "pull"));
                if (pulled.code !== 0) {
                    out.write(`The image could not be pulled (exit ${pulled.code}).\n${tail(pulled.stderr || pulled.stdout)}\n`);
                    code = 4;
                }
            }
            if (code === 0) {
                out.write("Starting WorldLens...\n");
                const up = await ctx.run("docker", composeArgs(dir, "up", "-d"));
                if (up.code !== 0) {
                    out.write(`Docker could not start it (exit ${up.code}).\n${tail(up.stderr || up.stdout)}\n`);
                    code = 4;
                } else {
                    const health = await waitForHealth({
                        fetchFn: ctx.fetchFn,
                        url: `http://127.0.0.1:${answers.port}/bridge/session`,
                        timeoutMs: healthTimeoutSec * 1000,
                        sleep: ctx.sleep,
                        now: ctx.now,
                    });
                    if (!health.ok) {
                        out.write(`WorldLens did not answer within ${healthTimeoutSec} seconds (${health.last}).\n`);
                        const logs = await ctx.run("docker", composeArgs(dir, "logs", "--tail", "20"));
                        if (logs.code === 0) out.write(`Last log lines:\n${tail(logs.stdout + logs.stderr)}\n`);
                        out.write(`See more with: docker compose --project-directory ${q(dir)} logs\n`);
                        code = 4;
                    } else running = true;
                }
            }
        }
    }

    if (running) {
        out.write("WorldLens is running.\n");
        out.write(`  This computer:  http://127.0.0.1:${answers.port}/\n`);
        if (answers.reach === "lan") {
            const lan = detectLanAddress(ctx.interfaces());
            if (lan === null) out.write("  Your network:   no network address was found, so no link can be offered.\n");
            else {
                const check = await waitForHealth({ fetchFn: ctx.fetchFn, url: `http://${lan}:${answers.port}/bridge/session`, timeoutMs: 5000, sleep: ctx.sleep, now: ctx.now });
                out.write(`  Your network:   http://${lan}:${answers.port}/  (${check.ok ? "answered when tried from this computer; not tried from another device" : "did not answer from this computer; check the firewall"})\n`);
            }
        }
        out.write("Sign in with the password. This deployment has one shared password and no separate accounts.\n");
        out.write(`Stop it with: docker compose --project-directory ${q(dir)} down\n`);
    }
    if (secret !== null) await reveal(secret);
    return code;
}

function tail(text, count = 12) {
    return text.trim().split("\n").slice(-count).map((l) => `  ${l}`).join("\n");
}

/* ---------- options, flags and environment ---------- */

export const OPTION_TABLE = [
    { key: "dir", flag: "dir", env: "WORLDLENS_SETUP_DIR", type: "string", help: "Folder for the setup files (default: worldlens-hosted in your home folder)." },
    { key: "port", flag: "port", env: "WORLDLENS_SETUP_PORT", type: "string", help: "Port to publish (default: the first free one from 8110)." },
    { key: "lan", flag: "lan", env: "WORLDLENS_SETUP_LAN", type: "boolean", help: "Let other computers on the network open it." },
    { key: "localOnly", flag: "local-only", env: "WORLDLENS_SETUP_LOCAL_ONLY", type: "boolean", help: "Only this computer can open it (the default)." },
    { key: "worlds", flag: "worlds", env: "WORLDLENS_SETUP_WORLDS", type: "list", help: "A read-only folder, as PATH or PATH=Label. Repeat the flag; in the variable separate with ;" },
    { key: "writable", flag: "writable", env: "WORLDLENS_SETUP_WRITABLE", type: "list", help: "A read-write folder, as PATH or PATH=Label. Same rules as --worlds." },
    { key: "capability", flag: "capability", env: "WORLDLENS_SETUP_CAPABILITIES", type: "list", help: "docker-socket, ssh or github. Repeat the flag; in the variable separate with commas." },
    { key: "behindTls", flag: "behind-tls", env: "WORLDLENS_SETUP_BEHIND_TLS", type: "boolean", help: "A proxy in front provides HTTPS." },
    { key: "image", flag: "image", env: "WORLDLENS_SETUP_IMAGE", type: "string", help: "Image reference, pinned by sha256 digest (default: the published one)." },
    { key: "name", flag: "name", env: "WORLDLENS_SETUP_NAME", type: "string", help: `Container and Compose project name (default ${DEFAULT_NAME}).` },
    { key: "passwordStdin", flag: "password-stdin", env: null, type: "boolean", help: "Read the password from standard input (one line)." },
    { key: "passwordOut", flag: "password-out", env: "WORLDLENS_SETUP_PASSWORD_OUT", type: "string", help: "Write a generated password to this file (mode 600) instead of printing it." },
    { key: "resetPassword", flag: "reset-password", env: "WORLDLENS_SETUP_RESET_PASSWORD", type: "boolean", help: "Generate a new password even though an earlier setup exists." },
    { key: "noStart", flag: "no-start", env: "WORLDLENS_SETUP_NO_START", type: "boolean", help: "Write the files and stop." },
    { key: "noPull", flag: "no-pull", env: "WORLDLENS_SETUP_NO_PULL", type: "boolean", help: "Skip the image pull (use a local copy)." },
    { key: "healthTimeout", flag: "health-timeout", env: "WORLDLENS_SETUP_HEALTH_TIMEOUT", type: "string", help: "Seconds to wait for WorldLens to answer (default 90)." },
    { key: "overwrite", flag: "overwrite", env: "WORLDLENS_SETUP_OVERWRITE", type: "boolean", help: "Replace files this setup did not create (it shows the difference first)." },
    { key: "plain", flag: "plain", env: "WORLDLENS_SETUP_PLAIN", type: "boolean", help: "Use plain line prompts instead of the arrow-key interface." },
    { key: "yes", flag: "yes", short: "y", env: "WORLDLENS_SETUP_YES", type: "boolean", help: "Ask nothing; use flags, variables, earlier answers and defaults." },
    { key: "help", flag: "help", short: "h", env: null, type: "boolean", help: "Show this help." },
];

export function usage() {
    const rows = OPTION_TABLE.map((o) => `  --${o.flag}${o.short ? `, -${o.short}` : ""}${o.type === "boolean" ? "" : " VALUE"}\n      ${o.help}${o.env ? `\n      Variable: ${o.env}` : ""}`);
    return [
        "WorldLens hosted setup",
        "",
        "Usage: node setup.mjs [flags]",
        "",
        "Run with no flags in a terminal for the interactive interface. Flags and variables below",
        "are for scripts and for the desktop app; a flag wins over its variable.",
        "The password is read from the WORLDLENS_SETUP_PASSWORD variable or --password-stdin.",
        "There is deliberately no --password flag: arguments show up in process lists.",
        "",
        ...rows,
        "",
        "Exit codes: 0 done, 1 bad input, 2 would overwrite a file this setup did not create,",
        "3 files written but Docker unavailable, 4 pull, start or health check failed, 130 cancelled.",
        "",
    ].join("\n");
}

export function parseArgs(argv, env = {}) {
    const opts = {};
    const problems = [];
    const byFlag = new Map(OPTION_TABLE.flatMap((o) => [[`--${o.flag}`, o], ...(o.short ? [[`-${o.short}`, o]] : [])]));
    for (const o of OPTION_TABLE) {
        const value = o.env ? env[o.env] : undefined;
        if (value === undefined || value === "") continue;
        if (o.type === "boolean") opts[o.key] = /^(1|true|yes|on)$/i.test(value);
        else if (o.type === "list") opts[o.key] = o.key === "capability" ? value.split(",").map((s) => s.trim()).filter(Boolean) : value.split(";").map((s) => s.trim()).filter(Boolean);
        else opts[o.key] = value;
    }
    const flagged = new Set();
    for (let i = 0; i < argv.length; i++) {
        let arg = argv[i];
        let inline = null;
        const eq = arg.startsWith("--") ? arg.indexOf("=") : -1;
        if (eq > 0) {
            inline = arg.slice(eq + 1);
            arg = arg.slice(0, eq);
        }
        const o = byFlag.get(arg);
        if (!o) {
            problems.push(`Unknown flag ${arg}. Run with --help to see them all.`);
            continue;
        }
        if (o.type === "boolean") {
            opts[o.key] = inline === null ? true : /^(1|true|yes|on)$/i.test(inline);
            continue;
        }
        const value = inline ?? argv[++i];
        if (value === undefined) {
            problems.push(`--${o.flag} needs a value.`);
            continue;
        }
        if (o.type === "list") {
            if (!flagged.has(o.key)) opts[o.key] = [];
            flagged.add(o.key);
            opts[o.key].push(value);
        } else opts[o.key] = value;
    }
    return { opts, problems };
}

/** `PATH` or `PATH=Label`. A Windows drive colon is fine because the separator is `=`. */
export function parseFolderSpec(spec) {
    const eq = spec.lastIndexOf("=");
    if (eq > 0 && !/^[a-zA-Z]$/.test(spec.slice(0, eq))) return { path: spec.slice(0, eq), label: spec.slice(eq + 1) };
    return { path: spec, label: null };
}

async function readAll(stream) {
    let text = "";
    stream.setEncoding?.("utf8");
    for await (const chunk of stream) text += chunk;
    return text;
}

/** Everything the questions would have asked, taken from flags, variables, earlier answers and defaults. */
export async function answersFromOptions(opts, ctx) {
    const problems = [];
    const dir = path.resolve(ctx.cwd, opts.dir ?? path.join(ctx.homedir, DEFAULT_NAME));
    const existing = await loadExisting(dir, ctx.fs);
    const name = opts.name ?? existing?.name ?? DEFAULT_NAME;
    const nameProblem = validateName(name);
    if (nameProblem) problems.push(`--name: ${nameProblem}`);
    const image = opts.image ?? existing?.image ?? HOSTED_IMAGE;
    if (!isPinnedImage(image)) problems.push("--image must be pinned by a sha256 digest (name@sha256:...).");

    let port = null;
    if (opts.port !== undefined) {
        const parsed = parsePort(opts.port);
        if (parsed.error) problems.push(`--port: ${parsed.error}`);
        else port = parsed.value;
    } else port = existing?.port ?? (await findFreePort(DEFAULT_PORT, ctx.isPortFree));
    if (port !== null && !(existing && existing.port === port) && !(await ctx.isPortFree(port))) problems.push(`Port ${port} is already in use. Choose another with --port, or leave it out to pick a free one.`);
    if (port === null) problems.push("No free port was found near 8110. Choose one with --port.");

    if (opts.lan && opts.localOnly) problems.push("Choose either --lan or --local-only, not both.");
    const reach = opts.lan ? "lan" : opts.localOnly ? "local" : (existing?.reach ?? "local");

    let folders;
    if (opts.worlds || opts.writable) {
        folders = [];
        for (const [specs, writable] of [[opts.worlds ?? [], false], [opts.writable ?? [], true]]) {
            for (const spec of specs) {
                const parsed = parseFolderSpec(spec);
                const resolved = path.resolve(ctx.cwd, parsed.path);
                const issue = await folderCheck(ctx, parsed.path);
                if (issue) {
                    problems.push(`${spec}: ${issue}`);
                    continue;
                }
                const label = parsed.label ?? (path.basename(resolved) || "Folder");
                const labelProblem = validateLabel(label);
                if (labelProblem) problems.push(`${spec}: ${labelProblem}`);
                else folders.push(makeFolder(resolved, label, writable, folders.map((f) => f.id)));
            }
        }
    } else folders = existing ? existing.folders.map((f) => ({ ...f })) : [];
    if (!existing && !folders.some((f) => f.writable)) folders.push(defaultRenders(dir));

    const capabilities = opts.capability ?? existing?.capabilities ?? [];
    for (const c of capabilities) if (!CAPABILITY_CHOICES.some((x) => x.id === c)) problems.push(`"${c}" is not a capability. Choose from: ${CAPABILITY_CHOICES.map((x) => x.id).join(", ")}.`);

    let hash = null;
    let secret = null;
    let supplied = null;
    if (opts.passwordStdin) supplied = (await readAll(ctx.stdin)).split(/\r?\n/)[0] ?? "";
    else if (ctx.env.WORLDLENS_SETUP_PASSWORD) supplied = ctx.env.WORLDLENS_SETUP_PASSWORD;
    if (supplied !== null) {
        const issue = validatePassword(supplied);
        if (issue) problems.push(`Password: ${issue}`);
        else hash = hashPassword(supplied);
    } else if (existing?.passwordHash && !opts.resetPassword) hash = existing.passwordHash;
    else {
        secret = generatePassword();
        hash = hashPassword(secret);
    }

    const answers = { name, image, port, reach, behindTls: opts.behindTls ?? existing?.behindTls ?? false, capabilities, folders };
    return { answers, dir, hash, secret, problems };
}

export function defaultRenders(dir) {
    return { id: "renders", path: path.join(dir, "renders"), label: "Renders", writable: true, createdBySetup: true };
}

/* ---------- entry ---------- */

export function defaultContext() {
    return {
        fs: fsp,
        run: spawnRunner,
        fetchFn: globalThis.fetch,
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        now: () => Date.now(),
        isPortFree,
        interfaces: () => os.networkInterfaces(),
        homedir: os.homedir(),
        cwd: process.cwd(),
        platform: process.platform,
        stdin: process.stdin,
        stdout: process.stdout,
        env: process.env,
        keysFor: (input) => createStdinKeys(input),
    };
}

export async function main(argv, ctxOverrides = {}) {
    const ctx = { ...defaultContext(), ...ctxOverrides };
    const out = ctx.stdout;
    const { opts, problems } = parseArgs(argv, ctx.env);
    if (opts.help) {
        out.write(usage());
        return 0;
    }
    if (problems.length > 0) {
        out.write(`${problems.join("\n")}\n`);
        return 1;
    }
    const healthTimeoutSec = opts.healthTimeout === undefined ? 90 : Number.parseInt(opts.healthTimeout, 10);
    if (!Number.isInteger(healthTimeoutSec) || healthTimeoutSec < 1) {
        out.write("--health-timeout must be a whole number of seconds.\n");
        return 1;
    }

    const interactive = !opts.yes;
    const tty = interactive && !opts.plain && ctx.stdin.isTTY && ctx.stdout.isTTY && ctx.env.TERM !== "dumb";
    let ui = null;
    try {
        if (!interactive) return await runUnattended({ ctx, opts, out, healthTimeoutSec });
        ui = tty
            ? createTtyUi({ keys: ctx.keysFor(ctx.stdin), out, columns: out.columns ?? 80, color: !ctx.env.NO_COLOR })
            : createLineUi({ lines: ctx.lines ?? createLineReader(ctx.stdin), out });
        ui.print(["WorldLens hosted setup", "Answers are asked here; nothing is written until the review screen says so.", ""]);
        const st = {
            dir: path.resolve(ctx.cwd, opts.dir ?? path.join(ctx.homedir, DEFAULT_NAME)),
            existing: null,
            loadedFor: null,
            passwordMode: "generate",
            customPassword: null,
            port: opts.port ? (parsePort(opts.port).value ?? null) : null,
            reach: opts.lan ? "lan" : "local",
            folders: [],
            capabilities: opts.capability ?? [],
            behindTls: Boolean(opts.behindTls),
            name: opts.name ?? DEFAULT_NAME,
            image: opts.image ?? HOSTED_IMAGE,
        };
        const result = await runWizard(buildSteps(ctx), st, ui);
        if (result.action === "cancel") {
            out.write("Cancelled. Nothing was written.\n");
            return 0;
        }
        const answers = answersOf(st);
        let secret = null;
        let hash;
        if (st.passwordMode === "keep") hash = st.existing.passwordHash;
        else if (st.passwordMode === "custom") hash = hashPassword(st.customPassword);
        else {
            secret = generatePassword();
            hash = hashPassword(secret);
        }
        const plan = await planFiles(st.dir, answers, hash, ctx.fs);
        const code = await execute({
            ctx,
            out,
            answers,
            dir: st.dir,
            hash,
            plan,
            start: result.action.endsWith("start") || result.action === "start",
            pull: !opts.noPull,
            overwrite: result.action.startsWith("overwrite"),
            secret,
            healthTimeoutSec,
            reveal: (value) =>
                ui.revealOnce({
                    title: "Your WorldLens password (stored only as a hash)",
                    secret: value,
                    onCopy: () => copyToClipboard(ctx.run, ctx.platform, value),
                }),
        });
        return code;
    } catch (error) {
        if (error instanceof Cancelled) {
            out.write(`${error.message} Nothing further was written.\n`);
            return 130;
        }
        throw error;
    } finally {
        ui?.close();
    }
}

async function runUnattended({ ctx, opts, out, healthTimeoutSec }) {
    const built = await answersFromOptions(opts, ctx);
    if (built.problems.length > 0) {
        out.write(`${built.problems.join("\n")}\n`);
        return 1;
    }
    const plan = await planFiles(built.dir, built.answers, built.hash, ctx.fs);
    return execute({
        ctx,
        out,
        answers: built.answers,
        dir: built.dir,
        hash: built.hash,
        plan,
        start: !opts.noStart,
        pull: !opts.noPull,
        overwrite: Boolean(opts.overwrite),
        secret: built.secret,
        healthTimeoutSec,
        reveal: async (value) => {
            if (opts.passwordOut) {
                await writePrivate(path.resolve(ctx.cwd, opts.passwordOut), `${value}\n`, ctx.fs);
                out.write(`The generated password was written to ${opts.passwordOut}.\n`);
            } else out.write(`Generated password (shown once, stored only as a hash): ${value}\n`);
        },
    });
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invoked) {
    main(process.argv.slice(2)).then(
        (code) => process.exit(code),
        (error) => {
            process.stderr.write(`Setup stopped: ${error.message}\n`);
            process.exit(1);
        },
    );
}
