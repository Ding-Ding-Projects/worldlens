import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function files(root, directory = root) {
    return readdirSync(directory, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name)).flatMap((entry) => {
        const path = join(directory, entry.name);
        if (entry.isSymbolicLink()) throw new Error('Runtime tree must not contain symbolic links');
        return entry.isDirectory() ? files(root, path) : [{ path: relative(root, path).split(sep).join('/'), sha256: hash(readFileSync(path)) }];
    });
}
/** Diagnostic receipt consistency only. Use independent derivation for provenance. */
export function verifyHostingRuntime(root, { pins } = {}) {
    const receipt = JSON.parse(readFileSync(join(root, 'receipt.json'), 'utf8'));
    if (receipt.schemaVersion !== 1 || receipt.nodeVersion !== '22.20.0' || !Array.isArray(receipt.files) || receipt.files.length < 3) throw new Error('Invalid hosting runtime receipt');
    if (pins && JSON.stringify(receipt.archives) !== JSON.stringify(pins.platforms)) throw new Error('Hosting archive provenance does not match reviewed pins');
    if (new Set(receipt.files.map(entry => entry.path)).size !== receipt.files.length) throw new Error('Duplicate runtime receipt path');
    for (const entry of receipt.files) {
        if (typeof entry.path !== 'string' || (/[\\:]/.test(entry.path)) || entry.path.split('/').some(part => !part || part === '.' || part === '..') || entry.path.startsWith('/')) throw new Error('Invalid runtime receipt path');
        const path = join(root, entry.path);
        if (!statSync(path).isFile() || hash(readFileSync(path)) !== entry.sha256) throw new Error(`Hosting runtime integrity mismatch: ${entry.path}`);
    }
    for (const required of ['node/win32-x64/node.exe', 'node/linux-x64/bin/node', 'bots/auth-worker.mjs', 'bots/node_modules/mineflayer/index.js', 'bots/node_modules/prismarine-auth/index.js']) {
        if (!receipt.files.some(entry => entry.path === required)) throw new Error(`Missing hosting runtime receipt entry: ${required}`);
    }
    return receipt;
}
function sourceSnapshot() {
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: appRoot, encoding: 'utf8' }).trim();
    const read = (path) => execFileSync('git', ['show', `${revision}:design/packages/app/${path}`], { cwd: appRoot, maxBuffer: 4 * 1024 * 1024 });
    return {
        revision,
        manifest: JSON.parse(read('bundled-runtimes.manifest.json')).hosting,
        packageJson: read('scripts/hosting-runtime/package.json'),
        lock: read('scripts/hosting-runtime/package-lock.json'),
        worker: read('src/main/mcserver/bots/auth-worker.mjs'),
    };
}
async function verifiedArchive(cache, manifest, pin, offline) {
    const archive = join(cache, pin.asset);
    if (!existsSync(archive) || hash(readFileSync(archive)) !== pin.sha256) {
        if (offline) throw new Error('Verified Node archive cache is unavailable');
        const response = await fetch(`https://nodejs.org/dist/v${manifest.nodeVersion}/${pin.asset}`);
        if (!response.ok) throw new Error(`Node archive download returned ${response.status}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        if (hash(bytes) !== pin.sha256) throw new Error('Node archive checksum mismatch');
        writeFileSync(archive, bytes);
    }
    return archive;
}
function licenseInventory(root, inventory, version) {
    const licenses = inventory.filter(entry => entry.path.endsWith('/package.json')).flatMap(entry => {
        const metadata = JSON.parse(readFileSync(join(root, entry.path), 'utf8'));
        if (!metadata.name || !metadata.version) return [];
        const parent = entry.path.slice(0, -'package.json'.length);
        return [{ name: metadata.name, version: metadata.version, license: metadata.license ?? 'not declared', files: inventory.filter(file => file.path.startsWith(parent) && !file.path.slice(parent.length).includes('/') && /^(licen[cs]e|copying|copyright|notice)([.-]|$)/i.test(file.path.slice(parent.length))).map(file => file.path) }];
    });
    licenses.push({ name: 'Node.js', version, license: 'See bundled upstream license inventory', files: ['node/win32-x64/LICENSE', 'node/linux-x64/LICENSE'] });
    return licenses;
}
/** Always derive from independently verified acquisition, never from an output receipt. */
async function deriveRuntime(root, source, { offline = false } = {}) {
    const { manifest } = source;
    const cache = join(appRoot, 'dist', 'bundled-cache', 'hosting');
    mkdirSync(cache, { recursive: true });
    for (const [platform, pin] of Object.entries(manifest.platforms)) {
        const archive = await verifiedArchive(cache, manifest, pin, offline);
        const extract = join(root, 'node', platform);
        mkdirSync(extract, { recursive: true });
        const archiveRoot = pin.asset.replace(/\.(zip|tar\.xz)$/, '');
        execFileSync(process.platform === 'win32' ? join(process.env.SystemRoot || 'C:/Windows', 'System32', 'tar.exe') : 'tar', ['-xf', archive, '-C', extract, `${archiveRoot}/${pin.executable}`, `${archiveRoot}/LICENSE`]);
        const inner = join(extract, archiveRoot);
        if (!existsSync(join(inner, pin.executable))) throw new Error('Node archive has no executable');
        for (const name of readdirSync(inner)) renameSync(join(inner, name), join(extract, name));
        rmSync(inner, { recursive: true });
    }
    const bots = join(root, 'bots'); mkdirSync(bots);
    writeFileSync(join(bots, 'package.json'), source.packageJson);
    writeFileSync(join(bots, 'package-lock.json'), source.lock);
    const npm = [
        join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
        join(dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    ].find(existsSync);
    if (!npm) throw new Error('The verified Node installation has no npm CLI');
    // npm validates cached/downloaded tarballs against the immutable reviewed lock.
    execFileSync(process.execPath, [npm, 'ci', ...(offline ? ['--offline'] : []), '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', join(cache, 'npm'), '--prefix', bots], { stdio: 'inherit', timeout: 5 * 60 * 1000 });
    writeFileSync(join(bots, 'auth-worker.mjs'), source.worker);
    if (hash(readFileSync(join(bots, 'auth-worker.mjs'))) !== hash(source.worker)) throw new Error('Staged worker differs from trusted source');
    const require = createRequire(join(bots, 'auth-worker.mjs'));
    if (require('prismarine-auth/package.json').version !== '3.1.1' || typeof require('prismarine-auth').Authflow !== 'function' || typeof require('mineflayer').createBot !== 'function' || typeof require('mineflayer-pathfinder').pathfinder !== 'function') throw new Error('Staged bot runtime resolution failed');
    const inventory = files(root);
    const receipt = { schemaVersion: 1, stagingScriptSha256: hash(readFileSync(fileURLToPath(import.meta.url))), sourceCommit: source.revision, workerSha256: hash(source.worker), nodeVersion: manifest.nodeVersion, checksumSource: manifest.checksumSource, archives: manifest.platforms, botLockSha256: hash(source.lock), baritoneStaged: false, licenses: licenseInventory(root, inventory, manifest.nodeVersion), files: inventory };
    writeFileSync(join(root, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
    verifyHostingRuntime(root, { pins: manifest });
    return receipt;
}
/** Validate packaged bytes against a fresh derivation, not their mutable receipt. */
export async function assertHostingRuntimeProvenance(root) {
    const source = sourceSnapshot();
    const parent = join(appRoot, 'dist', 'bundled-cache', 'hosting'); mkdirSync(parent, { recursive: true });
    const scratch = mkdtempSync(join(parent, 'verify-'));
    try {
        const trusted = await deriveRuntime(scratch, source, { offline: true });
        const observed = files(root).filter(entry => entry.path !== 'receipt.json');
        const expectedPaths = new Set(trusted.files.map(entry => entry.path));
        if (observed.length !== trusted.files.length || observed.some(entry => !expectedPaths.has(entry.path))) throw new Error('Unexpected hosting runtime files');
        const claim = verifyHostingRuntime(root, { pins: source.manifest });
        if (claim.sourceCommit !== source.revision || claim.workerSha256 !== hash(source.worker) || claim.botLockSha256 !== hash(source.lock)) throw new Error('Hosting source association does not match trusted source');
        for (const entry of trusted.files) {
            if (hash(readFileSync(join(root, entry.path))) !== entry.sha256) throw new Error(`Hosting provenance mismatch: ${entry.path}`);
        }
        const stagedWorker = hash(readFileSync(join(root, 'bots', 'auth-worker.mjs')));
        if (stagedWorker !== hash(source.worker)) throw new Error('Staged worker differs from trusted source');
        return trusted;
    } finally { rmSync(scratch, { recursive: true, force: true }); }
}
export async function stageHostingRuntime(output = join(appRoot, 'dist', 'bundled', 'hosting')) {
    const source = sourceSnapshot();
    mkdirSync(dirname(output), { recursive: true });
    const scratch = mkdtempSync(join(dirname(output), '.hosting-stage-'));
    const backup = `${scratch}-previous`;
    try {
        const receipt = await deriveRuntime(scratch, source);
        const existed = existsSync(output);
        if (existed) renameSync(output, backup);
        try { renameSync(scratch, output); }
        catch (error) { if (existed) renameSync(backup, output); throw error; }
        if (existed) rmSync(backup, { recursive: true, force: true });
        return receipt;
    } finally { if (existsSync(scratch)) rmSync(scratch, { recursive: true, force: true }); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await stageHostingRuntime();
