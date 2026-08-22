# @worldlens/design-system

Reusable Material Design 3 colors, design tokens, and Vuetify configuration for WorldLens-family interfaces.

## Install

```sh
pnpm add @worldlens/design-system vue vuetify
```

Import the token stylesheet once at the application entrypoint, then install the configured Vuetify plugin:

```ts
import "@worldlens/design-system/tokens.css";
import { createWorldLensDesignSystem } from "@worldlens/design-system";

app.use(createWorldLensDesignSystem());
```

Framework-neutral consumers can import only the color contract without loading Vuetify:

```ts
import { DARK_SCHEME, schemeToCustomProperties } from "@worldlens/design-system/colors";
```

The package exports the dark, light, and high-contrast color schemes, the complete token stylesheet, component defaults, theme metadata, and a factory that registers the WorldLens Vuetify blueprint. Consumer-specific modes and business behavior stay in the consuming application and can add a theme through the factory options.

## Build

From `design/`, run `pnpm --filter @worldlens/design-system build`. The package emits JavaScript and declarations in `dist/`; `tokens.css` ships from `src/` through the package export map.

