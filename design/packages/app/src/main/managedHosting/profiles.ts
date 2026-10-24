import { randomUUID, X509Certificate } from "node:crypto";
import { mkdir, readFile, writeFile, rename, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { isIP } from "node:net";
import { createSecureContext } from "node:tls";
import type { ProcessRunner } from "../cirender/gh.js";
import type { ManagedHostTarget, ManagedHostingHostFacts } from "./register.js";

export interface HostingProfile {
    id: string;
    name: string;
    target: ManagedHostTarget;
    origin: string;
    port: number;
    dataRoot: string;
    tlsCert: string;
    tlsKey: string;
    distribution: string;
}
const keys = [
    "id",
    "name",
    "target",
    "origin",
    "port",
    "dataRoot",
    "tlsCert",
    "tlsKey",
    "distribution",
];
export function validateHostingProfile(value: unknown): HostingProfile {
    if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        Object.keys(value).some((key) => !keys.includes(key))
    )
        throw new Error("Invalid hosting profile.");
    const p = value as HostingProfile;
    for (const key of [
        "id",
        "name",
        "origin",
        "dataRoot",
        "tlsCert",
        "tlsKey",
        "distribution",
    ] as const) {
        if (typeof p[key] !== "string" || p[key].length > 4096 || /[\x00-\x1f]/u.test(p[key]))
            throw new Error("Invalid hosting profile field.");
    }
    if (p.id && !/^[a-f0-9-]{36}$/u.test(p.id))
        throw new Error("Invalid hosting profile identity.");
    if (!p.name.trim() || p.name.length > 100)
        throw new Error("Enter a profile name of at most 100 characters.");
    if (!["native-windows", "native-wsl", "container"].includes(p.target))
        throw new Error("Choose a supported hosting target.");
    if (!Number.isInteger(p.port) || p.port < 1024 || p.port > 65535)
        throw new Error("Choose a host port from 1024 through 65535.");
    const origin = new URL(p.origin);
    if (
        origin.protocol !== "https:" ||
        origin.origin !== p.origin ||
        Number(origin.port || 443) !== p.port
    )
        throw new Error("The exact HTTPS origin must use the selected host port.");
    if (!isAbsolute(p.tlsCert) || !isAbsolute(p.tlsKey))
        throw new Error("Choose absolute local TLS file paths.");
    if (p.target === "native-wsl") {
        if (
            !/^\/(?!\/)/u.test(p.dataRoot) ||
            p.dataRoot.split("/").includes("..") ||
            !/^[a-zA-Z0-9_. -]{1,100}$/u.test(p.distribution) ||
            p.distribution.startsWith("-")
        )
            throw new Error(
                "Choose an absolute Linux data folder and an installed WSL distribution.",
            );
    } else if (!isAbsolute(p.dataRoot)) throw new Error("Choose an absolute private data folder.");
    if (
        p.target === "container" &&
        [p.dataRoot, p.tlsCert, p.tlsKey].some((path) => path.includes(","))
    )
        throw new Error("Container mount paths cannot contain commas.");
    return { ...p, name: p.name.trim() };
}
function contains(parent: string, child: string): boolean {
    const rel = relative(parent, child);
    return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
/** Local deployment preferences only. Never part of a project, map export or image. */
export class HostingProfileStore {
    private pending: Promise<unknown> = Promise.resolve();
    constructor(
        private readonly root: string,
        private readonly runner: ProcessRunner,
    ) {}
    async list(): Promise<HostingProfile[]> {
        let raw: string;
        try {
            raw = await readFile(join(this.root, "profiles.json"), "utf8");
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
            throw error;
        }
        if (raw.length > 1024 * 1024) throw new Error("Hosting profile storage exceeds its limit.");
        const rows: unknown = JSON.parse(raw);
        if (!Array.isArray(rows) || rows.length > 100)
            throw new Error("Hosting profile storage is invalid.");
        const profiles = rows.map(validateHostingProfile);
        if (
            profiles.some((profile) => !profile.id) ||
            new Set(profiles.map((profile) => profile.id)).size !== profiles.length
        )
            throw new Error("Hosting profile identities are invalid.");
        return profiles;
    }
    private mutate<T>(change: (rows: HostingProfile[]) => T): Promise<T> {
        const operation = this.pending
            .catch(() => undefined)
            .then(async () => {
                const rows = await this.list();
                const result = change(rows);
                await mkdir(this.root, { recursive: true, mode: 0o700 });
                const temporary = join(this.root, randomUUID() + ".tmp");
                await writeFile(temporary, JSON.stringify(rows), { mode: 0o600, flag: "wx" });
                await rename(temporary, join(this.root, "profiles.json"));
                return result;
            });
        this.pending = operation;
        return operation;
    }
    save(value: unknown): Promise<HostingProfile> {
        const profile = validateHostingProfile(value);
        return this.mutate((rows) => {
            if (!profile.id) {
                if (rows.length >= 100)
                    throw new Error("Remove an unused profile before creating another.");
                profile.id = randomUUID();
                rows.push(profile);
            } else {
                const index = rows.findIndex((row) => row.id === profile.id);
                if (index < 0) throw new Error("This hosting profile no longer exists.");
                rows[index] = profile;
            }
            return profile;
        });
    }
    remove(id: string): Promise<{ removed: boolean }> {
        return this.mutate((rows) => {
            const index = rows.findIndex((row) => row.id === id);
            if (index < 0) throw new Error("This hosting profile no longer exists.");
            rows.splice(index, 1);
            return { removed: true };
        });
    }
    async resolve(
        id: string,
        request: {
            context: string;
            target: ManagedHostTarget;
            port: number;
            excludedRoots?: string[];
        },
    ): Promise<ManagedHostingHostFacts> {
        const profile = (await this.list()).find((row) => row.id === id);
        if (!profile || profile.target !== request.target || profile.port !== request.port)
            throw new Error("Choose a saved profile matching the target and port.");
        const context = await realpath(request.context);
        const contexts = [
            context,
            ...(await Promise.all((request.excludedRoots ?? []).map((path) => realpath(path)))),
        ];
        const tlsKey = await realpath(profile.tlsKey);
        const tlsCert = await realpath(profile.tlsCert);
        for (const path of [tlsKey, tlsCert]) {
            const file = await stat(path);
            if (!file.isFile() || file.size > 1024 * 1024)
                throw new Error("Choose a TLS file no larger than one megabyte.");
        }
        if (contexts.some((root) => contains(root, tlsKey) || contains(root, tlsCert)))
            throw new Error("TLS files must stay outside the exported context.");
        const cert = new X509Certificate(await readFile(tlsCert));
        const host = new URL(profile.origin).hostname.replace(/^\[|\]$/gu, "");
        if (
            !(isIP(host) ? cert.checkIP(host) : cert.checkHost(host)) ||
            Date.parse(cert.validFrom) > Date.now() ||
            Date.parse(cert.validTo) <= Date.now()
        )
            throw new Error("The TLS certificate must be current and match the hosting origin.");
        createSecureContext({ cert: await readFile(tlsCert), key: await readFile(tlsKey) });
        const facts: ManagedHostingHostFacts = {
            dataRoot: profile.dataRoot,
            origin: profile.origin,
            tlsKey,
            tlsCert,
        };
        if (profile.target !== "native-wsl") {
            const dataRoot = await realpath(profile.dataRoot);
            if (
                !(await stat(dataRoot)).isDirectory() ||
                contexts.some((root) => contains(root, dataRoot) || contains(dataRoot, root)) ||
                contains(dataRoot, tlsKey) ||
                contains(dataRoot, tlsCert)
            )
                throw new Error(
                    "Use an existing private data folder separate from the context and TLS files.",
                );
            return { ...facts, dataRoot };
        }
        const distribution = profile.distribution;
        const convert = async (path: string): Promise<string> => {
            const result = await this.runner.run("wsl.exe", [
                "--distribution",
                distribution,
                "--exec",
                "wslpath",
                "-a",
                "-u",
                resolve(path),
            ]);
            const linux = result.stdout.trim();
            if (
                !result.started ||
                result.code !== 0 ||
                !linux.startsWith("/") ||
                /[\r\n\0]/u.test(linux)
            )
                throw new Error(
                    "The selected WSL distribution cannot resolve the local hosting files.",
                );
            return linux;
        };
        const linuxContext = await convert(context);
        const linuxContexts = [
            linuxContext,
            ...(await Promise.all(contexts.slice(1).map(convert))),
        ];
        const linuxTlsKey = await convert(tlsKey);
        const linuxTlsCert = await convert(tlsCert);
        const check = await this.runner.run("wsl.exe", [
            "--distribution",
            distribution,
            "--exec",
            "realpath",
            "-e",
            "--",
            profile.dataRoot,
        ]);
        const linuxDataRoot = check.stdout.trim();
        const within = (parent: string, child: string) =>
            child === parent || child.startsWith(parent.replace(/\/$/u, "") + "/");
        if (
            !check.started ||
            check.code !== 0 ||
            !linuxDataRoot.startsWith("/") ||
            /[\r\n\0]/u.test(linuxDataRoot) ||
            linuxContexts.some(
                (root) => within(root, linuxDataRoot) || within(linuxDataRoot, root),
            ) ||
            within(linuxDataRoot, linuxTlsKey) ||
            within(linuxDataRoot, linuxTlsCert)
        )
            throw new Error(
                "Use an existing private Linux data folder separate from the context and TLS files.",
            );
        const directory = await this.runner.run("wsl.exe", [
            "--distribution",
            distribution,
            "--exec",
            "test",
            "-d",
            linuxDataRoot,
        ]);
        if (!directory.started || directory.code !== 0)
            throw new Error("The Linux data folder is unavailable.");
        return { ...facts, distribution, linuxContext, linuxDataRoot, linuxTlsKey, linuxTlsCert };
    }
}
