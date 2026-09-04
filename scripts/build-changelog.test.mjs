import assert from "node:assert/strict";
import test from "node:test";

import { publicText, REDACTED_COMMIT_MESSAGES } from "./build-changelog.mjs";

const AFFECTED_COMMIT = "05d73d64023dba6fc41455d1b1d6cad0e678f73a";
const CLEAN_COMMIT = "df12151614623dc7260a2b8288390cd8f6d57dd0";
const PUBLIC_REDACTION = "Internal maintenance message omitted from the public changelog";

test("sanitizes an identified affected historical commit", () => {
    assert.equal(REDACTED_COMMIT_MESSAGES.has(AFFECTED_COMMIT), true);
    assert.equal(publicText("historical subject", AFFECTED_COMMIT, "subject"), PUBLIC_REDACTION);
    assert.equal(publicText("historical details", AFFECTED_COMMIT, "details"), "");
});

test("leaves an unrelated clean commit unchanged", () => {
    assert.equal(REDACTED_COMMIT_MESSAGES.has(CLEAN_COMMIT), false);
    assert.equal(publicText("clean subject", CLEAN_COMMIT, "subject"), "clean subject");
    assert.equal(publicText("clean details", CLEAN_COMMIT, "details"), "clean details");
});

test("keeps the public redaction manifest deterministic and well formed", () => {
    const entries = [...REDACTED_COMMIT_MESSAGES];
    assert.equal(new Set(entries).size, entries.length);
    assert.equal(entries.every((sha) => /^[0-9a-f]{40}$/.test(sha)), true);
});
