/**
 * Per-source-address rate limiting for the web console sign-in, plus the unlock ladder.
 *
 * This surface CAN lock a user out - repeated wrong passwords back off exponentially, capped
 * - so per the shared instructions it also implements the unlock ladder: a small set of games
 * a locked-out person can play to skip the wait, with every safety rule that keeps it from
 * quietly becoming a second, weaker password:
 *
 *   - Winning clears the WAITING ONLY. It never signs anybody in, never mints a session,
 *     never touches a cookie. That happens in `server.ts`, and only via the real password.
 *   - It never refunds more attempts than serving the clock would have.
 *   - Budget-capped at 3 ladder skips per rolling hour per source address; past that, the
 *     clock is the only way through.
 *   - It never slows the underlying exponential backoff it skips.
 *   - Every challenge is generated and graded server-side against a single-use nonce,
 *     consumed before grading; challenges expire; a whack-a-mole submission arriving before
 *     the round's own duration has elapsed is rejected; each mole is graded once, and only
 *     if it was genuinely visible in that cell at that moment.
 *   - Under School mode the ladder starts at the sums - the dim sum rung is ABSENT, not
 *     skipped with a message naming it. `startingRung` is the one function that decides.
 */

import { randomBytes, timingSafeEqual } from "node:crypto";

export type LadderRung = "dimsum" | "sums" | "whackamole" | "clock";

const RUNG_ORDER: readonly LadderRung[] = ["dimsum", "sums", "whackamole", "clock"];

/** The one function that decides the starting rung. School mode skips the dim sum rung. */
export function startingRung(schoolMode: boolean): LadderRung {
    return schoolMode ? "sums" : "dimsum";
}

function nextRung(current: LadderRung): LadderRung {
    const index = RUNG_ORDER.indexOf(current);
    return RUNG_ORDER[Math.min(index + 1, RUNG_ORDER.length - 1)] as LadderRung;
}

// ---------------------------------------------------------------------------------------
// Exponential backoff per source address
// ---------------------------------------------------------------------------------------

export interface LockoutOptions {
    readonly now?: () => number;
    /** Base delay for the first lockout. Doubles each consecutive failure, capped. */
    readonly baseDelayMs?: number;
    readonly maxDelayMs?: number;
    /** Failures before the FIRST lockout kicks in. */
    readonly freeAttempts?: number;
}

interface SourceState {
    consecutiveFailures: number;
    lockedUntil: number;
    ladderSkipTimestamps: number[];
}

const DEFAULT_BASE_DELAY_MS = 1_000;
const DEFAULT_MAX_DELAY_MS = 15 * 60 * 1000;
const DEFAULT_FREE_ATTEMPTS = 3;
const LADDER_BUDGET = 3;
const LADDER_BUDGET_WINDOW_MS = 60 * 60 * 1000;

export class LockoutTracker {
    readonly #now: () => number;
    readonly #baseDelayMs: number;
    readonly #maxDelayMs: number;
    readonly #freeAttempts: number;
    readonly #sources = new Map<string, SourceState>();

    constructor(options: LockoutOptions = {}) {
        this.#now = options.now ?? (() => Date.now());
        this.#baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
        this.#maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
        this.#freeAttempts = options.freeAttempts ?? DEFAULT_FREE_ATTEMPTS;
    }

