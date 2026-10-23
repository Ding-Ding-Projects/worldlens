import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
/** Isolated backend checks use this lane's own sources rather than another checkout's output. */
export default defineConfig({resolve:{alias:{'@worldlens/config':fileURLToPath(new URL('../../../../../config/src/index.ts',import.meta.url)),'@worldlens/dockhand':fileURLToPath(new URL('../../../../../dockhand/src/index.ts',import.meta.url))}},test:{pool:'forks',poolOptions:{forks:{minForks:1,maxForks:1}},testTimeout:30000}});
