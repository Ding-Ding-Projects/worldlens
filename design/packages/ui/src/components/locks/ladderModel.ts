/**
 * The unlock ladder: something to do instead of watching a lock's wait count down.
 *
 * When a lock is making somebody wait after too many wrong answers, they may play their way
 * out of that wait. Rungs, in order:
 *
 * 1. **Dim sum.** One dish, four names to choose from. A right answer ends the wait. Five
 *    wrong dishes move down to the next rung.
 * 2. **Ten easy sums.** Single- and double-digit arithmetic, every one must be right. One
 *    wrong sum moves down to the next rung.
 * 3. **Whack-a-mole.** Hit enough moles inside a timed round. A lost round moves down.
 * 4. **The clock.** The ladder is not offered again for this wait; it simply runs out.
 *
 * ## What the ladder never does
 *
 * - It ends the WAIT and never opens the lock. Clearing the ladder unlocks nothing and opens
 *   no session; the person goes back to the ordinary prompt and still needs the credential.
 * - It never hands back attempts. The failure count is untouched, so the next wrong answer
 *   waits exactly as long as it would have after serving the wait in full.
 * - It is capped. At most {@link LADDER_SKIPS_PER_HOUR} waits can be skipped in any rolling
 *   hour, across every lock, after which the clock is the only way through.
 * - Every question is generated and graded here, against a single-use nonce that is consumed
 *   before the answer is looked at. The surface only ever sees the question; the answers stay
 *   inside {@link createLadder}'s closure.
 * - A timed round cannot be finished early, and each mole counts once, only when it was
 *   genuinely showing in that cell at that moment.
 *
 * Under School mode the dim-sum rung is absent, not skipped with a message: the ladder starts
 * at the sums. {@link ladderStartRung} is the one place that decides where it starts.
 */

import type { DimSumDish } from "../dimsum/dimSumCatalog.js";

export type LadderRung = "dimsum" | "sums" | "moles" | "clock" | "cleared";

/** Waits the ladder may skip in any rolling hour, across every lock on this machine. */
export const LADDER_SKIPS_PER_HOUR = 3;
export const LADDER_WINDOW_MS = 60 * 60 * 1000;

export const DISH_CHOICES = 4;
/** Wrong dishes before the ladder moves down to the sums. */
export const DISH_MISS_LIMIT = 5;
export const SUM_COUNT = 10;
/** How long one question stays answerable. */
export const CHALLENGE_TTL_MS = 60_000;

export const MOLE_CELLS = 9;
export const MOLE_ROUND_MS = 24_000;
export const MOLE_COUNT = 10;
export const MOLE_VISIBLE_MS = 2_200;
export const MOLE_HITS_NEEDED = 5;
/** Taps on an empty cell beyond this lose the round, so tapping everything never wins. */
export const MOLE_MAX_MISSES = 8;
/** How long after a round ends its result may still be collected. */
export const MOLE_COLLECT_GRACE_MS = 30_000;

/**
 * Where the ladder starts. The one decision, made in one place.
 *
 * School mode and a dish list too short to make a question both start at the sums, and in
 * both cases the dim-sum rung is simply not there.
 */
export function ladderStartRung(context: {
    readonly schoolMode: boolean;
    readonly dishCount: number;
}): "dimsum" | "sums" {
    return context.schoolMode || context.dishCount < DISH_CHOICES ? "sums" : "dimsum";
}

/** Dishes usable as questions: distinct English names, so four choices are four answers. */
export function usableDishes(dishes: readonly DimSumDish[]): readonly DimSumDish[] {
    const seen = new Set<string>();
    const usable: DimSumDish[] = [];
    for (const dish of dishes) {
        const key = dish.nameEn.trim().toLocaleLowerCase();
        if (key === "" || seen.has(key)) continue;
        seen.add(key);
        usable.push(dish);
    }
    return usable;
}

/* -------------------------------------------------------------------------- */
/* What the surface sees                                                      */
/* -------------------------------------------------------------------------- */

