import { Color, Key } from "@worldlens/shared";
import { LRUCache } from "lru-cache";
import { PNG } from "pngjs";
import type { ResourcePack } from "../../../resources/pack/resourcepack/ResourcePack.js";
import type { Variant } from "../../../resources/pack/resourcepack/blockstate/Variant.js";
import { BlockState } from "../../../world/BlockState.js";
import type { BlockNeighborhood } from "../../../world/block/BlockNeighborhood.js";
import {
    flattenLegacyBlockState,
    isLegacyResourcePack,
} from "../../../world/mca/legacy/FlatteningRename.js";
import type { TextureGallery } from "../../TextureGallery.js";
import type { RenderSettings } from "../RenderSettings.js";
import type { TileModelView } from "../TileModelView.js";
import type { BlockRenderer } from "./BlockRenderer.js";
import type { BlockRendererType } from "./BlockRendererType.js";
import { BannerBlockEntity, bannerRenderLayers } from "../../../world/mca/blockentity/BannerBlockEntity.js";

/**
 * upstream: {@code util/Caches.build(loader)} — a caffeine LoadingCache with
 * {@code maximumSize(10000)} and {@code expireAfterAccess(1, MINUTES)}, the same shape
 * {@code resources/pack/resourcepack/ResourcePack} already mirrors with `lru-cache`.
 *
 * Keyed by the {@link BlockRendererType} object: upstream's key type overrides neither
 * {@code equals} nor {@code hashCode}, so caffeine compares it by identity — which is
 * exactly what a javascript Map key does.
 */
const CACHE_MAX_SIZE = 10000;
const CACHE_TTL_MS = 60 * 1000;

function rendererCache(
    create: (type: BlockRendererType) => BlockRenderer,
): (type: BlockRendererType) => BlockRenderer {
    const cache = new LRUCache<BlockRendererType, BlockRenderer>({
        max: CACHE_MAX_SIZE,
        ttl: CACHE_TTL_MS,
        updateAgeOnGet: true,
    });
    return (type) => {
        const cached = cache.get(type);
        if (cached !== undefined) return cached;
        const created = create(type);
        cache.set(type, created);
        return created;
    };
}

/**
 * upstream: map/hires/block/BlockStateModelRenderer.java
 *
 * One level above {@link BlockRenderer}: it resolves a block-state to its resource-pack
 * blockstate, asks that for the variants applying at this position (which is where the
 * coordinate-seeded variant PRNG in {@code blockstate/VariantSet} runs), dispatches each
 * variant to its renderer, and combines the per-variant colours into the one colour that
 * represents the block.
 */
export class BlockStateModelRenderer {
    private readonly resourcePack: ResourcePack;
    private readonly textureGallery: TextureGallery;
    private readonly blockRenderers: (type: BlockRendererType) => BlockRenderer;

    private readonly variants: Variant[] = [];

    constructor(
        resourcePack: ResourcePack,
        textureGallery: TextureGallery,
        renderSettings: RenderSettings,
    ) {
        this.resourcePack = resourcePack;
        this.textureGallery = textureGallery;
        this.blockRenderers = rendererCache((type) =>
            type.create(resourcePack, textureGallery, renderSettings),
        );
    }

    private readonly waterloggedColor = new Color();

    /** upstream: {@code render(BlockNeighborhood, TileModelView, Color)} */
    render(block: BlockNeighborhood, blockModel: TileModelView, blockColor: Color): void;
    /** upstream: {@code render(BlockNeighborhood, BlockState, TileModelView, Color)} */
    render(
        block: BlockNeighborhood,
        blockState: BlockState,
        tileModel: TileModelView,
        blockColor: Color,
    ): void;
    render(
        block: BlockNeighborhood,
        b: BlockState | TileModelView,
        c: TileModelView | Color,
        d?: Color,
    ): void {
        const blockState = b instanceof BlockState ? b : block.getBlockState();
        const tileModel = (b instanceof BlockState ? c : b) as TileModelView;
        const blockColor = (b instanceof BlockState ? d : c) as Color;

        blockColor.set(0, 0, 0, 0, true);

        //shortcut for air
        if (blockState.isAir()) return;

        const modelStart = tileModel.getStart();

        // render block
        this.renderModel(block, blockState, tileModel.initialize(), blockColor);
        this.renderBanner(block, tileModel);

        // add water if block is waterlogged
        if (blockState.isWaterlogged() || block.getProperties().isAlwaysWaterlogged()) {
            this.waterloggedColor.set(0, 0, 0, 0, true);
            this.renderModel(block, BlockState.WATER, tileModel.initialize(), this.waterloggedColor);
            blockColor.set(this.waterloggedColor.overlay(blockColor.premultiplied()));
        }

        tileModel.initialize(modelStart);
    }

    private readonly variantColor = new Color();

