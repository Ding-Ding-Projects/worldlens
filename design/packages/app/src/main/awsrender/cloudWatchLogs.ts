/**
 * The tail of a running render's log, out of CloudWatch.
 *
 * The Actions route gets a log by downloading the whole job log and keeping the last N
 * lines. CloudWatch can do better: it will return the last N events directly, so a tail
 * of a render that has been going for an hour costs the same as one that just started.
 */
import type { ProcessRunOptions } from "../cirender/gh.js";
import { AwsCredentialError } from "./credentialBroker.js";
import type { AwsCliAccountLease } from "./credentialBroker.js";

/** The default number of lines a tail returns, matching the Actions route's own. */
export const LOG_TAIL_LINES = 40;

/** The log group AWS Batch writes container output to unless told otherwise. */
export const DEFAULT_BATCH_LOG_GROUP = "/aws/batch/job";

interface LogEventsAnswer {
    readonly events?: readonly { readonly message?: string; readonly timestamp?: number }[];
}

export interface LogTailRequest {
    readonly lease: AwsCliAccountLease;
    readonly logGroup?: string | undefined;
    readonly logStream: string;
    readonly maxLines?: number | undefined;
    readonly signal?: AbortSignal | undefined;
}

/**
 * The last few lines a job logged, or null when it has logged nothing yet.
 *
 * Null rather than an empty string, and the difference matters to the surface: a job that
 * has not written anything yet is normal and needs no explanation, while an empty log on
 * a finished job is a real thing to be puzzled by.
 */
export async function readLogTail(request: LogTailRequest): Promise<string | null> {
    const maxLines = request.maxLines ?? LOG_TAIL_LINES;
    try {
        const answer = await request.lease.json<LogEventsAnswer>(
            [
                "logs",
                "get-log-events",
                "--log-group-name",
                request.logGroup ?? DEFAULT_BATCH_LOG_GROUP,
                "--log-stream-name",
                request.logStream,
                "--limit",
                String(maxLines),
                // Without this the API returns the *oldest* events, which for a long
                // render is the container starting up rather than whatever it is doing
                // now - the exact opposite of what a tail is for.
                "--start-from-head",
                "false",
            ],
            { signal: request.signal },
        );

        const events = answer.events ?? [];
        if (events.length === 0) {
            return null;
        }
        const lines = events
            .map((event) => event.message ?? "")
            .map((line) => line.replace(/\s+$/, ""))
            .filter((line) => line.length > 0);
        return lines.length > 0 ? lines.join("\n") : null;
    } catch (error) {
        if (error instanceof AwsCredentialError && error.code === "refused") {
            const text = error.message.toLowerCase();
            if (text.includes("resourcenotfound") || text.includes("does not exist")) {
                // The stream is created when the container first writes. Not yet existing
                // is the ordinary early state, not a failure worth surfacing.
                return null;
            }
        }
        throw error;
    }
}

/** A console address for one log stream, so a person can read the whole thing themselves. */
export function logStreamConsoleUrl(options: {
    readonly region: string;
    readonly logGroup?: string | undefined;
    readonly logStream: string;
}): string {
    const group = encodeURIComponent(options.logGroup ?? DEFAULT_BATCH_LOG_GROUP);
    const stream = encodeURIComponent(options.logStream);
    return (
        `https://${options.region}.console.aws.amazon.com/cloudwatch/home` +
        `?region=${options.region}#logsV2:log-groups/log-group/${group}/log-events/${stream}`
    );
}

export type { ProcessRunOptions };
