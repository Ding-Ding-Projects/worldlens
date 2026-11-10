import type { Database, SqlJsStatic } from "sql.js";
import { ACTION_CODES, type BlockChange, type ChangeAction, type ChangeFilter } from "./coreprotectModel.js";

/**
 * Reads a CoreProtect SQLite database (`plugins/CoreProtect/database.db`) entirely on this
 * computer, in the page, through SQLite compiled to WebAssembly. Nothing is uploaded and the
 * file is never written: it is opened from a copy in memory.
 *
 * CoreProtect names its tables with a configurable prefix (`co_` by default), so the prefix is
 * found from the block table rather than assumed.
 */

export const MAX_FILE_BYTES = 1024 * 1024 * 1024;
/** The most rows one query returns; the inspector says when a filter would return more. */
export const ROW_LIMIT = 200_000;

export interface CoreProtectMeta {
    readonly prefix: string;
    readonly worlds: readonly string[];
    readonly users: readonly string[];
    readonly blockRows: number;
    readonly first: number | null;
    readonly last: number | null;
}

let engine: Promise<SqlJsStatic> | null = null;

/** Loads SQLite once. The WebAssembly file ships with the app; nothing is fetched from elsewhere. */
export function loadEngine(locate?: (file: string) => string): Promise<SqlJsStatic> {
    engine ??= (async () => {
        const init = (await import("sql.js")).default;
        if (locate) return await init({ locateFile: locate });
        const wasm = (await import("sql.js/dist/sql-wasm.wasm?url")).default;
        return await init({ locateFile: () => wasm });
    })();
    return engine;
}

export class CoreProtectDb {
    private constructor(
        private readonly db: Database,
        readonly meta: CoreProtectMeta,
    ) {}

    /** Opens the bytes of a database file, refusing anything that is not a CoreProtect database. */
    static async open(bytes: Uint8Array, sql?: SqlJsStatic): Promise<CoreProtectDb> {
        if (bytes.byteLength > MAX_FILE_BYTES) throw new Error("This file is larger than 1 GB, which is more than the inspector can hold in memory.");
        if (bytes.byteLength < 100 || new TextDecoder().decode(bytes.subarray(0, 15)) !== "SQLite format 3") throw new Error("This is not an SQLite database. Choose CoreProtect's database.db.");
        const SQL = sql ?? (await loadEngine());
        const db = new SQL.Database(bytes);
        try {
            const tables = db.exec("SELECT name FROM sqlite_master WHERE type = 'table'")[0]?.values.map((r) => String(r[0])) ?? [];
            const block = tables.find((t) => t.endsWith("block") && tables.includes(`${t.slice(0, -5)}user`) && tables.includes(`${t.slice(0, -5)}world`));
            if (!block) throw new Error("This SQLite database has no CoreProtect block, user and world tables.");
            const prefix = block.slice(0, -5);
            if (!/^[A-Za-z0-9_]*$/u.test(prefix)) throw new Error("The table prefix in this database is not one CoreProtect writes.");
            const one = (q: string): unknown => db.exec(q)[0]?.values[0]?.[0] ?? null;
            const list = (q: string): string[] => db.exec(q)[0]?.values.map((r) => String(r[0])) ?? [];
            const meta: CoreProtectMeta = {
                prefix,
                worlds: list(`SELECT world FROM ${prefix}world ORDER BY world`),
                users: list(`SELECT DISTINCT u.user FROM ${prefix}block b JOIN ${prefix}user u ON u.id = b.user ORDER BY u.user COLLATE NOCASE`),
                blockRows: Number(one(`SELECT COUNT(*) FROM ${prefix}block`) ?? 0),
                first: (one(`SELECT MIN(time) FROM ${prefix}block`) as number | null) ?? null,
                last: (one(`SELECT MAX(time) FROM ${prefix}block`) as number | null) ?? null,
            };
            return new CoreProtectDb(db, meta);
        } catch (error) {
            db.close();
            throw error;
        }
    }

    /** Block changes matching a filter, oldest first, up to `limit`; `more` says whether rows were left out. */
    query(filter: ChangeFilter, limit = ROW_LIMIT): { readonly changes: BlockChange[]; readonly more: boolean } {
        const p = this.meta.prefix;
        const where: string[] = [];
        const params: (string | number)[] = [];
        if (filter.world !== null) {
            where.push("w.world = ?");
            params.push(filter.world);
        }
        if (filter.from !== null) {
            where.push("b.time >= ?");
            params.push(Math.floor(filter.from));
        }
        if (filter.to !== null) {
            where.push("b.time <= ?");
            params.push(Math.ceil(filter.to));
        }
        if (filter.users.length) {
            where.push(`u.user IN (${filter.users.map(() => "?").join(",")})`);
            params.push(...filter.users);
        }
        const codes = Object.entries(ACTION_CODES).filter(([, a]) => filter.actions.includes(a)).map(([code]) => Number(code));
        where.push(codes.length ? `b.action IN (${codes.join(",")})` : "0");
        if (filter.material) {
            where.push("m.material LIKE ? ESCAPE '\\'");
            params.push(`%${filter.material.replace(/[\\%_]/gu, (c) => `\\${c}`)}%`);
        }
        if (!filter.includeRolledBack) where.push("b.rolled_back = 0");
        const statement = this.db.prepare(
            `SELECT b.time, u.user, w.world, b.x, b.y, b.z, COALESCE(m.material, '#' || b.type), b.action, b.rolled_back
             FROM ${p}block b
             LEFT JOIN ${p}user u ON u.id = b.user
             LEFT JOIN ${p}world w ON w.id = b.wid
             LEFT JOIN ${p}material_map m ON m.id = b.type
             WHERE ${where.join(" AND ")}
             ORDER BY b.time, b.rowid
             LIMIT ?`,
        );
        try {
            statement.bind([...params, limit + 1]);
            const changes: BlockChange[] = [];
            while (statement.step()) {
                const r = statement.get();
                if (changes.length === limit) return { changes, more: true };
                changes.push({
                    time: Number(r[0]),
                    user: String(r[1] ?? "?"),
                    world: String(r[2] ?? "?"),
                    x: Number(r[3]),
                    y: Number(r[4]),
                    z: Number(r[5]),
                    material: String(r[6]),
                    action: ACTION_CODES[Number(r[7])] as ChangeAction,
                    rolledBack: Number(r[8]) !== 0,
                });
            }
            return { changes, more: false };
        } finally {
            statement.free();
        }
    }

    close(): void {
        this.db.close();
    }
}
