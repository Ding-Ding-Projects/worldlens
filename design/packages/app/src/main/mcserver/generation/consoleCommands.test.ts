import { describe,expect,it } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcess } from 'node:child_process';
import { executeGenerationCommands } from './consoleCommands.js';
function childFixture(response:(command:string)=>string){
    const child=new EventEmitter() as EventEmitter&{exitCode:null;stdout:PassThrough;stderr:PassThrough;stdin:PassThrough};
    child.exitCode=null;child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();
    child.stdin.on('data',(chunk:Buffer)=>setTimeout(()=>child.stdout.write(response(chunk.toString('utf8').trim())),1));
    return child as unknown as ChildProcess;
}
describe('generation console acknowledgement',()=>{
    it('waits for each exact rule name and value',async()=>{
        const child=childFixture(command=>{const [,name,value]=command.split(' ');return `Gamerule ${name} is now set to: ${value}\n`;});
        await expect(executeGenerationCommands(['gamerule doDaylightCycle false','gamerule randomTickSpeed 4'],child,{timeoutMs:100})).resolves.toBeUndefined();
        expect(child.stdout!.listenerCount('data')).toBe(0);
    });
    it('rejects a different acknowledgement instead of reporting success',async()=>{
        const child=childFixture(()=> 'Gamerule doDaylightCycle is now set to: true\n');
        await expect(executeGenerationCommands(['gamerule doDaylightCycle false'],child,{timeoutMs:20})).rejects.toThrow(/did not acknowledge/);
    });
    it('rejects command injection and actual server refusal',async()=>{
        await expect(executeGenerationCommands(['gamerule doDaylightCycle false\nstop'],childFixture(()=>''),{timeoutMs:20})).rejects.toThrow(/Unsupported/);
        await expect(executeGenerationCommands(['gamerule unknown false'],childFixture(()=> 'Unknown game rule\n'),{timeoutMs:100})).rejects.toThrow(/rejected/);
    });
    it('honours cancellation without sending another command',async()=>{
        const child=childFixture(()=> '');
        await expect(executeGenerationCommands(['gamerule doDaylightCycle false'],child,{isCancelled:()=>true})).rejects.toThrow('cancelled');
        expect(child.stdout!.listenerCount('data')).toBe(0);
    });
});

