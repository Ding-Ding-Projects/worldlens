<script setup lang="ts">
/**
 * "Let players join": choose how players outside this network reach a server, and get exactly
 * the files that route needs. Design: `design/design-sources/deploy-anywhere/Relay.dc.html`.
 */
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
    VBtn,
    VBtnToggle,
    VCard,
    VCardText,
    VCardTitle,
    VSwitch,
    VTextField,
} from "vuetify/components";
import {
    DEFAULT_PORTS,
    cloudFirewallRules,
    portProblems,
    relayCloudInit,
    relaySetupScript,
    routerSteps,
    serverWireGuardConfig,
    wireGuardKeys,
    type KeyPair,
    type RelayRoute,
} from "./relayPlan.js";

const { t } = useI18n();
const route = ref<RelayRoute>("oracle");
const enabled = ref<boolean[]>(DEFAULT_PORTS.map((_, i) => i < 2));
const relayHost = ref("");
const lanAddress = ref("");
const keys = ref<{ relay: KeyPair; server: KeyPair } | null>(null);
const keyError = ref<string | null>(null);
const copied = ref("");

const ports = computed(() => DEFAULT_PORTS.filter((_, i) => enabled.value[i]));
const problems = computed(() => portProblems(ports.value));

async function makeKeys(): Promise<void> {
    keyError.value = null;
    try {
        keys.value = { relay: await wireGuardKeys(), server: await wireGuardKeys() };
    } catch (error) {
        keyError.value = t(
            "relay.noKeys",
            { reason: error instanceof Error ? error.message : String(error) },
            "Tunnel keys could not be made here: {reason}",
        );
    }
}

const files = computed(() => {
    const k = keys.value;
    if (k === null || problems.value.length > 0) return [];
    const server = {
        name: "worldlens-server-wg0.conf",
        label: t("relay.serverFile", "Tunnel config for the server's machine"),
        text: serverWireGuardConfig(k.server, k.relay, relayHost.value),
    };
    if (route.value === "oracle")
        return [
            {
                name: "worldlens-relay-cloud-init.yaml",
                label: t(
                    "relay.cloudInit",
                    "Paste into Oracle Cloud: Create instance › Advanced options › Cloud-init script",
                ),
                text: relayCloudInit(k.relay, k.server, ports.value),
            },
            server,
        ];
    if (route.value === "ssh")
        return [
            {
                name: "worldlens-relay-setup.sh",
                label: t("relay.script", "Run once as root on your server"),
                text: relaySetupScript(k.relay, k.server, ports.value),
            },
            server,
        ];
    return [];
});

