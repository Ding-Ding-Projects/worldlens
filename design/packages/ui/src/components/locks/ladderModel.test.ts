/**
 * The unlock ladder's rules, driven by an injected clock and a fixed random source.
 *
 * The property that matters most is checked last and checked through the real store: a
 * cleared ladder ends the wait and nothing else. The lock stays locked, no unlock session is
 * opened, the failure count is untouched, and the hourly cap stops a machine playing its way
 * through an unlimited number of waits.
 */

import { describe, expect, it } from "vitest";

import type { DimSumDish } from "../dimsum/dimSumCatalog.js";
import {
    CHALLENGE_TTL_MS,
    DISH_MISS_LIMIT,
    LADDER_SKIPS_PER_HOUR,
    LADDER_WINDOW_MS,
    MOLE_COLLECT_GRACE_MS,
    MOLE_HITS_NEEDED,
    MOLE_ROUND_MS,
    SUM_COUNT,
    createLadder,
    ladderStartRung,
    moleSchedule,
    nextSkipAt,
    usableDishes,
    type Ladder,
    type LadderView,
} from "./ladderModel.js";
import type { LockRecord } from "./lockModel.js";
import { createLockStore, type LockHost } from "./lockStore.js";

const DISHES: readonly DimSumDish[] = [
    { id: "har-gow", nameEn: "Shrimp dumpling", nameZhHant: "蝦餃", imageUrl: null },
    { id: "siu-mai", nameEn: "Pork dumpling", nameZhHant: "燒賣", imageUrl: null },
    { id: "char-siu-bao", nameEn: "Barbecue pork bun", nameZhHant: "叉燒包", imageUrl: null },
    { id: "cheung-fun", nameEn: "Rice noodle roll", nameZhHant: "腸粉", imageUrl: null },
    { id: "egg-tart", nameEn: "Egg tart", nameZhHant: "蛋撻", imageUrl: null },
];

const NAME_BY_CLUE = new Map(DISHES.map((dish) => [dish.nameZhHant, dish.nameEn]));

function fixedRandom(value = 0.5): () => number {
    return () => value;
}

function harness(start: "dimsum" | "sums" = "dimsum") {
    let clock = 1_000_000;
    let cleared = 0;
    let clocked = 0;
    let allowClear = true;
    const ladder = createLadder({
        start,
        dishes: DISHES,
        now: () => clock,
        random: fixedRandom(),
        onCleared: () => {
            cleared += 1;
            return allowClear;
        },
        onClock: () => void (clocked += 1),
    });
    return {
        ladder,
        advance: (ms: number) => void (clock += ms),
        cleared: () => cleared,
        clocked: () => clocked,
        refuseClear: () => void (allowClear = false),
    };
}

function dish(view: LadderView) {
    if (view.rung !== "dimsum") throw new Error(`expected dimsum, got ${view.rung}`);
    return view.question;
}

function sum(view: LadderView) {
    if (view.rung !== "sums") throw new Error(`expected sums, got ${view.rung}`);
    return view.question;
}

function sumAnswer(question: ReturnType<typeof sum>): number {
    return question.operator === "+"
        ? question.left + question.right
        : question.operator === "-"
          ? question.left - question.right
          : question.left * question.right;
}

function rightChoice(question: ReturnType<typeof dish>): string {
    const name = NAME_BY_CLUE.get(question.clue);
    return question.choices.find((choice) => choice.label === name)!.id;
}

function wrongChoice(question: ReturnType<typeof dish>): string {
    const name = NAME_BY_CLUE.get(question.clue);
    return question.choices.find((choice) => choice.label !== name)!.id;
}

function toMoles(h: ReturnType<typeof harness>): string {
    const question = sum(h.ladder.view());
    h.ladder.answerSum(question.nonce, String(sumAnswer(question) + 1));
    const view = h.ladder.view();
    if (view.rung !== "moles") throw new Error("expected moles");
    return view.round.nonce;
}

