// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    MAX_CHAT_STORAGE_BYTES,
    OLLAMA_CHAT_STORAGE_KEY,
    ollamaStore,
    reloadOllamaChatSessions,
    setOllamaChatPersistence,
} from "./ollamaStore.js";

beforeEach(() => {
    setOllamaChatPersistence(false);
    localStorage.clear();
    reloadOllamaChatSessions();
});

afterEach(() => {
    localStorage.clear();
    reloadOllamaChatSessions();
    setOllamaChatPersistence(true);
});

describe("saved Ollama chat state", () => {
    it("rejects malformed sessions without making an empty list look like a successful read", () => {
        localStorage.setItem(
            OLLAMA_CHAT_STORAGE_KEY,
            JSON.stringify({ sessions: [{ id: "broken", messages: null }] }),
        );

        reloadOllamaChatSessions();

        expect(ollamaStore.sessions).toEqual([]);
        expect(ollamaStore.failure).toBe(
            "The saved chat sessions are not in a shape this build recognises.",
        );
    });

    it("rejects an oversized cell before parsing it", () => {
        localStorage.setItem(OLLAMA_CHAT_STORAGE_KEY, "x".repeat(MAX_CHAT_STORAGE_BYTES + 1));

        reloadOllamaChatSessions();

        expect(ollamaStore.sessions).toEqual([]);
        expect(ollamaStore.failure).toBe(
            "The saved chat sessions are larger than this build will load.",
        );
    });

    it("accepts a complete stored session and its message roles", () => {
        localStorage.setItem(
            OLLAMA_CHAT_STORAGE_KEY,
            JSON.stringify({
                sessions: [
                    {
                        id: "chat-1",
                        name: "A chat",
                        model: "llama3",
                        systemPrompt: "",
                        createdAt: "2026-08-13T00:00:00.000Z",
                        updatedAt: "2026-08-13T00:00:00.000Z",
                        messages: [
                            {
                                id: "message-1",
                                role: "user",
                                content: "Hello",
                                createdAt: "2026-08-13T00:00:00.000Z",
                            },
                            {
                                id: "message-2",
                                role: "assistant",
                                content: "Hi",
                                createdAt: "2026-08-13T00:00:01.000Z",
                            },
                        ],
                    },
                ],
            }),
        );

        reloadOllamaChatSessions();

        expect(ollamaStore.failure).toBeNull();
        expect(ollamaStore.sessions[0]?.messages).toHaveLength(2);
        expect(ollamaStore.activeSessionId).toBe("chat-1");
    });
});
