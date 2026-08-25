// @vitest-environment jsdom

/**
 * The hosted password prompt.
 *
 * Written against the state a real container was actually observed in before this existed:
 * `/bridge/session` answering `{"required":true,"signedIn":false}`, every bridge call
 * returning 401 "Sign in first.", and the interface rendering its whole shell as though it
 * were ready to work. The tests that matter are the two ends of that. The gate must hold when
 * a password is genuinely required, and it must get out of the way completely on a desktop
 * build, where the endpoint does not exist and failing closed would brick the application to
 * guard a case that cannot arise.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { attemptSignIn, awaitHostedSession, readSessionState } from "./hostedSignIn.js";

function root(): HTMLElement {
    const element = document.createElement("div");
    element.id = "app";
    document.body.append(element);
    return element;
}

/** A `fetch` that answers `/bridge/session` and nothing else. */
function sessionFetch(
    get: { status?: number; body?: unknown },
    post?: { status: number },
): typeof globalThis.fetch {
    return vi.fn(async (_url: unknown, init?: { method?: string }) => {
        const isPost = init?.method === "POST";
        const status = isPost ? (post?.status ?? 401) : (get.status ?? 200);
        return await Promise.resolve({
            ok: status >= 200 && status < 300,
            status,
            json: async () => await Promise.resolve(get.body),
        });
    }) as unknown as typeof globalThis.fetch;
}

const translate = (_key: string, fallback: string) => fallback;

afterEach(() => {
    document.body.innerHTML = "";
});

describe("asking whether a password stands in the way", () => {
    it("reads a well-formed answer", async () => {
        const state = await readSessionState(
            sessionFetch({ body: { required: true, signedIn: false } }),
        );

        expect(state).toEqual({ required: true, signedIn: false });
    });

    it("treats a missing endpoint as no gate, because a desktop build has none", async () => {
        expect(await readSessionState(sessionFetch({ status: 404, body: null }))).toBeNull();
    });

    it("treats a body of the wrong shape as no gate rather than guessing", async () => {
        expect(await readSessionState(sessionFetch({ body: { required: "yes" } }))).toBeNull();
    });

    it("treats a failed request as no gate", async () => {
        const failing = (async () => {
            throw new Error("offline");
        }) as unknown as typeof globalThis.fetch;

        expect(await readSessionState(failing)).toBeNull();
    });
});

describe("the gate in front of the application", () => {
    it("lets a desktop build straight through and renders nothing", async () => {
        const element = root();

        await awaitHostedSession({
            fetch: sessionFetch({ status: 404, body: null }),
            root: element,
            translate,
        });

        expect(element.querySelector("form")).toBeNull();
    });

    it("lets a deployment with no password straight through", async () => {
        const element = root();

        await awaitHostedSession({
            fetch: sessionFetch({ body: { required: false, signedIn: false } }),
            root: element,
            translate,
        });

        expect(element.querySelector("form")).toBeNull();
    });

    it("lets an already signed-in browser straight through", async () => {
        const element = root();

        await awaitHostedSession({
            fetch: sessionFetch({ body: { required: true, signedIn: true } }),
            root: element,
            translate,
        });

        expect(element.querySelector("form")).toBeNull();
    });

    it("does not resolve while a password is required and not yet given", async () => {
        // The whole point. If this resolved, the application would mount over a bridge that
        // answers 401 to everything, which is the exact state this was written to remove.
        const element = root();
        let resolved = false;

        void awaitHostedSession({
            fetch: sessionFetch({ body: { required: true, signedIn: false } }),
            root: element,
            translate,
        }).then(() => {
            resolved = true;
        });
        await vi.waitFor(() => expect(element.querySelector("form")).not.toBeNull());

        expect(resolved).toBe(false);
        expect(element.querySelector("input[type=password]")).not.toBeNull();
    });

    it("names the field and focuses it, so a keyboard reaches it without hunting", async () => {
        const element = root();

        void awaitHostedSession({
            fetch: sessionFetch({ body: { required: true, signedIn: false } }),
            root: element,
            translate,
        });
        await vi.waitFor(() => expect(element.querySelector("input")).not.toBeNull());

        const input = element.querySelector("input") as HTMLInputElement;
        const label = element.querySelector("label") as HTMLLabelElement;
        expect(label.htmlFor).toBe(input.id);
        expect(document.activeElement).toBe(input);
    });

    it("says a wrong password did not match, and stays put", async () => {
        const element = root();
        let resolved = false;

        void awaitHostedSession({
            fetch: sessionFetch({ body: { required: true, signedIn: false } }, { status: 401 }),
            root: element,
            translate,
        }).then(() => {
            resolved = true;
        });
        await vi.waitFor(() => expect(element.querySelector("form")).not.toBeNull());

        (element.querySelector("input") as HTMLInputElement).value = "wrong";
        (element.querySelector("form") as HTMLFormElement).dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
        );

        await vi.waitFor(() => {
            const problem = element.querySelector("[role=alert]") as HTMLElement;
            expect(problem.hidden).toBe(false);
        });
        expect(resolved).toBe(false);
        expect(element.querySelector("form")).not.toBeNull();
    });

    it("resolves and clears itself once the password is accepted", async () => {
        const element = root();
        let resolved = false;

        void awaitHostedSession({
            fetch: sessionFetch({ body: { required: true, signedIn: false } }, { status: 200 }),
            root: element,
            translate,
        }).then(() => {
            resolved = true;
        });
        await vi.waitFor(() => expect(element.querySelector("form")).not.toBeNull());

        (element.querySelector("input") as HTMLInputElement).value = "right";
        (element.querySelector("form") as HTMLFormElement).dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
        );

        await vi.waitFor(() => expect(resolved).toBe(true));
        expect(element.querySelector("form")).toBeNull();
    });
});

describe("sending one attempt", () => {
    it("reports success only on a 2xx", async () => {
        expect(await attemptSignIn(sessionFetch({}, { status: 200 }), "x")).toBe(true);
        expect(await attemptSignIn(sessionFetch({}, { status: 401 }), "x")).toBe(false);
    });

    it("reports failure rather than throwing when the request itself fails", async () => {
        const failing = (async () => {
            throw new Error("offline");
        }) as unknown as typeof globalThis.fetch;

        expect(await attemptSignIn(failing, "x")).toBe(false);
    });
});
