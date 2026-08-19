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
    if (candidate.length !== 37) complaints.push(`expected 37 actions, found ${candidate.length}`);
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

test("the onboarding driver declines download consent and never claims a standing choice", () => {
    const onboard = driver.match(/onboard: async \(\) => \{[\s\S]*?\n  \},/u)?.[0] ?? "";
    assert.match(onboard, /\["NEXT", "NEXT", "DECLINE", "FINISH SETUP"\]/);
    assert.match(onboard, /declined download consent/);
    assert.doesNotMatch(onboard, /ACCEPT|accepted download consent|standing choice/);
});

test("the real Adult settings plan declines consent and reaches Kid Mode settings through overflow", () => {
    const consent = plan.find((step) => step.action === "click" && step.hasText === "DECLINE");
    assert.ok(consent, "the plan must decline download consent");
    assert.equal(
        plan.some((step) => step.action === "click" && step.hasText === "ACCEPT"),
        false,
        "the plan must not accept download consent",
    );
    const overflow = plan.findIndex(
        (step) =>
            step.action === "click" &&
            typeof step.selector === "string" &&
            step.selector.includes("mb-tabs-strip__controls") &&
            step.selector.includes("do not fit"),
    );
    const kidMode = plan.findIndex(
        (step) =>
            step.action === "click" &&
            step.selector === ".mb-settings .mb-tabs-strip__sheet:visible .v-list-item" &&
            step.hasText === "Kid Mode and Adult Mode",
    );
    assert.ok(overflow >= 0 && kidMode > overflow, "settings tab must be reached via the visible overflow action");
});

test("runtime evidence keeps bounded sanitized console and page error messages", () => {
    assert.match(driver, /const consoleErrors = \[\];/);
    assert.match(driver, /const pageErrors = \[\];/);
    assert.match(driver, /MAX_RUNTIME_ERRORS = 20/);
    assert.match(driver, /sanitizeRuntimeError/);
    assert.match(driver, /consoleErrors,\n          pageErrors/);
    assert.match(driver, /token\|secret\|password/);
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

test("the new-repository plan creates visibility and Pages through UI controls before dispatch", async () => {
    const createPlan = JSON.parse(
        await readFile(new URL("./worldlens-lowlevel-create-ci-repository.json", import.meta.url), "utf8"),
    );
    const action = (name) => createPlan.findIndex((step) => step.action === name);
    const pages = createPlan.findIndex(
        (step) =>
            step.action === "setCheckboxWhenFocused" && step.selector.includes("publish-pages"),
    );
    const visibility = createPlan.findIndex(
        (step) =>
            step.action === "setCheckboxWhenFocused" && step.selector.includes("create-private"),
    );
    const create = createPlan.findIndex((step) => step.selector === "[data-test='bootstrap-repository']");
    const created = createPlan.findIndex((step) => step.selector === "[data-test='repository-created']");
    const dispatched = createPlan.findIndex(
        (step) => step.name === "lowlevel-ci-repository-render-dispatched",
    );

    assert.ok(action("chooseFolder") > 0);
    assert.ok(pages > 0 && pages < create);
    assert.ok(visibility > 0 && visibility < create);
    assert.ok(create < created && created < dispatched);
    assert.match(driver, /case "setCheckbox"/);
    assert.match(driver, /case "setCheckboxIfVisible"/);
    assert.match(driver, /case "setCheckboxWhenFocused"/);
});

test("the existing-repository plan checks Pages and upload acknowledgement before dispatch", async () => {
    const existingPlan = JSON.parse(
        await readFile(
            new URL("./worldlens-lowlevel-existing-ci-repository-render.json", import.meta.url),
            "utf8",
        ),
    );
    const pages = existingPlan.findIndex(
        (step) => step.action === "setCheckboxWhenFocused" && step.selector.includes("publish-pages"),
    );
    const upload = existingPlan.findIndex(
        (step) => step.action === "setCheckboxWhenFocused" && step.selector.includes("ack-upload"),
    );
    const firstStart = existingPlan.findIndex(
        (step) => step.action === "clickUntilVisible" && step.selector === "[data-test='start']",
    );
    const pagesFailure = existingPlan.findIndex(
        (step) => step.name === "lowlevel-private-pages-unavailable",
    );
    const secondStart = existingPlan.findLastIndex(
        (step) => step.action === "clickUntilVisible" && step.selector === "[data-test='start']",
    );
    const dispatched = existingPlan.findIndex(
        (step) => step.name === "lowlevel-existing-repository-render-dispatched",
    );
    assert.ok(pages > 0 && pages < firstStart);
    assert.ok(upload > pages && upload < firstStart);
    assert.ok(firstStart < pagesFailure && pagesFailure < secondStart);
    assert.ok(secondStart < dispatched);
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