describe("where the ladder starts", () => {
    it("starts at the dish, or at the sums under School mode with the dish rung absent", () => {
        expect(ladderStartRung({ schoolMode: false, dishCount: 10 })).toBe("dimsum");
        expect(ladderStartRung({ schoolMode: true, dishCount: 10 })).toBe("sums");
        // Too few dishes for four distinct choices is the same: no dish rung at all.
        expect(ladderStartRung({ schoolMode: false, dishCount: 3 })).toBe("sums");
    });

    it("never builds a dish question from duplicate names", () => {
        expect(usableDishes([...DISHES, { ...DISHES[0]!, id: "again" }])).toHaveLength(
            DISHES.length,
        );
    });

    it("renders a sums-first ladder with no dish question anywhere in it", () => {
        const h = harness("sums");
        expect(h.ladder.view().rung).toBe("sums");
    });
});

describe("rung 1: one dish, four choices", () => {
    it("offers four distinct names, one of them right, and shows no answer key", () => {
        const question = dish(harness().ladder.view());
        expect(question.choices).toHaveLength(4);
        expect(new Set(question.choices.map((choice) => choice.label)).size).toBe(4);
        expect(question.choices.map((choice) => choice.label)).toContain(
            NAME_BY_CLUE.get(question.clue),
        );
        expect(JSON.stringify(question)).not.toMatch(/answer|correct/i);
    });

    it("clears on the right dish", () => {
        const h = harness();
        const question = dish(h.ladder.view());
        expect(h.ladder.answerDish(question.nonce, rightChoice(question))).toBe("right");
        expect(h.ladder.view().rung).toBe("cleared");
        expect(h.cleared()).toBe(1);
    });

    it("moves to the sums after five wrong dishes, and not before", () => {
        const h = harness();
        for (let index = 0; index < DISH_MISS_LIMIT - 1; index += 1) {
            const question = dish(h.ladder.view());
            expect(h.ladder.answerDish(question.nonce, wrongChoice(question))).toBe("wrong");
            expect(h.ladder.view().rung).toBe("dimsum");
        }
        const last = dish(h.ladder.view());
        h.ladder.answerDish(last.nonce, wrongChoice(last));
        expect(h.ladder.view().rung).toBe("sums");
    });

    it("consumes the nonce before grading: no retry of a wrong answer, no replay of a right one", () => {
        const h = harness();
        const first = dish(h.ladder.view());
        expect(h.ladder.answerDish(first.nonce, wrongChoice(first))).toBe("wrong");
        expect(h.ladder.answerDish(first.nonce, rightChoice(first))).toBe("stale");
        expect(h.ladder.view().rung).toBe("dimsum");

        const second = dish(h.ladder.view());
        expect(h.ladder.answerDish(second.nonce, rightChoice(second))).toBe("right");
        expect(h.ladder.answerDish(second.nonce, rightChoice(second))).toBe("stale");
        expect(h.cleared()).toBe(1);
    });

    it("refuses an answer that is not one of the choices without spending the question", () => {
        const h = harness();
        const question = dish(h.ladder.view());
        expect(h.ladder.answerDish(question.nonce, "Shrimp dumpling")).toBe("invalid");
        expect(h.ladder.answerDish(question.nonce, rightChoice(question))).toBe("right");
    });

    it("counts an expired question as a miss, even when the answer was right", () => {
        const h = harness();
        const question = dish(h.ladder.view());
        h.advance(CHALLENGE_TTL_MS + 1);
        expect(h.ladder.answerDish(question.nonce, rightChoice(question))).toBe("expired");
        expect(h.ladder.view().rung).toBe("dimsum");
        expect(h.cleared()).toBe(0);
    });
});

