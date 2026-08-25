/**
 * Wharf's renderer.
 *
 * Plain modules and the platform's own elements, deliberately. This surface is four cards and
 * a plan; a framework would be more machinery than the thing it renders, and the one property
 * that actually matters here is that nothing on screen can compose a host path - which is
 * easier to see in a file this size than to promise in a larger one.
 */

/** @type {{ probe: Function, plan: Function, deploy: Function, verifyPort: Function, chooseFolder: Function }} */
const wharf = globalThis.wharf;

const el = (id) => document.getElementById(id);

/**
 * The folder somebody chose, or null.
 *
 * Held here rather than in an input's value because there is no input: the only way this
 * becomes non-null is a real file picker returning a real path.
 */
let chosenFolder = null;

/** What the form currently describes. */
function destination() {
    if (el("destination").value === "local") return { kind: "local" };
    return {
        kind: "ssh",
        target: {
            id: "wharf-target",
            label: `${el("ssh-user").value}@${el("ssh-host").value}`,
            host: el("ssh-host").value.trim(),
            port: Number(el("ssh-port").value) || 22,
            user: el("ssh-user").value.trim(),
            identityFile: null,
            workDir: "~/.wharf",
            docker: "docker",
        },
    };
}

function request() {
    const port = Number(el("port").value);
    const name = el("name").value.trim();
    return {
        id: (name || "deployment").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 60),
        name: name || "deployment",
        image: el("image").value.trim(),
        ...(Number.isFinite(port) && port > 0
            ? { ports: [{ port, bindMode: el("public").checked ? "public" : "loopback" }] }
            : {}),
        ...(chosenFolder === null
            ? {}
            : {
                  mainFolder: {
                      hostPath: chosenFolder,
                      containerPath: el("container-path").value.trim(),
                      writable: el("folder-writable").checked,
                  },
              }),
    };
}

el("destination").addEventListener("change", () => {
    el("ssh-fields").hidden = el("destination").value !== "ssh";
});

el("check-docker").addEventListener("click", async () => {
    const status = el("docker-status");
    status.textContent = "Checking…";
    try {
        const report = await wharf.probe(destination());
        // The probe answers with a state and a reason. Both are shown: "unavailable" on its
        // own sends somebody to reinstall Docker when the daemon merely is not running.
        status.textContent =
            report.status === "available"
                ? `Docker ${report.version ?? ""} is available.`
                : `Docker is not usable here: ${report.detail ?? report.status}`;
    } catch (error) {
        status.textContent = `Could not ask: ${String(error)}`;
    }
});

el("choose-folder").addEventListener("click", async () => {
    const answer = await wharf.chooseFolder();
    const status = el("folder-status");
    if (!answer.ok) {
        // A cancel and a refusal are different things and must not read the same. Cancelling
        // leaves the previous choice alone; a refusal says what was wrong with the new one.
        if (answer.reason !== null) status.textContent = answer.reason;
        return;
    }
    chosenFolder = answer.path;
    status.textContent = `Chosen: ${answer.path}`;
});

el("show-plan").addEventListener("click", async () => {
    const target = el("plan");
    target.textContent = "";
    el("deploy").disabled = true;

    const plan = await wharf.plan(destination(), request());

    const list = document.createElement("dl");
    const row = (term, value) => {
        const dt = document.createElement("dt");
        dt.textContent = term;
        const dd = document.createElement("dd");
        dd.textContent = value;
        list.append(dt, dd);
    };
    row("Machine", plan.destination);
    row("Image", plan.image);
    row("Ports", plan.ports.length === 0 ? "none published" : plan.ports.join(", "));
    row("Folder", plan.folder ?? "none");
    target.append(list);

    if (plan.refusals.length > 0) {
        // Every refusal, not the first. Somebody correcting a form wants to see all of it;
        // showing one at a time turns a single mistake into several round trips.
        const problems = document.createElement("ul");
        problems.className = "wharf-refusals";
        for (const refusal of plan.refusals) {
            const item = document.createElement("li");
            item.textContent = refusal;
            problems.append(item);
        }
        target.append(problems);
        return;
    }
    el("deploy").disabled = false;
});

el("deploy").addEventListener("click", async () => {
    const target = el("plan");
    const answer = await wharf.deploy(destination(), request());
    const note = document.createElement("p");
    note.className = answer.ok ? "wharf-ok" : "wharf-refusals";
    if (!answer.ok) {
        note.textContent = answer.failure.message;
        target.append(note);
        return;
    }

    const port = Number(el("port").value);
    if (!Number.isFinite(port) || port <= 0) {
        note.textContent = "Deployed.";
        target.append(note);
        return;
    }

    // Created is not running, and running is not listening. Asking the destination itself is
    // the only thing that tells them apart, and saying "deployed" without asking would be
    // reporting a success nobody checked.
    note.textContent = "Deployed. Checking whether it is answering…";
    target.append(note);
    const answering = await wharf.verifyPort(destination(), port);
    note.textContent = answering
        ? `Deployed, and port ${port} is answering.`
        : `Deployed, but nothing is answering on port ${port} yet. The container was created; something inside it may still be starting, or may have failed.`;
});
