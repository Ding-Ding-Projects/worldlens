/**
 * The password prompt a hosted deployment needs and did not have.
 *
 * ## What was actually wrong
 *
 * The server side was already complete. `HostedAuthGate` refuses every bridge call with 401
 * until a session cookie exists, and `/bridge/session` answers `{required, signedIn}` with a
 * comment saying it exists so the interface can show a prompt "without guessing". Nothing
 * ever asked it.
 *
 * So an unauthenticated visitor to a password-protected deployment got the entire application
 * shell: every destination, every control, every empty state, and a 401 behind all of it. The
 * password was doing its job at the data layer and nothing at all was telling the person it
 * existed. Measured against a real container before this was written: `/bridge/session`
 * reported `{"required":true,"signedIn":false}`, every `invoke` returned 401 "Sign in first.",
 * and the interface rendered "Let's make your first map" as though it were ready to work.
 *
 * That is the decorative-control defect this project refuses everywhere else, arriving on the
 * one surface where the person cannot even tell it is happening: nothing errors visibly, the
 * app simply does nothing and looks fine doing it.
 *
 * ## Why it gates the mount rather than living inside the app
 *
 * Mounting first and overlaying a prompt would mean every store, every screen and every
 * `onMounted` fetch runs first and fails, filling the notification centre with 401s before the
 * person has had a chance to type anything. Gating is also the honest shape: until there is a
 * session there is nothing to show.
 *
 * ## Why a missing endpoint means "carry on"
 *
 * A desktop build serves its renderer over HTTP too, but never installs `HostedSessionHandler`,
 * so `/bridge/session` is simply not there. A 404, a network error, or anything that is not a
 * well-formed answer therefore means "not a gated deployment" and the application mounts
 * exactly as before. Failing closed here would brick every desktop build to guard a case that
 * only exists when a server explicitly opted into it.
 */

export interface SessionState {
    /** Whether this deployment asks for a password at all. */
    readonly required: boolean;
    /** Whether this browser already holds a valid session. */
    readonly signedIn: boolean;
}

export interface SignInDependencies {
    readonly fetch: typeof globalThis.fetch;
    /** Where the prompt is rendered. The application's own mount point. */
    readonly root: HTMLElement;
    readonly translate: (key: string, fallback: string) => string;
}

/**
 * Ask the deployment whether a password stands between this browser and the application.
 *
 * Returns `null` for "this is not a gated deployment", which covers a desktop build, a 404, a
 * non-JSON body and a failed request alike. All four mean the same thing to the caller and
 * telling them apart would only invite a branch that guesses.
 */
export async function readSessionState(fetchImpl: typeof globalThis.fetch): Promise<SessionState | null> {
    try {
        const response = await fetchImpl("/bridge/session", {
            method: "GET",
            headers: { accept: "application/json" },
        });
        if (!response.ok) return null;
        const body: unknown = await response.json();
        if (body === null || typeof body !== "object") return null;
        const { required, signedIn } = body as { required?: unknown; signedIn?: unknown };
        if (typeof required !== "boolean" || typeof signedIn !== "boolean") return null;
        return { required, signedIn };
    } catch {
        return null;
    }
}

/** Send one attempt. `true` means the cookie is now set. */
export async function attemptSignIn(
    fetchImpl: typeof globalThis.fetch,
    password: string,
): Promise<boolean> {
    try {
        const response = await fetchImpl("/bridge/session", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ password }),
        });
        return response.ok;
    } catch {
        return false;
    }
}

/**
 * Resolve once this browser may talk to the deployment.
 *
 * Resolves immediately when there is no gate, or when one is already satisfied. Otherwise it
 * renders the prompt and does not resolve until an attempt succeeds, which is what makes the
 * caller's `await` the gate rather than a suggestion.
 */
export async function awaitHostedSession(dependencies: SignInDependencies): Promise<void> {
    const state = await readSessionState(dependencies.fetch);
    if (state === null || !state.required || state.signedIn) return;
    await renderPrompt(dependencies);
}

function renderPrompt(dependencies: SignInDependencies): Promise<void> {
    const { root, translate } = dependencies;

    return new Promise<void>((resolve) => {
        root.textContent = "";
        // Vuetify sets the page background, and it has not mounted yet, so without this the
        // card sits on the browser's default white and the whole thing reads as half-loaded.
        // Removed on the way out so the application gets the surface it expects.
        document.body.classList.add("wl-signin-active");

        const form = document.createElement("form");
        form.className = "wl-signin";
        form.setAttribute("aria-labelledby", "wl-signin-heading");

        const heading = document.createElement("h1");
        heading.id = "wl-signin-heading";
        heading.className = "wl-signin__heading";
        heading.textContent = translate("hosted.signIn.heading", "Sign in");

        const blurb = document.createElement("p");
        blurb.className = "wl-signin__blurb";
        blurb.textContent = translate(
            "hosted.signIn.blurb",
            "This copy of WorldLens is being served over a network and asks for the password the operator set.",
        );

        const label = document.createElement("label");
        label.className = "wl-signin__label";
        label.htmlFor = "wl-signin-password";
        label.textContent = translate("hosted.signIn.password", "Password");

        const input = document.createElement("input");
        input.id = "wl-signin-password";
        input.className = "wl-signin__input";
        input.type = "password";
        input.name = "password";
        input.autocomplete = "current-password";
        input.required = true;

        // Announced rather than merely coloured, and tied to the field so a screen reader
        // reads the reason when focus lands there rather than leaving it to be discovered.
        const problem = document.createElement("p");
        problem.id = "wl-signin-problem";
        problem.className = "wl-signin__problem";
        problem.setAttribute("role", "alert");
        problem.hidden = true;
        input.setAttribute("aria-describedby", problem.id);

        const submit = document.createElement("button");
        submit.type = "submit";
        submit.className = "wl-signin__submit";
        submit.textContent = translate("hosted.signIn.submit", "Sign in");

        form.append(heading, blurb, label, input, problem, submit);
        root.append(form);
        input.focus();

        let busy = false;
        form.addEventListener("submit", (event) => {
            event.preventDefault();
            if (busy) return;
            busy = true;
            submit.disabled = true;
            problem.hidden = true;

            void attemptSignIn(dependencies.fetch, input.value).then((ok) => {
                if (ok) {
                    root.textContent = "";
                    document.body.classList.remove("wl-signin-active");
                    resolve();
                    return;
                }
                busy = false;
                submit.disabled = false;
                // Says only that it did not match. Whether it was close, the wrong length, or
                // right for a deployment that has none are all things the person learns
                // nothing useful from and somebody guessing learns plenty from.
                problem.textContent = translate(
                    "hosted.signIn.wrong",
                    "That password did not match. Try again.",
                );
                problem.hidden = false;
                input.select();
                input.focus();
            });
        });
    });
}
