/**
 * Reactive state for the local Ollama suite manager: runtime health, installed models, the
 * catalogue, the pull queue and chat sessions.
 *
 * ## The fail-closed read, copied on purpose
 *
 * Chat session persistence follows the exact shape `../markers/markerStudioStore.ts` uses for
 * a person's markers: an unreadable read reports itself as a `failure` string rather than
 * answering with an empty session list, and the store refuses to persist while that failure
 * stands so a parse error can never turn into "your chat history is gone" the moment anything
 * else in the store happens to write. A chat transcript is exactly the kind of thing somebody
 * notices missing only when they go looking for it, which is the same property markers have.
 *
 * ## What is safe to persist, and what is not
 *
 * Installed models, the catalogue and hardware detection are re-derived from the daemon and
 * from detection on every load, so none of that is written to storage: a stale cached model
 * list would claim something is installed that was since deleted outside this app. Chat
 * sessions and their messages are the one thing genuinely owned by this app rather than
 * mirrored from the daemon, so they are the one thing persisted.
 */

import { reactive, watch } from "vue";
import type { OllamaChatMessage } from "./ollamaApi.js";
import type { OllamaInstalledModel } from "./ollamaApi.js";
import type { OllamaCatalog } from "./ollamaCatalog.js";
import type { FitAssessment } from "./hardwareFit.js";

export const OLLAMA_CHAT_STORAGE_KEY = "worldlens-ollama-chat-sessions";

export type RuntimeState = "unknown" | "missing" | "stopped" | "unhealthy" | "ready";

export interface RuntimeStatus {
    readonly state: RuntimeState;
    readonly version: string | null;
    readonly checkedAt: string | null;
    /** A sentence naming what went wrong, present whenever `state` is not `ready`. */
    readonly detail: string | null;
}

export type PullItemState = "queued" | "pulling" | "pulled" | "cancelled" | "failed";

export interface PullQueueItem {
    readonly id: string;
    readonly modelName: string;
    state: PullItemState;
    /** 0-100 when the daemon has reported a total, otherwise null (indeterminate). */
    percent: number | null;
    statusLine: string;
    error: string | null;
}

export interface ChatMessageRecord extends Omit<OllamaChatMessage, "content"> {
    readonly id: string;
    readonly createdAt: string;
    /**
     * Mutable, unlike {@link OllamaChatMessage}'s own field: a streaming assistant reply is
     * appended to token by token as chunks arrive, so this is the one field on a stored
     * message that is expected to change after it is first recorded.
     */
    content: string;
}

export interface ChatSession {
    readonly id: string;
    name: string;
    model: string;
    systemPrompt: string;
    messages: ChatMessageRecord[];
    readonly createdAt: string;
    updatedAt: string;
}

interface PersistedChatState {
    sessions: ChatSession[];
}

interface StoreState {
    runtime: RuntimeStatus;
    installedModels: OllamaInstalledModel[];
    catalog: OllamaCatalog | null;
    catalogStale: boolean;
    pullQueue: PullQueueItem[];
    sessions: ChatSession[];
    activeSessionId: string | null;
    fitCache: Record<string, FitAssessment>;
    /** Non-null when the persisted chat sessions could not be read. Never confused with "none". */
    failure: string | null;
}

function loadChatState(): { sessions: ChatSession[]; failure: string | null } {
    try {
        const raw = localStorage.getItem(OLLAMA_CHAT_STORAGE_KEY);
        if (raw === null) return { sessions: [], failure: null };
        const parsed = JSON.parse(raw) as Partial<PersistedChatState>;
        if (!Array.isArray(parsed.sessions)) {
            return { sessions: [], failure: "The saved chat sessions are not in a shape this build recognises." };
        }
        return { sessions: parsed.sessions as ChatSession[], failure: null };
    } catch (error) {
        return { sessions: [], failure: error instanceof Error ? error.message : String(error) };
    }
}

const initialChat = loadChatState();

export const ollamaStore = reactive<StoreState>({
    runtime: { state: "unknown", version: null, checkedAt: null, detail: null },
    installedModels: [],
    catalog: null,
    catalogStale: false,
    pullQueue: [],
    sessions: initialChat.sessions,
    activeSessionId: initialChat.sessions[0]?.id ?? null,
    fitCache: {},
    failure: initialChat.failure,
});

let persisting = true;

watch(
    () => JSON.stringify(ollamaStore.sessions),
    (serialised) => {
        // The store that failed to read must not write over what it could not read, exactly as
        // markerStudioStore.ts explains: that would turn "I could not parse your sessions" into
        // "your sessions are gone", which is the same failure one step further and unrecoverable.
        if (!persisting || ollamaStore.failure !== null) return;
        try {
            localStorage.setItem(OLLAMA_CHAT_STORAGE_KEY, JSON.stringify({ sessions: JSON.parse(serialised) }));
        } catch {
            // A full or refused quota is not worth taking the chat surface down for; sessions
            // stay in memory and the next successful write catches up.
        }
    },
);

