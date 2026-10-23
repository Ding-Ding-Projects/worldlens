import { describe, expect, it, vi } from "vitest";
import { annotationClient, AnnotationRevisionConflict, validateAnnotations } from "./annotationClient.js";
const identity = { projectId: "project-a", mapId: "overworld", dimension: "minecraft:overworld" };
const document = { version: 1, identity, revision: 4, updatedAt: "2026-10-23T00:00:00Z", updatedBy: "editor", annotations: [] };
describe("annotation transport", () => {
    it("uses authenticated same-origin requests with exact revision", async () => {
        const transport = vi.fn().mockResolvedValue(new Response(JSON.stringify(document)));
        await annotationClient(identity, transport).save(3, []);
        expect(transport.mock.calls[0]?.[1]).toMatchObject({ method: "PUT", credentials: "same-origin", cache: "no-store", body: JSON.stringify({ expectedRevision: 3, annotations: [] }) });
    });
    it("preserves conflict data without retrying the write", async () => {
        const transport = vi.fn().mockResolvedValue(new Response(JSON.stringify({ current: document }), { status: 409 }));
        await expect(annotationClient(identity, transport).save(2, [])).rejects.toBeInstanceOf(AnnotationRevisionConflict);
        expect(transport).toHaveBeenCalledTimes(1);
    });
    it("rejects stale identity, missing revision and malformed marker data", () => {
        expect(() => validateAnnotations({ ...document, identity: { ...identity, dimension: "minecraft:the_nether" } }, identity)).toThrow("identity");
        expect(() => validateAnnotations({ ...document, revision: -1 }, identity)).toThrow("revision");
        expect(() => validateAnnotations({ ...document, annotations: [{}] }, identity)).toThrow("invalid markers");
    });
    it("does not treat authentication refusal as an empty document", async () => {
        const transport = vi.fn().mockResolvedValue(new Response("", { status: 401 }));
        await expect(annotationClient(identity, transport).read()).rejects.toThrow("Sign in");
    });
});
