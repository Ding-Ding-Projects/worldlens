import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createLocalDockerServer } from "./create.js";
import { createServerRegistry } from "./registry.js";

describe("container creation rollback", () => {
    it.each([true, false])(
        "requires independent ownership proof before rollback: %s",
        async (owned) => {
            const root = await mkdtemp(join(tmpdir(), "wl-create-rollback-"));
            const calls: readonly string[][] = [];
            const recorded: string[][] = calls as string[][];
            const containerId = "b".repeat(64);
            let creationId = "";
            try {
                const registry = createServerRegistry({ dataFolder: join(root, "registry") });
                const result = await createLocalDockerServer({
                    id: "new-server",
                    name: "New server",
                    flavour: "vanilla",
                    version: "1.21.4",
                    memoryMb: 1024,
                    acceptedEula: true,
                    serversRoot: root,
                    registry: {
                        ...registry,
                        put: async () => ({
                            ok: false,
                            failure: {
                                code: "denied",
                                message: "fixture registry write refused",
                                detail: null,
                            },
                        }),
                    },
                    dockerPlan: {
                        image: `itzg/minecraft-server@sha256:${"a".repeat(64)}`,
                        imageVerified: true,
                        containerRef: "new-container",
                        serverDir: "/data",
                        ports: [{ host: 25579, container: 25565 }],
                        runner: async (_command, args) => {
                            recorded.push([...args]);
                            if (args[0] === "create")
                                creationId = args
                                    .find((arg) =>
                                        arg.startsWith("com.worldlens.docker-creation="),
                                    )!
                                    .split("=")[1]!;
                            return {
                                ok: true,
                                exitCode: 0,
                                stderr: "",
                                spawnError: null,
                                stdout:
                                    args[0] === "inspect"
                                        ? JSON.stringify({
                                              Id: containerId,
                                              State: { Running: false },
                                              Config: {
                                                  Labels: {
                                                      "com.worldlens.docker-hosting": "true",
                                                      "com.worldlens.docker-instance": owned
                                                          ? "new-server"
                                                          : "unrelated",
                                                      "com.worldlens.docker-name": "New server",
                                                      "com.worldlens.docker-creation": creationId,
                                                  },
                                              },
                                          })
                                        : containerId,
                            };
                        },
                    },
                });
                expect(result.ok).toBe(false);
                expect(recorded.filter((args) => args[0] === "rm")).toEqual(
                    owned ? [["rm", containerId]] : [],
                );
                expect(
                    await stat(join(root, "new-server")).then(
                        () => true,
                        () => false,
                    ),
                ).toBe(!owned);
                expect((await registry.get("new-server")).ok).toBe(false);
            } finally {
                await rm(root, { recursive: true, force: true });
            }
        },
    );
});
