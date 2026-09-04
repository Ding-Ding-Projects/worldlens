import {describe,it,expect,vi} from 'vitest';
import {resolveApprovedChunkerImage} from './approvedImage.js';
const digest='sha256:'+'a'.repeat(64);
const ok=(stdout:string)=>({ok:true,exitCode:0,stdout,stderr:'',spawnError:null});
describe('approved conversion runtime',()=>{
    it('refuses unrelated or caller-selected digest images before doing anything',async()=>{
        const run=vi.fn();await expect(resolveApprovedChunkerImage('unrelated:latest',run)).rejects.toThrow(/Unrelated/);expect(run).not.toHaveBeenCalled();
    });
    it('resolves and verifies an immutable official digest rather than returning the tag',async()=>{
        const run=vi.fn().mockResolvedValueOnce(ok(`Digest: ${digest}\n`)).mockResolvedValueOnce(ok(JSON.stringify([`eclipse-temurin@${digest}`])));
        await expect(resolveApprovedChunkerImage('eclipse-temurin:25-jre',run)).resolves.toBe(`docker.io/library/eclipse-temurin@${digest}`);
        expect(run.mock.calls[1]?.[1]).toContain(`docker.io/library/eclipse-temurin@${digest}`);
    });
    it('refuses absent or mismatching digest evidence',async()=>{
        await expect(resolveApprovedChunkerImage('eclipse-temurin:25-jre',vi.fn().mockResolvedValue(ok('already present')))).rejects.toThrow(/digest/);
        const run=vi.fn().mockResolvedValueOnce(ok(`Digest: ${digest}`)).mockResolvedValueOnce(ok('["unrelated@sha256:abc"]'));
        await expect(resolveApprovedChunkerImage('eclipse-temurin:25-jre',run)).rejects.toThrow(/does not match/);
    });
});
