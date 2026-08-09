#!/usr/bin/env node
/**
 * generate-color-roles.mjs — emit the site's colour role layer from the project's one authority.
 *
 * The site used to carry a palette of its own. `src/theme/tokens.css` declared a full set of
 * tonal ramps under a brand name and derived every `--md-sys-color-*` role from them, which
 * meant this package was a second place a colour could be decided. That is precisely the
 * condition `packages/shared/src/colorRoles.ts` was written to end: its own header records
 * that the product once looked like two products because the desktop theme and the viewer
 * shell disagreed about every value, and it exists so there is exactly one answer. A
 * documentation site that paints itself from a private palette re-creates that split, only
 * with the marketing surface as the third disagreeing party.
 *
 * So the roles are generated rather than written. This script imports the compiled shared
 * schemes and emits `src/theme/generated/colorRoles.css`, which `tokens.css` imports ahead of
 * everything else. Re-seeding the product is a change in the shared module and a rebuild here;
 * it is not an edit to this package at all.
 *
 * ## Why a generated file rather than a runtime import
 *
 * The roles have to be correct in the first painted frame. `index.html` decides light or dark
 * before any module evaluates, precisely so the page never flashes the wrong theme, and a
 * runtime `schemeToCustomProperties()` call would land after that first paint. A stylesheet
 * imported by the entry CSS is in the initial cascade, so the generated form is the only one
 * that keeps that guarantee.
 *
 * ## Failure behaviour differs from the fetch scripts, deliberately
 *
 * `fetch-release.mjs` and its siblings fail open, because a site with an honest empty state is
 * a successful build. This one fails closed: a site that cannot resolve its colours does not
 * have an honest empty state, it has no legible text. A missing or malformed shared module
 * exits non-zero rather than emitting a partial sheet.
 *
 * Usage:
 *   node scripts/generate-color-roles.mjs
 */

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

import { SITE_ROOT, log } from "./shared.mjs";

const SCRIPT = "generate-color-roles";

/** Where the emitted sheet lands. Imported by `src/theme/tokens.css`. */
const OUTPUT = resolve(SITE_ROOT, "src/theme/generated/colorRoles.css");

/**
 * The compiled shared module, reached by path rather than by package name.
 *
 * `@worldlens/shared` is not a declared dependency of this package and deliberately is not
 * becoming one: the site ships no shared runtime code, it only needs thirty-eight strings at
 * build time. Reaching for the built artifact keeps that a build-time relationship, so the
 * browser bundle does not grow a dependency edge for data that has already been inlined.
 */
const SHARED_COLOR_ROLES = new URL("../../shared/dist/colorRoles.js", import.meta.url);

/**
 * Roles the shared schemes do not carry, expressed against roles they do.
 *
 * The shared set is the Material role list exactly; it has no opinion about a "warning" or a
 * "success" colour because neither is an M3 role. The site needs both for its feature-status
 * tables, so they are derived here from tertiary and secondary rather than invented as new
 * hex values — which keeps the promise that no colour is decided in this package while still
 * giving those tables a distinct hue from `error`.
 */
const DERIVED_ROLES = [
    ["warning", "tertiary"],
    ["on-warning", "on-tertiary"],
    ["warning-container", "tertiary-container"],
    ["on-warning-container", "on-tertiary-container"],
    ["success", "secondary"],
    ["on-success", "on-secondary"],
    ["success-container", "secondary-container"],
    ["on-success-container", "on-secondary-container"],
];

/** One `--md-sys-color-<role>: <value>;` line per role, indented for the emitted block. */
function roleDeclarations(scheme, roles) {
    const direct = roles.map((role) => `    --md-sys-color-${role}: ${scheme[role].toLowerCase()};`);
    const derived = DERIVED_ROLES.map(
        ([name, source]) => `    --md-sys-color-${name}: var(--md-sys-color-${source});`,
    );
    return [...direct, ...derived].join("\n");
}

