/**
 * The screen's handle on the generation engine.
 *
 * Requests go to a Web Worker so quicktype never runs on the interface thread. Where no
 * Worker exists (a test, a very old shell) the same engine runs in-process through a dynamic
 * import, so behaviour is identical and the engine still stays out of the main chunk.
 * Only the newest generate request matters: an older reply that arrives late is dropped.
 */
import type {
    DescribeReply,
    GenerateFailure,
    GenerateRequest,
    GenerateSuccess,
    LanguageInfo,
    WorkerReply,
    WorkerRequest,
} from "./typeGenTypes.js";

/** Anything that can carry a request to the engine and bring the reply back. */
export interface TypeGenTransport {
    send(request: WorkerRequest): Promise<WorkerReply>;
    dispose(): void;
}

export function createWorkerTransport(): TypeGenTransport | null {
    if (typeof Worker === "undefined") return null;
    const worker = new Worker(new URL("./typeGen.worker.ts", import.meta.url), { type: "module" });
    const waiting = new Map<number, (reply: WorkerReply) => void>();
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
        const resolve = waiting.get(event.data.id);
        if (resolve) {
            waiting.delete(event.data.id);
            resolve(event.data);
        }
    };
    worker.onerror = (event) => {
        for (const [id, resolve] of waiting) {
            resolve({ type: "generated", id, ok: false, failure: "engine", message: event.message || "The generator worker stopped." });
        }
        waiting.clear();
    };
    return {
        send: (request) =>
            new Promise<WorkerReply>((resolve) => {
                waiting.set(request.id, resolve);
                worker.postMessage(request);
            }),
        dispose: () => worker.terminate(),
    };
}

export function createInProcessTransport(): TypeGenTransport {
    return {
        send: async (request) => (await import("./typeGenEngine.js")).handleMessage(request),
        dispose: () => undefined,
    };
}

export interface TypeGenClient {
    languages(): Promise<readonly LanguageInfo[]>;
    /** Resolves with the reply, or null when a newer request replaced this one. */
    generate(request: Omit<GenerateRequest, "type" | "id">): Promise<GenerateSuccess | GenerateFailure | null>;
    dispose(): void;
}

export function createTypeGenClient(transport?: TypeGenTransport): TypeGenClient {
    const channel = transport ?? createWorkerTransport() ?? createInProcessTransport();
    let counter = 0;
    let latest = 0;
    return {
        async languages() {
            const reply = (await channel.send({ type: "describe", id: ++counter })) as DescribeReply;
            return reply.languages;
        },
        async generate(request) {
            const id = ++counter;
            latest = id;
            const reply = await channel.send({ ...request, type: "generate", id });
            if (reply.type !== "generated" || id !== latest) return null;
            return reply;
        },
        dispose: () => channel.dispose(),
    };
}
