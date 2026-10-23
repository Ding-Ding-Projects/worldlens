import { defineConfig, mergeConfig } from "vitest/config";
import base from "../../../../../vitest.config.js";
import { fileURLToPath } from "node:url";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
const packages = fileURLToPath(new URL("../../../../", import.meta.url));
const alias = readdirSync(packages).flatMap(name => {
    const entry = join(packages, name, "src/index.ts");
    return existsSync(entry) ? [{ find: new RegExp(`^@worldlens/${name}$`), replacement: entry }] : [];
});
for (const name of readdirSync(packages)) {
    alias.unshift({ find: new RegExp(`^@worldlens/${name}/(.+)$`), replacement: join(packages, name, "src", "$1.ts").replaceAll("\\", "/") });
}
export default mergeConfig(base, defineConfig({ resolve: { alias } }));
