/**
 * material-exempt: colours rendered into a user's own artwork. Same reason as the document beside it.
 */
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
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const transforms = [`translate(${cssValue(centerX)} ${cssValue(centerY)})`, `scale(${cssValue(scaleX)} ${cssValue(scaleY)})`, `rotate(${cssValue(rotation)})`, `translate(${cssValue(-centerX)} ${cssValue(-centerY)})`];
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

function maskMarkup(layer: CreativeLayer, children: readonly CreativeLayer[]): { readonly defs: string; readonly attribute: string } {
    const inner = layer.effects.innerGlow;
    const innerId = `creative-inner-glow-${escape(layer.id)}`;
    const innerDefs = inner.color && inner.radius > 0
        ? `<filter id="${innerId}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur in="SourceAlpha" stdDeviation="${cssValue(inner.radius)}" result="blur"/><feFlood flood-color="${cssValue(inner.color)}" result="colour"/><feComposite in="colour" in2="blur" operator="in" result="glow"/><feComposite in="glow" in2="SourceAlpha" operator="in" result="inner"/><feMerge><feMergeNode in="inner"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
        : "";
    const clipId = `creative-clip-${escape(layer.id)}`;
    const source = layer.clipSourceId === null ? null : children.find((candidate) => candidate.id === layer.clipSourceId) ?? null;
    const clipDefs = layer.clipped && source !== null && "x" in source && "y" in source && "width" in source && "height" in source
        ? `<clipPath id="${clipId}"><rect x="${cssValue(source.x)}" y="${cssValue(source.y)}" width="${cssValue(source.width)}" height="${cssValue(source.height)}"/></clipPath>`
        : "";
    const clipAttribute = clipDefs ? ` clip-path="url(#${clipId})"` : "";
    if (!layer.mask?.enabled) return { defs: `${innerDefs}${clipDefs}`, attribute: `${clipAttribute}${innerDefs ? ` filter="url(#${innerId})"` : ""}` };
    const maskId = `creative-mask-${escape(layer.id)}`;
    const shape = layer.mask.kind === "ellipse"
        ? `<ellipse cx="${cssValue(layer.mask.x + layer.mask.width / 2)}" cy="${cssValue(layer.mask.y + layer.mask.height / 2)}" rx="${cssValue(layer.mask.width / 2)}" ry="${cssValue(layer.mask.height / 2)}" fill="white"/>`
        : `<rect x="${cssValue(layer.mask.x)}" y="${cssValue(layer.mask.y)}" width="${cssValue(layer.mask.width)}" height="${cssValue(layer.mask.height)}" rx="${cssValue(layer.mask.feather)}" fill="white"/>`;
    return { defs: `${innerDefs}${clipDefs}<mask id="${maskId}">${shape}</mask>`, attribute: `${clipAttribute} mask="url(#${maskId})"${innerDefs ? ` filter="url(#${innerId})"` : ""}` };
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
    const mask = maskMarkup(layer, children);
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
    const crop = document.canvas.crop;
    const cropWidth = Math.max(1, document.canvas.width - crop.left - crop.right);
    const cropHeight = Math.max(1, document.canvas.height - crop.top - crop.bottom);
    const gridId = "creative-grid";
    const grid = document.canvas.grid.enabled
        ? `<defs><pattern id="${gridId}" width="${cssValue(document.canvas.grid.size)}" height="${cssValue(document.canvas.grid.size)}" patternUnits="userSpaceOnUse"><path d="M ${cssValue(document.canvas.grid.size)} 0 L 0 0 0 ${cssValue(document.canvas.grid.size)}" fill="none" stroke="#ffffff" stroke-opacity=".16" stroke-width="1"/></pattern></defs><rect x="${cssValue(crop.left)}" y="${cssValue(crop.top)}" width="${cssValue(cropWidth)}" height="${cssValue(cropHeight)}" fill="url(#${gridId})" pointer-events="none"/>`
        : "";
    const guides = document.canvas.guides.map((guide) => guide.axis === "x"
        ? `<line data-guide-id="${escape(guide.id)}" x1="${cssValue(guide.position)}" y1="${cssValue(crop.top)}" x2="${cssValue(guide.position)}" y2="${cssValue(crop.top + cropHeight)}" stroke="#00e5ff" stroke-dasharray="6 4" pointer-events="none"/>`
        : `<line data-guide-id="${escape(guide.id)}" x1="${cssValue(crop.left)}" y1="${cssValue(guide.position)}" x2="${cssValue(crop.left + cropWidth)}" y2="${cssValue(guide.position)}" stroke="#00e5ff" stroke-dasharray="6 4" pointer-events="none"/>`).join("");
    const safe = document.canvas.safeArea.enabled
        ? `<rect x="${cssValue(crop.left + document.canvas.safeArea.inset)}" y="${cssValue(crop.top + document.canvas.safeArea.inset)}" width="${cssValue(Math.max(1, cropWidth - document.canvas.safeArea.inset * 2))}" height="${cssValue(Math.max(1, cropHeight - document.canvas.safeArea.inset * 2))}" fill="none" stroke="#ffcc00" stroke-dasharray="4 4" pointer-events="none"/>`
        : "";
    const rulers = document.canvas.rulers ? `<g stroke="#ffffff" stroke-opacity=".4" stroke-width="1" pointer-events="none">${Array.from({ length: Math.ceil(cropWidth / 100) }, (_, index) => `<line x1="${cssValue(crop.left + index * 100)}" y1="${cssValue(crop.top)}" x2="${cssValue(crop.left + index * 100)}" y2="${cssValue(crop.top + 8)}"/>`).join("")}${Array.from({ length: Math.ceil(cropHeight / 100) }, (_, index) => `<line x1="${cssValue(crop.left)}" y1="${cssValue(crop.top + index * 100)}" x2="${cssValue(crop.left + 8)}" y2="${cssValue(crop.top + index * 100)}"/>`).join("")}</g>` : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${cssValue(crop.left)} ${cssValue(crop.top)} ${cssValue(cropWidth)} ${cssValue(cropHeight)}" role="img" aria-label="Creative appearance preview"><rect width="${cssValue(document.canvas.width)}" height="${cssValue(document.canvas.height)}" fill="${cssValue(document.canvas.background)}"/>${grid}${roots}${guides}${safe}${rulers}</svg>`;
}

export function renderCreativePreviewText(document: CreativeAppearanceDocument): string {
    return renderCreativeSvg(document).replace(/\s+/g, " ").trim();
}
