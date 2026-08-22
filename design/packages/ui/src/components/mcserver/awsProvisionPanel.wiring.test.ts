/**
 * That `AwsProvisionPanel` is actually mounted where a server's detail surface lives, not
 * merely present as an unreferenced file.
 *
 * Modelled on `mcserverShellWiring.test.ts`: it reads the real source of
 * `WebConsolePanel.vue` (the component App.vue mounts as each server's detail hub, per
 * `<template #mcservers>`), strips comments, flattens whitespace, and asserts on whole
 * anchored constructs rather than a bare substring - so a commented-out import or a
 * commented-out `<VWindowItem>` cannot satisfy it.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function source(relative: string): string {
    const path = fileURLToPath(new URL(relative, import.meta.url));
    return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

function code(text: string): string {
    return text
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/(^|[^:])\/\/.*/g, "$1 ")
        .replace(/\s+/g, " ");
}

const PANEL_CODE = code(source("./WebConsolePanel.vue"));

describe("AwsProvisionPanel is reachable from a server's detail surface", () => {
    it("imports the real component, not a commented-out one", () => {
        expect(PANEL_CODE).toMatch(/import AwsProvisionPanel from "\.\/AwsProvisionPanel\.vue";/);
    });

    it("mounts it inside the tabbed window, wired to the real server id", () => {
        expect(PANEL_CODE).toMatch(/<VWindowItem value="aws"><AwsProvisionPanel :server-id="server\.id" \/><\/VWindowItem>/);
    });

    it("declares a tab for it in the same VTabs strip as every other server screen", () => {
        expect(PANEL_CODE).toMatch(/<VTab value="aws">/);
    });

    it("the tab model includes \"aws\" as a real state, not just a stray string", () => {
        expect(PANEL_CODE).toMatch(/const tab = ref<"console" \| "config" \| "plugins" \| "players" \| "web" \| "aws">\("console"\);/);
    });
});
