/**
 * An in-memory `ServerTransport`, for `install.ts` and `manage.ts` tests.
 *
 * Backed by a plain `Map<path, Uint8Array>` rather than a real filesystem or a real
 * Docker daemon, because everything these tests care about - a file landing at the
 * right path, a rename, a delete - is a fact about that map.
 */

import { fail, ok, type Answer, type FileEntry, type ServerTransport, type WriteReceipt } from "../transport/types.js";
import { createHash } from "node:crypto";

export function createFakeTransport(): ServerTransport & { readonly files: Map<string, Uint8Array> } {
    const files = new Map<string, Uint8Array>();

    const transport: ServerTransport & { readonly files: Map<string, Uint8Array> } = {
        files,
        ref: { kind: "local-process", serverDir: "/fake" },
        capabilities: { canCreate: true, canLifecycle: true, canWriteFiles: true, canDestroy: true, console: "stdin" },
        probe: () => Promise.resolve(ok({ reachable: true, runtimeVersion: null, message: "ok", checkedAt: "now" })),
        create: () => Promise.resolve(fail("unsupported", "not needed for this test")),
        start: () => Promise.resolve(ok(undefined)),
        stop: () => Promise.resolve(ok(undefined)),
        status: () =>
            Promise.resolve(ok({ state: "running", running: true, startedAt: "now", exitCode: null, checkedAt: "now" })),
        attach: () => Promise.resolve(fail("unsupported", "not needed for this test")),

        fileList: (dir: string): Promise<Answer<readonly FileEntry[]>> => {
            const prefix = `${dir}/`;
            const entries: FileEntry[] = [];
            const seen = new Set<string>();
            for (const path of files.keys()) {
                if (!path.startsWith(prefix)) continue;
                const rest = path.slice(prefix.length);
                if (rest.includes("/")) continue;
                if (seen.has(rest)) continue;
                seen.add(rest);
                entries.push({ name: rest, kind: "file", size: files.get(path)?.length ?? null, modifiedAt: null });
            }
            if (entries.length === 0 && ![...files.keys()].some((path) => path.startsWith(prefix))) {
                return Promise.resolve(fail("not-found", "no such directory"));
            }
            return Promise.resolve(ok(entries));
        },

        fileRead: (path: string) => {
            const bytes = files.get(path);
            if (bytes === undefined) return Promise.resolve(fail("not-found", "no such file"));
            const hash = createHash("sha256").update(bytes).digest("hex");
            return Promise.resolve(ok({ bytes, hash, size: bytes.length, truncated: false }));
        },

        fileWrite: (path: string, blob: Uint8Array): Promise<Answer<WriteReceipt>> => {
            files.set(path, blob);
            const hash = createHash("sha256").update(blob).digest("hex");
            return Promise.resolve(ok({ hash, size: blob.length, writtenAt: "now", backupPath: null }));
        },

        fileDelete: (path: string) => {
            files.delete(path);
            return Promise.resolve(ok(undefined));
        },

        dirEnsure: () => Promise.resolve(ok(undefined)),
    };

    return transport;
}
