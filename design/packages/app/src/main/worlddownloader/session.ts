/**
 * One run of the world downloader: the child process, what its output means, and how it stops.
 *
 * The shape is `../render/runner.ts`'s, deliberately and almost line for line, because the two
 * problems are the same problem. A JVM is spawned directly with no shell in between, so the
 * process tree is exactly one process and cancelling it cannot leave a detached JVM holding a
 * port; stdin is closed rather than inherited, so a child cannot block waiting on a terminal that
 * is not there; both output streams are piped, because the interesting lines are on both; and the
 * stop path asks politely with SIGINT before escalating to SIGKILL after a grace period, which on
 * Windows never fires because `kill` there is `TerminateProcess`, and on a platform with real
 * signals is what buys the tool its own shutdown.
 *
 * ## The one thing this run has that a render does not
 *
 * A render is a batch job that reports its own progress accurately. This is a proxy that sits
 * between a person's game client and a server, and the interesting question about it is not "how
 * far along is it" but "what is it waiting for": a Microsoft device code somebody has to type
 * into a browser, a game client that has not connected yet, chunks arriving or not arriving. So
 * the output of this module is a stream of {@link DownloaderEvent}s describing a state rather than
 * a percentage, and the percentage - such as it is - comes from counting region files on disk
 * rather than from anything the tool says about itself.
 *
 * ## Which lines are parsed, and why only these
 *
 * Three, all of them read out of the tool's own Java source rather than guessed at from a
 * transcript:
 *
 *  - `MSA_CODE {"code":"...","url":"..."}` exists precisely so that a managing console can lift
 *    the device code out of the output and put it on screen. It is a contract the tool offers,
 *    which is what makes it safe to parse.
 *  - `[ms-auth] Signed in as <name>.` names the account that was authorised, which is worth
 *    showing because signing in to the wrong Microsoft account is an easy mistake with a
 *    confusing consequence later.
 *  - `[ms-auth] Microsoft sign-in failed: <reason>` carries the reason, which is the only thing
 *    that tells somebody whether to try again or to do something differently.
 *
 * Everything else is a log line. In particular the `===== MICROSOFT SIGN-IN REQUIRED =====`
 * banner and the numbered instructions under it are the human-readable twin of `MSA_CODE`: the
 * same code, formatted for a person reading a console. Parsing both would surface the device code
 * twice, from two formats with different lifetimes, and the banner is the one that can change
 * wording at any upstream commit. So the banner is logged and never parsed.
 *
 * ## Why "connected" is a disk fact rather than a log line
 *
 * The tool prints nothing unambiguous when a game client actually attaches to the proxy, and the
 * temptation is to pick a line that usually appears around then and call it the connect signal.
 * That would be a guess dressed as a fact, and it would fail silently: an upstream wording change
 * turns the state machine into one that reports "waiting" forever while a download runs perfectly.
 *
 * So the promotion to `connected` is driven by evidence instead. The chunk count on disk is
 * sampled when the session starts, and the first time it rises above that baseline the session
 * reports `connected`, because chunks only arrive through a connected client. This is a heuristic
 * about *disk*, not a protocol signal, and it has one honest consequence worth stating plainly:
 * somebody who connects and then stands still writes no new chunks, and stays reported as
 * `waiting` until they move. Reporting `waiting` while a person is connected but idle is a
 * conservative error that costs nothing; reporting `connected` from a log line that stopped
 * meaning that two releases ago is a confident lie.
 *
 * ## The token
 *
 * The access token reaches exactly one place: the argument vector handed to `spawn`. It is never
 * held in a field, never emitted, and never retained. Every argument vector this module reports -
 * on the `started` event, from {@link DownloaderSession.redactedArguments} - is the `redacted`
 * half of {@link deriveDownloaderArguments}, which the shared module produces by index rather than
 * by pattern-matching, so it cannot miss the secret and cannot mask the wrong element. As a second
 * line, any occurrence of the token inside a line of the child's own output is scrubbed before
 * that line becomes an event, because a guarantee that depends on an upstream tool never echoing
 * its own argument is not a guarantee.
 */

