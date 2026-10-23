import type { ChildProcess } from 'node:child_process';

/** Uses the owned process console and waits for the server's value acknowledgement. */
export async function executeGenerationCommands(commands:readonly string[],child:ChildProcess,options:{readonly timeoutMs?:number;readonly isCancelled?:()=>boolean}={}):Promise<void> {
    const deadline=Date.now()+120000;
    for(const command of commands) {
        if(options.isCancelled?.())throw new Error('cancelled');
        if(Date.now()>=deadline)throw new Error('Generation command acknowledgement exceeded its total deadline.');
        const match=/^gamerule ([a-zA-Z][a-zA-Z0-9_:.-]{0,127}) (true|false|-?\d+)$/.exec(command);
        if(!match) throw new Error('Unsupported generation console command.');
        if(!child.stdin||child.exitCode!==null) throw new Error('The generation console is not running.');
        const name=match[1]!.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
        const value=match[2]!;
        const acknowledged=new RegExp(`Game ?rule ${name} (?:is now set to|is currently set to|is)[:\\s]+${value}(?:\\s|$)`,'i');
        await new Promise<void>((resolve,reject)=>{
            let buffer='';
            const finish=(error?:Error)=>{clearTimeout(timer);clearInterval(cancellation);child.stdout?.off('data',data);child.stderr?.off('data',data);child.off('exit',exit);child.stdin?.off('error',errorHandler);error?reject(error):resolve();};
            const data=(chunk:Buffer)=>{buffer=(buffer+chunk.toString('utf8')).slice(-32768);if(acknowledged.test(buffer)) finish(); else if(/Unknown or incomplete command|Unknown game ?rule|Incorrect argument|Invalid value/i.test(buffer)) finish(new Error('The server rejected the requested generation rule.'));};
            const exit=()=>finish(new Error('The server exited before acknowledging the generation rule.'));
            const errorHandler=(error:Error)=>finish(error);
            const timer=setTimeout(()=>finish(new Error('The server did not acknowledge the generation rule value.')),Math.min(options.timeoutMs??15000,deadline-Date.now()));
            const cancellation=setInterval(()=>{if(options.isCancelled?.())finish(new Error('cancelled'));},100);
            child.stdout?.on('data',data);child.stderr?.on('data',data);child.once('exit',exit);child.stdin!.once('error',errorHandler);
            try{child.stdin!.write(`${command}\n`);}catch(error){finish(error instanceof Error?error:new Error(String(error)));}
        });
    }
}
