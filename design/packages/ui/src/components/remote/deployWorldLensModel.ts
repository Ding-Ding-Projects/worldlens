/**
 * "Deploy WorldLens as a container": turns the deploy form into one Docker hosting request.
 *
 * The container is the hosted application image (`docs/hosted-mode.md`). Each chosen folder is
 * bind-mounted at `/data/<id>` and declared in `WORLDLENS_MOUNTS`, which is what the hosted app
 * may open; the deployment's own records live in an owned named volume at `/data/state`. The
 * password is sent only as its SHA-256 (`WORLDLENS_PASSWORD_SHA256`), so it never sits in the
 * container's environment. A password is always required: the hosted app listens on every
 * interface inside the container and refuses to start without one, and anything else on the
 * Docker network could reach it even when the published port is loopback only.
 *
 * Design: `design/design-sources/deploy-anywhere/Container.dc.html`. Pure.
 */
import type { CreateInstanceRequest } from "./dockerHostingBridge.js";

export const HOSTED_IMAGE_NAME = "worldlens-hosted";

export interface DeployFolder {
    path: string;
    label: string;
    readOnly: boolean;
}

export interface DeployForm {
    name: string;
    image: string;
    port: number;
    reachable: boolean;
    /** SHA-256 hex of the password, or "" for none. */
    passwordHash: string;
    folders: DeployFolder[];
    restart: "unless-stopped" | "always" | "on-failure" | "no";
}

export function defaultForm(): DeployForm {
    return {
        name: "WorldLens",
        image: "",
        port: 8110,
        reachable: false,
        passwordHash: "",
        folders: [],
        restart: "unless-stopped",
    };
}

/** A hosted image reference Docker reported, digest pinned. */
export function isHostedImage(ref: string): boolean {
    return new RegExp(`(^|/)${HOSTED_IMAGE_NAME}(:[^@]*)?@sha256:[a-f0-9]{64}$`).test(ref);
}

export function instanceId(name: string): string {
    const base = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40);
    return `worldlens-${base || "app"}`.replace(/^worldlens-worldlens/, "worldlens");
}

/** A short id for a folder, unique within the form: its last path part, then a number. */
export function folderIds(folders: readonly DeployFolder[]): string[] {
    const used = new Set<string>(["state"]);
    return folders.map((f) => {
        const last = f.path.split(/[\\/]/).filter(Boolean).pop() ?? "folder";
        const base =
            last
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "")
                .slice(0, 40) || "folder";
        let id = /^[a-z0-9]/.test(base) ? base : `f-${base}`;
        for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
        used.add(id);
        return id;
    });
}

export function formProblems(form: DeployForm): string[] {
    const out: string[] = [];
    if (form.name.trim() === "") out.push("Give the deployment a name.");
    if (!isHostedImage(form.image))
        out.push("Choose the WorldLens hosted image (a worldlens-hosted image pinned by digest).");
    if (!Number.isInteger(form.port) || form.port < 1 || form.port > 65535)
        out.push("The port must be from 1 to 65535.");
    if (form.passwordHash === "") out.push("Set a password for signing in.");
    if (form.passwordHash !== "" && !/^[a-f0-9]{64}$/.test(form.passwordHash))
        out.push("The password could not be prepared.");
    form.folders.forEach((f, i) => {
        if (f.path.trim() === "") out.push(`Folder ${i + 1} has no folder chosen.`);
        else if (/[,"'\r\n]/.test(f.path))
            out.push(
                `Folder ${i + 1}'s path has a comma, quote or line break Docker cannot mount.`,
            );
        if (/[,:]/.test(f.label))
            out.push(`Folder ${i + 1}'s name cannot contain a comma or colon.`);
    });
    return out;
}

export function deployRequest(form: DeployForm): CreateInstanceRequest {
    const id = instanceId(form.name);
    const ids = folderIds(form.folders);
    const mounts = form.folders.map(
        (f, i) => `${ids[i]}:/data/${ids[i]}${f.readOnly ? ":ro" : ""}:${f.label.trim() || ids[i]}`,
    );
    const env = [
        { key: "WORLDLENS_PORT", value: String(form.port) },
        { key: "WORLDLENS_DATA", value: "/data/state" },
        { key: "WORLDLENS_MOUNTS", value: mounts.join(",") },
        ...(form.passwordHash === ""
            ? []
            : [{ key: "WORLDLENS_PASSWORD_SHA256", value: form.passwordHash }]),
    ];
    return {
        id,
        name: form.name.trim(),
        image: form.image,
        portMappings: [{ port: form.port, bindMode: form.reachable ? "public" : "loopback" }],
        volumes: [`${id}-state:/data/state`],
        binds: form.folders.map((f, i) => ({
            source: f.path,
            target: `/data/${ids[i]}`,
            readOnly: f.readOnly,
        })),
        env,
        restartPolicy: form.restart,
    };
}

export async function sha256Hex(text: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
