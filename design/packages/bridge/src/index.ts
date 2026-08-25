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
export {
    BRIDGE_CHANNELS,
    BRIDGE_EVENT_CHANNELS,
    BRIDGE_INVOKE_CHANNELS,
    BRIDGE_SYNC_CHANNELS,
} from "./channels.js";
export { createHttpTransport, BridgeCallError } from "./httpTransport.js";
export type { HttpTransportOptions } from "./httpTransport.js";
