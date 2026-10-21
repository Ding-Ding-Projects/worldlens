/** Immutable repository metadata and the explicitly reviewed historical-image adapter. */
import { resolve } from 'node:path';
import { objectSource, objectDatabaseSource, git } from './immutable-source.mjs';
const ORIGIN = 'https://github.com/Ding-Ding-Projects/worldlens';
const images = [
    ['82139b484903d81997e11306292983dbd55a608f','docs/screenshots/pages-parity-appearance-414x844-bilingual.png','881aaaaf6f31255ac46c6d76cb3a7275df7cb8bc'],
    ['5a6dd201e4aa1ba5eb41a044017c39c79ff36a31','docs/screenshots/pages-parity-schedule-390x844-bilingual.png','f3615bf8adb0888f97b75beec8e3fd1e90881df5'],
    ['5a6dd201e4aa1ba5eb41a044017c39c79ff36a31','docs/screenshots/pages-parity-command-390x844-bilingual-2x.png','4b2fff8c02af64b1e3c0736cedfbdf9e69423ba7'],
];
export const HISTORICAL_IMAGES = new Map(images.map(([revision,path,oid]) => [
    `https://raw.githubusercontent.com/Ding-Ding-Projects/worldlens/${revision}/${path}`, {revision,path,oid},
]));
const encoded = path => path.split('/').map(encodeURIComponent).join('/');
export function createRepositoryResolver(repository, revision) {
    const source = objectSource(repository, revision, '', true);
    const history = new Map();
    return {
        source,
        reference(path) {
            let entry = source.entry(path), sourceRevision = revision, origin = ORIGIN, sourcePath = path;
            if (!entry && path.startsWith('vendor/BlueMap/')) {
                const pin = source.entry('vendor/BlueMap');
                if (!pin || pin.mode !== '160000') throw new Error('missing-source-reference');
                const configured = git(repository,['config','--blob',revision+':.gitmodules','--get-all','submodule.vendor/BlueMap.url']);
                if (configured !== 'https://github.com/BlueMap-Minecraft/BlueMap') throw new Error('unreviewed-source-origin');
                const admin = resolve(repository, git(repository,['rev-parse','--git-common-dir']), 'modules/vendor/BlueMap');
                const nested = objectDatabaseSource(admin, pin.oid, '', true);
                sourcePath = path.slice('vendor/BlueMap/'.length);
                entry = nested.entry(sourcePath); sourceRevision = pin.oid;
                origin = 'https://github.com/BlueMap-Minecraft/BlueMap';
            }
            if (!entry || !['100644','100755','040000'].includes(entry.mode)) throw new Error('missing-or-unsafe-source-reference');
            return {path, sourcePath, revision:sourceRevision, oid:entry.oid, type:entry.type,
                href:`${origin}/${entry.type === 'tree' ? 'tree' : 'blob'}/${sourceRevision}/${encoded(sourcePath)}`,
                label:'Source reference (external, requires connectivity)', requiresActivation:true, requiresConnectivity:true};
        },
        historicalImage(href) {
            const expected = HISTORICAL_IMAGES.get(href);
            if (!expected) return null;
            if (!history.has(expected.revision)) history.set(expected.revision,objectSource(repository,expected.revision,'',true));
            const pinned = history.get(expected.revision), entry = pinned.entry(expected.path);
            if (!entry || entry.oid !== expected.oid || !['100644','100755'].includes(entry.mode)) throw new Error('historical-image-pin-mismatch');
            return { ...expected, href, size:entry.size, read:()=>pinned.read(expected.path) };
        },
    };
}
