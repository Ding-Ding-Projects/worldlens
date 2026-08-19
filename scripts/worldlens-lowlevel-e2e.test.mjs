import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const planUrl = new URL("./worldlens-lowlevel-e2e.json", import.meta.url);
const driverUrl = new URL("../.claude/skills/run-worldlens/driver.mjs", import.meta.url);
const plan = JSON.parse(await readFile(planUrl, "utf8"));
const driver = await readFile(driverUrl, "utf8");

const EXPECTED_CAPTURES = [
    "lowlevel-kid-first-run-welcome",
    "lowlevel-kid-first-run-licence",
    "lowlevel-kid-first-run-consent",
    "lowlevel-kid-first-run-storage",
    "lowlevel-kid-home",
    "lowlevel-kid-explore-empty",
    "lowlevel-kid-jobs",
    "lowlevel-kid-stickers",
    "lowlevel-kid-grown-up-gate",
    "lowlevel-adult-map-empty",
    "lowlevel-adult-home",
    "lowlevel-adult-settings",
    "lowlevel-adult-kid-mode-settings",
    "lowlevel-kid-returned-from-settings",
];

const ALLOWED_ACTIONS = new Set(["screenshot", "click", "windowKey", "assertText"]);

function planComplaints(candidate) {
    const complaints = [];
    if (!Array.isArray(candidate)) return ["plan must be an array"];
    if (candidate.length !== 36) complaints.push(`expected 36 actions, found ${candidate.length}`);
    const captures = [];
    for (const [index, step] of candidate.entries()) {
        if (!step || typeof step !== "object") {
            complaints.push(`step ${index + 1} must be an object`);
            continue;
        }
        if (!ALLOWED_ACTIONS.has(step.action)) {
            complaints.push(`step ${index + 1} uses forbidden action ${String(step.action)}`);
        }
        if (step.action === "screenshot") {
            captures.push(step.name);
            for (const field of ["name", "category", "state", "expectedSurface", "alt"]) {
                if (typeof step[field] !== "string" || step[field].trim() === "") {
                    complaints.push(`capture ${String(step.name)} is missing ${field}`);
                }
            }
        }
        if (step.action === "click" && !step.selector && !step.role) {
            complaints.push(`click ${index + 1} has no visible target`);
        }
    }
    assert.deepEqual(
        captures,
        EXPECTED_CAPTURES,
        "the hand-written capture order is part of the Adult/Kid journey",
    );
    return complaints;
}

test("the Lowlevel Adult/Kid plan is complete and contains no state-injection action", () => {
    assert.deepEqual(planComplaints(plan), []);
});

test("the driver routes UI-only state changes and captures through Lowlevel MCP", () => {
    assert.match(driver, /WORLDLENS_UI_ONLY === "1"/);
    assert.match(driver, /lowlevelCall\("mouse_click"/);
    assert.match(driver, /lowlevelCall\("type_text"/);
    assert.match(driver, /lowlevelCall\("win_send_keys"/);
    assert.match(driver, /lowlevelCall\("screenshot"/);
    assert.match(driver, /CDP read-only assertions/);
});

test("the real render plan cannot claim dispatch from a pre-existing failed row", async () => {
    const dispatchPlan = JSON.parse(
        await readFile(new URL("./worldlens-lowlevel-ci-render-dispatch.json", import.meta.url), "utf8"),
    );
    const remembered = dispatchPlan.findIndex((step) => step.action === "rememberCount");
    const started = dispatchPlan.findIndex((step) => step.action === "pressWhenFocused");
    const advanced = dispatchPlan.findIndex(
        (step) => step.action === "waitForCountGreaterThanRemembered",
    );
    const acquiredRun = dispatchPlan.findIndex(
        (step) =>
            step.action === "waitTextNot" &&
            step.selector === "[data-test='row'] [data-test='run-label']",
    );
    const captured = dispatchPlan.findIndex(
        (step) => step.name === "lowlevel-ci-render-dispatched",
    );

    assert.ok(remembered >= 0 && remembered < started);
    assert.ok(started < advanced && advanced < acquiredRun && acquiredRun < captured);
    assert.match(driver, /rememberedCounts\.set/);
    assert.match(driver, /actual > remembered/);
    assert.match(driver, /actual < remembered/);
    assert.match(driver, /scrollUntilInViewport/);
    assert.match(driver, /x: Math\.max\(0, LOWLEVEL_WINDOW_WIDTH - 9\)/);
    assert.match(driver, /box !== null && centerY < 0/);
});

test("removing a required capture turns the plan guard red", () => {
    const broken = plan.filter((step) => step.name !== "lowlevel-adult-home");
    assert.throws(() => planComplaints(broken), /hand-written capture order/);
});

test("introducing direct evaluation turns the plan guard red", () => {
    const broken = plan.map((step, index) => (index === 1 ? { action: "eval", js: "localStorage.clear()" } : step));
    assert.match(planComplaints(broken).join("\n"), /forbidden action eval/);
});

test("removing capture metadata turns the plan guard red", () => {
    const broken = plan.map((step) =>
        step.name === "lowlevel-kid-home" ? { ...step, alt: "" } : step,
    );
    assert.match(planComplaints(broken).join("\n"), /missing alt/);
});
