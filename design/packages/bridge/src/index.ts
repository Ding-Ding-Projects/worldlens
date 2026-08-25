/**
 * The renderer's single route to the application, and the seam that lets it run somewhere
 * other than inside Electron.
 *
 * The Electron-backed transport deliberately lives in the application package's preload
 * rather than here: it is the only code that needs to import `electron`, and keeping this
 * package free of that import is what lets a browser bundle it without pulling a desktop
 * runtime's type surface along behind it.
 */
export type { BridgeTransport } from "./transport.js";
export { createWorldlensBridge } from "./factory.js";
