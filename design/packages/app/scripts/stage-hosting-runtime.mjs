import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
export async function stageHostingRuntime(output = join(appRoot, 'dist', 'bundled', 'hosting')) {
    const manifest = JSON.parse(readFileSync(join(appRoot, 'bundled-runtimes.manifest.json'), 'utf8')).hosting;
    const packageRoot = join(dirname(fileURLToPath(import.meta.url)), 'hosting-runtime');
    const workerSource = join(appRoot, 'src', 'main', 'mcserver', 'bots', 'auth-worker.mjs');
    if (existsSync(join(output, 'receipt.json'))) {
        try {
            const prior = verifyHostingRuntime(output);
            if (Array.isArray(prior.licenses) && prior.botLockSha256 === hash(readFileSync(join(packageRoot, 'package-lock.json'))) && prior.workerSha256 === hash(readFileSync(workerSource)) && JSON.stringify(prior.archives) === JSON.stringify(manifest.platforms)) {
                prior.sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: appRoot, encoding: 'utf8' }).trim();
                prior.stagingScriptSha256 = hash(readFileSync(fileURLToPath(import.meta.url)));
                writeFileSync(join(output, 'receipt.json'), JSON.stringify(prior, null, 2) + '\n');
                return prior;
            }
        } catch { /* Rebuild corrupted or obsolete staging from verified inputs. */ }
    }
    const cache = join(appRoot, 'dist', 'bundled-cache', 'hosting');
    mkdirSync(cache, { recursive: true });
    // Archive digests remain checked whenever extraction uses the cached archives.
    for (const [platform, pin] of Object.entries(manifest.platforms)) {
        const archive = join(cache, pin.asset);
        if (!existsSync(archive) || hash(readFileSync(archive)) !== pin.sha256) {
            const response = await fetch(`https://nodejs.org/dist/v${manifest.nodeVersion}/${pin.asset}`);
            if (!response.ok) throw new Error(`Node archive download returned ${response.status}`);
            const bytes = Buffer.from(await response.arrayBuffer());
            if (hash(bytes) !== pin.sha256) throw new Error('Node archive checksum mismatch');
            writeFileSync(archive, bytes);
        }
        const extract = join(cache, platform);
        rmSync(extract, { recursive: true, force: true }); mkdirSync(extract);
        const archiveRoot = pin.asset.replace(/\.(zip|tar\.xz)$/, '');
        execFileSync(process.platform === 'win32' ? join(process.env.SystemRoot || 'C:/Windows', 'System32', 'tar.exe') : 'tar', ['-xf', archive, '-C', extract, `${archiveRoot}/${pin.executable}`, `${archiveRoot}/LICENSE`]);
        const source = join(extract, pin.asset.replace(/\.(zip|tar\.xz)$/, ''));
        if (!existsSync(join(source, pin.executable))) throw new Error('Node archive has no executable');
        const target = join(output, 'node', platform);
        rmSync(target, { recursive: true, force: true }); mkdirSync(dirname(target), { recursive: true });
        cpSync(source, target, { recursive: true, dereference: true });
    }
    const install = join(cache, 'bots'); mkdirSync(install, { recursive: true });
    for (const name of ['package.json', 'package-lock.json']) cpSync(join(packageRoot, name), join(install, name));
    const npm = process.env.npm_execpath || join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
    if (!existsSync(npm)) throw new Error('The verified Node installation has no npm CLI');
    execFileSync(process.execPath, [npm, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--prefix', install], { stdio: 'inherit' });
    const bots = join(output, 'bots'); rmSync(bots, { recursive: true, force: true });
    cpSync(install, bots, { recursive: true, dereference: true });
    cpSync(join(appRoot, 'src', 'main', 'mcserver', 'bots', 'auth-worker.mjs'), join(bots, 'auth-worker.mjs'));
    const require = createRequire(join(bots, 'auth-worker.mjs'));
    if (require('prismarine-auth/package.json').version !== '3.1.1' || typeof require('prismarine-auth').Authflow !== 'function' || typeof require('mineflayer').createBot !== 'function' || typeof require('mineflayer-pathfinder').pathfinder !== 'function') throw new Error('Staged bot runtime resolution failed');
    const inventory = files(output).filter(entry => entry.path !== 'receipt.json');
    const licenses = inventory.filter(entry => entry.path.endsWith('/package.json')).flatMap(entry => {
        const metadata = JSON.parse(readFileSync(join(output, entry.path), 'utf8'));
        if (!metadata.name || !metadata.version) return [];
        const parent = entry.path.slice(0, -'package.json'.length);
        return [{ name: metadata.name, version: metadata.version, license: metadata.license ?? 'not declared', files: inventory.filter(file => file.path.startsWith(parent) && !file.path.slice(parent.length).includes('/') && /^(licen[cs]e|copying|copyright|notice)([.-]|$)/i.test(file.path.slice(parent.length))).map(file => file.path) }];
    });
    licenses.push({ name: 'Node.js', version: manifest.nodeVersion, license: 'See bundled upstream license inventory', files: ['node/win32-x64/LICENSE', 'node/linux-x64/LICENSE'] });
    rmSync(join(output, 'receipt.json'), { force: true });
    const receipt = { schemaVersion: 1, stagingScriptSha256: hash(readFileSync(fileURLToPath(import.meta.url))), sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: appRoot, encoding: 'utf8' }).trim(), workerSha256: hash(readFileSync(workerSource)), nodeVersion: manifest.nodeVersion, checksumSource: manifest.checksumSource, archives: manifest.platforms, botLockSha256: hash(readFileSync(join(packageRoot, 'package-lock.json'))), baritoneStaged: false, licenses, files: inventory };
    writeFileSync(join(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
    verifyHostingRuntime(output);
    return receipt;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await stageHostingRuntime();
