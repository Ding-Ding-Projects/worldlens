import { describe, expect, it } from "vitest";
import { createInProcessTransport, createTypeGenClient } from "./typeGenClient.js";
import { describeLanguages, generate, handleMessage, inferredTypesFromSchema } from "./typeGenEngine.js";
import { DEFAULT_INFERENCE, MAX_INPUT_CHARS, type GenerateRequest } from "./typeGenTypes.js";

const SAMPLE = JSON.stringify({ name: "Ada", age: 36, tags: ["a", "b"], address: { city: "London" }, born: "1815-12-10" });

function request(overrides: Partial<GenerateRequest> = {}): GenerateRequest {
    return {
        type: "generate",
        id: 1,
        kind: "json",
        topLevelName: "Person",
        text: SAMPLE,
        language: "typescript",
        rendererOptions: {},
        inference: DEFAULT_INFERENCE,
        ...overrides,
    };
}

describe("language list and option definitions", () => {
    it("comes from the engine and carries typed options", () => {
        const languages = describeLanguages();
        const names = languages.map((language) => language.name);
        for (const wanted of ["typescript", "python", "go", "cs", "rust", "kotlin", "swift"]) expect(names).toContain(wanted);
        const typescript = languages.find((language) => language.name === "typescript");
        expect(typescript?.options.find((option) => option.name === "just-types")?.kind).toBe("boolean");
        const acronym = typescript?.options.find((option) => option.name === "acronym-style");
        expect(acronym?.kind).toBe("enum");
        expect(acronym?.values).toContain("camel");
    });

    it("answers a describe message through the worker protocol", async () => {
        const reply = await handleMessage({ type: "describe", id: 7 });
        expect(reply).toMatchObject({ type: "described", id: 7 });
    });
});

describe("generation", () => {
    const cases: [string, string[]][] = [
        ["typescript", ["interface Person", "name: string"]],
        ["python", ["class Person", "name: str"]],
        ["go", ["type Person struct", "Name"]],
        ["cs", ["class Person", "Address"]],
        ["rust", ["struct Person", "pub name"]],
        ["kotlin", ["class Person", "val name"]],
        ["swift", ["struct Person", "let name"]],
    ];
    for (const [language, expected] of cases) {
        it(`generates ${language} from JSON`, async () => {
            const result = await generate(request({ language }));
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            for (const text of expected) expect(result.code).toContain(text);
            expect(result.inferred.map((type) => type.name)).toContain("Person");
        });
    }

    it("applies a renderer option", async () => {
        const plain = await generate(request());
        const justTypes = await generate(request({ rendererOptions: { "just-types": true } }));
        expect(plain.ok && justTypes.ok).toBe(true);
        if (plain.ok && justTypes.ok) {
            expect(plain.code).toContain("Convert");
            expect(justTypes.code).not.toContain("Convert");
        }
    });

    it("applies an inference switch", async () => {
        const result = await generate(request({ inference: { ...DEFAULT_INFERENCE, allPropertiesOptional: true } }));
        expect(result.ok && result.code).toMatch(/name\?:\s+string/);
    });

    it("generates from JSON Schema", async () => {
        const schema = JSON.stringify({ type: "object", properties: { id: { type: "integer" } }, required: ["id"] });
        const result = await generate(request({ kind: "schema", text: schema, topLevelName: "Thing" }));
        expect(result.ok && result.code).toContain("interface Thing");
    });

    it("generates from a GraphQL schema and query", async () => {
        const result = await generate(
            request({
                kind: "graphql",
                topLevelName: "Q",
                text: "type Query { me: User } type User { id: ID! name: String }",
                query: "query Q { me { id name } }",
            }),
        );
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.code).toContain("name");
    });

    it("names a JSON parse error", async () => {
        const result = await generate(request({ text: '{"a": ' }));
        expect(result).toMatchObject({ ok: false, failure: "parse" });
        if (!result.ok) expect(result.message).toMatch(/^JSON:/);
    });

    it("refuses oversized input", async () => {
        const result = await generate(request({ text: " ".repeat(MAX_INPUT_CHARS + 1) }));
        expect(result).toMatchObject({ ok: false, failure: "tooLarge" });
    });

    it("says TypeScript input is unavailable", async () => {
        const result = await generate(request({ kind: "typescript", text: "interface A {}" }));
        expect(result).toMatchObject({ ok: false, failure: "unsupported" });
    });

    it("requires a GraphQL query", async () => {
        const result = await generate(request({ kind: "graphql", text: "type Query { a: Int }", query: "" }));
        expect(result).toMatchObject({ ok: false, failure: "parse" });
    });
});

describe("inspector", () => {
    it("reads objects, enums and optional properties from engine output", () => {
        const types = inferredTypesFromSchema(
            JSON.stringify({
                definitions: {
                    A: { type: "object", properties: { x: { type: "integer" }, y: { $ref: "#/definitions/B" } }, required: ["x"] },
                    B: { type: "string", enum: ["p", "q"] },
                },
            }),
        );
        expect(types[0]).toMatchObject({ name: "A", kind: "object" });
        expect(types[0]?.properties).toEqual([
            { name: "x", type: "integer", required: true },
            { name: "y", type: "B", required: false },
        ]);
        expect(types[1]).toMatchObject({ name: "B", kind: "enum", values: ["p", "q"] });
        expect(inferredTypesFromSchema("not json")).toEqual([]);
    });
});

describe("client", () => {
    it("drops a reply that a newer request replaced", async () => {
        const client = createTypeGenClient(createInProcessTransport());
        const first = client.generate({ ...request(), text: SAMPLE });
        const second = client.generate({ ...request(), topLevelName: "Second" });
        expect(await first).toBeNull();
        const latest = await second;
        expect(latest?.ok && latest.code).toContain("Second");
        expect((await client.languages()).length).toBeGreaterThan(20);
    });
});
