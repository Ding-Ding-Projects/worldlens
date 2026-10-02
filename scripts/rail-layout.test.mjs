/** Focused checks runnable without installing the workspace:
 * node --experimental-strip-types --test scripts/rail-layout.test.mjs
 * Geometry and focus in a real browser are covered separately by rail-layout-proof.mjs.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as overflow from "../design/packages/ui/src/components/shell/railOverflow.ts";

const source = readFileSync(new URL("../design/packages/ui/src/components/shell/AppRail.vue", import.meta.url), "utf8");
const input = { availableBlockSize: 800, destinationsBlockSize: 200, footerBlockSize: 160,
    shortcutItemBlockSize: 52, moreButtonBlockSize: 50, shortcutCount: 7 };
const split = (changes = {}) => overflow.computeRailShortcutSplit({ ...input, ...changes });

function shortcutsCondition() {
    const attributes = [...source.matchAll(/<ul((?:[^">]|"[^"]*")*)>/g)]
        .map((match) => match[1]).find((value) => value.includes("wl-rail__shortcuts"));
    assert.ok(attributes, "the shortcut list must exist");
    const expression = attributes.match(/v-if="([^"]+)"/)?.[1];
    assert.ok(expression, "the shortcut list must have its own condition");
    return new Function("visibleShortcuts", "shortcutSplit", `return (${expression});`);
}

test("all seven shortcuts fit at 800", () => {
    assert.deepEqual(split(), { visibleCount: 7, overflowCount: 0, showMore: false });
});
test("partial overflow reserves the More row", () => {
    const value = split({ availableBlockSize: 600 });
    assert.equal(value.visibleCount + value.overflowCount, 7);
    assert.ok(value.showMore);
    assert.ok(200 + 160 + value.visibleCount * 52 + 50 <= 600);
});
test("zero available shortcut rows still mount More", () => {
    const value = split({ availableBlockSize: 360 });
    assert.deepEqual(value, { visibleCount: 0, overflowCount: 7, showMore: true });
    assert.equal(shortcutsCondition()([], value), true);
});
test("no shortcuts mounts neither the list nor More", () => {
    const value = split({ shortcutCount: 0 });
    assert.deepEqual(value, { visibleCount: 0, overflowCount: 0, showMore: false });
    assert.equal(shortcutsCondition()([], value), false);
});
test("ordinary visible rows keep their parent", () => {
    assert.equal(shortcutsCondition()([{}], split()), true);
});
for (const [key, value] of [
    ["availableBlockSize", NaN], ["availableBlockSize", Infinity],
    ["destinationsBlockSize", NaN], ["footerBlockSize", Infinity],
    ["shortcutItemBlockSize", NaN], ["moreButtonBlockSize", Infinity],
]) {
    test(`invalid ${key}=${String(value)} retains an explicit overflow route`, () => {
        assert.deepEqual(split({ [key]: value }), { visibleCount: 0, overflowCount: 7, showMore: true });
    });
}
test("invalid counts cannot produce NaN or infinite slices", () => {
    for (const shortcutCount of [NaN, Infinity, -Infinity, -5]) {
        assert.deepEqual(split({ shortcutCount }), { visibleCount: 0, overflowCount: 0, showMore: false });
    }
});
test("fractional counts are normalized", () => {
    assert.deepEqual(split({ shortcutCount: 2.9 }), { visibleCount: 2, overflowCount: 0, showMore: false });
});
test("very tall translated rows are budgeted with their measured height", () => {
    const value = split({ shortcutItemBlockSize: 180, moreButtonBlockSize: 90 });
    assert.equal(value.visibleCount, 1);
    assert.ok(200 + 160 + value.visibleCount * 180 + 90 <= 800);
});
test("height boundaries use CSS pixels and exclude unmeasured zero", () => {
    assert.equal(typeof overflow.isCompactRail, "function");
    for (const height of [1, 160, 240, 320, 520]) assert.equal(overflow.isCompactRail(height), true);
    for (const height of [0, -1, 521, 800, NaN, Infinity]) assert.equal(overflow.isCompactRail(height), false);
});
test("counts and budget invariants hold across a deterministic matrix", () => {
    for (let height = 0; height <= 1200; height += 7) {
        for (let count = 0; count <= 30; count++) {
            const value = split({ availableBlockSize: height, shortcutCount: count });
            assert.ok(Number.isInteger(value.visibleCount) && value.visibleCount >= 0);
            assert.equal(value.visibleCount + value.overflowCount, count);
            assert.equal(value.showMore, value.overflowCount > 0);
            if (height >= 410) assert.ok(value.visibleCount * 52 + (value.showMore ? 50 : 0) <= height - 360);
        }
    }
});
test("destination text is not line-clamped", () => {
    const css = source.match(/\.wl-rail-label\s*\{([\s\S]*?)\n\}/)?.[1];
    assert.ok(css);
    assert.doesNotMatch(css, /-webkit-line-clamp:\s*[1-9]|overflow:\s*hidden/);
});
test("viewport-bounded menu keeps its scrollable content and text wrapping", () => {
    const css = source.match(/\.wl-rail-more-menu\s*\{([\s\S]*?)\n\}/)?.[1];
    assert.match(css, /100dvh/);
    assert.match(css, /100dvw/);
    assert.match(css, /overflow-y:\s*auto/);
    assert.match(source, /\.wl-rail-more-menu__item\s*>\s*span\s*\{[^}]*overflow-wrap:\s*anywhere/s);
});
test("every menu state close, not just Vuetify events, is observed", () => {
    assert.match(source, /watch\(moreOpen,/);
    assert.doesNotMatch(source, /@update:model-value="onMoreMenuChange"/);
    assert.match(source, /if \(moreOpen\.value\) return/);
});
test("the More overlay is positioned without a second click activator", () => {
    const menu = source.match(/<v-menu((?:[^">]|"[^"]*")*)>/)?.[1];
    assert.match(menu, /:target="moreButtonRef \?\? undefined"/);
    assert.doesNotMatch(menu, /\bactivator=/);
});
test("measurements observe content changes and reserve bottom padding", () => {
    assert.match(source, /paddingBlockEnd/);
    assert.match(source, /destinationsEl\.value, footerEl\.value/);
    assert.match(source, /measuredShortcutItem\.value = Math\.max/);
});
test("the compact rail and its detached world overlay share the width", () => {
    assert.match(source, /\.wl-rail--short\s*\{[^}]*inline-size:\s*192px/s);
    assert.match(source, /:global\(:root:has\(\.wl-rail--short\) \.mb-world-host--beside-rail\)\s*\{\s*inset-inline-start:\s*192px/s);
});
