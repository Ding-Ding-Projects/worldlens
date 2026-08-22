import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SETTINGS_SECTIONS } from "./settingsSections.js";

/**
 * Registration for the AWS accounts settings section, guarded the way the rest of
 * this surface is: every seam anchored to a whole line, so a commented-out call or
 * a renamed symbol that merely contains the right substring cannot pass this.
 *
 * Each check is watched failing once (see the pig's report) before being trusted.
 */

const here = dirname(fileURLToPath(import.meta.url));
const source = (name: string): string => {
    const crlf = readFileSync(join(here, name), "utf-8");
    return crlf.replace(/\r\n/g, "\n");
};

describe("aws-accounts settings section is genuinely reachable", () => {
    it("is a real settings section anchor", () => {
        expect(SETTINGS_SECTIONS).toContain("aws-accounts");
    });

    it("has copy registered in settingsCopy.ts", () => {
        const text = source("settingsCopy.ts");
        expect(text).toMatch(/^\s*"aws-accounts":\s*\{$/m);
    });

    it("is imported and mounted in AppSettings.vue", () => {
        const text = source("AppSettings.vue");
        expect(text).toMatch(/^import AwsAccountsPanel from "\.\/AwsAccountsPanel\.vue";$/m);
        expect(text).toMatch(/^\s*<AwsAccountsPanel \/>$/m);
        expect(text).toMatch(/^\s*case "aws-accounts":$/m);
        expect(text).toMatch(/^\s*return awsAccountsSection\.value;$/m);
        expect(text).toMatch(/^\s*<template #aws-accounts>$/m);
    });

    it("the panel resolves a real preload bridge slice, not an invented one", () => {
        const bridge = source("awsAccountsBridge.ts");
        expect(bridge).toMatch(/^\s*const host = \(globalThis as \{ worldlens\?: \{ mcserver\?: \{ awsAccounts\?: AwsAccountsBridge \} \} \}\)\.worldlens;$/m);
    });

    it("the preload actually exposes mcserver.awsAccounts.list/setAlias/credits", () => {
        const preload = source(join("..", "..", "..", "..", "app", "src", "preload", "index.ts"));
        expect(preload).toMatch(/^\s*list: \(\) => ipcRenderer\.invoke\("mcserver:aws:accounts"\),$/m);
        expect(preload).toMatch(/^\s*setAlias: \(request\) => ipcRenderer\.invoke\("mcserver:aws:accountAlias", request\),$/m);
        expect(preload).toMatch(/^\s*credits: \(request\) => ipcRenderer\.invoke\("mcserver:aws:credits", request\),$/m);
    });
});