    #state(source: string): SourceState {
        let state = this.#sources.get(source);
        if (state === undefined) {
            state = { consecutiveFailures: 0, lockedUntil: 0, ladderSkipTimestamps: [] };
            this.#sources.set(source, state);
        }
        return state;
    }

    /** Milliseconds remaining before this source may try again. 0 means it may try now. */
    remainingLockMs(source: string): number {
        const state = this.#state(source);
        return Math.max(0, state.lockedUntil - this.#now());
    }

    isLocked(source: string): boolean {
        return this.remainingLockMs(source) > 0;
    }

    /** Delay the NEXT lockout would use, without recording a failure - the ladder must
     * never refund more than serving the clock would have, and this is how it knows what
     * the clock would have been. */
    nextDelayMs(source: string): number {
        const state = this.#state(source);
        const failures = Math.max(0, state.consecutiveFailures - this.#freeAttempts + 1);
        if (failures <= 0) return 0;
        const delay = this.#baseDelayMs * 2 ** (failures - 1);
        return Math.min(delay, this.#maxDelayMs);
    }

    /** Records a wrong password attempt and applies backoff once past the free attempts. */
    recordFailure(source: string): void {
        const state = this.#state(source);
        state.consecutiveFailures += 1;
        const delay = this.nextDelayMs(source);
        if (delay > 0) state.lockedUntil = this.#now() + delay;
    }

    /** Records a correct password: the wait is over, by the real route. */
    recordSuccess(source: string): void {
        const state = this.#state(source);
        state.consecutiveFailures = 0;
        state.lockedUntil = 0;
    }

    // -----------------------------------------------------------------------------------
    // Ladder budget - shared with UnlockLadder below via the tracker, so both the backoff
    // and the ladder agree about the same rolling window for the same source.
    // -----------------------------------------------------------------------------------

    /** How many ladder skips this source has left in the current rolling hour. */
    ladderBudgetRemaining(source: string): number {
        const state = this.#state(source);
        const now = this.#now();
        state.ladderSkipTimestamps = state.ladderSkipTimestamps.filter(
            (t) => now - t < LADDER_BUDGET_WINDOW_MS,
        );
        return Math.max(0, LADDER_BUDGET - state.ladderSkipTimestamps.length);
    }

    /**
     * Clears the current wait for this source WITHOUT touching `consecutiveFailures` - the
     * underlying exponential escalation is never slowed by a cleared ladder, only the one
     * lockout window it is currently serving. Returns false, and changes nothing, when the
     * budget is exhausted.
     */
    clearLockoutByLadder(source: string): boolean {
        const state = this.#state(source);
        if (this.ladderBudgetRemaining(source) <= 0) return false;
        state.ladderSkipTimestamps.push(this.#now());
        state.lockedUntil = 0;
        return true;
    }
}

// ---------------------------------------------------------------------------------------
// Challenge generation and grading
// ---------------------------------------------------------------------------------------

const DIM_SUM_DISHES = [
    "Har gow",
    "Siu mai",
    "Char siu bao",
    "Egg tart",
    "Cheung fun",
    "Lo mai gai",
] as const;

interface SumQuestion {
    readonly a: number;
    readonly b: number;
    readonly op: "+" | "-";
    readonly answer: number;
}

interface MoleSpot {
    readonly cell: number;
    readonly visibleFromMs: number;
    readonly visibleUntilMs: number;
    graded: boolean;
}

interface BaseChallenge {
    readonly nonce: string;
    readonly rung: LadderRung;
    readonly createdAt: number;
    readonly expiresAt: number;
    consumed: boolean;
}

interface DimSumChallenge extends BaseChallenge {
    readonly rung: "dimsum";
    readonly choices: readonly string[];
    readonly correctIndex: number;
}

interface SumsChallenge extends BaseChallenge {
    readonly rung: "sums";
    readonly questions: readonly SumQuestion[];
}

interface WhackChallenge extends BaseChallenge {
    readonly rung: "whackamole";
    readonly gridSize: number;
    readonly durationMs: number;
    readonly requiredHits: number;
    readonly startedAt: number;
    readonly moles: MoleSpot[];
}

type Challenge = DimSumChallenge | SumsChallenge | WhackChallenge;

/** What is safe to send to the browser: never the answers. */
export type ChallengePayload =
    | { readonly rung: "dimsum"; readonly nonce: string; readonly choices: readonly string[] }
    | { readonly rung: "sums"; readonly nonce: string; readonly questionCount: number; readonly prompts: readonly string[] }
    | {
          readonly rung: "whackamole";
          readonly nonce: string;
          readonly gridSize: number;
          readonly durationMs: number;
          readonly requiredHits: number;
      }
    | { readonly rung: "clock"; readonly nonce: null };

const CHALLENGE_TTL_MS = 2 * 60 * 1000;
const WHACK_GRID_SIZE = 9;
const WHACK_DURATION_MS = 6_000;
const WHACK_REQUIRED_HITS = 5;
const WHACK_MOLE_COUNT = 8;
const WHACK_MOLE_VISIBLE_MS = 900;

export interface RandomSource {
    /** An integer in [0, max). */
    int(max: number): number;
}

function defaultRandomSource(): RandomSource {
    return {
        int(max: number): number {
            if (max <= 0) return 0;
            return randomBytes(4).readUInt32BE(0) % max;
        },
    };
}

export interface UnlockLadderOptions {
    readonly now?: () => number;
    readonly random?: RandomSource;
    readonly nonceBytes?: () => Buffer;
}

export class UnlockLadder {
    readonly #now: () => number;
    readonly #random: RandomSource;
    readonly #nonceBytes: () => Buffer;
    readonly #challenges = new Map<string, Challenge>();

    constructor(options: UnlockLadderOptions = {}) {
        this.#now = options.now ?? (() => Date.now());
        this.#random = options.random ?? defaultRandomSource();
        this.#nonceBytes = options.nonceBytes ?? (() => randomBytes(24));
    }

    /** How many wrong dishes trigger escalation from rung 1 to rung 2. */
    static readonly WRONG_DISH_LIMIT = 5;
    /** How many wrong sums attempts trigger escalation from rung 2 to rung 3. */
    static readonly WRONG_SUMS_LIMIT = 1;

    #newNonce(): string {
        return this.#nonceBytes().toString("base64url");
    }

    #prune(): void {
        const now = this.#now();
        for (const [nonce, challenge] of this.#challenges) {
            if (challenge.consumed || challenge.expiresAt < now) this.#challenges.delete(nonce);
        }
    }

    /** Generates and stores a fresh challenge for the given rung, returning its safe payload. */
    issue(rung: LadderRung): ChallengePayload {
        this.#prune();
        const now = this.#now();
        const nonce = this.#newNonce();
        const expiresAt = now + CHALLENGE_TTL_MS;

        if (rung === "clock") {
            return { rung: "clock", nonce: null };
        }

        if (rung === "dimsum") {
            const correctIndex = this.#random.int(DIM_SUM_DISHES.length);
            // Four choices: the correct dish plus three distinct wrong ones.
            const pool = DIM_SUM_DISHES.filter((_, i) => i !== correctIndex);
            const wrongs: string[] = [];
            const poolCopy = [...pool];
            while (wrongs.length < 3 && poolCopy.length > 0) {
                const pick = this.#random.int(poolCopy.length);
                wrongs.push(poolCopy.splice(pick, 1)[0] as string);
            }
            const choices = [...wrongs.slice(0, 1), DIM_SUM_DISHES[correctIndex] as string, ...wrongs.slice(1)];
            const challenge: DimSumChallenge = {
                nonce,
                rung: "dimsum",
                createdAt: now,
                expiresAt,
                consumed: false,
                choices,
                correctIndex: choices.indexOf(DIM_SUM_DISHES[correctIndex] as string),
            };
            this.#challenges.set(nonce, challenge);
            return { rung: "dimsum", nonce, choices };
        }

        if (rung === "sums") {
            const questions: SumQuestion[] = [];
            for (let i = 0; i < 10; i += 1) {
                const op: "+" | "-" = this.#random.int(2) === 0 ? "+" : "-";
                const a = this.#random.int(90) + 10;
                const b = this.#random.int(90) + 10;
                const [x, y] = op === "-" && b > a ? [b, a] : [a, b];
                questions.push({ a: x, b: y, op, answer: op === "+" ? x + y : x - y });
            }
            const challenge: SumsChallenge = {
                nonce,
                rung: "sums",
                createdAt: now,
                expiresAt,
                consumed: false,
                questions,
            };
            this.#challenges.set(nonce, challenge);
            return {
                rung: "sums",
                nonce,
                questionCount: questions.length,
                prompts: questions.map((q) => `${q.a} ${q.op} ${q.b}`),
            };
        }

        // whackamole
        const moles: MoleSpot[] = [];
        for (let i = 0; i < WHACK_MOLE_COUNT; i += 1) {
            const cell = this.#random.int(WHACK_GRID_SIZE);
            const slotStart = Math.floor((i / WHACK_MOLE_COUNT) * WHACK_DURATION_MS);
            moles.push({
                cell,
                visibleFromMs: slotStart,
                visibleUntilMs: Math.min(slotStart + WHACK_MOLE_VISIBLE_MS, WHACK_DURATION_MS),
                graded: false,
            });
        }
        const challenge: WhackChallenge = {
            nonce,
            rung: "whackamole",
            createdAt: now,
            expiresAt,
            consumed: false,
            gridSize: WHACK_GRID_SIZE,
            durationMs: WHACK_DURATION_MS,
            requiredHits: WHACK_REQUIRED_HITS,
            startedAt: now,
            moles,
        };
        this.#challenges.set(nonce, challenge);
        return {
            rung: "whackamole",
            nonce,
            gridSize: WHACK_GRID_SIZE,
            durationMs: WHACK_DURATION_MS,
            requiredHits: WHACK_REQUIRED_HITS,
        };
    }

    #take(nonce: unknown): Challenge | null {
        if (typeof nonce !== "string" || nonce.length === 0 || nonce.length > 128) return null;
        this.#prune();
        const challenge = this.#challenges.get(nonce);
        if (challenge === undefined) return null;
        if (challenge.consumed) return null;
        if (challenge.expiresAt < this.#now()) {
            this.#challenges.delete(nonce);
            return null;
        }
        // Consumed BEFORE grading: a replayed nonce can never be retried, win or lose.
        challenge.consumed = true;
        this.#challenges.delete(nonce);
        return challenge;
    }

    /** Grades a dim sum answer. Returns null when the nonce is invalid/expired/replayed. */
    gradeDimSum(nonce: unknown, choiceIndex: unknown): boolean | null {
        const challenge = this.#take(nonce);
        if (challenge === null || challenge.rung !== "dimsum") return null;
        if (typeof choiceIndex !== "number" || !Number.isInteger(choiceIndex)) return false;
        return choiceIndex === challenge.correctIndex;
    }

    /** Grades sums answers. ALL must be correct. */
    gradeSums(nonce: unknown, answers: unknown): boolean | null {
        const challenge = this.#take(nonce);
        if (challenge === null || challenge.rung !== "sums") return null;
        if (!Array.isArray(answers) || answers.length !== challenge.questions.length) return false;
        return challenge.questions.every((q, i) => answers[i] === q.answer);
    }

    /**
     * Grades a whack-a-mole round. `submittedAtMs` is the SERVER-observed elapsed time
     * since the round's challenge was issued (the caller passes `now() - issuedAt`, never a
     * client-supplied timestamp) - a submission arriving before the round's own duration has
     * elapsed is rejected outright, so a script cannot claim a perfect score the instant it
     * receives the mole schedule. `hits` is a list of cell indices the player claims to have
     * struck along with the elapsed time (also server-observed per hit is not required here;
     * grading uses each hit's claimed `atMs` against the schedule, and a spammed or
     * out-of-window or already-graded cell simply does not count).
     */
    gradeWhackAMole(
        nonce: unknown,
        hits: unknown,
        elapsedSinceIssueMs: number,
    ): boolean | null {
        const challenge = this.#take(nonce);
        if (challenge === null || challenge.rung !== "whackamole") return null;
        if (elapsedSinceIssueMs < challenge.durationMs) return false;
        if (!Array.isArray(hits)) return false;

        let graded = 0;
        for (const rawHit of hits) {
            if (typeof rawHit !== "object" || rawHit === null) continue;
            const hit = rawHit as Record<string, unknown>;
            const cell = hit.cell;
            const atMs = hit.atMs;
            if (typeof cell !== "number" || !Number.isInteger(cell)) continue;
            if (typeof atMs !== "number" || !Number.isFinite(atMs)) continue;
            const mole = challenge.moles.find(
                (m) => !m.graded && m.cell === cell && atMs >= m.visibleFromMs && atMs <= m.visibleUntilMs,
            );
            if (mole === undefined) continue; // empty cell, outside the round, or already graded
            mole.graded = true;
            graded += 1;
        }
        return graded >= challenge.requiredHits;
    }

    /** Test/diagnostic only: how many live challenges remain. */
    get pendingCount(): number {
        this.#prune();
        return this.#challenges.size;
    }
}

