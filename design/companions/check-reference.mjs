/** Source-only reference validation. This is not a build or visual acceptance test. */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(new URL("../packages/ui/package.json", import.meta.url));
const { parse, compileScript, compileTemplate } = require("vue/compiler-sfc");
const filename = new URL("./references/CompanionReference.vue", import.meta.url).pathname;
const source = readFileSync(new URL("./references/CompanionReference.vue", import.meta.url), "utf8");
const { descriptor, errors } = parse(source, { filename });
if (errors.length) throw new Error("Reference component parse failed");
compileScript(descriptor, { id: "companion-reference" });
const compiled = compileTemplate({ source: descriptor.template.content, filename, id: "companion-reference" });
if (compiled.errors.length) throw new Error("Reference template compilation failed");
process.stdout.write("Reference SFC parse and template compilation passed; runtime and visual evidence remain pending.\n");
