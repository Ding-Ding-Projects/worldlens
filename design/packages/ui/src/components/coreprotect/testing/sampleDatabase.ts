import type { SqlJsStatic } from "sql.js";

/**
 * Builds a small database with CoreProtect's own table layout (from its Database.java), for
 * tests and screenshots. The rows describe a made-up afternoon on a test server: a house
 * built, a tree cut down, a creeper blast and a rolled-back grief.
 */
export function sampleDatabase(SQL: SqlJsStatic, options: { readonly prefix?: string; readonly start?: number } = {}): Uint8Array {
    const p = options.prefix ?? "co_";
    const start = options.start ?? 1_762_700_000;
    const db = new SQL.Database();
    db.run(`CREATE TABLE ${p}block (time INTEGER, user INTEGER, wid INTEGER, x INTEGER, y INTEGER, z INTEGER, type INTEGER, data INTEGER, meta BLOB, blockdata BLOB, action INTEGER, rolled_back INTEGER)`);
    db.run(`CREATE TABLE ${p}user (id INTEGER PRIMARY KEY ASC, time INTEGER, user TEXT, uuid TEXT)`);
    db.run(`CREATE TABLE ${p}world (id INTEGER, world TEXT)`);
    db.run(`CREATE TABLE ${p}material_map (id INTEGER, material TEXT)`);
    db.run(`INSERT INTO ${p}world VALUES (1, 'world'), (2, 'world_nether')`);
    db.run(`INSERT INTO ${p}user VALUES (1, ${start}, 'Builder_Amy', 'a'), (2, ${start}, 'LumberLee', 'b'), (3, ${start}, '#creeper', NULL), (4, ${start}, 'Griefer99', 'c')`);
    db.run(`INSERT INTO ${p}material_map VALUES (1, 'minecraft:oak_planks'), (2, 'minecraft:oak_log'), (3, 'minecraft:grass_block'), (4, 'minecraft:glass'), (5, 'minecraft:netherrack')`);
    const insert = db.prepare(`INSERT INTO ${p}block (time, user, wid, x, y, z, type, data, action, rolled_back) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`);
    let t = start;
    // A 5 by 5 floor and four walls of planks.
    for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++) insert.run([(t += 3), 1, 1, 100 + x, 64, -40 + z, 1, 1, 0]);
    for (let y = 65; y < 68; y++) for (let x = 0; x < 5; x++) {
        insert.run([(t += 2), 1, 1, 100 + x, y, -40, 1, 1, 0]);
        insert.run([(t += 2), 1, 1, 100 + x, y, -36, 4, 1, 0]);
    }
    // A tree cut down.
    for (let y = 64; y < 70; y++) insert.run([(t += 4), 2, 1, 120, y, -30, 2, 0, 0]);
    // A creeper blast.
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (dx * dx + dz * dz <= 5) insert.run([t + 1, 3, 1, 90 + dx, 63, -20 + dz, 3, 0, 0]);
    t += 60;
    // A grief that was rolled back, and a door click.
    for (let x = 0; x < 5; x++) insert.run([(t += 1), 4, 1, 100 + x, 65, -40, 1, 0, 1]);
    insert.run([(t += 5), 1, 1, 102, 65, -40, 1, 2, 0]);
    // Something in the nether.
    insert.run([(t += 30), 1, 2, 10, 40, 10, 5, 0, 0]);
    insert.free();
    const bytes = db.export();
    db.close();
    return bytes;
}