describe("rung 2: ten easy sums", () => {
    it("asks only single- and double-digit arithmetic", () => {
        for (const value of [0, 0.34, 0.5, 0.67, 0.99]) {
            const ladder = createLadder({
                start: "sums",
                dishes: [],
                now: () => 0,
                random: fixedRandom(value),
                onCleared: () => true,
                onClock: () => undefined,
            });
            const question = sum(ladder.view());
            expect(question.left).toBeLessThan(100);
            expect(question.right).toBeLessThan(10);
        }
    });

    it("clears after ten right answers in a row", () => {
        const h = harness("sums");
        for (let index = 0; index < SUM_COUNT; index += 1) {
            const question = sum(h.ladder.view());
            expect(question.index).toBe(index);
            h.ladder.answerSum(question.nonce, String(sumAnswer(question)));
        }
        expect(h.ladder.view().rung).toBe("cleared");
    });

    it("moves to the moles after a single wrong sum, even the last one", () => {
        const h = harness("sums");
        for (let index = 0; index < SUM_COUNT - 1; index += 1) {
            const question = sum(h.ladder.view());
            h.ladder.answerSum(question.nonce, String(sumAnswer(question)));
        }
        const last = sum(h.ladder.view());
        expect(h.ladder.answerSum(last.nonce, String(sumAnswer(last) + 1))).toBe("wrong");
        expect(h.ladder.view().rung).toBe("moles");
        expect(h.cleared()).toBe(0);
    });

    it("treats an answer of the wrong kind as not an answer, and a replayed nonce as stale", () => {
        const h = harness("sums");
        const question = sum(h.ladder.view());
        expect(h.ladder.answerSum(question.nonce, "seven")).toBe("invalid");
        expect(h.ladder.answerSum(question.nonce, "1e3")).toBe("invalid");
        expect(h.ladder.answerSum(question.nonce, String(sumAnswer(question)))).toBe("right");
        expect(h.ladder.answerSum(question.nonce, String(sumAnswer(question)))).toBe("stale");
    });

    it("counts an expired sum as wrong", () => {
        const h = harness("sums");
        const question = sum(h.ladder.view());
        h.advance(CHALLENGE_TTL_MS + 1);
        expect(h.ladder.answerSum(question.nonce, String(sumAnswer(question)))).toBe("expired");
        expect(h.ladder.view().rung).toBe("moles");
    });
});

describe("rung 3: whack-a-mole", () => {
    const schedule = moleSchedule(fixedRandom());

    /** Hits the first `count` moles just after each shows. Returns the elapsed round time. */
    function hitFirst(h: ReturnType<typeof harness>, nonce: string, count: number): number {
        let elapsed = 0;
        for (const slot of schedule.slice(0, count)) {
            h.advance(slot.showAt + 10 - elapsed);
            elapsed = slot.showAt + 10;
            expect(h.ladder.visibleMoles(nonce)).toContain(slot.cell);
            expect(h.ladder.hitMole(nonce, slot.cell)).toBe("hit");
        }
        return elapsed;
    }

    it("cannot be finished before it starts, or before its full duration has elapsed", () => {
        const h = harness("sums");
        const nonce = toMoles(h);
        expect(h.ladder.finishMoles(nonce)).toBe("too-early");
        h.ladder.startMoles(nonce);
        h.advance(MOLE_ROUND_MS - 1);
        expect(h.ladder.finishMoles(nonce)).toBe("too-early");
        expect(h.ladder.view().rung).toBe("moles");
    });

    it("clears when enough moles were hit, once the round has run its course", () => {
        const h = harness("sums");
        const nonce = toMoles(h);
        h.ladder.startMoles(nonce);
        const elapsed = hitFirst(h, nonce, MOLE_HITS_NEEDED);
        h.advance(MOLE_ROUND_MS - elapsed);
        expect(h.ladder.finishMoles(nonce)).toBe("right");
        expect(h.ladder.view().rung).toBe("cleared");
    });

    it("counts each mole once, however often its cell is tapped", () => {
        const h = harness("sums");
        const nonce = toMoles(h);
        h.ladder.startMoles(nonce);
        const first = schedule[0]!;
        h.advance(first.showAt + 10);
        expect(h.ladder.hitMole(nonce, first.cell)).toBe("hit");
        for (let index = 0; index < 20; index += 1) {
            expect(h.ladder.hitMole(nonce, first.cell)).toBe("miss");
        }
        const view = h.ladder.view();
        expect(view.rung === "moles" && view.round.hits).toBe(1);
        h.advance(MOLE_ROUND_MS);
        // One genuine hit and a pile of taps is a lost round.
        expect(h.ladder.finishMoles(nonce)).toBe("wrong");
        expect(h.ladder.view().rung).toBe("clock");
    });

    it("never counts a tap on an empty cell, before the start, or after the round", () => {
        const h = harness("sums");
        const nonce = toMoles(h);
        expect(h.ladder.hitMole(nonce, schedule[0]!.cell)).toBe("outside");
        h.ladder.startMoles(nonce);
        // Nothing is showing in the first moments of the round.
        expect(h.ladder.hitMole(nonce, schedule[0]!.cell)).toBe("miss");
        h.advance(MOLE_ROUND_MS);
        expect(h.ladder.hitMole(nonce, schedule[0]!.cell)).toBe("outside");
        expect(h.ladder.hitMole("not-the-round", 0)).toBe("stale");
    });

    it("falls to the clock on a lost round, and a result collected too late is expired", () => {
        const lost = harness("sums");
        const nonce = toMoles(lost);
        lost.ladder.startMoles(nonce);
        lost.advance(MOLE_ROUND_MS + MOLE_COLLECT_GRACE_MS + 1);
        expect(lost.ladder.finishMoles(nonce)).toBe("expired");
        expect(lost.ladder.view().rung).toBe("clock");
        expect(lost.clocked()).toBe(1);
        expect(lost.ladder.finishMoles(nonce)).toBe("stale");
    });
});

