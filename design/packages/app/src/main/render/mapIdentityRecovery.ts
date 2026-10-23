import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { parseHocon } from "@worldlens/shared";
import { acquireRenderWorkspaceLease } from "./workspaceLease.js";
import { resolveRenderMaps } from "./mapIdentity.js";
import { readRenderRecord } from "./provenance.js";
import { readRenderSession, renderConfigFingerprint } from "./session.js";
import { buildCompletedOutputManifest } from "./outputManifest.js";
import type { RenderWorkspace } from "./workspace.js";

/**
 * Read-only recovery proposal. Originals, timestamps, worlds and output remain untouched.
 * The caller must retain this evidence and explicitly apply/reverify metadata separately.
 * IDs are derived exclusively from matching source configs, never adopted from output.
 */
export async function inspectLegacyMapIdentity(workspace: RenderWorkspace) {
    const safeRead = async (path: string) => {
        const info = await lstat(path);
        if (!info.isFile() || info.isSymbolicLink() || info.size > 4_194_304) throw new Error("Unsafe recovery input.");
        return await readFile(path, "utf8");
    };
    // Reject links anywhere in the retained workspace, including parent directories.
    if ((await realpath(workspace.root)).toLowerCase() !== resolve(workspace.root).toLowerCase()) throw new Error("Recovery root has an aliased ancestor.");
    let entriesVisited = 0;
    const visit = async (path: string): Promise<void> => {
        if (++entriesVisited > 500_000) throw new Error("Recovery input exceeds inventory bounds.");
        const info = await lstat(path);
        if (info.isSymbolicLink()) throw new Error("Recovery does not follow symbolic links.");
        if (info.isDirectory()) for (const child of await readdir(path)) await visit(join(path, child));
    };
    await visit(workspace.root);
    const recordText = await safeRead(workspace.recordFile);
    const sessionPath = join(workspace.root, "session.json");
    const sessionText = await safeRead(sessionPath);
    const record = await readRenderRecord(workspace.recordFile);
    const session = await readRenderSession(sessionPath);
    if (!record || !session || record.renderId !== workspace.renderId || session.renderId !== workspace.renderId ||
        record.engine !== "upstream-java" || session.engine !== record.engine || session.engineVersion !== record.engineVersion ||
        record.maps.length !== session.maps.length || record.maps.length === 0)
        throw new Error("Recovery requires matching upstream Java provenance and session.");
    if (record.runtime === "wsl" || session.runtime === "wsl") throw new Error("WSL recovery unavailable: retained source-bound host-to-WSL world mapping is not recorded.");
    for (const [index, map] of record.maps.entries()) {
        const stored = session.maps[index];
        if (!stored || ["id", "world", "name", "dimension"].some(key => map[key as keyof typeof map] !== stored[key as keyof typeof stored]))
            throw new Error("Original map identities disagree.");
    }
    const maps = resolveRenderMaps(session.maps, record.engine);
    if (maps.every((map, index) => map.id === session.maps[index]?.id)) throw new Error("No legacy map identity correction is needed.");
    const configDir = record.runtime === "docker" ? workspace.containerConfigDir : workspace.configDir;
    const sourceConfigs = [];
    const sourceFiles = await readdir(join(configDir, "maps"));
    if (sourceFiles.filter(file => file.endsWith(".conf")).length !== maps.length) throw new Error("Source configuration map set differs.");
    for (const [index, map] of maps.entries()) {
        const original = session.maps[index]!;
        const text = await safeRead(join(configDir, "maps", `${original.id}.conf`));
        const config = parseHocon(text) as Record<string, unknown>;
        if (config.dimension !== map.dimension || config.name !== map.name || typeof config.world !== "string" ||
            (record.runtime !== "docker" && config.world !== map.world)) throw new Error("Source map configuration identity differs.");
        if (record.runtime === "docker" && config.world !== `/worlds/${original.id}`) throw new Error("Container source world binding differs.");
        const settings = JSON.parse(await safeRead(join(workspace.storageRoot, map.id, "settings.json")));
        if (settings.name !== map.name) throw new Error("Output map name differs.");
        sourceConfigs.push({ id: original.id, sha256: digest(text) });
    }
    const settings = JSON.parse(await safeRead(join(workspace.webRoot, "settings.json")));
    if (!Array.isArray(settings.maps) || settings.maps.length !== maps.length || new Set(settings.maps).size !== maps.length ||
        maps.some(map => !settings.maps.includes(map.id))) throw new Error("Output map set differs from source-derived identities.");
    const outputManifest = await buildCompletedOutputManifest(workspace.webRoot, maps.map(map => map.id));
    if (!outputManifest || outputManifest.maps.some(map => map.fileCount < 2)) throw new Error("Output payload is incomplete.");
    return { recoveryVersion: 1 as const, originalRecordSha256: digest(recordText), originalSessionSha256: digest(sessionText),
        sourceConfigs, outputManifest, record: { ...record, maps: record.maps.map((map, index) => ({ ...map, id: maps[index]!.id })),
            configHash: renderConfigFingerprint(maps), outputManifest },
        session: { ...session, maps: session.maps.map((map, index) => ({ ...map, id: maps[index]!.id })), configHash: renderConfigFingerprint(maps) } };
}
function digest(text: string): string { return createHash("sha256").update(text).digest("hex"); }

