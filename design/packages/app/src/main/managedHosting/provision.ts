import { join } from "node:path";
import type { ProcessRunner } from "../cirender/gh.js";
import type { BootstrapAccess } from "./access.js";
import { ProtectedAccessStore } from "./access.js";
import { verifyManagedMapContext } from "./exportContext.js";

export type ManagedBootstrapDestination =
    | { kind: "native-windows"; context: string; dataRoot: string }
    | { kind: "wsl"; context: string; distribution: string; linuxContext: string; linuxDataRoot: string }
    | { kind: "docker"; context: string; image: string; dataRoot: string };
/** Account preparation is consumed over stdin only. Image, export and launch arguments contain none. */
export async function provisionManagedDestination(store: ProtectedAccessStore, reference: string, destination: ManagedBootstrapDestination, runner: ProcessRunner): Promise<{ state: "provisioned" }> {
    const receipt = await verifyManagedMapContext(destination.context);
    const invoke = async (access: BootstrapAccess): Promise<void> => {
        let command: string; let args: string[];
        if (destination.kind === "native-windows") {
            if (!receipt.nativeWindows) throw new Error("The verified native runtime is unavailable in this export.");
            command = join(destination.context, "runtime", "node.exe"); args = [join(destination.context, "managed-host.mjs"), "--bootstrap", "--data-root", destination.dataRoot];
        } else if (destination.kind === "wsl") {
            if (!receipt.nativeLinux || !/^[a-zA-Z0-9_. -]{1,100}$/u.test(destination.distribution) || !destination.linuxContext.startsWith("/") || !destination.linuxDataRoot.startsWith("/")) throw new Error("Choose a supported WSL distribution and verified Linux runtime.");
            command = "wsl.exe"; args = ["--distribution", destination.distribution, "--exec", destination.linuxContext + "/runtime/node", destination.linuxContext + "/managed-host.mjs", "--bootstrap", "--data-root", destination.linuxDataRoot];
        } else {
            if (!/^(?:docker\.io\/[a-z0-9_.\/-]+@)?sha256:[a-f0-9]{64}$/u.test(destination.image) || destination.dataRoot.includes(",")) throw new Error("Choose a verified immutable image and valid private storage path.");
            command = "docker"; args = ["run", "--rm", "-i", "--network", "none", "--read-only", "--mount", `type=bind,source=${destination.dataRoot},target=/data`, "--env", "WORLDLENS_HOST_DATA=/data", "--entrypoint", "node", destination.image, "/app/managed-host.mjs", "--bootstrap"];
        }
        const result = await runner.run(command, args, { input: JSON.stringify(access) });
        if (!result.started || result.code !== 0) throw new Error("Protected destination bootstrap did not complete.");
        let value: unknown; try { value = JSON.parse(result.stdout); } catch { throw new Error("Destination bootstrap receipt is unavailable."); }
        if (!value || typeof value !== "object" || !("state" in value) || value.state !== "provisioned") throw new Error("Destination did not confirm administrator provisioning.");
    };
    await store.consumeBootstrap(reference, invoke);
    return { state: "provisioned" };
}
