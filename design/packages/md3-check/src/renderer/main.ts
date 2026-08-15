import { createApp } from "vue";
import App from "./App.vue";
import { vuetify } from "./lib/worldlensVuetify.js";

// Roboto is what Worldlens's own M3 type scale names everywhere (`md3.scss`'s
// `--md-ref-typeface-plain: Roboto, sans-serif`), and Windows ships no Roboto - see
// `ui/src/main.ts`'s identical comment. Bundled locally through @fontsource so nothing is
// fetched at runtime (this instrument's CSP has no `font-src` allowance beyond `'self' data:`
// anyway - see `index.html`). Weights match what `ui/src/main.ts` bundles, for the same
// reason: nothing this app renders asks for a weight outside 300/400/500/700.
import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";

// The real M3 token vocabulary and its remap of Vuetify's shape/elevation utilities, imported
// in the exact order `ui/src/main.ts` imports them (shape/type/elevation tokens declared
// before the sheet that spends them) - see `lib/worldlensVuetify.ts`'s header for exactly why
// both are required and exactly what is deliberately left out (`markers.scss`,
// `prototypeSurface.scss`, `motion.scss`).
import "@worldlens/ui/src/styles/md3.scss";
import "@worldlens/ui/src/styles/global.scss";

// This instrument's own two stylesheets: the hand-typed M3 reference pane (see that file's own
// long header for what it is and is not allowed to cite) and this app's own chrome (the
// toolbar, the row grid, the measurement table - none of it product UI). Imported last so
// neither can be silently overridden by a Worldlens sheet loaded after it by accident.
import "./styles/m3Reference.scss";
import "./styles/harnessChrome.scss";

createApp(App).use(vuetify).mount("#app");
