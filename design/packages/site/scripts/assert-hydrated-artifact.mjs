#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import process from "node:process";

const VIEWPORTS = [
    { width: 360, height: 640 },
    { width: 390, height: 844 },
    { width: 414, height: 896 },
];
const port = Number.parseInt(
    process.env["PAGES_HYDRATION_CDP_PORT"] ?? process.env["PAGES_PROOF_CDP_PORT"] ?? "49229",
    10,
);
const exactTargetUrl = process.env["PAGES_HYDRATION_TARGET_URL"];
const output = process.argv[2];

if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PAGES_HYDRATION_CDP_PORT must be a valid loopback port.");
}

const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(async (response) => {
    if (!response.ok) throw new Error(`CDP target discovery returned HTTP ${response.status}.`);
    return response.json();
});
if (targets.length !== 1) {
    throw new Error(`Hydration proof requires exactly one isolated CDP target; found ${targets.length}.`);
}
const target = targets[0];
if (
    target?.type !== "page" ||
    typeof target.url !== "string" ||
    typeof target.webSocketDebuggerUrl !== "string" ||
    (exactTargetUrl !== undefined && target.url !== exactTargetUrl)
) {
    throw new Error(`The isolated CDP target is not the expected page: ${target?.url ?? "unknown"}.`);
}

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out connecting to the CDP page.")), 5_000);
    socket.addEventListener(
        "open",
        () => {
            clearTimeout(timer);
            resolve();
        },
        { once: true },
    );
    socket.addEventListener(
        "error",
        (event) => {
            clearTimeout(timer);
            reject(event.error ?? new Error("The CDP WebSocket failed."));
        },
        { once: true },
    );
});

let sequence = 0;
const pending = new Map();
const runtimeErrors = [];
socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id !== undefined) {
        const waiter = pending.get(message.id);
        if (waiter === undefined) return;
        pending.delete(message.id);
        clearTimeout(waiter.timer);
        if (message.error === undefined) waiter.resolve(message.result);
        else waiter.reject(new Error(JSON.stringify(message.error)));
        return;
    }

    if (message.method === "Runtime.exceptionThrown") {
        const details = message.params?.exceptionDetails;
        runtimeErrors.push({
            source: "page exception",
            text: details?.exception?.description ?? details?.text ?? "Unknown page exception",
        });
    } else if (
        message.method === "Runtime.consoleAPICalled" &&
        ["error", "assert"].includes(message.params?.type)
    ) {
        runtimeErrors.push({
            source: `console.${message.params.type}`,
            text: (message.params.args ?? [])
                .map((argument) => argument.value ?? argument.description ?? argument.type)
                .join(" "),
        });
    }
});

function send(method, params = {}) {
    sequence += 1;
    const id = sequence;
    const reply = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            pending.delete(id);
            reject(new Error(`CDP ${method} timed out; the page main thread may be blocked.`));
        }, 5_000);
        pending.set(id, { resolve, reject, timer });
    });
    socket.send(JSON.stringify({ id, method, params }));
    return reply;
}

async function evaluate(expression) {
    const result = await send("Runtime.evaluate", {
        expression,
        awaitPromise: false,
        returnByValue: true,
    });
    if (result.exceptionDetails !== undefined) {
        throw new Error(
            result.exceptionDetails.exception?.description ??
                result.exceptionDetails.text ??
                "Runtime evaluation failed.",
        );
    }
    return result.result.value;
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const probeExpression = `(() => {
    const text = document.body?.innerText ?? "";
    return JSON.stringify({
        readyState: document.readyState,
        width: window.innerWidth,
        height: window.innerHeight,
        rawBindings: [...new Set(text.match(/\\{\\{\\s*[^{}]+?\\s*\\}\\}/gu) ?? [])].slice(0, 40),
        hasTemplate: document.querySelector("x-dc") !== null,
        hasRoot: document.querySelector("#dc-root") !== null,
        bootType: typeof window.__dcBoot,
    });
})()`;

await send("Page.enable");
await send("Runtime.enable");

const frames = [];
try {
    for (const viewport of VIEWPORTS) {
        await send("Emulation.setDeviceMetricsOverride", {
            width: viewport.width,
            height: viewport.height,
            deviceScaleFactor: 1,
            mobile: true,
            screenWidth: viewport.width,
            screenHeight: viewport.height,
        });
        const errorStart = runtimeErrors.length;
        await send("Page.reload", { ignoreCache: true });

        let probe;
        for (let attempt = 0; attempt < 30; attempt += 1) {
            await sleep(100);
            probe = JSON.parse(await evaluate(probeExpression));
            if (probe.readyState === "complete" && probe.hasRoot && !probe.hasTemplate) break;
        }
        await sleep(50);

        const failures = [];
        if (probe?.readyState !== "complete") failures.push("the document did not finish loading");
        if (probe?.hasTemplate) failures.push("the raw x-dc template remained mounted");
        if (!probe?.hasRoot) failures.push("the hydrated #dc-root was not mounted");
        if (probe?.bootType !== "function") failures.push("the archive runtime did not expose its boot function");
        if (probe?.rawBindings?.length) {
            failures.push(`visible raw template bindings: ${probe.rawBindings.join(", ")}`);
        }
        for (const error of runtimeErrors.slice(errorStart)) {
            failures.push(`${error.source}: ${error.text}`);
        }

        frames.push({ viewport, probe, failures, passed: failures.length === 0 });
    }
} finally {
    socket.close();
}

const proof = {
    schemaVersion: 1,
    source: "built Worldlens documentation site",
    generatedAt: new Date().toISOString(),
    target: { url: target.url, cdpPort: port },
    frames,
    passed: frames.every((frame) => frame.passed),
};
if (output !== undefined) await writeFile(output, `${JSON.stringify(proof, null, 2)}\n`, "utf8");

console.log(
    JSON.stringify(
        {
            output: output ?? null,
            frameCount: frames.length,
            widths: frames.map((frame) => frame.viewport.width),
            failureCount: frames.reduce((sum, frame) => sum + frame.failures.length, 0),
            passed: proof.passed,
        },
        null,
        2,
    ),
);
if (!proof.passed) process.exitCode = 1;
