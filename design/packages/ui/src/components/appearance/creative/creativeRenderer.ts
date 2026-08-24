import { DEFAULT_TYPOGRAPHY, detectTypographyCapabilities, typographyCss, type TypographySpec } from "../typographySpec.js";
import type { CreativeAppearanceDocument, CreativeLayer, CreativeTextLayer } from "./creativeTypes.js";

function escape(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function cssValue(value: unknown): string {
    return escape(String(value));
}

function transform(layer: CreativeLayer): string {
    const x = "x" in layer ? layer.x : 0;
    const y = "y" in layer ? layer.y : 0;
    const width = "width" in layer ? layer.width : 0;
    const height = "height" in layer ? layer.height : 0;
    const rotation = "rotation" in layer ? layer.rotation : 0;
    const scaleX = ("scaleX" in layer ? layer.scaleX : 1) * ("flipX" in layer && layer.flipX ? -1 : 1);
    const scaleY = ("scaleY" in layer ? layer.scaleY : 1) * ("flipY" in layer && layer.flipY ? -1 : 1);
    const transforms = [`translate(${cssValue(x + width / 2)} ${cssValue(y + height / 2)})`, `scale(${cssValue(scaleX)} ${cssValue(scaleY)})`, `rotate(${cssValue(rotation)})`, `translate(${cssValue(-width / 2)} ${cssValue(-height / 2)})`];
    return ` transform="${transforms.join(" ")}"`;
}

function effectStyle(layer: CreativeLayer): string {
    const effects = layer.effects;
    const filters: string[] = [];
    if (effects.blur > 0) filters.push(`blur(${cssValue(effects.blur)}px)`);
    if (effects.brightness !== 1) filters.push(`brightness(${cssValue(effects.brightness)})`);
    if (effects.contrast !== 1) filters.push(`contrast(${cssValue(effects.contrast)})`);
    if (effects.saturation !== 1) filters.push(`saturate(${cssValue(effects.saturation)})`);
    if (effects.hue !== 0) filters.push(`hue-rotate(${cssValue(effects.hue)}deg)`);
    if (effects.grayscale > 0) filters.push(`grayscale(${cssValue(effects.grayscale)})`);
    if (effects.sepia > 0) filters.push(`sepia(${cssValue(effects.sepia)})`);
    if (effects.invert > 0) filters.push(`invert(${cssValue(effects.invert)})`);
    if (effects.shadow.color && effects.shadow.blur > 0) filters.push(`drop-shadow(${cssValue(effects.shadow.x)}px ${cssValue(effects.shadow.y)}px ${cssValue(effects.shadow.blur)}px ${cssValue(effects.shadow.color)})`);
    if (effects.outerGlow.color && effects.outerGlow.radius > 0) filters.push(`drop-shadow(0 0 ${cssValue(effects.outerGlow.radius)}px ${cssValue(effects.outerGlow.color)})`);
    return filters.length === 0 ? "" : `filter:${filters.join(" ")};`;
}

function opacityBlend(layer: CreativeLayer): string {
    return ` opacity="${cssValue(layer.opacity)}"`;
}

function styleAttribute(layer: CreativeLayer, extra = ""): string {
    return ` style="mix-blend-mode:${cssValue(layer.blendMode)};${escape(effectStyle(layer))}${extra}"`;
}

function maskMarkup(layer: CreativeLayer): { readonly defs: string; readonly attribute: string } {
    if (!layer.mask?.enabled) return { defs: "", attribute: "" };
    const maskId = `creative-mask-${escape(layer.id)}`;
    const shape = layer.mask.kind === "ellipse"
        ? `<ellipse cx="${cssValue(layer.mask.x + layer.mask.width / 2)}" cy="${cssValue(layer.mask.y + layer.mask.height / 2)}" rx="${cssValue(layer.mask.width / 2)}" ry="${cssValue(layer.mask.height / 2)}" fill="white"/>`
        : `<rect x="${cssValue(layer.mask.x)}" y="${cssValue(layer.mask.y)}" width="${cssValue(layer.mask.width)}" height="${cssValue(layer.mask.height)}" rx="${cssValue(layer.mask.feather)}" fill="white"/>`;
    return { defs: `<mask id="${maskId}">${shape}</mask>`, attribute: ` mask="url(#${maskId})"` };
}

function textStyle(layer: CreativeTextLayer): string {
    const typography = { ...DEFAULT_TYPOGRAPHY, ...layer.typography } as TypographySpec;
    const css = typographyCss(typography, detectTypographyCapabilities({ supports: () => true }), `${typography.fontFamily}, sans-serif`);
    return `${Object.entries(css.style).map(([key, value]) => `${key}:${cssValue(value)};`).join("")}color:${cssValue(layer.fill)};`;
}

function renderLayer(layer: CreativeLayer, children: readonly CreativeLayer[], seen = new Set<string>()): string {
    if (seen.has(layer.id)) return "";
    const nextSeen = new Set(seen).add(layer.id);
    if (!layer.visible) return "";
    const nested = children.filter((candidate) => candidate.parentId === layer.id).map((candidate) => renderLayer(candidate, children, nextSeen)).join("");
    const mask = maskMarkup(layer);
    const shared = `data-layer-id="${escape(layer.id)}"${opacityBlend(layer)}${mask.attribute}${transform(layer)}`;
    if (layer.kind === "group") return `<g ${shared}${styleAttribute(layer)} aria-label="${escape(layer.name)}"><defs>${mask.defs}</defs>${nested}</g>`;
    if (layer.kind === "vector") {
        const shape = layer.shape === "ellipse"
            ? `<ellipse cx="${cssValue(layer.x + layer.width / 2)}" cy="${cssValue(layer.y + layer.height / 2)}" rx="${cssValue(layer.width / 2)}" ry="${cssValue(layer.height / 2)}" fill="${cssValue(layer.fill)}" stroke="${cssValue(layer.stroke)}" stroke-width="${cssValue(layer.strokeWidth)}"/>`
            : layer.shape === "line"
                ? `<line x1="${cssValue(layer.x)}" y1="${cssValue(layer.y)}" x2="${cssValue(layer.x + layer.width)}" y2="${cssValue(layer.y + layer.height)}" stroke="${cssValue(layer.stroke)}" stroke-width="${cssValue(layer.strokeWidth)}"/>`
                : `<rect x="${cssValue(layer.x)}" y="${cssValue(layer.y)}" width="${cssValue(layer.width)}" height="${cssValue(layer.height)}" rx="12" fill="${cssValue(layer.fill)}" stroke="${cssValue(layer.stroke)}" stroke-width="${cssValue(layer.strokeWidth)}"/>`;
        return `<g ${shared}${styleAttribute(layer)}><defs>${mask.defs}</defs>${shape}</g>`;
    }
    if (layer.kind === "gradient") {
        const gradientId = `creative-gradient-${escape(layer.id)}`;
        const stops = layer.stops.map((stop) => `<stop offset="${cssValue(stop.offset * 100)}%" stop-color="${cssValue(stop.color)}"/>`).join("");
        return `<g ${shared}${styleAttribute(layer)}><defs>${mask.defs}<linearGradient id="${gradientId}" gradientTransform="rotate(${cssValue(layer.angle)})">${stops}</linearGradient></defs><rect x="${cssValue(layer.x)}" y="${cssValue(layer.y)}" width="${cssValue(layer.width)}" height="${cssValue(layer.height)}" fill="url(#${gradientId})"/></g>`;
    }
    if (layer.kind === "text") {
        return `<text ${shared}${styleAttribute(layer, escape(textStyle(layer)))} x="${cssValue(layer.x)}" y="${cssValue(layer.y)}" fill="${cssValue(layer.fill)}">${escape(layer.text)}</text>`;
    }
    return `<image ${shared}${styleAttribute(layer)} href="${escape(layer.dataUrl)}" x="${cssValue(layer.x)}" y="${cssValue(layer.y)}" width="${cssValue(layer.width)}" height="${cssValue(layer.height)}" preserveAspectRatio="none"/>`;
}

/**
 * Renders the document to an SVG fragment. It is intentionally pure, which makes the preview
 * and the mounted tests use the exact same output. Text and attributes are escaped before the
 * fragment is handed to Vue's `v-html`, so imported local text cannot become markup.
 */
export function renderCreativeSvg(document: CreativeAppearanceDocument): string {
    const roots = document.layers.filter((layer) => layer.parentId === null).map((layer) => renderLayer(layer, document.layers)).join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cssValue(document.canvas.width)} ${cssValue(document.canvas.height)}" role="img" aria-label="Creative appearance preview"><rect width="100%" height="100%" fill="${cssValue(document.canvas.background)}"/>${roots}</svg>`;
}

export function renderCreativePreviewText(document: CreativeAppearanceDocument): string {
    return renderCreativeSvg(document).replace(/\s+/g, " ").trim();
}