import { randomUUID } from "node:crypto";
import { spawn as nodeSpawn } from "node:child_process";
import type { ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { deriveDownloaderArguments } from "@worldlens/shared/dist/downloaderOptions.js";
import type { DownloaderSettings } from "@worldlens/shared/dist/downloaderOptions.js";
import { countWorldChunks } from "./chunks.js";
import { LineSplitter } from "../render/progress.js";

/** How long a polite stop is given before the process is killed outright. */
export const CANCEL_GRACE_MS = 8_000;

/** How often the chunk count on disk is re-read while a session runs. */
export const DEFAULT_POLL_MS = 4_000;

/**
 * The proxy port the tool listens on when nothing else is chosen.
 *
 * Restated here rather than reached for through the shared option schema, because this module
 * needs a number even when the schema has no entry for the key, and a session that reported no
 * port at all would leave the interface unable to tell anybody where to point their game.
 */
export const DEFAULT_PROXY_PORT = 25565;

/**
 * How many lines of the child's output are kept.
 *
 * A session runs for as long as somebody is playing, which is hours, and the tool is chatty: an
 * unbounded buffer is a slow memory leak whose size is decided by how long a person plays for.
 * Two thousand lines is comfortably more than the tail anybody reads when working out why a
 * download misbehaved, and it is bounded, which is the property that matters. Anything older has
 * already been delivered to whoever subscribed to the events; this buffer exists so that a
 * surface opened halfway through a session has something to show.
 */
export const MAX_RETAINED_LOG_LINES = 2000;

/**
 * The child a spawn produces.
 *
 * `stdin` is `null` rather than a stream and the type says so: the tool reads nothing from it in
 * the `--no-gui` mode this application runs it in.
 */
export type DownloaderChild = ChildProcessByStdio<null, Readable, Readable>;

/** Injectable so a test can run a fake child, and so nothing here reaches a real JVM. */
export type SpawnDownloader = (
    command: string,
    args: readonly string[],
    options: { readonly cwd: string; readonly env: NodeJS.ProcessEnv },
) => DownloaderChild;

/**
 * The subset of `countWorldChunks`'s answer this module uses.
 *
 * Narrower than `WorldChunkCount` on purpose: a fake in a test should be three lines rather than a
 * reconstruction of the real counter's whole shape, and this states exactly how much of that shape
 * the progress reporting depends on.
 */
export interface DownloaderChunkCount {
    readonly total: number;
    readonly bytes: number;
    readonly dimensions: readonly { readonly dimension: string; readonly chunks: number }[];
}

export type CountDownloaderChunks = (folder: string) => Promise<DownloaderChunkCount>;

/**
 * What the session is doing, in words an interface can render without further interpretation.
 *
 * `waiting` is the state a correctly-running download spends most of its life in when nobody is
 * moving, and `connected` is the state it reaches once chunks are demonstrably arriving. See this
 * file's header for why the difference is measured on disk.
 */
export type DownloaderPhase =
    | "starting"
    | "signing-in"
    | "waiting"
    | "connected"
    | "stopped"
    | "failed";

export type DownloaderEvent =
    | {
          readonly type: "started";
          readonly sessionId: string;
          readonly at: string;
          readonly proxyPort: number;
          readonly redactedArguments: readonly string[];
          readonly notes: readonly string[];
      }
    | {
          readonly type: "log";
          readonly sessionId: string;
          readonly at: string;
          readonly stream: "stdout" | "stderr";
          readonly line: string;
      }
    | {
          readonly type: "sign-in";
          readonly sessionId: string;
          readonly at: string;
          readonly code: string;
          readonly url: string;
      }
    | {
          readonly type: "signed-in";
          readonly sessionId: string;
          readonly at: string;
          readonly username: string;
      }
    | {
          readonly type: "phase";
          readonly sessionId: string;
          readonly at: string;
          readonly phase: DownloaderPhase;
          readonly message: string;
      }
    | {
          readonly type: "progress";
          readonly sessionId: string;
          readonly at: string;
          readonly chunks: number;
          readonly bytes: number;
          readonly dimensions: readonly { readonly dimension: string; readonly chunks: number }[];
      }
    | {
          readonly type: "finished";
          readonly sessionId: string;
          readonly at: string;
          readonly exitCode: number | null;
          readonly chunks: number;
      }
    | {
          readonly type: "failed";
          readonly sessionId: string;
          readonly at: string;
          readonly message: string;
      };

export interface DownloaderSessionOptions {
    readonly sessionId: string;
    /** Absolute path to the `java` executable, from the toolchain layer. */
    readonly javaExecutable: string;
    /** Absolute path to the verified world-downloader jar. */
    readonly jarPath: string;
    readonly settings: DownloaderSettings;
    /**
     * Fetched out of the credential store immediately before this call and dropped straight after.
     *
     * A parameter rather than part of the settings, for the reason `deriveDownloaderArguments`
     * gives: a token that is never part of the settings record cannot reach the settings file, an
     * export or a diagnostic report by accident.
     */
    readonly accessToken?: string | null;
    /** The child's working directory. Every path the tool is given is absolute, so this is only ever a fallback root. */
    readonly workingDirectory: string;
    readonly onEvent: (event: DownloaderEvent) => void;
    readonly spawn?: SpawnDownloader;
    readonly countChunks?: CountDownloaderChunks;
    readonly pollMs?: number;
}

/**
 * The `MSA_CODE` marker line.
 *
 * Anchored and tolerant of surrounding whitespace, because a JVM's output on Windows arrives with
 * a carriage return on the end of every line and a logging layer can prefix one with spaces. The
 * JSON is captured as a whole rather than picked apart with a regular expression, because reading
 * structured data with a pattern is how a parser starts accepting things that are not the format.
 */
const MSA_CODE_LINE = /^\s*MSA_CODE\s+(\{.*\})\s*$/;

/** `[ms-auth] Signed in as <name>.` - the trailing full stop belongs to the sentence, not the name. */
const SIGNED_IN_LINE = /^\s*\[ms-auth\]\s+Signed in as\s+(.+?)\.?\s*$/;

/** `[ms-auth] Microsoft sign-in failed: <reason>` */
const SIGN_IN_FAILED_LINE = /^\s*\[ms-auth\]\s+Microsoft sign-in failed:\s*(.*?)\s*$/;

/**
 * One run of the tool.
 *
 * Constructed, then {@link run} once. {@link stop} is safe at any point, including before the
 * process has spawned and after it has exited, because somebody pressing Stop does not know or
 * care which of those is true at that instant.
 */
export class DownloaderSession {
    readonly #options: DownloaderSessionOptions;
    readonly #redacted: readonly string[];
    readonly #args: readonly string[];
    readonly #notes: readonly string[];
    readonly #logLines: string[] = [];

    #child: DownloaderChild | null = null;
    #phase: DownloaderPhase = "starting";
    #stopRequested = false;
    #finished = false;
    #killTimer: NodeJS.Timeout | null = null;
    #pollTimer: NodeJS.Timeout | null = null;
    #baselineChunks = 0;
    #lastTotal: number | null = null;
    #lastBytes: number | null = null;
    #latestTotal = 0;

    constructor(options: DownloaderSessionOptions) {
        this.#options = options;
        const derived = deriveDownloaderArguments(options.settings, options.accessToken ?? null);
        // The jar path leads both vectors so that the reported arguments are the full command line
        // a person could paste into a terminal, minus the secret. A reported vector that starts
        // halfway through the real one is the kind of half-truth that wastes an hour of somebody's
        // debugging.
        this.#args = ["-jar", options.jarPath, ...derived.args];
        this.#redacted = ["-jar", options.jarPath, ...derived.redacted];
        this.#notes = derived.notes;
    }

    /** The redacted argument vector, safe to render, log and export. */
    redactedArguments(): readonly string[] {
        return this.#redacted;
    }

    phase(): DownloaderPhase {
        return this.#phase;
    }

    /**
     * The process id this session is backed by right now, or null when there is none to address.
     *
     * The process tree is one JVM, spawned with no shell and no launcher script in between, so
     * this single id is the whole of what a caller needs to reach "the process the download is".
     */
    pid(): number | null {
        const child = this.#child;
        if (child === null || this.#finished) return null;
        if (child.exitCode !== null) return null;
        return typeof child.pid === "number" ? child.pid : null;
    }

    /** The retained tail of the child's own output, oldest first. */
    recentLogLines(): readonly string[] {
        return [...this.#logLines];
    }

    /**
     * Spawns the tool and resolves when it has exited.
     *
     * Never rejects. A spawn failure is an outcome the interface has to render, exactly like a
     * non-zero exit, and turning one of the two into a thrown exception makes every caller handle
     * the same event twice in two different ways.
     */
    async run(): Promise<{ exitCode: number | null; chunks: number }> {
        if (this.#stopRequested) {
            // Stopped before it ever started, which is what a double-click on Start followed by
            // Stop looks like from here. There is no process to report on and nothing was written.
            this.#finished = true;
            this.#setPhase("stopped", "The download was stopped before the tool started.");
            return { exitCode: null, chunks: 0 };
        }

        // Sampled before the spawn so that a world folder holding a previous session's chunks
        // cannot be mistaken for chunks arriving now. See the header for why this baseline is what
        // `connected` is measured against.
        const baseline = await this.#count();
        this.#baselineChunks = baseline?.total ?? 0;
        this.#latestTotal = this.#baselineChunks;

        const spawn = this.#options.spawn ?? defaultSpawn;
        let child: DownloaderChild;
        try {
            child = spawn(this.#options.javaExecutable, this.#args, {
                cwd: this.#options.workingDirectory,
                env: process.env,
            });
        } catch (error) {
            this.#finished = true;
            this.#emit({
                type: "failed",
                sessionId: this.#options.sessionId,
                at: new Date().toISOString(),
                message: `The world downloader could not be started: ${describe(error)}`,
            });
            this.#setPhase("failed", "The world downloader could not be started.");
            return { exitCode: null, chunks: this.#latestTotal };
        }
        this.#child = child;

        this.#emit({
            type: "started",
            sessionId: this.#options.sessionId,
            at: new Date().toISOString(),
            proxyPort: proxyPortOf(this.#options.settings),
            redactedArguments: this.#redacted,
            notes: this.#notes,
        });
        this.#setPhase("starting", "Starting the world downloader.");

        // A stop that arrived while the baseline was being counted has to be honoured now that
        // there is finally a process to address, rather than waiting for a second click.
        if (this.#stopRequested) this.#terminate();

        this.#schedulePoll();

        const stdout = this.#pipe(child.stdout, "stdout");
        const stderr = this.#pipe(child.stderr, "stderr");

        const exit = await new Promise<{ code: number | null }>((resolve) => {
            child.once("error", (error) => {
                this.#emit({
                    type: "failed",
                    sessionId: this.#options.sessionId,
                    at: new Date().toISOString(),
                    message: `The world downloader stopped unexpectedly: ${describe(error)}`,
                });
                resolve({ code: null });
            });
            child.once("close", (code) => resolve({ code }));
        });

        // Awaited after `close` rather than raced with it: the streams can still hold buffered
        // output when the process ends, and the last line before a crash is usually the one that
        // explains it.
        await Promise.all([stdout, stderr]);

        this.#finished = true;
        this.#clearKillTimer();
        this.#clearPollTimer();

        // One last count, because the tool flushes its final region writes on the way out and a
        // number taken a poll interval ago would under-report the download that just completed.
        const final = await this.#count();
        if (final !== null) {
            this.#latestTotal = final.total;
            this.#reportProgress(final);
        }

        this.#emit({
            type: "finished",
            sessionId: this.#options.sessionId,
            at: new Date().toISOString(),
            exitCode: exit.code,
            chunks: this.#latestTotal,
        });

        // A stop that somebody asked for is not a failure however the process ended, and a clean
        // exit is not a failure either. Anything else is, and says so, because a download that
        // ended by itself with a non-zero code is exactly the case where a person needs to look at
        // the log rather than assume the world on disk is complete.
        if (this.#stopRequested || exit.code === 0) {
            this.#setPhase("stopped", "The world downloader has stopped.");
        } else {
            this.#setPhase(
                "failed",
                exit.code === null
                    ? "The world downloader ended without reporting why. The log above is the only record of what happened."
                    : `The world downloader ended with exit code ${String(exit.code)}.`,
            );
        }

        return { exitCode: exit.code, chunks: this.#latestTotal };
    }

    /**
     * Asks the tool to stop, then makes sure it did.
     *
     * Returns immediately; {@link run}'s promise is what resolves when the process is actually
     * gone. Calling it twice is harmless, which matters because "did that click register?" is
     * answered by clicking again.
     */
    stop(): void {
        if (this.#stopRequested) return;
        this.#stopRequested = true;
        this.#terminate();
    }

    #terminate(): void {
        const child = this.#child;
        if (child === null || this.#finished || child.exitCode !== null) return;

        child.kill("SIGINT");

        // On Windows this timer never fires, because `kill` there is `TerminateProcess` and the
        // process is already gone. On a platform with real signals it is the deadline on a JVM
        // that has decided not to honour its shutdown hook.
        this.#killTimer = setTimeout(() => {
            if (!this.#finished && child.exitCode === null) child.kill("SIGKILL");
        }, CANCEL_GRACE_MS);
        // Never hold the event loop open on behalf of a process that is already dying.
        this.#killTimer.unref?.();
    }

    #clearKillTimer(): void {
        if (this.#killTimer === null) return;
        clearTimeout(this.#killTimer);
        this.#killTimer = null;
    }

    #clearPollTimer(): void {
        if (this.#pollTimer === null) return;
        clearTimeout(this.#pollTimer);
        this.#pollTimer = null;
    }

    /**
     * Re-arms the disk poll after each count rather than running on an interval.
     *
     * An interval would let a slow count overlap the next one, which on a world folder holding
     * hundreds of region files means several concurrent sweeps competing for the same disk the
     * download is trying to write to. Chaining guarantees one at a time.
     */
    #schedulePoll(): void {
        const pollMs = this.#options.pollMs ?? DEFAULT_POLL_MS;
        this.#pollTimer = setTimeout(() => {
            void this.#poll(pollMs);
        }, pollMs);
        this.#pollTimer.unref?.();
    }

    async #poll(pollMs: number): Promise<void> {
        if (this.#finished) return;
        const counted = await this.#count();
        if (this.#finished) return;

        if (counted !== null) {
            this.#latestTotal = counted.total;
            this.#reportProgress(counted);

            if (
                counted.total > this.#baselineChunks &&
                (this.#phase === "starting" ||
                    this.#phase === "signing-in" ||
                    this.#phase === "waiting")
            ) {
                this.#setPhase(
                    "connected",
                    "Chunks are arriving, so a game client is connected through the proxy.",
                );
            } else if (this.#phase === "starting") {
                // The tool has been alive for a full poll interval without exiting and without
                // asking for a sign-in, which is the only evidence available that it got past its
                // own startup. It is a weaker claim than a log line would be, which is why the
                // wording says the proxy is ready rather than that anything has connected.
                this.#setPhase(
                    "waiting",
                    `The proxy is running. Connect your game to this computer on port ${String(proxyPortOf(this.#options.settings))} to start downloading.`,
                );
            }
        }

        if (!this.#finished) {
            this.#pollTimer = setTimeout(() => {
                void this.#poll(pollMs);
            }, pollMs);
            this.#pollTimer.unref?.();
        }
    }

    /**
     * Emits progress only when the count actually moved.
     *
     * A world nobody is walking through produces an identical count every four seconds forever,
     * and forwarding each one would mean a renderer redrawing a number that has not changed for
     * the entire length of a session. Both the chunk total and the byte total are compared,
     * because a region file growing while its chunk count stays put is still real progress and
     * still worth showing.
     */
    #reportProgress(counted: DownloaderChunkCount): void {
        if (counted.total === this.#lastTotal && counted.bytes === this.#lastBytes) return;
        this.#lastTotal = counted.total;
        this.#lastBytes = counted.bytes;
        this.#emit({
            type: "progress",
            sessionId: this.#options.sessionId,
            at: new Date().toISOString(),
            chunks: counted.total,
            bytes: counted.bytes,
            dimensions: counted.dimensions.map((entry) => ({
                dimension: entry.dimension,
                chunks: entry.chunks,
            })),
        });
    }

    /**
     * Counts what is on disk, or null when the count itself failed.
     *
     * `countWorldChunks` already treats a missing folder and a half-written region file as zero
     * rather than as an error, so a rejection here means something genuinely unexpected. Null
     * rather than zero, because reporting zero would look like a download that lost everything it
     * had, which is a far more alarming thing to put on screen than one stale number.
     */
    async #count(): Promise<DownloaderChunkCount | null> {
        const folder = this.#options.settings.outputFolder.trim();
        if (folder === "") return null;
        const count = this.#options.countChunks ?? countWorldChunks;
        try {
            return await count(folder);
        } catch {
            return null;
        }
    }

    async #pipe(stream: NodeJS.ReadableStream, which: "stdout" | "stderr"): Promise<void> {
        const splitter = new LineSplitter();
        stream.setEncoding("utf8");
        try {
            for await (const chunk of stream as AsyncIterable<string>) {
                for (const line of splitter.push(chunk)) this.#consume(line, which);
            }
        } catch {
            // A stream that errors while the process is dying is the process dying, which the
            // `close` handler already reports. Nothing here should turn that into a second,
            // differently-worded failure.
        }
        for (const line of splitter.flush()) this.#consume(line, which);
    }

    #consume(rawLine: string, which: "stdout" | "stderr"): void {
        // A JVM on Windows terminates its lines with a carriage return that the line splitter has
        // no reason to know about, and a trailing `\r` in a regular expression match is the sort of
        // thing that makes a parser work everywhere except the platform most people run.
        const line = this.#scrub(rawLine.replace(/\r$/, ""));
        if (line.trim() === "") return;

        const at = new Date().toISOString();

        const msaCode = MSA_CODE_LINE.exec(line);
        if (msaCode !== null) {
            const parsed = parseSignInMarker(msaCode[1] ?? "");
            if (parsed !== null) {
                this.#emit({
                    type: "sign-in",
                    sessionId: this.#options.sessionId,
                    at,
                    code: parsed.code,
                    url: parsed.url,
                });
                this.#setPhase(
                    "signing-in",
                    "Microsoft is waiting for the device code to be entered in a browser.",
                );
                return;
            }
            // Malformed JSON behind the marker is ignored as a marker and kept as a log line. A
            // half-parsed device code is worse than none: somebody types four of the eight
            // characters into Microsoft's page and is told the code is wrong, which sends them
            // looking at their account rather than at the download.
        }

        const signedIn = SIGNED_IN_LINE.exec(line);
        if (signedIn !== null && signedIn[1] !== undefined) {
            this.#emit({
                type: "signed-in",
                sessionId: this.#options.sessionId,
                at,
                username: signedIn[1],
            });
            if (this.#phase !== "connected") {
                this.#setPhase(
                    "waiting",
                    `Signed in as ${signedIn[1]}. Connect your game to this computer on port ${String(proxyPortOf(this.#options.settings))} to start downloading.`,
                );
            }
            this.#record(line);
            return;
        }

        const signInFailed = SIGN_IN_FAILED_LINE.exec(line);
        if (signInFailed !== null) {
            const reason = signInFailed[1] ?? "";
            // Reported as a failed phase rather than as a `failed` event, and the process is left
            // running. The tool decides what to do about its own sign-in failure, and its exit code
            // is the honest answer to whether the run survived it. Killing it here to make the
            // state machine tidier would replace a real outcome with this module's guess at one.
            this.#setPhase(
                "failed",
                reason === ""
                    ? "Microsoft sign-in failed. The downloader is still running and will report what it does next."
                    : `Microsoft sign-in failed: ${reason}`,
            );
            this.#record(line);
            return;
        }

        this.#record(line);
        this.#emit({
            type: "log",
            sessionId: this.#options.sessionId,
            at,
            stream: which,
            line,
        });
    }

    /**
     * Removes the access token from a line before anything else sees it.
     *
     * The tool does not echo its own arguments, so in practice this replaces nothing. It exists
     * because the alternative is a promise about secrets that rests entirely on an upstream
     * project's current logging choices, and that promise would be broken by a debug build nobody
     * here controls, silently, into a log buffer this application exports.
     */
    #scrub(line: string): string {
        const token = this.#options.accessToken;
        if (token === undefined || token === null || token.length < 8) return line;
        return line.split(token).join("********");
    }

    #record(line: string): void {
        this.#logLines.push(line);
        if (this.#logLines.length > MAX_RETAINED_LOG_LINES) this.#logLines.shift();
    }

    #setPhase(phase: DownloaderPhase, message: string): void {
        this.#phase = phase;
        this.#emit({
            type: "phase",
            sessionId: this.#options.sessionId,
            at: new Date().toISOString(),
            phase,
            message,
        });
    }

    /**
     * Hands an event to the subscriber, and survives a subscriber that throws.
     *
     * The subscriber is usually a bridge to a renderer window, and a window that has been closed
     * between one event and the next throws on send. That is an ordinary thing to happen halfway
     * through a session, and it must not be able to abort the loop reading the child's output or
     * leave a JVM running with nothing watching it.
     */
    #emit(event: DownloaderEvent): void {
        try {
            this.#options.onEvent(event);
        } catch {
            // Nothing to do and nowhere to report it: the only channel out of here is the one that
            // just failed.
        }
    }
}