/** Escalates one rung after a loss, per the fixed ladder order. Exported for callers that
 * track per-source rung state (e.g. `server.ts`) without duplicating the order here. */
export function escalate(current: LadderRung): LadderRung {
    return nextRung(current);
}

export function isRung(value: unknown): value is LadderRung {
    return value === "dimsum" || value === "sums" || value === "whackamole" || value === "clock";
}

/** Used only in tests to prove nonce comparisons are not vulnerable to a timing probe on
 * the map key lookup itself; production code never needs this because `Map` keys are
 * compared by V8's own string equality, and nonces are single-use regardless. */
export function constantTimeStringEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a, "utf8");
    const bufB = Buffer.from(b, "utf8");
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
}

// ---------------------------------------------------------------------------------------
// SignInGate - ties the backoff tracker and the ladder together per source address.
// ---------------------------------------------------------------------------------------

interface GateSourceState {
    rung: LadderRung;
    wrongDishes: number;
    wrongSumsAttempts: number;
    activeNonce: string | null;
    activeIssuedAt: number | null;
}

export type LadderOutcome = "cleared" | "wrong" | "invalid" | "not-locked" | "budget-exhausted";

/**
 * The single object `server.ts` talks to for both the exponential backoff and the ladder.
 * It never mints a session and never sets a cookie - it only ever answers whether the
 * WAIT is currently in force, and clears it on a ladder win within budget.
 */