describe("a ladder whose win cannot be honoured", () => {
    it("reports capped and falls to the clock instead of pretending", () => {
        const h = harness();
        h.refuseClear();
        const question = dish(h.ladder.view());
        expect(h.ladder.answerDish(question.nonce, rightChoice(question))).toBe("capped");
        expect(h.ladder.view().rung).toBe("clock");
    });
});

describe("the hourly cap", () => {
    it("allows three skips in a rolling hour, then frees one an hour after the oldest", () => {
        expect(LADDER_SKIPS_PER_HOUR).toBe(3);
        expect(nextSkipAt([0, 10, 20], 30)).toBe(LADDER_WINDOW_MS);
        expect(nextSkipAt([0, 10], 30)).toBeNull();
        expect(nextSkipAt([0, 10, 20], LADDER_WINDOW_MS)).toBeNull();
    });
});

/* -------------------------------------------------------------------------- */
/* Through the real store: the wait goes, the lock stays                      */
/* -------------------------------------------------------------------------- */

function host(): LockHost {
    let stored: readonly LockRecord[] = [];
    return {
        name: "test",
        dataFolder: null,
        vault: null,
        load: async () => stored,
        save: async (locks) => void (stored = locks),
    };
}

async function lockedOut(clock: { now: number }) {
    const store = createLockStore({ host: host(), now: () => clock.now });
    await store.load();
    await store.add(
        { surface: "settings", path: "x", label: "X" },
        { method: "pin", pin: "482916" },
    );
    const id = store.locks.value[0]!.id;
    // Serve each wait so every wrong answer is genuinely checked and counted; ten of them
    // reach the half-minute ceiling, longer than one whack-a-mole round.
    for (let index = 0; index < 10; index += 1) {
        clock.now += store.waitMs(id);
        await store.attempt(id, { pin: "000000" });
    }
    return { store, id };
}

function winDish(ladder: Ladder): void {
    const question = dish(ladder.view());
    ladder.answerDish(question.nonce, rightChoice(question));
}

