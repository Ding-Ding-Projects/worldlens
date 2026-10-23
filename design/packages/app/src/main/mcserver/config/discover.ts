import { posix } from 'node:path';
import { fail, ok, type Answer, type ServerTransport } from '../transport/types.js';
import { formatFor } from './describe.js';
export interface ConfigInventory { readonly files: readonly string[]; readonly unavailable: readonly { path: string; message: string }[]; readonly truncated: boolean }
/** Bounded recursive discovery, without following symbolic links. */
export async function discoverConfigFiles(transport: ServerTransport, roots: readonly string[] = ['.'], limits = { depth: 8, entries: 10000 }): Promise<Answer<ConfigInventory>> {
    if (!Number.isSafeInteger(limits.depth) || limits.depth < 0 || limits.depth > 32 || !Number.isSafeInteger(limits.entries) || limits.entries < 1 || limits.entries > 100000) return fail('invalid-request', 'Invalid discovery limits.');
    const files = new Set<string>();
    const visited = new Set<string>();
    const unavailable: { path: string; message: string }[] = [];
    let count = 0;
    let truncated = false;
    const walk = async (directory: string, depth: number): Promise<void> => {
        const normalized = posix.normalize(directory.replace(/\\/g, '/'));
        if (visited.has(normalized)) return;
        visited.add(normalized);
        const listing = await transport.fileList(normalized);
        if (!listing.ok) { unavailable.push({ path: normalized, message: listing.failure.message }); return; }
        for (const entry of listing.value) {
            if (++count > limits.entries) { truncated = true; return; }
            if (!entry.name || entry.name === '.' || entry.name === '..' || /[\\/\x00]/.test(entry.name)) { unavailable.push({ path: normalized, message: 'Unsafe directory entry excluded.' }); continue; }
            const path = posix.join(normalized, entry.name);
            if (entry.kind === 'file' && formatFor(path) !== 'text') files.add(path);
            else if (entry.kind === 'file' && /\.(conf|cfg|ini|txt)$/i.test(entry.name)) unavailable.push({path,message:'This configuration format has no safe structured parser yet.'});
            else if (entry.kind === 'directory' && !['world', 'world_nether', 'world_the_end', 'logs', 'cache', 'libraries', 'versions', 'backups', '.git'].includes(entry.name)) {
                if (depth < limits.depth) await walk(path, depth + 1);
                else truncated = true;
            }
        }
    };
    for (const root of roots) {
        if (posix.isAbsolute(root.replace(/\\/g,'/')) || root.split(/[\\/]/).includes('..') || /^[a-z]:/i.test(root)) return fail('out-of-scope', 'Discovery roots must stay relative to the server.');
        await walk(root, 0);
    }
    return ok({ files: [...files].sort(), unavailable, truncated });
}
