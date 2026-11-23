/**
 * Composes an appliance disk from the command line: the same code path the desktop app uses.
 * CI bundles this with esbuild for the boot smoke test:
 *
 *   node compose-cli.mjs --base base.img --map ./map --out disk.img [--host worldlens-map] [--port 80] [--code secret]
 */
import { composeDisk, resolveMapDirectory, sha256File } from "./compose.js";
import { buildMapConfig } from "./mapConfig.js";

const argv = process.argv.slice(2);
const arg = (name: string): string | undefined => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : undefined;
};

const base = arg("base");
const map = arg("map");
const out = arg("out");
if (!base || !map || !out) {
    console.error("usage: compose-cli --base <base.img> --map <folder> --out <disk.img> [--host name] [--port 80] [--code access-code]");
    process.exit(2);
}

const result = await composeDisk({
    baseImage: base,
    baseSha256: await sha256File(base),
    mapDirectory: await resolveMapDirectory(map),
    config: buildMapConfig({ hostName: arg("host") ?? "worldlens-map", port: Number(arg("port") ?? 80), accessCode: arg("code") ?? null, vocabulary: {} }),
    outFile: out,
});
console.log(`${result.path} ${result.bytes} bytes sha256 ${result.sha256}`);
