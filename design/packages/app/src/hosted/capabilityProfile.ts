import { BRIDGE_CHANNELS } from "@worldlens/bridge";

/**
 * What a hosted deployment will and will not answer, and why.
 *
 * ## The default is refusal, and that is the whole design
 *
 * The desktop application and a hosted container are the same code answering very different
 * questions. On a desktop, "open a folder picker" and "talk to the Docker daemon" are
 * requests from the person sitting at the machine, about their own machine. In a container
 * reachable over a network they are requests from whoever can reach the port, about somebody
 * else's server. The channels did not change; the trust did.
 *
 * So an unrecognised channel here is **refused**, not allowed. That is deliberately the
 * opposite of the renderer's own `capabilities.ts`, where an unknown name is treated as
 * present because the cost of being wrong there is a hidden button. The cost of being wrong
 * here is a hole in a network surface, arriving by default, in a release nobody reviewed.
 * Every reachable channel has to be classified on purpose, and `capabilityProfile.test.ts`
 * fails when one is not.
 *
 * ## Refusal is not silence
 *
 * A refused channel answers with a reason and, where one exists, the thing an operator could
 * do instead. A surface that simply does nothing reads as broken software; a surface that
 * says "a container has no folder picker, choose from the mounted folders instead" reads as
 * software that knows where it is running.
 */
export type ChannelPolicy =
    | { readonly kind: "available" }
    | {
          /** Off unless an operator turned it on, because it reaches past the container. */
          readonly kind: "opt-in";
          readonly capability: HostedCapability;
          readonly reason: string;
      }
    | {
          readonly kind: "refused";
          readonly reason: string;
          /** What to do instead, when there is something. */
          readonly instead?: string;
      };

/** Grants an operator makes explicitly, each of which reaches beyond the container. */
export type HostedCapability =
    /** The Docker daemon socket, bind-mounted in. Hands this container the host's daemon. */
    | "docker-socket"
    /** SSH material supplied out of band. Lets the container reach other machines. */
    | "ssh"
    /** GitHub credentials supplied out of band. Lets the container act as an account. */
    | "github";

const refused = (reason: string, instead?: string): ChannelPolicy =>
    instead === undefined ? { kind: "refused", reason } : { kind: "refused", reason, instead };

const optIn = (capability: HostedCapability, reason: string): ChannelPolicy => ({
    kind: "opt-in",
    capability,
    reason,
});

const available: ChannelPolicy = { kind: "available" };

/**
 * Channels whose answer differs from the rest of their own prefix.
 *
 * Checked before the prefix table, because a prefix is a convenience and not a boundary.
 * `config:` is almost entirely a file-reading surface a container answers happily, and two
 * of its channels open a native dialog that does not exist there.
 */
const EXACT: Readonly<Record<string, ChannelPolicy>> = Object.freeze({
    "config:pickDirectory": refused(
        "A container has no desktop, so there is no native folder picker to open.",
        "Choose from the folders the operator mounted.",
    ),
    "config:pickFile": refused(
        "A container has no desktop, so there is no native file picker to open.",
        "Choose from the folders the operator mounted.",
    ),
    "runtimeSettings:historySetCredential": refused(
        "The history credential is encrypted through the desktop's own keyring, and a container " +
            "has no keyring to encrypt it with.",
        "Read the history without a credential, or run this on the desktop to set one.",
    ),
    "runtimeSettings:statusHubSaveCredential": refused(
        "Same keyring: the Status Hub credential is stored encrypted by the desktop, which this " +
            "container cannot do.",
        "Supply the Status Hub credential to the container out of band instead.",
    ),
    "converter:openInEditor": refused(
        "Opening a result in an editor needs a desktop with that editor installed, and this " +
            "process is a server the browser is merely talking to.",
        "Download the converted file and open it on your own computer.",
    ),
    "files:reveal": refused(
        "There is no file manager in a container, and these files are on the server rather than on this computer.",
    ),
    "files:revealRoots": refused("There is no file manager in a container."),
    "clipboard:writeText": refused(
        "The clipboard belongs to the computer running the browser, not to the server, so the server writing to it would be writing to the wrong machine.",
        "The interface copies through the browser's own clipboard instead.",
    ),
});

/**
 * The default answer for every channel sharing a prefix.
 *
 * Read the refusal reasons as the real explanation rather than as boilerplate. Each names
 * something a container genuinely does not have, and several are the reason a replacement
 * surface exists elsewhere in the application.
 */
