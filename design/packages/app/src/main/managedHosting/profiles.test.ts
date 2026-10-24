import { afterEach, expect, test } from "vitest";
import { mkdtemp, rm, readFile, mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HostingProfileStore, validateHostingProfile } from "./profiles.js";
import type { HostingProfile } from "./profiles.js";
import type { ProcessRunner } from "../cirender/gh.js";
const roots: string[] = [];
let hasOpenSsl = false;
try {
    execFileSync("openssl", ["version"], { stdio: "ignore", windowsHide: true });
    hasOpenSsl = true;
} catch {
    /* The TLS integration case reports skipped when OpenSSL is unavailable. */
}
afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
const runner: ProcessRunner = {
    async run() {
        throw new Error("Unexpected process invocation");
    },
    async runToFile() {
        throw new Error("Unexpected process invocation");
    },
};
function profile(root: string): HostingProfile {
    return {
        id: "",
        name: "Local host",
        target: "native-windows",
        origin: "https://map.example:8443",
        port: 8443,
        dataRoot: join(root, "data"),
        tlsKey: join(root, "key.pem"),
        tlsCert: join(root, "cert.pem"),
        distribution: "",
    };
}
test.skipIf(!hasOpenSsl)(
    "real TLS pair resolves without claiming trust and mismatched host or overlapping storage is refused",
    async () => {
        const root = await mkdtemp(join(tmpdir(), "hosting-tls-"));
        roots.push(root);
        const context = join(root, "context");
        await mkdir(context);
        await mkdir(join(root, "data"));
        await writeFile(
            join(root, "openssl.cnf"),
            "[req]\ndistinguished_name=subject\n[subject]\nCN=map.example\n",
        );
        execFileSync(
            "openssl",
            [
                "req",
                "-config",
                join(root, "openssl.cnf"),
                "-x509",
                "-newkey",
                "rsa:2048",
                "-nodes",
                "-keyout",
                join(root, "key.pem"),
                "-out",
                join(root, "cert.pem"),
                "-days",
                "1",
                "-subj",
                "/CN=map.example",
                "-addext",
                "subjectAltName=DNS:map.example",
            ],
            { stdio: "ignore", windowsHide: true },
        );
        const store = new HostingProfileStore(join(root, "profiles"), runner);
        const saved = await store.save(profile(root));
        const facts = await store.resolve(saved.id, {
            context,
            target: "native-windows",
            port: 8443,
        });
        expect(facts.origin).toBe(saved.origin);
        await expect(
            store.resolve(saved.id, {
                context,
                target: "native-windows",
                port: 8443,
                excludedRoots: [root],
            }),
        ).rejects.toThrow("outside the exported context");
        expect(facts).not.toHaveProperty("trust");
        await store.save({ ...saved, origin: "https://other.example:8443" });
        await expect(
            store.resolve(saved.id, { context, target: "native-windows", port: 8443 }),
        ).rejects.toThrow("match the hosting origin");
        await store.save({ ...saved, dataRoot: context });
        await expect(
            store.resolve(saved.id, { context, target: "native-windows", port: 8443 }),
        ).rejects.toThrow("separate from the context");
    },
);
test("profiles survive store recreation, update and remove without retaining credentials", async () => {
    const root = await mkdtemp(join(tmpdir(), "hosting-profile-"));
    roots.push(root);
    const store = new HostingProfileStore(root, runner);
    const saved = await store.save(profile(root));
    expect(saved.id).toMatch(/^[a-f0-9-]{36}$/u);
    const restored = new HostingProfileStore(root, runner);
    expect(await restored.list()).toEqual([saved]);
    const changed = await restored.save({ ...saved, name: "Renamed" });
    expect((await restored.list())[0]?.name).toBe("Renamed");
    expect(await readFile(join(root, "profiles.json"), "utf8")).not.toMatch(/password|verifier/u);
    await restored.remove(changed.id);
    expect(await restored.list()).toEqual([]);
    await expect(restored.save(changed)).rejects.toThrow("no longer exists");
});
test("profile validation rejects injected fields, mismatched ports and unsafe WSL values", () => {
    const valid = profile(tmpdir());
    expect(validateHostingProfile(valid)).toEqual(valid);
    for (const invalid of [
        { ...valid, password: "never-store" },
        { ...valid, port: 443 },
        { ...valid, origin: "http://map.example:8443" },
        { ...valid, origin: "https://map.example:8443/path" },
        { ...valid, tlsKey: "relative.pem" },
        { ...valid, target: "native-wsl", distribution: "-bad", dataRoot: "/private" },
        { ...valid, target: "native-wsl", distribution: "Ubuntu", dataRoot: "/private/../map" },
    ])
        expect(() => validateHostingProfile(invalid)).toThrow();
    expect(
        validateHostingProfile({
            ...valid,
            target: "native-wsl",
            distribution: "Ubuntu",
            dataRoot: "/private/data",
        }).target,
    ).toBe("native-wsl");
});
test("concurrent profile writes preserve both records and deployment refuses changed identity", async () => {
    const root = await mkdtemp(join(tmpdir(), "hosting-profile-"));
    roots.push(root);
    const store = new HostingProfileStore(root, runner);
    const [a] = await Promise.all([
        store.save(profile(root)),
        store.save({ ...profile(root), name: "Second" }),
    ]);
    expect(await store.list()).toHaveLength(2);
    await expect(
        store.resolve(a.id, { context: root, target: "container", port: 8443 }),
    ).rejects.toThrow("matching the target and port");
    await expect(
        store.resolve(a.id, { context: root, target: "native-windows", port: 8444 }),
    ).rejects.toThrow("matching the target and port");
});