    private renderModel(
        block: BlockNeighborhood,
        blockState: BlockState,
        tileModel: TileModelView,
        blockColor: Color,
    ): void {
        const modelStart = tileModel.getStart();

        /*
         * Port-only, no upstream analog: a pre-flattening (1.12.2) chunk hands back the
         * exact pre-flattening block name (Chunk_1_12 / BlockIdMapper are correct about
         * that — see FlatteningRename.ts), so only *here*, right before the resource pack
         * is consulted, is that name translated to its modern equivalent. Gated on
         * `block.isLegacy()` so a modern block-state — which can legitimately use some of
         * these exact names for a different, already-correct block (a real 1.13-1.20.2
         * chunk's `minecraft:grass` really does mean the grass tuft) — is never touched.
         *
         * ALSO gated on `!isLegacyResourcePack(this.resourcePack)` (issue #46): the rename
         * bridges a legacy WORLD to a MODERN pack, and firing it against an era-matched
         * (real pre-flattening) pack does the opposite of what it is for — that pack
         * already resolves `minecraft:grass` etc. correctly on its own, so renaming it to
         * `minecraft:grass_block` (a name that never existed pre-flattening) only turns a
         * working lookup into a `null` one, silently dropping the block at the
         * `if (stateResource == null) return;` below. See FlatteningRename.ts's doc
         * comment.
         */
        const lookupState =
            block.isLegacy() && !isLegacyResourcePack(this.resourcePack)
                ? flattenLegacyBlockState(blockState)
                : blockState;

        const stateResource = this.resourcePack.getBlockState(lookupState);
        if (stateResource == null) return;

        let blockColorOpacity = 0;
        this.variants.length = 0;
        stateResource.forEach(lookupState, block.getX(), block.getY(), block.getZ(), (variant) =>
            this.variants.push(variant),
        );

        for (let i = 0; i < this.variants.length; i++) {
            this.variantColor.set(0, 0, 0, 0, true);

            const variant = this.variants[i]!;
            this.blockRenderers(variant.getRenderer()).render(
                block,
                variant,
                tileModel.initialize(),
                this.variantColor,
            );

            if (this.variantColor.a > blockColorOpacity) blockColorOpacity = this.variantColor.a;
            blockColor.add(this.variantColor.premultiplied());
        }

        if (blockColor.a > 0) {
            blockColor.flatten().straight();
            blockColor.a = blockColorOpacity;
        }

        tileModel.initialize(modelStart);
    }

    /**
     * Banner block entities are data-driven overlays rather than ordinary block-state
     * geometry. Keep the overlay in the same tile model so the packaged viewer receives
     * the exact ordered layers and their colours, instead of silently dropping the entity.
     * The small procedural textures are deterministic fallbacks for the resource-pack
     * banner paths; a supplied pack texture replaces them through the same gallery key.
     */
    private renderBanner(block: BlockNeighborhood, tileModel: TileModelView): void {
        const entity = block.getBlockEntity();
        if (!(entity instanceof BannerBlockEntity)) return;

        for (const [index, layer] of bannerRenderLayers(entity).entries()) {
            const z = 7 - index * 0.01;
            const start = tileModel.initialize().add(2);
            const model = tileModel.getTileModel();
            model.setPositions(start, 1.2, 1.4, z, 14.8, 1.4, z, 1.2, 29.4, z);
            model.setPositions(start + 1, 14.8, 1.4, z, 14.8, 29.4, z, 1.2, 29.4, z);
            model.setUvs(start, 0, 1, 1, 1, 0, 0);
            model.setUvs(start + 1, 1, 1, 1, 0, 0, 0);
            const material = this.textureGallery.get(new Key("minecraft", "block/white_banner"));
            model.setMaterialIndex(start, material);
            model.setMaterialIndex(start + 1, material);
            for (const face of [start, start + 1]) {
                model.setColor(face, layer.tint[0], layer.tint[1], layer.tint[2]);
                model.setAOs(face, 1, 1, 1);
                model.setSunlight(face, 15);
                model.setBlocklight(face, 0);
            }
        }
    }
}

export function bannerLayerImage(
    pattern: string,
    tint: readonly [number, number, number],
): PNG {
    const image = new PNG({ width: 16, height: 32 });
    const value = pattern.includes(":") ? pattern.slice(pattern.indexOf(":") + 1) : pattern;
    const base = value === "base";
    for (let y = 0; y < image.height; y++) {
        for (let x = 0; x < image.width; x++) {
            const painted = base ||
                (value.includes("stripe_bottom") && y >= 20) ||
                (value.includes("stripe_top") && y < 12) ||
                (value.includes("stripe_left") && x < 6) ||
                (value.includes("stripe_right") && x >= 10) ||
                (value.includes("creeper") && ((x + y) % 5 < 2)) ||
                (!base && !value.includes("stripe_") && !value.includes("creeper") && ((x + y) % 7 === 0));
            const offset = (y * image.width + x) * 4;
            image.data[offset] = Math.round(tint[0] * 255);
            image.data[offset + 1] = Math.round(tint[1] * 255);
            image.data[offset + 2] = Math.round(tint[2] * 255);
            image.data[offset + 3] = painted ? 255 : 0;
        }
    }
    return image;
}
