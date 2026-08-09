import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { UPDATE_INSTALL_JOURNAL_FILE, createFileUpdateInstallJournal } from "./installJournal.js";

const roots: string[] = [];

function root(): string {
    const value = mkdtempSync(join(tmpdir(), "worldlens-update-install-"));
    roots.push(value);
    return value;
}

afterEach(() => {
    for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true });
});

describe("the update install journal", () => {
    it("records the exact requested transition and consumes a successful install", () => {
        const directory = root();
        createFileUpdateInstallJournal(directory, () => new Date("2026-08-08T23:00:00.000Z")).begin(
            "0.1.0",
            "0.2.0",
        );

        expect(
            JSON.parse(readFileSync(join(directory, UPDATE_INSTALL_JOURNAL_FILE), "utf8")),
        ).toEqual({
            schema: 1,
            fromVersion: "0.1.0",
            targetVersion: "0.2.0",
            requestedAt: "2026-08-08T23:00:00.000Z",
        });
        expect(createFileUpdateInstallJournal(directory).reconcile("0.2.0")).toMatchObject({
            status: "installed",
        });
        expect(createFileUpdateInstallJournal(directory).reconcile("0.2.0")).toEqual({
            status: "none",
        });
    });

    it("distinguishes a rollback from a different version taking over", () => {
        const rolledBack = root();
        createFileUpdateInstallJournal(rolledBack).begin("0.1.0", "0.2.0");
        expect(createFileUpdateInstallJournal(rolledBack).reconcile("0.1.0")).toMatchObject({
            status: "rolled-back",
            attempt: { fromVersion: "0.1.0", targetVersion: "0.2.0" },
        });

        const mismatched = root();
        createFileUpdateInstallJournal(mismatched).begin("0.1.0", "0.2.0");
        expect(createFileUpdateInstallJournal(mismatched).reconcile("0.3.0")).toMatchObject({
            status: "version-mismatch",
            actualVersion: "0.3.0",
        });
    });

    it("does not trust a corrupt record and consumes it once", () => {
        const directory = root();
        writeFileSync(join(directory, UPDATE_INSTALL_JOURNAL_FILE), "not json", "utf8");
        const journal = createFileUpdateInstallJournal(directory);
        expect(journal.reconcile("0.2.0")).toEqual({ status: "corrupt" });
        expect(journal.reconcile("0.2.0")).toEqual({ status: "none" });
    });

    it("refuses unbounded or empty versions before writing anything", () => {
        const directory = root();
        const journal = createFileUpdateInstallJournal(directory);
        expect(() => journal.begin("", "0.2.0")).toThrow(/two bounded versions/);
        expect(() => journal.begin("0.1.0", "x".repeat(129))).toThrow(/two bounded versions/);
        expect(journal.reconcile("0.1.0")).toEqual({ status: "none" });
    });
});