export class SignInGate {
    readonly #lockout: LockoutTracker;
    readonly #ladder: UnlockLadder;
    readonly #now: () => number;
    readonly #sources = new Map<string, GateSourceState>();

    constructor(lockout: LockoutTracker, ladder: UnlockLadder, now: () => number = () => Date.now()) {
        this.#lockout = lockout;
        this.#ladder = ladder;
        this.#now = now;
    }

    #state(source: string, schoolMode: boolean): GateSourceState {
        let state = this.#sources.get(source);
        if (state === undefined) {
            state = {
                rung: startingRung(schoolMode),
                wrongDishes: 0,
                wrongSumsAttempts: 0,
                activeNonce: null,
                activeIssuedAt: null,
            };
            this.#sources.set(source, state);
        }
        return state;
    }

    isLocked(source: string): boolean {
        return this.#lockout.isLocked(source);
    }

    remainingLockMs(source: string): number {
        return this.#lockout.remainingLockMs(source);
    }

    recordPasswordFailure(source: string): void {
        this.#lockout.recordFailure(source);
    }

    /** A correct password: reset the backoff AND the ladder rung for next time. */
    recordPasswordSuccess(source: string, schoolMode: boolean): void {
        this.#lockout.recordSuccess(source);
        this.#sources.delete(source);
        void schoolMode;
    }

    /** Issues (or re-issues) the challenge for this source's current rung. Null when the
     * source is not currently locked - there is nothing to skip. */
    requestChallenge(source: string, schoolMode: boolean): ChallengePayload | null {
        if (!this.isLocked(source)) return null;
        const state = this.#state(source, schoolMode);
        const payload = this.#ladder.issue(state.rung);
        state.activeNonce = payload.rung === "clock" ? null : payload.nonce;
        state.activeIssuedAt = this.#now();
        return payload;
    }

    #escalateAndReissue(source: string, state: GateSourceState): void {
        state.rung = escalate(state.rung);
        state.activeNonce = null;
        state.activeIssuedAt = null;
    }

    submitDimSum(source: string, schoolMode: boolean, nonce: unknown, choiceIndex: unknown): LadderOutcome {
        if (!this.isLocked(source)) return "not-locked";
        const state = this.#state(source, schoolMode);
        const result = this.#ladder.gradeDimSum(nonce, choiceIndex);
        if (result === null) return "invalid";
        if (result === true) {
            const cleared = this.#lockout.clearLockoutByLadder(source);
            state.rung = startingRung(schoolMode);
            state.wrongDishes = 0;
            return cleared ? "cleared" : "budget-exhausted";
        }
        state.wrongDishes += 1;
        if (state.wrongDishes >= UnlockLadder.WRONG_DISH_LIMIT) this.#escalateAndReissue(source, state);
        return "wrong";
    }

    submitSums(source: string, schoolMode: boolean, nonce: unknown, answers: unknown): LadderOutcome {
        if (!this.isLocked(source)) return "not-locked";
        const state = this.#state(source, schoolMode);
        const result = this.#ladder.gradeSums(nonce, answers);
        if (result === null) return "invalid";
        if (result === true) {
            const cleared = this.#lockout.clearLockoutByLadder(source);
            state.rung = startingRung(schoolMode);
            state.wrongSumsAttempts = 0;
            return cleared ? "cleared" : "budget-exhausted";
        }
        state.wrongSumsAttempts += 1;
        if (state.wrongSumsAttempts >= UnlockLadder.WRONG_SUMS_LIMIT) this.#escalateAndReissue(source, state);
        return "wrong";
    }

    submitWhackAMole(source: string, schoolMode: boolean, nonce: unknown, hits: unknown): LadderOutcome {
        if (!this.isLocked(source)) return "not-locked";
        const state = this.#state(source, schoolMode);
        if (state.activeIssuedAt === null) return "invalid";
        const elapsed = this.#now() - state.activeIssuedAt;
        const result = this.#ladder.gradeWhackAMole(nonce, hits, elapsed);
        if (result === null) return "invalid";
        if (result === true) {
            const cleared = this.#lockout.clearLockoutByLadder(source);
            state.rung = startingRung(schoolMode);
            return cleared ? "cleared" : "budget-exhausted";
        }
        // A lost round falls straight to the clock for THIS lockout; the ladder is not
        // offered again until the next lockout.
        this.#escalateAndReissue(source, state);
        return "wrong";
    }

    currentRung(source: string, schoolMode: boolean): LadderRung {
        return this.#state(source, schoolMode).rung;
    }
}