async function main() {
    /** @type {{ LIGHT_SCHEME: Record<string, string>, DARK_SCHEME: Record<string, string>, COLOR_ROLES: string[] }} */
    let shared;
    try {
        shared = await import(SHARED_COLOR_ROLES.href);
    } catch (error) {
        log(
            SCRIPT,
            `cannot import the shared colour authority at ${SHARED_COLOR_ROLES.pathname}. ` +
                `Build @worldlens/shared first (pnpm --filter @worldlens/shared run build). ${String(error)}`,
        );
        process.exit(1);
        return;
    }

    const { LIGHT_SCHEME, DARK_SCHEME, COLOR_ROLES } = shared;
    if (!LIGHT_SCHEME || !DARK_SCHEME || !Array.isArray(COLOR_ROLES) || COLOR_ROLES.length === 0) {
        log(SCRIPT, "the shared colour module did not export the expected schemes.");
        process.exit(1);
        return;
    }

    // A role present in one scheme and absent from the other would emit a sheet where dark
    // silently inherits a light value, which reads as a theming bug in a single component
    // rather than as the missing data it actually is.
    const missing = COLOR_ROLES.filter(
        (role) => typeof LIGHT_SCHEME[role] !== "string" || typeof DARK_SCHEME[role] !== "string",
    );
    if (missing.length > 0) {
        log(SCRIPT, `these roles are missing from one of the schemes: ${missing.join(", ")}`);
        process.exit(1);
        return;
    }

    const sheet = `/*
 * GENERATED FILE — do not edit.
 *
 * Emitted by scripts/generate-color-roles.mjs from packages/shared/src/colorRoles.ts, which is
 * the one place this project decides a colour. Editing this file directly would re-open the
 * split that module exists to close, and the next build would overwrite the edit anyway.
 *
 * To change a colour, change the shared schemes and rebuild.
 */

:root,
:root[data-theme="light"] {
${roleDeclarations(LIGHT_SCHEME, COLOR_ROLES)}
}

:root[data-theme="dark"] {
${roleDeclarations(DARK_SCHEME, COLOR_ROLES)}
}
`;

    /*
     * The accent seed has to be generated too, and forgetting it is a genuinely invisible bug.
     *
     * `theme.accent` is a setting whose compiled default is applied to `--md-sys-color-primary`
     * unconditionally on every load, for every visitor who has never touched the control. A
     * stylesheet can therefore be entirely correct and still be repainted to a different brand
     * a few milliseconds later by a constant sitting in the settings schema. That is exactly
     * what happened when the roles above were first generated: the sheet said blue, the site
     * rendered amber, and nothing anywhere reported a problem.
     *
     * So the seed comes from the same authority as the roles, as a module the schema imports.
     */
    const seedModule = `/*
 * GENERATED FILE — do not edit.
 *
 * Emitted by scripts/generate-color-roles.mjs from packages/shared/src/colorRoles.ts.
 *
 * This is the brand seed the \`theme.accent\` setting starts at and resets to. It is generated
 * rather than typed because the setting's value is applied over \`--md-sys-color-primary\` on
 * every load: a literal here that disagreed with the generated stylesheet would silently win,
 * and the site would render a brand no file in the repository claims.
 */

/** The light scheme's primary role — what an untouched \`theme.accent\` resolves to. */
export const BRAND_ACCENT_SEED = "${LIGHT_SCHEME["primary"].toLowerCase()}";
`;

    await mkdir(resolve(SITE_ROOT, "src/theme/generated"), { recursive: true });
    await writeFile(OUTPUT, sheet, "utf8");
    await writeFile(resolve(SITE_ROOT, "src/theme/generated/seed.ts"), seedModule, "utf8");
    log(SCRIPT, `wrote ${COLOR_ROLES.length} roles per scheme to src/theme/generated/colorRoles.css`);
    log(SCRIPT, `wrote the brand accent seed ${LIGHT_SCHEME["primary"].toLowerCase()} to src/theme/generated/seed.ts`);
}

await main();