/** Apply a reviewed correction only to already completed records, then run normal promotion verification. */
export async function recoverLegacyMapIdentity(workspace: RenderWorkspace, options: {
    readonly expectedRecordSha256: string;
    readonly expectedSessionSha256: string;
    readonly expectedOutputFingerprint: string;
    readonly sourceCommit: string | null;
    readonly projectId: string | null;
}) {
    const release = await acquireRenderWorkspaceLease(dirname(workspace.root), workspace.renderId);
    try {
    const proposal = await inspectLegacyMapIdentity(workspace);
    if (proposal.originalRecordSha256 !== options.expectedRecordSha256 || proposal.originalSessionSha256 !== options.expectedSessionSha256)
        throw new Error("Recovery inputs changed since review.");
    if (proposal.outputManifest.payloadFingerprint !== options.expectedOutputFingerprint) throw new Error("Output changed since recovery review.");
    if (proposal.record.outcome !== "finished" || proposal.session.status !== "completed" ||
        proposal.record.finishedAt === null || proposal.record.finishedAt !== proposal.session.endedAt)
        throw new Error("Recovery cannot invent completion or historical timestamps.");
    const { writeFile, mkdir } = await import("node:fs/promises");
    const { writeRenderRecord } = await import("./provenance.js");
    const { writeRenderSession } = await import("./session.js");
    const { verifyFinishedRender } = await import("./promotion.js");
    const sessionPath = join(workspace.root, "session.json");
    const recordText = await readFile(workspace.recordFile, "utf8");
    const sessionText = await readFile(sessionPath, "utf8");
    if (digest(recordText) !== proposal.originalRecordSha256 || digest(sessionText) !== proposal.originalSessionSha256)
        throw new Error("Recovery inputs changed before preservation.");
    const backup = join(workspace.root, `identity-recovery-${proposal.originalRecordSha256.slice(0, 16)}`);
    await mkdir(backup); // Existing evidence is never replaced.
    await writeFile(join(backup, "render.json"), recordText, { flag: "wx" });
    await writeFile(join(backup, "session.json"), sessionText, { flag: "wx" });
    await writeFile(join(backup, "proposal.json"), JSON.stringify(proposal, null, 2), { flag: "wx" });
    try {
        await writeRenderRecord(workspace.recordFile, proposal.record);
        await writeRenderSession(sessionPath, proposal.session);
        const result = await verifyFinishedRender(workspace, { sourceCommit: options.sourceCommit, projectId: options.projectId });
        if (result.failure !== null) throw new Error(`Recovered metadata did not verify: ${result.failure.detail}`);
        return { ...result, backupDirectory: backup };
    } catch (error) {
        // Preserve the failed proposal and restore byte-for-byte originals.
        await writeFile(workspace.recordFile, recordText);
        await writeFile(sessionPath, sessionText);
        throw error;
    }
    } finally { await release(); }
}