export interface DownloaderRunnerDefaults {
    readonly spawn?: SpawnDownloader;
    readonly countChunks?: CountDownloaderChunks;
    readonly pollMs?: number;
}

export type DownloaderStartResult =
    | { readonly ok: true; readonly sessionId: string }
    | { readonly ok: false; readonly message: string };

/**
 * Owns the sessions, of which there is at most one.
 *
 * The single-session rule is not tidiness. The tool is a proxy that binds a port on this machine,
 * and two of them asked to bind the same port produce one working download and one process that
 * failed to start for a reason buried in its own output. Refusing the second attempt, by name, is
 * the difference between an explanation and a mystery.
 */
export class DownloaderRunner {
    readonly #defaults: DownloaderRunnerDefaults;
    readonly #sessions = new Map<string, DownloaderSession>();

    constructor(defaults: DownloaderRunnerDefaults = {}) {
        this.#defaults = defaults;
    }

    start(
        options: Omit<DownloaderSessionOptions, "sessionId"> & { readonly sessionId?: string },
    ): DownloaderStartResult {
        const running = [...this.#sessions.keys()][0];
        if (running !== undefined) {
            return {
                ok: false,
                message: `A download is already running as session ${running}. Stop it before starting another: the downloader is a proxy that binds a port on this computer, and two of them cannot both hold it.`,
            };
        }

        const sessionId = options.sessionId ?? randomUUID();
        const spawn = options.spawn ?? this.#defaults.spawn;
        const countChunks = options.countChunks ?? this.#defaults.countChunks;
        const pollMs = options.pollMs ?? this.#defaults.pollMs;

        let session: DownloaderSession;
        try {
            session = new DownloaderSession({
                sessionId,
                javaExecutable: options.javaExecutable,
                jarPath: options.jarPath,
                settings: options.settings,
                workingDirectory: options.workingDirectory,
                onEvent: options.onEvent,
                ...(options.accessToken === undefined ? {} : { accessToken: options.accessToken }),
                ...(spawn === undefined ? {} : { spawn }),
                ...(countChunks === undefined ? {} : { countChunks }),
                ...(pollMs === undefined ? {} : { pollMs }),
            });
        } catch (error) {
            // Building the argument vector is the only work the constructor does, and it is the one
            // place a malformed settings record could still throw after validation passed.
            return {
                ok: false,
                message: `The download could not be prepared: ${describe(error)}`,
            };
        }

        this.#sessions.set(sessionId, session);
        // `run` never rejects, so the `catch` is a belt rather than a handler. What matters is that
        // the session is removed from the map in every ending, including one nobody predicted,
        // because a stale entry here is what makes every later start refuse for no visible reason.
        void session
            .run()
            .catch(() => undefined)
            .finally(() => {
                this.#sessions.delete(sessionId);
            });

        return { ok: true, sessionId };
    }

    /** Asks a session to stop. False when no session is known by that id. */
    stop(sessionId: string): boolean {
        const session = this.#sessions.get(sessionId);
        if (session === undefined) return false;
        session.stop();
        return true;
    }

    /** Stops everything. Used when the window owning these sessions is going away. */
    stopAll(): void {
        for (const session of this.#sessions.values()) session.stop();
    }

    activeSessionIds(): readonly string[] {
        return [...this.#sessions.keys()];
    }

    phaseOf(sessionId: string): DownloaderPhase | null {
        return this.#sessions.get(sessionId)?.phase() ?? null;
    }

    /** The running session, so a status call can report its arguments without holding a reference. */
    sessionOf(sessionId: string): DownloaderSession | null {
        return this.#sessions.get(sessionId) ?? null;
    }
}

/**
 * The port the proxy will listen on, from the settings or from the tool's own default.
 *
 * Parsed leniently because the stored value is held as text exactly as somebody typed it, and this
 * number is only ever used to write a sentence telling them where to point their game. The
 * validation that decides whether the value is acceptable at all lives in
 * `validateDownloaderSettings`, which has already run by the time a session exists.
 */
function proxyPortOf(settings: DownloaderSettings): number {
    const raw = settings.options["proxyPort"];
    if (typeof raw === "number" && Number.isInteger(raw)) return raw;
    if (typeof raw === "string") {
        const parsed = Number(raw.trim());
        if (Number.isInteger(parsed) && parsed > 0) return parsed;
    }
    return DEFAULT_PROXY_PORT;
}

/**
 * The device code and its URL out of the `MSA_CODE` payload.
 *
 * Both fields have to be present and non-empty, because a sign-in event carrying a code and no URL
 * puts a person in front of a code with nowhere to type it.
 */
function parseSignInMarker(json: string): { code: string; url: string } | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch {
        return null;
    }
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    const code = record["code"];
    const url = record["url"];
    if (typeof code !== "string" || code === "") return null;
    if (typeof url !== "string" || url === "") return null;
    return { code, url };
}

const defaultSpawn: SpawnDownloader = (command, args, options) =>
    nodeSpawn(command, [...args], {
        cwd: options.cwd,
        env: options.env,
        // Explicit rather than inherited, for the reason `../render/runner.ts` gives: the tool
        // reads nothing from stdin in this mode, and leaving it attached to the app's own would let
        // a child block on a terminal that is not there. `windowsHide` keeps a console window from
        // flashing up on Windows, and there is no shell, so the process tree is one JVM.
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
    });

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
