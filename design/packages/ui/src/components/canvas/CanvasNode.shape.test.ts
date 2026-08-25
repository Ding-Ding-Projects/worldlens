import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Asserted against the component's source text rather than a mounted instance, which is the
 * pattern this repository already uses for structural facts (see `AppTitleBar.shape.test.ts`).
 *
 * The reason is specific: mounting proves that whatever the component renders today renders
 * without throwing. It cannot prove the negative this file exists for - that nobody has written a
 * bespoke input for one option. A mounted test would happily pass on a node that renders twelve
 * options through `ConfigField` and the thirteenth through a hand-rolled text field, and the
 * thirteenth is exactly the one that would ship wrong.
 */
const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "CanvasNode.vue"), "utf8");

/*
 * The template half only, so a mention inside a comment or the script block cannot satisfy a check.
 *
 * `lastIndexOf` for the closing tag, not `indexOf`. This component contains an inner
 * `<template v-if=...>` block, so slicing to the FIRST close ended the slice a third of the way in
 * and left everything after it unchecked - which a deliberate sabotage proved: a hand-written
 * `v-text-field` added below that point sailed straight past a guard that looked complete.
 */
const template = source.slice(source.indexOf("<template>"), source.lastIndexOf("</template>"));

/** The source with block and line comments removed, for assertions about what the code does. */
const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the canvas node renders settings through the shared control", () => {
    it("renders options with ConfigField", () => {
        expect(template).toMatch(/<ConfigField\b/);
    });

    it("passes each field's own FieldMeta and the shared file", () => {
        expect(template).toMatch(/:field="field"/);
        expect(template).toMatch(/:file="file"/);
    });

    /**
     * The load-bearing assertion. Every one of these would be a bespoke control standing in for a
     * declared `Control` kind, which is how an option loses its picker and becomes a box somebody
     * has to guess the format of.
     */
    it("writes no bespoke input, select, switch or slider of its own", () => {
        const bespoke = [
            /<v-text-field\b/i,
            /<v-select\b/i,
            /<v-switch\b/i,
            /<v-slider\b/i,
            /<v-checkbox\b/i,
            /<v-combobox\b/i,
            /<v-autocomplete\b/i,
            /<v-file-input\b/i,
            /<input\b/i,
            /<select\b/i,
            /<textarea\b/i,
        ];
        for (const pattern of bespoke) {
            expect(template, `the node template must not contain ${String(pattern)}`).not.toMatch(pattern);
        }
    });

    it("wraps itself in an appearance target so it carries editing and locking", () => {
        expect(template).toMatch(/<AppearanceTarget\b/);
        expect(template).toMatch(/:id="`canvas\.node\.\$\{kind\}`"/);
    });

    /**
     * The badge must report the model's count, not a number this component worked out, or the
     * canvas and the wizard would be able to disagree about whether a step is complete.
     */
    it("reports problems from the shared model rather than computing them", () => {
        expect(template).toMatch(/problems\.length/);
        /*
         * Comments are stripped first, and that is not fussiness. This file's own documentation
         * explains that the node deliberately does not call `problemsFor`, so an assertion over the
         * raw source matched the explanation rather than a call and failed on correct code. A
         * negative assertion that can be satisfied by prose is not checking anything.
         */
        expect(code).not.toMatch(/function\s+validate/i);
        expect(code).not.toMatch(/problemsFor\s*\(/);
    });
});