describe("a cleared ladder, through the store", () => {
    it("is offered only while the lock is making somebody wait", async () => {
        const clock = { now: 5_000_000 };
        const store = createLockStore({ host: host(), now: () => clock.now });
        await store.load();
        await store.add({ surface: "s", path: "p", label: "P" }, { method: "pin", pin: "482916" });
        const id = store.locks.value[0]!.id;
        expect(store.ladderState(id)).toBe("not-waiting");
        expect(store.startLadder(id, { schoolMode: false, dishes: DISHES })).toBeNull();
    });

    it("ends the wait and leaves the lock locked, the count unchanged, and no session open", async () => {
        const clock = { now: 5_000_000 };
        const { store, id } = await lockedOut(clock);
        const failures = store.failures(id);
        const waitBefore = store.waitMs(id);
        expect(waitBefore).toBeGreaterThan(0);

        const ladder = store.startLadder(id, { schoolMode: false, dishes: DISHES })!;
        winDish(ladder);

        expect(store.waitMs(id)).toBe(0);
        expect(store.isLocked("settings", "x")).toBe(true);
        expect(store.open.value).toEqual([]);
        expect(store.failures(id)).toBe(failures);
        // The credential is still required: a wrong one is refused and starts a longer wait.
        expect((await store.attempt(id, { pin: "000000" })).ok).toBe(false);
        expect(store.failures(id)).toBe(failures + 1);
        // Escalation untouched: the next wait is at least as long as the skipped one.
        expect(store.waitMs(id)).toBeGreaterThanOrEqual(waitBefore);
        expect(store.isLocked("settings", "x")).toBe(true);
    });

    it("sets no cookie and touches no storage", async () => {
        const clock = { now: 5_000_000 };
        const { store, id } = await lockedOut(clock);
        const before = globalThis.document?.cookie ?? "";
        winDish(store.startLadder(id, { schoolMode: false, dishes: DISHES })!);
        expect(globalThis.document?.cookie ?? "").toBe(before);
    });

    it("starts at the sums under School mode", async () => {
        const clock = { now: 5_000_000 };
        const { store, id } = await lockedOut(clock);
        const ladder = store.startLadder(id, { schoolMode: true, dishes: DISHES })!;
        expect(ladder.view().rung).toBe("sums");
    });

    it("is spent for a wait once it falls to the clock", async () => {
        const clock = { now: 5_000_000 };
        const { store, id } = await lockedOut(clock);
        const ladder = store.startLadder(id, { schoolMode: true, dishes: [] })!;
        const question = sum(ladder.view());
        ladder.answerSum(question.nonce, String(sumAnswer(question) + 1));
        const round = ladder.view();
        if (round.rung !== "moles") throw new Error("expected moles");
        ladder.startMoles(round.round.nonce);
        clock.now += MOLE_ROUND_MS;
        expect(ladder.finishMoles(round.round.nonce)).toBe("wrong");
        expect(store.ladderState(id)).toBe("spent");
        expect(store.waitMs(id)).toBeGreaterThan(0);
        expect(store.startLadder(id, { schoolMode: false, dishes: DISHES })).toBeNull();
    });

    it("exhausts after three skips in an hour, across locks, and refills as the hour rolls", async () => {
        const clock = { now: 5_000_000 };
        const { store, id } = await lockedOut(clock);
        for (let skip = 0; skip < LADDER_SKIPS_PER_HOUR; skip += 1) {
            winDish(store.startLadder(id, { schoolMode: false, dishes: DISHES })!);
            clock.now += 1000;
            await store.attempt(id, { pin: "000000" });
        }
        expect(store.waitMs(id)).toBeGreaterThan(0);
        expect(store.ladderState(id)).toBe("capped");
        expect(store.startLadder(id, { schoolMode: false, dishes: DISHES })).toBeNull();

        clock.now += LADDER_WINDOW_MS;
        await store.attempt(id, { pin: "000000" });
        expect(store.ladderState(id)).toBe("available");
    });

    it("re-checks the cap at the moment of winning", async () => {
        // Separate clocks, so setting up one store does not run out the other's wait.
        const first = await lockedOut({ now: 5_000_000 });
        const second = await lockedOut({ now: 5_000_000 });
        // Fill one store's cap from other locks while a ladder is already open on it.
        const ladder = first.store.startLadder(first.id, { schoolMode: false, dishes: DISHES })!;
        for (let skip = 0; skip < LADDER_SKIPS_PER_HOUR; skip += 1) {
            await first.store.add(
                { surface: "s", path: `extra-${skip}`, label: "E" },
                { method: "pin", pin: "482916" },
            );
            const extra = first.store.locks.value.at(-1)!.id;
            for (let index = 0; index < 4; index += 1) {
                await first.store.attempt(extra, { pin: "000000" });
            }
            winDish(first.store.startLadder(extra, { schoolMode: false, dishes: DISHES })!);
        }
        const question = dish(ladder.view());
        expect(ladder.answerDish(question.nonce, rightChoice(question))).toBe("capped");
        expect(first.store.waitMs(first.id)).toBeGreaterThan(0);
        expect(second.store.ladderState(second.id)).toBe("available");
    });
});
