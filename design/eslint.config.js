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
            // A third copy of that same generated bundle, at the design root rather than
            // under design-sources/. Its first line carries the same "GENERATED ... do not
            // edit" banner, so it belongs with the two above; the pattern simply never
            // reached it.
            "support.js",
        ],
    },
    ...tseslint.configs.recommended,
    {
        // A .cjs file is CommonJS by definition, so require() is the only import it has.
        // electron-builder loads this config through Node's CommonJS loader, and an ESM
        // import here would fail to load rather than merely look different.
        files: ["**/*.cjs"],
        rules: { "@typescript-eslint/no-require-imports": "off" },
    },
    {
        rules: {
            // `ignoreRestSiblings` is what makes the omit-a-key idiom legal:
            // `const { hosting: _hosting, ...render } = project.render` exists precisely to
            // drop one key, and the binding it leaves behind is the mechanism rather than an
            // oversight. `varsIgnorePattern` extends to variables the same `^_` signal this
            // rule already accepts for arguments - an underscore there is a deliberate "this
            // is unused and I mean it", which is the whole point of having the option.
            //
            // Neither of these silences an ordinary unused variable: a name without the
            // underscore still fails, which is how the genuinely dead ones were found.
            "@typescript-eslint/no-unused-vars": [
                "error",
                { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
            ],
        },
    },
);
