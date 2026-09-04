import {EventEmitter} from 'node:events';
import {describe,it,expect,vi} from 'vitest';
import {SenderOwnership} from './senderOwnership.js';
class Sender extends EventEmitter{destroyed=false;isDestroyed(){return this.destroyed;}destroy(){this.destroyed=true;this.emit('destroyed');}}
describe('conversion sender ownership',()=>{
    it('refuses cross-window reads and cancellation even with the exact UUID',()=>{
        const a=new Sender(),b=new Sender(),cancel=vi.fn(),owner=new SenderOwnership(cancel);owner.claim('known-id',a);
        expect(owner.require('known-id',a)).toBe('known-id');expect(()=>owner.require('known-id',b)).toThrow(/not owned/);expect(()=>owner.claim('known-id',b)).toThrow(/another window/);expect(cancel).not.toHaveBeenCalled();
    });
    it('cancels only the destroyed owner and retains its tombstone',()=>{
        const a=new Sender(),b=new Sender(),cancel=vi.fn(),owner=new SenderOwnership(cancel);owner.claim('a',a);owner.claim('b',b);a.destroy();
        expect(cancel).toHaveBeenCalledExactlyOnceWith('a');expect(owner.owns('a',a)).toBe(false);expect(owner.owns('b',b)).toBe(true);expect(()=>owner.claim('a',b)).toThrow();
    });
});
