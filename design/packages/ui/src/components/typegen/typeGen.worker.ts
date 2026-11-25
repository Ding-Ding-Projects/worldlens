/**
 * The Web Worker that runs quicktype off the interface thread. All behaviour lives in
 * `typeGenEngine.ts`; this file only connects it to `postMessage`.
 */
import { handleMessage } from "./typeGenEngine.js";
import type { WorkerRequest } from "./typeGenTypes.js";

const scope = globalThis as unknown as {
    onmessage: ((event: { data: WorkerRequest }) => void) | null;
    postMessage(message: unknown): void;
};

scope.onmessage = (event) => {
    void handleMessage(event.data).then((reply) => scope.postMessage(reply));
};