async function copy(text: string, name: string): Promise<void> {
    try {
        await navigator.clipboard.writeText(text);
        copied.value = t("relay.copied", { name }, "Copied {name}.");
    } catch {
        copied.value = t("relay.copyFailed", "Copying is blocked here; use Save instead.");
    }
}
function save(text: string, name: string): void {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
</script>

<template>
    <v-card variant="outlined" class="wl-relay" data-test="relay-planner">
        <v-card-title>{{ t("relay.title", "Let players join from anywhere") }}</v-card-title>
        <v-card-text class="wl-relay__body">
            <p class="wl-relay__note">
                {{
                    t(
                        "relay.why",
                        "A Cloudflare tunnel carries the management site and map, but not the game's own TCP and UDP ports. Pick how players get in.",
                    )
                }}
            </p>
            <v-btn-toggle
                v-model="route"
                mandatory
                rounded="pill"
                variant="outlined"
                color="secondary"
                class="wl-relay__wrap"
                :aria-label="t('relay.route', 'Way in for players')"
            >
                <v-btn value="oracle">{{
                    t("relay.oracle", "Oracle Cloud relay (Always Free)")
                }}</v-btn>
                <v-btn value="ssh">{{ t("relay.ssh", "My own server") }}</v-btn>
                <v-btn value="router">{{ t("relay.router", "Router port") }}</v-btn>
                <v-btn value="local">{{ t("relay.local", "This network only") }}</v-btn>
            </v-btn-toggle>

            <div
                class="wl-relay__ports"
                role="group"
                :aria-label="t('relay.ports', 'Ports to forward')"
            >
                <v-switch
                    v-for="(p, i) in DEFAULT_PORTS"
                    :key="p.label + p.protocol"
                    v-model="enabled[i]"
                    color="primary"
                    hide-details
                    density="compact"
                    :label="`${p.label}: ${p.protocol.toUpperCase()} ${p.port}`"
                />
            </div>
            <ul v-if="problems.length" class="wl-relay__problems">
                <li v-for="p in problems" :key="p">{{ p }}</li>
            </ul>

            <template v-if="route === 'oracle' || route === 'ssh'">
                <v-text-field
                    v-model="relayHost"
                    :label="t('relay.host', 'Relay public address (fill in once the relay exists)')"
                    variant="outlined"
                    density="comfortable"
                    autocomplete="off"
                />
                <v-btn
                    color="primary"
                    rounded="pill"
                    class="wl-relay__start"
                    :disabled="problems.length > 0"
                    @click="makeKeys"
                    >{{
                        keys
                            ? t("relay.newKeys", "Make new tunnel keys")
                            : t("relay.make", "Make the relay files")
                    }}</v-btn
                >
                <p v-if="keyError" class="wl-relay__problems" role="alert">{{ keyError }}</p>
                <div v-for="f in files" :key="f.name" class="wl-relay__file">
                    <div class="wl-relay__row">
                        <strong>{{ f.label }}</strong
                        ><span class="wl-relay__grow" /><v-btn
                            size="small"
                            variant="text"
                            @click="copy(f.text, f.name)"
                            >{{ t("relay.copy", "Copy") }}</v-btn
                        ><v-btn size="small" variant="text" @click="save(f.text, f.name)">{{
                            t("relay.save", "Save")
                        }}</v-btn>
                    </div>
                    <pre class="wl-relay__pre" tabindex="0" :aria-label="f.label">{{ f.text }}</pre>
                </div>
                <template v-if="files.length">
                    <p class="wl-relay__note">
                        {{
                            t(
                                "relay.firewall",
                                "Also allow these in the cloud's own firewall (Oracle: the subnet's security list), which no script on the machine can change:",
                            )
                        }}
                    </p>
                    <ul class="wl-relay__list">
                        <li v-for="r in cloudFirewallRules(ports)" :key="r">{{ r }}</li>
                    </ul>
                    <p class="wl-relay__note">
                        {{
                            t(
                                "relay.serverSide",
                                "On the server's machine, install WireGuard and bring the tunnel up with the server file (wg-quick up). Players then join the relay's address. The private keys are in these files: keep them like passwords.",
                            )
                        }}
                    </p>
                </template>
            </template>
            <template v-else-if="route === 'router'">
                <v-text-field
                    v-model="lanAddress"
                    :label="t('relay.lan', 'The server machine\'s local address')"
                    variant="outlined"
                    density="comfortable"
                    autocomplete="off"
                />
                <ol class="wl-relay__list">
                    <li v-for="s in routerSteps(ports, lanAddress)" :key="s">{{ s }}</li>
                </ol>
            </template>
            <p v-else class="wl-relay__note">
                {{
                    t(
                        "relay.localNote",
                        "Nothing to forward: friends on the same network join with the server's local address.",
                    )
                }}
            </p>
            <p class="wl-relay__note" aria-live="polite">{{ copied }}</p>
        </v-card-text>
    </v-card>
</template>

<style scoped>
.wl-relay__body {
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.wl-relay__wrap {
    flex-wrap: wrap;
    height: auto !important;
}
.wl-relay__ports {
    display: flex;
    flex-wrap: wrap;
    gap: 0 20px;
}
.wl-relay__row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}
.wl-relay__grow {
    flex: 1;
}
.wl-relay__start {
    align-self: flex-start;
}
.wl-relay__pre {
    margin: 0;
    max-height: 240px;
    overflow: auto;
    padding: 12px;
    border-radius: 12px;
    background: rgba(var(--v-theme-on-surface), 0.06);
    font:
        400 12px/18px "Roboto Mono",
        monospace;
    white-space: pre-wrap;
    word-break: break-all;
}
.wl-relay__note {
    margin: 0;
    font:
        400 13px/18px Roboto,
        sans-serif;
    color: rgb(var(--v-theme-on-surface-variant));
}
.wl-relay__problems {
    margin: 0;
    padding-left: 18px;
    color: rgb(var(--v-theme-error));
    font:
        400 13px/20px Roboto,
        sans-serif;
}
.wl-relay__list {
    margin: 0;
    padding-left: 20px;
    font:
        400 14px/22px Roboto,
        sans-serif;
}
</style>
