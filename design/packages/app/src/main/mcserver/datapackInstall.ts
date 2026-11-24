/**
 * Puts a data pack the data pack studio built onto a server WorldLens manages.
 *
 * The pack goes into `<level-name>/datapacks/<file>.zip`, where `level-name` is read from the
 * server's own `server.properties` (the game's default, `world`, when the file or the key is
 * missing). Everything goes through the server's transport, so a server in a container, on an
 * SSH host or in a local folder is written the same way, under the same write scope and the
 * same permission to change world files. An existing pack of the same name is backed up
 * before it is replaced, and the result says that it was replaced.
 */
import type { Answer, ServerTransport } from "./transport/types.js";
import { fail, ok } from "./transport/types.js";

export const MAX_SERVER_DATAPACK_BYTES = 64 * 1024 * 1024;
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9 _.()-]{0,120}\.zip$/;

export interface InstalledDataPack {
    readonly path: string;
    readonly bytes: number;
    readonly replaced: boolean;
    readonly world: string;
}

/** `level-name` from server.properties text, unescaped the way properties files are. */
export function levelName(properties: string): string | null {
    for (const raw of properties.split(/\r?\n/)) {
        const line = raw.trimStart();
        if (line.startsWith("#") || line.startsWith("!")) continue;
        const m = /^level-name\s*[=:]\s*(.*)$/.exec(line);
        if (m) {
            const value = m[1]!.replace(/\\(.)/g, "$1").trim();
            return value === "" ? null : value;
        }
    }
    return null;
}

export async function installDataPack(
    transport: Pick<ServerTransport, "fileRead" | "fileList" | "fileWrite" | "dirEnsure">,
    fileName: string,
    bytes: Uint8Array,
): Promise<Answer<InstalledDataPack>> {
    if (!FILE_NAME.test(fileName) || fileName.includes(".."))
        return fail("invalid-request", `${fileName} is not a plain .zip file name.`);
    if (bytes.byteLength > MAX_SERVER_DATAPACK_BYTES)
        return fail("invalid-request", "The pack is larger than 64 MiB.");
    const magic = Buffer.from(bytes.subarray(0, 4)).toString("hex");
    if (magic !== "504b0304" && magic !== "504b0506")
        return fail("invalid-request", "What was sent is not a .zip file.");

    const props = await transport.fileRead("server.properties", { maxBytes: 256 * 1024 });
    const world = (props.ok ? levelName(Buffer.from(props.value.bytes).toString("utf8")) : null) ?? "world";
    if (world.includes("..") || world.startsWith("/") || /^[A-Za-z]:/.test(world))
        return fail("invalid-request", `The server's level-name (${world}) is not a folder inside the server.`);

    const folder = `${world}/datapacks`;
    const ensured = await transport.dirEnsure(folder, "world");
    if (!ensured.ok) return ensured;
    const listed = await transport.fileList(folder);
    const replaced = listed.ok && listed.value.some((entry) => entry.name === fileName);
    const path = `${folder}/${fileName}`;
    const written = await transport.fileWrite(path, bytes, { expectedHash: null, backup: true, kind: "world" });
    if (!written.ok) return written;
    return ok({ path, bytes: bytes.byteLength, replaced, world });
}