/** Stops persistence while a test rearranges the store, so one test cannot write another's. */
export function setOllamaChatPersistence(on: boolean): void {
    persisting = on;
}

/** Re-reads storage. Used after a test replaces `localStorage`, and by a restore. */
export function reloadOllamaChatSessions(): void {
    const fresh = loadChatState();
    ollamaStore.sessions.splice(0, ollamaStore.sessions.length, ...fresh.sessions);
    ollamaStore.failure = fresh.failure;
    ollamaStore.activeSessionId = fresh.sessions[0]?.id ?? null;
}

function newId(prefix: string): string {
    const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    return `${prefix}-${random}`;
}

export function setRuntimeStatus(status: RuntimeStatus): void {
    ollamaStore.runtime = status;
}

export function setInstalledModels(models: readonly OllamaInstalledModel[]): void {
    ollamaStore.installedModels.splice(0, ollamaStore.installedModels.length, ...models);
}

export function setCatalog(catalog: OllamaCatalog | null, stale: boolean): void {
    ollamaStore.catalog = catalog;
    ollamaStore.catalogStale = stale;
}

export function cacheFit(fullName: string, assessment: FitAssessment): void {
    ollamaStore.fitCache[fullName] = assessment;
}

/* -------------------------------------------------------------------------- */
/* Pull queue                                                                  */
/* -------------------------------------------------------------------------- */

export function enqueuePulls(modelNames: readonly string[]): readonly PullQueueItem[] {
    const created: PullQueueItem[] = modelNames.map((modelName) => ({
        id: newId("pull"),
        modelName,
        state: "queued",
        percent: null,
        statusLine: "Queued.",
        error: null,
    }));
    ollamaStore.pullQueue.push(...created);
    return created;
}

export function updatePullItem(id: string, patch: Partial<Pick<PullQueueItem, "state" | "percent" | "statusLine" | "error">>): void {
    const item = ollamaStore.pullQueue.find((entry) => entry.id === id);
    if (!item) return;
    if (patch.state !== undefined) item.state = patch.state;
    if (patch.percent !== undefined) item.percent = patch.percent;
    if (patch.statusLine !== undefined) item.statusLine = patch.statusLine;
    if (patch.error !== undefined) item.error = patch.error;
}

export function clearFinishedPulls(): void {
    for (let index = ollamaStore.pullQueue.length - 1; index >= 0; index -= 1) {
        const state = ollamaStore.pullQueue[index]!.state;
        if (state === "pulled" || state === "cancelled" || state === "failed") {
            ollamaStore.pullQueue.splice(index, 1);
        }
    }
}

/* -------------------------------------------------------------------------- */
/* Chat sessions                                                              */
/* -------------------------------------------------------------------------- */

export function createChatSession(model: string, name: string, systemPrompt = ""): ChatSession {
    const now = new Date().toISOString();
    const session: ChatSession = {
        id: newId("chat"),
        name,
        model,
        systemPrompt,
        messages: [],
        createdAt: now,
        updatedAt: now,
    };
    ollamaStore.sessions.unshift(session);
    ollamaStore.activeSessionId = session.id;
    return session;
}

export function renameChatSession(id: string, name: string): void {
    const session = ollamaStore.sessions.find((entry) => entry.id === id);
    if (session) {
        session.name = name;
        session.updatedAt = new Date().toISOString();
    }
}

/**
 * Deleting a session is destructive and unrecoverable from this store's own storage: the
 * screen puts `ConfigSuperConfirm` in front of the call that reaches this function, and this
 * function performs the removal only after that gate authorizes it.
 */
export function deleteChatSession(id: string): void {
    const index = ollamaStore.sessions.findIndex((entry) => entry.id === id);
    if (index >= 0) ollamaStore.sessions.splice(index, 1);
    if (ollamaStore.activeSessionId === id) {
        ollamaStore.activeSessionId = ollamaStore.sessions[0]?.id ?? null;
    }
}

export function appendChatMessage(sessionId: string, message: OllamaChatMessage): ChatMessageRecord {
    const session = ollamaStore.sessions.find((entry) => entry.id === sessionId);
    const record: ChatMessageRecord = { ...message, id: newId("msg"), createdAt: new Date().toISOString() };
    if (session) {
        session.messages.push(record);
        session.updatedAt = record.createdAt;
    }
    return record;
}

export function updateLastAssistantMessage(sessionId: string, content: string): void {
    const session = ollamaStore.sessions.find((entry) => entry.id === sessionId);
    if (!session) return;
    const last = session.messages[session.messages.length - 1];
    if (last && last.role === "assistant") {
        last.content = content;
        session.updatedAt = new Date().toISOString();
    }
}

/** The corpus a chat-search field's regex builder previews against. */
export function chatSessionCorpus(): string {
    return ollamaStore.sessions.map((session) => `${session.name}\n${session.model}\n${session.messages.map((m) => m.content).join("\n")}`).join("\n\n");
}
