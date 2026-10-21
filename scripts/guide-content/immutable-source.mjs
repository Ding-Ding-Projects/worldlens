import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
const LIMITS = {files:10000,totalBytes:512*1024*1024};
/** All object reads use the same isolated, offline configuration and bounded process. */
function gitBytes(root, args, maxBuffer = 16 * 1024 * 1024) {
    const env = {};
    for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'HOME', 'USERPROFILE', 'TMP', 'TEMP', 'LANG', 'LC_ALL']) {
        if (process.env[key] !== undefined) env[key] = process.env[key];
    }
    Object.assign(env, {
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: resolve(tmpdir(), 'guide-unused-config-' + randomUUID()),
        GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0',
        GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1',
    });
    return execFileSync('git', ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=', '-c', 'protocol.allow=never', ...args], {
        cwd: root, env, timeout: 15000, killSignal: 'SIGKILL', maxBuffer,
        windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    });
}
export const git = (root, args) => gitBytes(root, args).toString('utf8').trim();
/** Read immutable tracked blobs only; working files, ignored files and symlinks are never inputs. */
export function objectSource(repository, revision, prefix = '', rooted = false) {
    if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('full-source-revision-required');
    const output = gitBytes(repository, ['ls-tree', '-r', ...(rooted ? ['-t'] : []), '-z', '-l', revision, ...(prefix ? ['--', prefix] : [])]).toString('utf8');
    const entries = new Map();
    for (const record of output.split('\0').filter(Boolean)) {
        const match = /^(\d+) (\w+) ([a-f0-9]+)\s+(\d+|-)\t([^]*)$/.exec(record);
        if (!match || (!rooted && (!['100644','100755'].includes(match[1]) || match[2] !== 'blob'))) throw new Error('unsupported-source-mode');
        const name = prefix ? match[5].slice(prefix.length + 1) : match[5];
        entries.set(name, { oid: match[3], size: Number(match[4]), mode: match[1], type: match[2] });
    }
    if (entries.size > LIMITS.files) throw new Error('file-limit');
    return {
        entry(name) { return entries.get(name.replace(/\/$/, '')); },
        files: [...entries.keys()].sort((a,b)=>a.localeCompare(b,'en')),
        size(name) { if (!entries.has(name)) throw new Error('untracked-source'); if (!['100644','100755'].includes(entries.get(name).mode)) throw new Error('unsupported-source-mode'); return entries.get(name).size; },
        read(name) { if (!entries.has(name)) throw new Error('untracked-source'); return gitBytes(repository, ['cat-file', 'blob', entries.get(name).oid], LIMITS.totalBytes); },
    };
}

