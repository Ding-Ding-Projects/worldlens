// @vitest-environment jsdom

/**
 * Knowing whether this copy is served or installed.
 *
 * The case worth pinning is the one that looks like success: a desktop build answers
 * `app:deployment` with an error envelope rather than throwing, because no handler is
 * registered for it there. An implementation that treated "I got an object back" as "I am
 * hosted" would report every desktop as hosted, swap a working native picker for a folder
 * browser with nothing in it, and never fail a type check doing so.
 */
import { afterEach, describe, expect, it } from "vitest";
import { deployment, isHosted, loadDeployment, setDeploymentForTesting } from "./deployment.js";

function setBridge(getDeployment: (() => Promise<unknown>) | null): void {
    const scope = globalThis as { window?: unknown };
    if (getDeployment === null) {
        delete (scope as { worldlens?: unknown }).worldlens;
        return;
    }
    (scope as { worldlens?: unknown }).worldlens = { getDeployment };
}

afterEach(() => {
    setDeploymentForTesting(null);
    setBridge(null);
});

describe("what this copy knows about where it is running", () => {
    it("starts out not knowing, rather than guessing", () => {
        expect(deployment.value).toBeNull();
        expect(isHosted()).toBe(false);
    });

    it("is hosted only when the deployment says so in as many words", async () => {
        setDeploymentForTesting(null);
        setBridge(async () => await Promise.resolve({ hosted: true, mounts: [], capabilities: [] }));

        await loadDeployment();

        expect(isHosted()).toBe(true);
    });

    it("is not hosted when a desktop answers with an error envelope", async () => {
        // What a desktop really returns: an object, and not one that says hosted.
        setDeploymentForTesting(null);
        setBridge(
            async () =>
                await Promise.resolve({ ok: false, error: { message: "No handler is registered." } }),
        );

        await loadDeployment();

        expect(isHosted()).toBe(false);
    });

    it("stays unknown when the read fails, rather than recording a guess", async () => {
        setDeploymentForTesting(null);
        setBridge(async () => await Promise.reject(new Error("gone")));

        await loadDeployment();

        expect(deployment.value).toBeNull();
        expect(isHosted()).toBe(false);
    });

    it("stays unknown when there is no bridge to ask at all", async () => {
        setDeploymentForTesting(null);
        setBridge(null);

        await loadDeployment();

        expect(deployment.value).toBeNull();
    });

    it("asks once, because a deployment cannot change while the page is open", async () => {
        setDeploymentForTesting(null);
        let calls = 0;
        setBridge(async () => {
            calls += 1;
            return await Promise.resolve({ hosted: true });
        });

        await loadDeployment();
        await loadDeployment();
        await loadDeployment();

        expect(calls).toBe(1);
    });
});