const BY_PREFIX: Readonly<Record<string, ChannelPolicy>> = Object.freeze({
    // Reading, rendering and recording, all within the container's own mounted folders.
    app: available,
    backup: available,
    bedrock: available,
    bluemapSource: available,
    config: available,
    consent: available,
    // Everything it converts is a file inside a mounted folder, and every adapter it uses is
    // bundled in the image rather than fetched or found on a PATH. The one member that needs a
    // desktop is refused by name above.
    converter: available,

    download: available,
    eula: available,
    files: available,
    firstRun: available,
    gallery: available,
    history: available,
    locks: available,
    "map-export": available,
    // What `dialog:` and `config:pick*` are refused in favour of. Available rather than
    // opt-in: it reaches nothing the operator has not already mounted, and every path it
    // returns goes back through the same confinement a typed one would.
    mounts: available,
    preview: available,
    profiles: available,
    // The settings themselves, their local history, and the external sources they can be
    // driven from - all of which a container does over its own network and its own data
    // directory. The two members that encrypt a secret through the desktop keyring are
    // refused by name above.
    runtimeSettings: available,

    profilesHistory: available,
    project: available,
    "release-ledger": available,
    render: available,
    repair: available,
    schoolMode: available,
    settingsHistory: available,
    startup: available,
    structures: available,
    vocabulary: available,
    world: available,
    worldrepo: available,
    worldsource: available,

    // Reaching past the container, each behind its own explicit grant.
    addons: optIn(
        "docker-socket",
        "An addon is code this application runs. On a desktop that is a person deciding about their own machine; over a network it is arbitrary execution on somebody's server.",
    ),
    cirender: optIn("github", "Driving cloud renders needs GitHub credentials."),
    chunkerActions: optIn(
        "github",
        "Uploading a world and dispatching a conversion needs GitHub credentials to upload it and run the workflow.",
    ),
    dashboard: optIn("ssh", "Polling other hosts needs SSH material."),
    dockerhosting: optIn(
        "docker-socket",
        "Managing containers needs the Docker socket bind-mounted in, which hands this container control of every container on the host.",
    ),
    dockerworld: optIn(
        "docker-socket",
        "Reading a world out of another container needs the Docker socket bind-mounted in.",
    ),
    ghCli: optIn(
        "github",
        "Acting as a GitHub account needs credentials supplied to the container out of band.",
    ),
    hosting: optIn("ssh", "Publishing to another machine needs SSH material."),
    ollama: refused(
        "A local Ollama runtime is not in this image, and half of this prefix manages that " +
            "runtime as a process on the machine - starting it, restarting it, stopping it - " +
            "which a container cannot do for a host it does not control.",
        "Run the model tooling on the machine that has Ollama, rather than through this deployment.",
    ),

    mcserver: optIn(
        "docker-socket",
        "Running and adopting Minecraft servers means starting processes and binding ports on the host.",
    ),
    pages: optIn("github", "Publishing needs GitHub credentials."),
    remote: optIn(
        "ssh",
        "Reaching another machine needs SSH material supplied to the container out of band, never typed into a browser form.",
    ),
    runtime: optIn("docker-socket", "Probing the Docker daemon needs its socket."),

    // Genuinely meaningless here, each for its own reason rather than a shared one.
    clipboard: refused(
        "The clipboard belongs to the computer running the browser, not to the server.",
    ),
    dialog: refused(
        "A container has no desktop, so there are no native dialogs to open.",
        "Choose from the folders the operator mounted.",
    ),
    java: refused(
        "The image decides its own runtime, so a runtime downloaded into a container would be discarded the next time it is recreated.",
    ),
    sysdeps: refused(
        "Installing system packages would change the image from inside, and the change would vanish the next time the container is recreated.",
        "Add what is needed to the image instead.",
    ),
    update: refused(
        "A container does not update itself in place.",
        "Pull a newer image and recreate the container.",
    ),
    window: refused(
        "There is no application window in a browser tab to minimise, maximise or close.",
    ),
});

/** What a hosted deployment does with this channel. An unknown channel is refused. */
export function channelPolicy(channel: string): ChannelPolicy {
    const exact = EXACT[channel];
    if (exact !== undefined) return exact;
    const separator = channel.indexOf(":");
    const prefix = separator === -1 ? channel : channel.slice(0, separator);
    return (
        BY_PREFIX[prefix] ??
        refused(
            "This channel has no hosting policy, so it is refused. That is deliberate: a channel nobody has classified is a channel nobody has decided to expose.",
        )
    );
}

/** Every prefix this profile answers for. */
export function classifiedPrefixes(): readonly string[] {
    return Object.keys(BY_PREFIX);
}

/**
 * Every channel the bridge can reach that this profile has not classified.
 *
 * The guard's whole subject. It must be empty, and it is derived from the bridge's own
 * inventory rather than from this file, so a channel added there without a decision here
 * shows up as a name rather than as nothing.
 */
export function unclassifiedChannels(): readonly string[] {
    return BRIDGE_CHANNELS.filter((channel) => {
        if (EXACT[channel] !== undefined) return false;
        const separator = channel.indexOf(":");
        const prefix = separator === -1 ? channel : channel.slice(0, separator);
        return BY_PREFIX[prefix] === undefined;
    });
}
