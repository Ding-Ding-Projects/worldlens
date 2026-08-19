import {
    SqlRecoverableError,
    SqlUniqueViolationError,
    type SqlConnectionHandle,
    type SqlDriverAdapter,
    type SqlExecuteResult,
    type SqlParam,
    type SqlRow,
} from "../Database.js";
import type { SqlConnectionOptions } from "../Dialect.js";
import { loadOptionalModule } from "./loadOptionalModule.js";

// Type-only: erased entirely at build time (this file's runtime code never imports
// "pg" directly — see `loadOptionalModule`), so this does not defeat the point of the
// dynamic import below. `Pool["connect"]` is overloaded (a no-callback promise form and
// a callback form); indexing into it with `ReturnType` picks the *last* overload rather
// than the one this file actually calls, which is why `PoolClient` is imported by name
// instead of derived.
import type { Pool as PgPoolType, PoolClient as PgPoolClient } from "pg";

type PgModule = typeof import("pg");
type PgPool = PgPoolType;

/** Postgres error codes (SQLSTATE) this port treats as transient. */
const RECOVERABLE_SQLSTATES = new Set([
    "57P01", // admin_shutdown
    "57P02", // crash_shutdown
    "57P03", // cannot_connect_now
]);
const RECOVERABLE_NODE_CODES = new Set(["ECONNRESET", "ETIMEDOUT"]);
/** Postgres SQLSTATE for a unique-constraint violation. */
const UNIQUE_VIOLATION_SQLSTATE = "23505";

/**
 * Exported for its own test (`PostgresDriver.test.ts`): a reachable server is not
 * always available where this runs, so the classification is checked directly there
 * against synthetic errors carrying the exact SQLSTATE codes Postgres documents for a
 * unique-constraint violation and a few transient shutdown states.
 * `SqlStorage.realServer.test.ts` is the opt-in file that exercises this port against a
 * real PostgreSQL server when one is configured.
 */
export function mapPostgresError(ex: unknown): Error {
    if (ex instanceof Error) {
        const code = (ex as Error & { code?: string }).code;
        if (code === UNIQUE_VIOLATION_SQLSTATE) return new SqlUniqueViolationError(ex.message, { cause: ex });
        if (code !== undefined && (RECOVERABLE_SQLSTATES.has(code) || RECOVERABLE_NODE_CODES.has(code))) {
            return new SqlRecoverableError(ex.message, { cause: ex });
        }
        return ex;
    }
    return new Error(String(ex));
}

function toBindValue(value: SqlParam): number | string | boolean | Buffer | null {
    if (value instanceof Uint8Array && !Buffer.isBuffer(value)) {
        return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    }
    return value;
}

/**
 * node-postgres uses `$1, $2, ...` positional placeholders, not JDBC's `?`. Every
 * `*Statement()` method in `PostgreSQLCommandSet` is transcribed byte-for-byte from
 * upstream's Java (which writes `?`, same as every other dialect, because JDBC's
 * `PreparedStatement` accepts `?` regardless of the underlying database), so the
 * translation happens here, at the driver boundary, rather than by changing the
 * statement text and losing that fidelity. Safe because none of this port's SQL text
 * ever contains a literal `?` inside a string constant.
 */
export function toPostgresPlaceholders(sql: string): string {
    let n = 0;
    return sql.replace(/\?/g, () => `$${String(++n)}`);
}

/**
 * `jdbc:postgresql://host:port/database?opt=val` differs from `pg`'s own
 * `postgres(ql)://...` connection string only in its `jdbc:` prefix. Parse the URL into
 * a plain client config instead of passing `connectionString` alongside properties:
 * node-postgres parses `connectionString` *after* merging the object and silently
 * overwrites an explicitly supplied password with the URL's empty password field.
 */
export function parsePostgresConnectionOptions(
    options: SqlConnectionOptions,
): Record<string, unknown> {
    const connectionString = options.connectionUrl.replace(/^jdbc:/, "");
    const parsed = new URL(connectionString);
    const config: Record<string, unknown> = {
        host: parsed.hostname,
        port: parsed.port === "" ? undefined : Number(parsed.port),
        database: parsed.pathname.length > 1 ? decodeURIComponent(parsed.pathname.slice(1)) : undefined,
        max: options.maxConnections > 0 ? options.maxConnections : 10,
    };
    if (parsed.username !== "") config.user = decodeURIComponent(parsed.username);
    if (parsed.password !== "") config.password = decodeURIComponent(parsed.password);
    for (const [key, value] of parsed.searchParams.entries()) config[key] = value;
    // `connection-properties` (typically user/password) overrides anything embedded in
    // the connection string, matching the same precedence the MySQL adapter uses. The
    // config file boundary is untyped at runtime, so normalize authentication values to
    // strings before node-postgres sees them; SCRAM rejects undefined/null/non-string
    // passwords with a misleading handshake error rather than naming the bad property.
    const properties = options.connectionProperties;
    Object.assign(config, properties);
    if (properties.user !== undefined) config.user = String(properties.user);
    if (properties.password !== undefined) config.password = String(properties.password);
    return config;
}

class PostgresDriverAdapter implements SqlDriverAdapter {
    private readonly pool: PgPool;
    private closed = false;

    constructor(pool: PgPool) {
        this.pool = pool;
    }

    async getConnection(): Promise<SqlConnectionHandle> {
        let client: PgPoolClient;
        try {
            client = await this.pool.connect();
        } catch (ex) {
            throw mapPostgresError(ex);
        }
        await client.query("BEGIN");

        return {
            query: async (sql, params) => {
                try {
                    const result = await client.query({
                        text: toPostgresPlaceholders(sql),
                        values: params.map(toBindValue),
                        rowMode: "array",
                    });
                    return result.rows as unknown as SqlRow[];
                } catch (ex) {
                    throw mapPostgresError(ex);
                }
            },
            execute: async (sql, params): Promise<SqlExecuteResult> => {
                try {
                    const result = await client.query(toPostgresPlaceholders(sql), params.map(toBindValue));
                    return { affectedRows: result.rowCount ?? 0 };
                } catch (ex) {
                    throw mapPostgresError(ex);
                }
            },
            commit: async () => {
                await client.query("COMMIT");
            },
            rollback: async () => {
                await client.query("ROLLBACK");
            },
            release: () => {
                client.release();
                return Promise.resolve();
            },
        };
    }

    async close(): Promise<void> {
        if (this.closed) return;
        this.closed = true;
        await this.pool.end();
    }
}

export async function createPostgresDriverAdapter(
    options: SqlConnectionOptions,
): Promise<SqlDriverAdapter> {
    const pg = await loadOptionalModule<PgModule>("pg", "pg", "PostgreSQL");
    const pool = new pg.Pool(parsePostgresConnectionOptions(options));
    return new PostgresDriverAdapter(pool);
}
