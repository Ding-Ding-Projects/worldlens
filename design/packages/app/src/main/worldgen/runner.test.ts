import { describe, expect, it } from "vitest";

import { describeRunner, listAvailableRunners, runnerKey, type RunnerChoice } from "./runner.js";

describe("listAvailableRunners", () => {
    it("lists nothing when nothing is available", () => {
        expect(
            listAvailableRunners({ localProcessAvailable: false, configuredTransports: [], githubRepository: null }),
        ).toEqual([]);
    });

    it("puts the local machine first when available", () => {
        const runners = listAvailableRunners({
            localProcessAvailable: true,
            configuredTransports: [],
            githubRepository: null,
        });
        expect(runners).toHaveLength(1);
        expect(runners[0]?.kind).toBe("transport");
    });

    it("includes configured remote transports, excluding a duplicate local-process entry", () => {
        const runners = listAvailableRunners({
            localProcessAvailable: true,
            configuredTransports: [
                { kind: "local-process", serverDir: "/x" },
                { kind: "ssh-docker", hostId: "h1", containerRef: "c1", serverDir: "/y" },
            ],
            githubRepository: null,
        });
        expect(runners).toHaveLength(2);
        expect(runners[1]).toEqual({
            kind: "transport",
            transport: { kind: "ssh-docker", hostId: "h1", containerRef: "c1", serverDir: "/y" },
        });
    });

    it("appends GitHub Actions last when a repository is configured", () => {
        const runners = listAvailableRunners({
            localProcessAvailable: false,
            configuredTransports: [],
            githubRepository: { owner: "acme", repo: "worlds" },
        });
        expect(runners).toEqual([{ kind: "github-actions", owner: "acme", repo: "worlds", workflowFile: "generate-world.yml" }]);
    });
});

describe("describeRunner / runnerKey", () => {
    it("describes and keys every runner kind distinctly", () => {
        const runners: RunnerChoice[] = [
            { kind: "transport", transport: { kind: "local-process", serverDir: "/x" } },
            { kind: "transport", transport: { kind: "local-docker", containerRef: "c", serverDir: "/x" } },
            { kind: "transport", transport: { kind: "ssh-docker", hostId: "h", containerRef: "c", serverDir: "/x" } },
            {
                kind: "transport",
                transport: {
                    kind: "aws",
                    region: "us-east-1",
                    instanceId: "i-123",
                    publicIp: "1.2.3.4",
                    sshUser: "ec2-user",
                    identityFile: null,
                    containerRef: "c",
                    serverDir: "/x",
                },
            },
            { kind: "github-actions", owner: "acme", repo: "worlds", workflowFile: "generate-world.yml" },
        ];
        const labels = runners.map(describeRunner);
        const keys = runners.map(runnerKey);
        expect(new Set(labels).size).toBe(runners.length);
        expect(new Set(keys).size).toBe(runners.length);
        expect(labels).toEqual([
            "This computer",
            "Local Docker container",
            "Remote host (h)",
            "AWS (us-east-1)",
            "GitHub Actions (acme/worlds)",
        ]);
    });
});