export interface DishQuestion {
    readonly nonce: string;
    /** The public catalogue photo, or null when the dish has none. */
    readonly imageUrl: string | null;
    /** The dish's Traditional Chinese name, the clue that makes the question answerable. */
    readonly clue: string;
    readonly choices: readonly { readonly id: string; readonly label: string }[];
    readonly expiresAt: number;
}

export interface SumQuestion {
    readonly nonce: string;
    readonly left: number;
    readonly right: number;
    readonly operator: "+" | "-" | "×";
    /** Zero-based position among the ten. */
    readonly index: number;
    readonly expiresAt: number;
}

export interface MoleRound {
    readonly nonce: string;
    readonly startsAt: number;
    readonly endsAt: number;
    readonly hits: number;
    readonly misses: number;
}

export type LadderView =
    | {
          readonly rung: "dimsum";
          readonly question: DishQuestion;
          readonly dishMisses: number;
      }
    | { readonly rung: "sums"; readonly question: SumQuestion; readonly sumsRight: number }
    | { readonly rung: "moles"; readonly round: MoleRound }
    | { readonly rung: "clock" }
    | { readonly rung: "cleared" };

/**
 * What became of one submission.
 *
 * - `right` / `wrong`: graded, and the ladder moved on.
 * - `stale`: the nonce was already used or never issued. Nothing was graded.
 * - `expired`: the question timed out. Counted as a wrong answer.
 * - `invalid`: the answer was the wrong kind of thing (not one of the choices, not a whole
 *   number). Not graded and the question stands.
 * - `too-early`: a timed round asked to finish before it had run its course.
 * - `capped`: the ladder was won but the hourly cap was reached meanwhile, so the wait stands.
 */
export type LadderResult =
    "right" | "wrong" | "stale" | "expired" | "invalid" | "too-early" | "capped";

export type MoleHit = "hit" | "miss" | "outside" | "stale";

export interface Ladder {
    view(): LadderView;
    answerDish(nonce: string, choiceId: string): LadderResult;
    answerSum(nonce: string, value: string): LadderResult;
    /** Starts the round's clock. Before this, the round has not begun. */
    startMoles(nonce: string): LadderResult;
    /** The cells showing a mole right now. */
    visibleMoles(nonce: string): readonly number[];
    hitMole(nonce: string, cell: number): MoleHit;
    finishMoles(nonce: string): LadderResult;
}

export interface LadderOptions {
    readonly start: "dimsum" | "sums";
    readonly dishes: readonly DimSumDish[];
    readonly now: () => number;
    /** A uniform number in [0, 1). Injected in tests. */
    readonly random?: () => number;
    /**
     * Called once, when the ladder is won. Returns false when the wait could not be skipped
     * after all (the hourly cap filled up meanwhile).
     */
    readonly onCleared: () => boolean;
    /** Called once, when the ladder falls to the clock. */
    readonly onClock: () => void;
}

function cryptoRandom(): number {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    return bytes[0]! / 2 ** 32;
}

