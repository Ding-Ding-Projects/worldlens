import tseslint from "typescript-eslint";

export default tseslint.config(
    // `release/` holds packaged installers. Linting an unpacked Electron app means
    // linting a minified renderer bundle, which produced 3334 errors in a tree that
    // was otherwise clean. It is gitignored, but eslint does not read gitignore.
    {
        ignores: [
            "**/dist/**",
            "**/out/**",
            "**/release/**",
            "**/node_modules/**",
            "**/coverage/**",
            "packages/site/archive/support.js",
            "packages/site/archive/vendor/react-dom.production.min.js",
            "packages/site/archive/vendor/react.production.min.js",
            // The same generated dc-runtime bundle as the archived copy above, shipped
            // beside the imported `.dc.html` design sources. Its own first line is
            // "GENERATED from dc-runtime/src/*.ts - do not edit", so the six errors it
            // raises are esbuild's output style rather than anything a person wrote here:
            // the `a && a.b()` short-circuit call, and a destructure that exists purely to
            // omit the __-prefixed keys from a rest object. Fixing them in place would be
            // undone by the next rebuild, and the file is not ours to hand-edit.
            "design-sources/**/support.js",
        ],
    },
    ...tseslint.configs.recommended,
    {
        rules: {
            "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
        },
    },
);
