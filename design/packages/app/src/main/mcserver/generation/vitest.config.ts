import { fileURLToPath } from "node:url";
import { mergeConfig } from "vitest/config";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import workspaceConfig from "../../../../../../vitest.config.js";
const packages = fileURLToPath(new URL("../../../../../", import.meta.url));
const alias: { find: string; replacement: string }[] = [];
for (const name of readdirSync(packages)) {
    const root = join(packages, name);
    if (!existsSync(join(root, "src", "index.ts"))) continue;
    const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
        name: string;
        exports?: Record<string, unknown>;
    };
    for (const subpath of Object.keys(manifest.exports ?? {})) {
        if (!subpath.startsWith("./") || subpath.endsWith(".json")) continue;
        const source = join(
            root,
            "src",
            subpath.slice(2) + (subpath.endsWith(".css") ? "" : ".ts"),
        );
        if (existsSync(source))
            alias.push({ find: `${manifest.name}/${subpath.slice(2)}`, replacement: source });
    }
    alias.push({ find: manifest.name, replacement: join(root, "src", "index.ts") });
}
/** Resolve this lane's source, keeping the workspace's Vue and isolated-worker setup. */
export default mergeConfig(workspaceConfig, { resolve: { alias } });
