import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const compilerPath = process.argv[2];
if (!compilerPath) throw new Error('Pass an installed @vue/compiler-sfc path.');
const require = createRequire(import.meta.url);
const { parse, compileScript, compileTemplate, version } = require(path.resolve(compilerPath));
const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const files = ['WorkflowReference.vue', 'TaskStateReference.vue'];
for (const file of files) {
  const filename = path.resolve(decodeURIComponent(root), file);
  const { descriptor, errors } = parse(fs.readFileSync(filename, 'utf8'), { filename });
  if (errors.length) throw new Error(`${file}: ${errors.join('; ')}`);
  const script = compileScript(descriptor, { id: file });
  const template = compileTemplate({ source: descriptor.template.content, filename, id: file, compilerOptions: { bindingMetadata: script.bindings } });
  if (template.errors.length) throw new Error(`${file}: ${template.errors.join('; ')}`);
  console.log(`${file}: parse, script and template compilation passed`);
}
console.log(`@vue/compiler-sfc ${version}; no mounted runtime or typecheck claimed`);
