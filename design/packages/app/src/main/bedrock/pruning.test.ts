import { describe, expect, it } from 'vitest';
import { composePruning, subtract } from './pruning.js';
import { planKeyFor } from './batchConvert.js';
const box = { minChunkX: 0, minChunkZ: 0, maxChunkX: 31, maxChunkZ: 31 };
const base = { configs: { 'minecraft:overworld': { include: true as const, regions: [box] } } };
describe('pruning composition', () => {
    it('intersects user inclusion instead of dropping it', () => {
        const result = composePruning(base, { configs: { 'minecraft:overworld': { include: true, regions: [{ ...box, maxChunkX: 4 }] } } });
        expect(result.configs['minecraft:overworld']?.regions).toEqual([{ ...box, maxChunkX: 4 }]);
    });
    it('subtracts an excluded interior without losing the four surrounding areas', () => {
        const result = subtract(box, { minChunkX: 10, minChunkZ: 10, maxChunkX: 19, maxChunkZ: 19 });
        const cells = new Set<string>();
        for (const r of result) for(let x=r.minChunkX;x<=r.maxChunkX;x++) for(let z=r.minChunkZ;z<=r.maxChunkZ;z++) cells.add(`${x},${z}`);
        expect(cells.size).toBe(924); expect(cells.has('10,10')).toBe(false); expect(cells.has('31,31')).toBe(true);
    });
    it('keeps other dimensions independent and preserves upstream empty-list semantics', () => {
        expect(composePruning(base, { configs: { 'minecraft:overworld': { include: true, regions: [] } } })).toEqual(base);
        expect(composePruning(base, { configs: { 'minecraft:the_end': { include: true, regions: [] } } })).toEqual(base);
    });
    it('binds resume identity to coordinates and settings, not only counts', () => {
        const a = [{ index: 0, dimension: 'minecraft:overworld', regions: [{x:0,z:0}] }];
        const b = [{ index: 0, dimension: 'minecraft:overworld', regions: [{x:1,z:0}] }];
        expect(planKeyFor(a,'JAVA_1_21_4')).not.toBe(planKeyFor(b,'JAVA_1_21_4'));
        expect(planKeyFor(a,'JAVA_1_21_4',{ converterSettings: { mapConversion: false } })).not.toBe(planKeyFor(a,'JAVA_1_21_4'));
    });
    it('uses a full exclusion for an empty intersection, because an empty list disables pruning', () => {
        const result = composePruning(base, { configs: { 'minecraft:overworld': { include: true, regions: [{ ...box, minChunkX: 100, maxChunkX: 110 }] } } });
        expect(result.configs['minecraft:overworld']).toEqual({ include: false, regions: [{minChunkX:-2147483648,minChunkZ:-2147483648,maxChunkX:2147483647,maxChunkZ:2147483647}] });
    });
});
