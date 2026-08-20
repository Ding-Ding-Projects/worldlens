import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
    ChunkNbtWriter,
    RegionFileWriter,
    TerrainGenerator,
    generateWorld,
} from "../../../design/packages/worldgen/dist/index.js";

const BANNER_X = 8;
const BANNER_Z = 8;
const BANNER_LAYERS = [
    { x: BANNER_X, field: "Patterns", layers: [["bs", 15], ["cre", 4], ["tts", 11], ["bri", 1]] },
    { x: BANNER_X + 2, field: "patterns", layers: [["minecraft:stripe_bottom", "minecraft:black"], ["minecraft:creeper", "minecraft:red"], ["minecraft:triangles_top", "minecraft:blue"]] },
    { x: BANNER_X + 4, field: "Patterns", layers: [["mr", 10], ["cre", 14], ["bri", 1]] },
];

/** Create a real worldgen Anvil world, then place three patterned banner entities in its generated chunk. */
export async function createPatternedBannerWorld(outDir) {
    await mkdir(outDir, { recursive: true });
    const generated = await generateWorld({ seed: 89, size: 64, outDir, name: "patterned-banner-world" });
    const terrain = new TerrainGenerator(89);
    const bannerChunk = terrain.generateChunk(0, 0);
    const states = [
        ["minecraft:white_banner[rotation=0]", BANNER_X],
        ["minecraft:red_banner[rotation=0]", BANNER_X + 2],
        ["minecraft:blue_wall_banner[facing=north]", BANNER_X + 4],
    ];
    const banners = [];
    for (let i = 0; i < BANNER_LAYERS.length; i++) {
        const [state, x] = states[i];
        const y = bannerChunk.surfaceY[(BANNER_Z << 4) | x] + 1;
        bannerChunk.setBlock(x, y, BANNER_Z, terrain.registry.id(state));
        const definition = BANNER_LAYERS[i];
        const banner = {
            id: "minecraft:banner", x, y, z: BANNER_Z,
            patternField: definition.field,
            patterns: definition.layers.map(([pattern, color]) => ({ pattern, color })),
        };
        banners.push(banner);
        bannerChunk.blockEntities.push(banner);
    }
    const regionPath = join(generated.worldFolder, "region", "r.0.0.mca");
    const region = await RegionFileWriter.create(regionPath);
    const chunkWriter = new ChunkNbtWriter();
    for (let chunkZ = 0; chunkZ < 4; chunkZ++) {
        for (let chunkX = 0; chunkX < 4; chunkX++) {
            const chunk = chunkX === 0 && chunkZ === 0 ? bannerChunk : terrain.generateChunk(chunkX, chunkZ);
            await region.addChunk(chunkX, chunkZ, chunkWriter.write(chunk));
        }
    }
    await region.close();
    const manifest = {
        fixture: "patterned-banner",
        generator: "@worldlens/worldgen generateWorld + ChunkNbtWriter + RegionFileWriter",
        blockStates: states.map(([state, x], index) => ({ position: [x, banners[index].y, BANNER_Z], state })),
        banners: banners.map((banner, index) => ({
            era: index === 1 ? "current-components" : index === 2 ? "modern-wall-banner" : "legacy-1.12-to-1.20",
            position: [banner.x, banner.y, banner.z], field: banner.patternField,
            layers: banner.patterns.map(({ pattern, color }) => [pattern, color]),
        })),
        resourcePaths: ["minecraft:entity/banner/banner_base", "minecraft:entity/banner/stripe_bottom", "minecraft:entity/banner/creeper", "minecraft:entity/banner/triangles_top"],
        generatedLevelDat: await readFile(join(generated.worldFolder, "level.dat")).then(() => true),
    };
    await writeFile(join(generated.worldFolder, "patterned-banner-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
    return generated.worldFolder;
}
