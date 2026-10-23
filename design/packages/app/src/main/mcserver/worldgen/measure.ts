import { lstat, opendir, open } from 'node:fs/promises';
import { join } from 'node:path';
import { inspectWorldFolder } from '../../world/inspect.js';

/** Counts only allocated Anvil locations, never an assumed radius. */
export async function measureGeneratedWorld(folder: string): Promise<{ chunkCount: number; bytes: number }> {
    const listing = await inspectWorldFolder(folder);
    if (!listing.entries.some(entry => entry.path === 'level.dat')) throw new Error('The server did not produce level.dat.');
    let bytes = 0;
    let chunkCount = 0;
    const walk = async (directory: string): Promise<void> => {
        for await (const entry of await opendir(directory)) {
            const path = join(directory, entry.name);
            const info = await lstat(path);
            if (info.isSymbolicLink()) throw new Error('Generated world contains an unexpected symbolic link.');
            if (info.isDirectory()) await walk(path);
            else if (info.isFile()) {
                bytes += info.size;
                if (entry.name.endsWith('.mca') && directory.endsWith('region')) {
                    const file = await open(path, 'r');
                    try {
                        const locations = Buffer.alloc(4096);
                        const read = await file.read(locations, 0, locations.length, 0);
                        if (read.bytesRead !== locations.length) throw new Error('Truncated region location table.');
                        for (let offset = 0; offset < locations.length; offset += 4) if (locations.readUInt32BE(offset) !== 0) chunkCount++;
                    } finally { await file.close(); }
                }
            }
        }
    };
    await walk(folder);
    if (chunkCount === 0) throw new Error('No generated chunks were found after the server stopped.');
    return { chunkCount, bytes };
}

