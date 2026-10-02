/** Only the project's approved official Java runtime may receive a world mount. */
import type {CommandRunner} from '../runtime/command.js';
export const APPROVED_CHUNKER_IMAGE = 'eclipse-temurin:25-jre';
const REPOSITORY = 'docker.io/library/eclipse-temurin';
export async function resolveApprovedChunkerImage(requested:string,run:CommandRunner,signal?:AbortSignal):Promise<string>{
    if(![APPROVED_CHUNKER_IMAGE,`${REPOSITORY}:25-jre`].includes(requested)) throw Error('Choose the approved Eclipse Temurin 25 JRE runtime. Unrelated images cannot receive a world mount.');
    // Pull through the canonical registry before any source transfer or mount. A locally
    // retagged image cannot satisfy this registry resolution. The resulting digest, not
    // the mutable tag, is subsequently inspected, recorded and used by docker run.
    const pulled=await run('docker',['pull',`${REPOSITORY}:25-jre`],{timeoutMs:600_000,...(signal?{signal}:{})});
    if(!pulled.ok) throw Error('The approved Java runtime could not be resolved from its canonical registry. No world was mounted.');
    const match=/^Digest: (sha256:[a-f0-9]{64})\s*$/m.exec(pulled.stdout+'\n'+pulled.stderr);
    if(!match?.[1]) throw Error('Docker did not report an immutable registry digest. No world was mounted.');
    const reference=`${REPOSITORY}@${match[1]}`;
    const inspected=await run('docker',['image','inspect',reference,'--format','{{json .RepoDigests}}'],{...(signal?{signal}:{})});
    if(!inspected.ok) throw Error('The resolved Java runtime is not installed by its immutable digest.');
    const digests:unknown=JSON.parse(inspected.stdout);
    if(!Array.isArray(digests)||!digests.some(value=>typeof value==='string'&&[`eclipse-temurin@${match[1]}`,`library/eclipse-temurin@${match[1]}`,reference].includes(value))) throw Error('The installed runtime does not match the resolved official digest.');
    return reference;
}