function newNonce(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

interface MoleSlot {
    readonly cell: number;
    readonly showAt: number;
    readonly hideAt: number;
}

/** A schedule of moles across one round, never two in a row in the same cell. */
export function moleSchedule(random: () => number): readonly MoleSlot[] {
    const slots: MoleSlot[] = [];
    const spacing = Math.floor((MOLE_ROUND_MS - MOLE_VISIBLE_MS - 600) / (MOLE_COUNT - 1));
    let previous = -1;
    for (let index = 0; index < MOLE_COUNT; index += 1) {
        let cell = Math.floor(random() * MOLE_CELLS);
        if (cell === previous) cell = (cell + 1) % MOLE_CELLS;
        previous = cell;
        const showAt = 600 + index * spacing;
        slots.push({ cell, showAt, hideAt: showAt + MOLE_VISIBLE_MS });
    }
    return slots;
}

/**
 * One run of the ladder for one wait. The answers live only in here.
 */
export function createLadder(options: LadderOptions): Ladder {
    const random = options.random ?? cryptoRandom;
    const now = options.now;
    const dishes = usableDishes(options.dishes);

    let rung: LadderRung =
        options.start === "dimsum" && dishes.length >= DISH_CHOICES ? "dimsum" : "sums";
    let dishMisses = 0;
    let sumsRight = 0;

    /** The one nonce that may be answered now, and what the right answer is. */
    let live:
        | { kind: "dish"; nonce: string; answer: string; question: DishQuestion }
        | { kind: "sum"; nonce: string; answer: number; question: SumQuestion }
        | {
              kind: "moles";
              nonce: string;
              slots: readonly MoleSlot[];
              hit: Set<number>;
              startsAt: number | null;
              misses: number;
          }
        | null = null;

    const pick = (count: number): number => Math.floor(random() * count);

    function issueDish(): void {
        const correct = dishes[pick(dishes.length)]!;
        const others = dishes.filter((dish) => dish !== correct);
        const wrong: DimSumDish[] = [];
        while (wrong.length < DISH_CHOICES - 1) {
            const candidate = others.splice(pick(others.length), 1)[0]!;
            wrong.push(candidate);
        }
        const options = [correct, ...wrong];
        // Fisher-Yates, so the right answer is not always first.
        for (let index = options.length - 1; index > 0; index -= 1) {
            const swap = pick(index + 1);
            [options[index], options[swap]] = [options[swap]!, options[index]!];
        }
        const choices = options.map((dish) => ({ id: newNonce().slice(0, 8), label: dish.nameEn }));
        const answer = choices[options.indexOf(correct)]!.id;
        const nonce = newNonce();
        live = {
            kind: "dish",
            nonce,
            answer,
            question: {
                nonce,
                imageUrl: correct.imageUrl,
                clue: correct.nameZhHant,
                choices,
                expiresAt: now() + CHALLENGE_TTL_MS,
            },
        };
    }

    function issueSum(): void {
        const kind = pick(3);
        let left: number;
        let right: number;
        let operator: SumQuestion["operator"];
        let answer: number;
        if (kind === 0) {
            left = 1 + pick(89);
            right = 1 + pick(9);
            operator = "+";
            answer = left + right;
        } else if (kind === 1) {
            left = 10 + pick(90);
            right = 1 + pick(9);
            operator = "-";
            answer = left - right;
        } else {
            left = 2 + pick(8);
            right = 2 + pick(8);
            operator = "×";
            answer = left * right;
        }
        const nonce = newNonce();
        live = {
            kind: "sum",
            nonce,
            answer,
            question: {
                nonce,
                left,
                right,
                operator,
                index: sumsRight,
                expiresAt: now() + CHALLENGE_TTL_MS,
            },
        };
    }

    function issueMoles(): void {
        live = {
            kind: "moles",
            nonce: newNonce(),
            slots: moleSchedule(random),
            hit: new Set(),
            startsAt: null,
            misses: 0,
        };
    }

    function toClock(): void {
        rung = "clock";
        live = null;
        options.onClock();
    }

    function toCleared(): LadderResult {
        live = null;
        if (!options.onCleared()) {
            rung = "clock";
            return "capped";
        }
        rung = "cleared";
        return "right";
    }

    function enter(next: LadderRung): void {
        rung = next;
        if (next === "dimsum") issueDish();
        else if (next === "sums") issueSum();
        else if (next === "moles") issueMoles();
    }

    enter(rung);

    return {
        view(): LadderView {
            if (rung === "dimsum" && live?.kind === "dish") {
                return { rung, question: live.question, dishMisses };
            }
            if (rung === "sums" && live?.kind === "sum") {
                return { rung, question: live.question, sumsRight };
            }
            if (rung === "moles" && live?.kind === "moles") {
                const startsAt = live.startsAt ?? 0;
                return {
                    rung,
                    round: {
                        nonce: live.nonce,
                        startsAt,
                        endsAt: live.startsAt === null ? 0 : startsAt + MOLE_ROUND_MS,
                        hits: live.hit.size,
                        misses: live.misses,
                    },
                };
            }
            return { rung: rung === "cleared" ? "cleared" : "clock" };
        },

        answerDish(nonce, choiceId): LadderResult {
            if (live?.kind !== "dish" || live.nonce !== nonce) return "stale";
            const current = live;
            if (!current.question.choices.some((choice) => choice.id === choiceId)) {
                return "invalid";
            }
            // Consumed before grading: a wrong answer cannot be retried, a right one cannot
            // be replayed.
            live = null;
            const expired = now() > current.question.expiresAt;
            if (!expired && choiceId === current.answer) return toCleared();
            dishMisses += 1;
            if (dishMisses >= DISH_MISS_LIMIT) enter("sums");
            else issueDish();
            return expired ? "expired" : "wrong";
        },

        answerSum(nonce, value): LadderResult {
            if (live?.kind !== "sum" || live.nonce !== nonce) return "stale";
            const trimmed = value.trim();
            if (!/^-?[0-9]{1,4}$/.test(trimmed)) return "invalid";
            const current = live;
            live = null;
            const expired = now() > current.question.expiresAt;
            if (!expired && Number(trimmed) === current.answer) {
                sumsRight += 1;
                if (sumsRight >= SUM_COUNT) return toCleared();
                issueSum();
                return "right";
            }
            enter("moles");
            return expired ? "expired" : "wrong";
        },

        startMoles(nonce): LadderResult {
            if (live?.kind !== "moles" || live.nonce !== nonce) return "stale";
            if (live.startsAt !== null) return "invalid";
            live.startsAt = now();
            return "right";
        },

        visibleMoles(nonce): readonly number[] {
            if (live?.kind !== "moles" || live.nonce !== nonce || live.startsAt === null) return [];
            const elapsed = now() - live.startsAt;
            const round = live;
            return round.slots
                .map((slot, index) => ({ slot, index }))
                .filter(
                    ({ slot, index }) =>
                        !round.hit.has(index) && elapsed >= slot.showAt && elapsed < slot.hideAt,
                )
                .map(({ slot }) => slot.cell);
        },

        hitMole(nonce, cell): MoleHit {
            if (live?.kind !== "moles" || live.nonce !== nonce) return "stale";
            if (live.startsAt === null) return "outside";
            const round = live;
            const elapsed = now() - (round.startsAt ?? 0);
            if (elapsed < 0 || elapsed >= MOLE_ROUND_MS) return "outside";
            if (!Number.isInteger(cell) || cell < 0 || cell >= MOLE_CELLS) return "miss";
            const index = round.slots.findIndex(
                (slot, at) =>
                    slot.cell === cell &&
                    !round.hit.has(at) &&
                    elapsed >= slot.showAt &&
                    elapsed < slot.hideAt,
            );
            if (index === -1) {
                round.misses += 1;
                return "miss";
            }
            round.hit.add(index);
            return "hit";
        },

        finishMoles(nonce): LadderResult {
            if (live?.kind !== "moles" || live.nonce !== nonce) return "stale";
            if (live.startsAt === null) return "too-early";
            const elapsed = now() - live.startsAt;
            if (elapsed < MOLE_ROUND_MS) return "too-early";
            const round = live;
            live = null;
            if (elapsed > MOLE_ROUND_MS + MOLE_COLLECT_GRACE_MS) {
                toClock();
                return "expired";
            }
            if (round.hit.size >= MOLE_HITS_NEEDED && round.misses <= MOLE_MAX_MISSES) {
                return toCleared();
            }
            toClock();
            return "wrong";
        },
    };
}

/* -------------------------------------------------------------------------- */
/* The hourly cap                                                             */
/* -------------------------------------------------------------------------- */

/** The skips still inside the rolling hour, oldest first. */
export function skipsInWindow(skips: readonly number[], atMs: number): readonly number[] {
    return skips.filter((at) => atMs - at < LADDER_WINDOW_MS);
}

/** When the next skip becomes available again, or null when one is available now. */
export function nextSkipAt(skips: readonly number[], atMs: number): number | null {
    const recent = skipsInWindow(skips, atMs);
    if (recent.length < LADDER_SKIPS_PER_HOUR) return null;
    return recent[recent.length - LADDER_SKIPS_PER_HOUR]! + LADDER_WINDOW_MS;
}
