import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// Dedicated child: never print authentication responses, cache data or device codes.
console.log = console.warn = console.error = () => {};
const waiters = new Map();
let sequence = 0;
process.on("message", async (message) => {
    if (message?.kind === "stored") {
        const waiter = waiters.get(message.id);
        waiters.delete(message.id);
        if (message.ok) waiter?.resolve();
        else waiter?.reject(new Error("Protected persistence failed."));
        return;
    }
    if (message?.kind !== "start") return;
    try {
        const metadata = require("prismarine-auth/package.json");
        if (metadata.version !== "3.1.1") throw new Error("Unreviewed authentication runtime.");
        const { Authflow } = require("prismarine-auth");
        const caches = message.caches ?? {};
        const persist = async () => {
            const id = ++sequence;
            await new Promise((resolve, reject) => {
                waiters.set(id, { resolve, reject });
                process.send({ kind: "store", id, caches });
            });
        };
        const factory = ({ cacheName }) => ({
            getCached: async () => caches[cacheName] ?? {},
            setCached: async (value) => {
                caches[cacheName] = value;
                await persist();
            },
            setCachedPartial: async (value) => {
                caches[cacheName] = { ...(caches[cacheName] ?? {}), ...value };
                await persist();
            },
            reset: async () => {
                caches[cacheName] = {};
                await persist();
            },
        });
        const flow = new Authflow(
            message.reference,
            factory,
            { flow: "msal", authTitle: message.clientId },
            (code) => {
                process.send({
                    kind: "device",
                    userCode: code.user_code,
                    verificationUri: code.verification_uri,
                    expiresIn: code.expires_in,
                });
            },
        );
        const result = await flow.getMinecraftJavaToken({
            fetchProfile: true,
            fetchEntitlements: true,
            fetchCertificates: true,
        });
        if (!result.token || !result.profile?.id || !result.profile?.name)
            throw new Error("A licensed Java profile is required.");
        const certificates = result.certificates
            ? {
                  ...result.certificates,
                  profileKeys: {
                      ...result.certificates.profileKeys,
                      private: undefined,
                      public: undefined,
                  },
              }
            : null;
        process.send({
            kind: "session",
            session: {
                accessToken: result.token,
                profile: { id: result.profile.id, name: result.profile.name },
                certificates,
            },
        });
    } catch {
        process.send({ kind: "failed" });
    }
});
