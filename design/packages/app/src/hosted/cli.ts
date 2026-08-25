/**
 * The process entry point, and nothing else.
 *
 * Separate from `main.ts` so that everything in there stays importable by a test without
 * starting a server as a side effect of the import. The first version bundled `main.ts`
 * directly, which exported `main` and never called it: the container started, exited 0
 * immediately, and looked for all the world like a server that had crashed silently.
 */
import { main } from "./main.js";

await main(process.env);
