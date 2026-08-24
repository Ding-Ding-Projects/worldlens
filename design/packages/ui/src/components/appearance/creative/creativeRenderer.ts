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
    return rotation === 0 ? "" : ` transform="rotate(${cssValue(rotation)} ${cssValue(x + width / 2)} ${cssValue(y + height / 2)})"`;
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
    return filters.length === 0 ? "" : ` style="filter:${filters.join(" ")}"`;
}

function opacityBlend(layer: CreativeLayer): string {
    return ` opacity="${cssValue(layer.opacity)}" style="mix-blend-mode:${cssValue(layer.blendMode)}"`;
}

function textStyle(layer: CreativeTextLayer): string {
    const typography = { ...DEFAULT_TYPOGRAPHY, ...layer.typography } as TypographySpec;
    const css = typographyCss(typography, detectTypographyCapabilities({ supports: () => true }), `${typography.fontFamily}, sans-serif`);
    return `${Object.entries(css.style).map(([key, value]) => `${key}:${cssValue(value)};`).join("")}color:${cssValue(layer.fill)};`;
}

function renderLayer(layer: CreativeLayer, children: readonly CreativeLayer[]): string {
    if (!layer.visible) return "";
    const nested = children.filter((candidate) => candidate.parentId === layer.id).map((candidate) => renderLayer(candidate, children)).join("");
    const shared = `data-layer-id="${escape(layer.id)}"${opacityBlend(layer)}${effectStyle(layer)}${transform(layer)}`;
    if (layer.kind === "group") return `<g ${shared} aria-label="${escape(layer.name)}">${nested}</g>`;
    if (layer.kind === "vector") {
        const shape = layer.shape === "ellipse"
            ? `<ellipse cx="${cssValue(layer.x + layer.width / 2)}" cy="${cssValue(layer.y + layer.height / 2)}" rx="${cssValue(layer.width / 2)}" ry="${cssValue(layer.height / 2)}" fill="${cssValue(layer.fill)}" stroke="${cssValue(layer.stroke)}" stroke-width="${cssValue(layer.strokeWidth)}"/>`
            : layer.shape === "line"
                ? `<line x1="${cssValue(layer.x)}" y1="${cssValue(layer.y)}" x2="${cssValue(layer.x + layer.width)}" y2="${cssValue(layer.y + layer.height)}" stroke="${cssValue(layer.stroke)}" stroke-width="${cssValue(layer.strokeWidth)}"/>`
                : `<rect x="${cssValue(layer.x)}" y="${cssValue(layer.y)}" width="${cssValue(layer.width)}" height="${cssValue(layer.height)}" rx="12" fill="${cssValue(layer.fill)}" stroke="${cssValue(layer.stroke)}" stroke-width="${cssValue(layer.strokeWidth)}"/>`;
        return `<g ${shared}>${shape}</g>`;
    }
    if (layer.kind === "gradient") {
        const gradientId = `creative-gradient-${escape(layer.id)}`;
        const stops = layer.stops.map((stop) => `<stop offset="${cssValue(stop.offset * 100)}%" stop-color="${cssValue(stop.color)}"/>`).join("");
        return `<g ${shared}><defs><linearGradient id="${gradientId}" gradientTransform="rotate(${cssValue(layer.angle)})">${stops}</linearGradient></defs><rect x="${cssValue(layer.x)}" y="${cssValue(layer.y)}" width="${cssValue(layer.width)}" height="${cssValue(layer.height)}" fill="url(#${gradientId})"/></g>`;
    }
    if (layer.kind === "text") {
        return `<text ${shared} x="${cssValue(layer.x)}" y="${cssValue(layer.y)}" fill="${cssValue(layer.fill)}" style="${escape(textStyle(layer))}">${escape(layer.text)}</text>`;
    }
    return `<image ${shared} href="${escape(layer.dataUrl)}" x="${cssValue(layer.x)}" y="${cssValue(layer.y)}" width="${cssValue(layer.width)}" height="${cssValue(layer.height)}" preserveAspectRatio="none"/>`;
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
