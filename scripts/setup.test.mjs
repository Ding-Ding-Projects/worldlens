import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
    BACK,
    HOSTED_IMAGE,
    answersFromOptions,
    copyToClipboard,
    detectLanAddress,
    findFreePort,
    generatePassword,
    hashPassword,
    isPortFree,
    lineDiff,
    loadExisting,
    main,
    makeFolder,
    mountsDeclaration,
    parseArgs,
    parseFolderSpec,
    renderCompose,
    renderEnv,
    validateLabel,
    validateName,
    validatePassword,
    waitForHealth,
} from "./setup.mjs";

/* ---------- fakes ---------- */

const stripAnsi = (s) => s.replace(/\u001b\[[0-9;]*[A-Za-z]/g, "");

function makeOut({ tty = false } = {}) {
    const chunks = [];
    return {
        isTTY: tty,
        columns: 120,
        write(s) {
            chunks.push(String(s));
            return true;
        },
        raw: () => chunks.join(""),
        plain: () => stripAnsi(chunks.join("")),
    };
}

function makeRun(handler = () => undefined) {
    const calls = [];
    const run = async (cmd, args = [], opts = {}) => {
        calls.push({ cmd, args, input: opts.input });
        return handler(cmd, args, opts) ?? { code: 0, stdout: "", stderr: "", missing: false };
    };
    run.calls = calls;
    run.lines = () => calls.map((c) => `${c.cmd} ${c.args.join(" ")}`);
    return run;
}

const healthy = async () => ({ status: 200, json: async () => ({ required: true, signedIn: false }) });

function clock() {
    let t = 0;
    return { now: () => t, sleep: async (ms) => void (t += ms) };
}

const K = {
    enter: { name: "return" },
    esc: { name: "escape" },
    up: { name: "up" },
    down: { name: "down" },
    space: { name: "space", ch: " " },
    ctrlC: { name: "c", ctrl: true },
    ctrlU: { name: "u", ctrl: true },
};
const typed = (text) => [...text].map((ch) => ({ ch }));

/** A scripted key source. A function token runs when the interface is waiting for input. */
function scriptKeys(tokens) {
    const queue = tokens.flat();
    return {
        next: async () => {
            for (;;) {
                if (queue.length === 0) throw new Error("the key script ran out: the interface asked for more input than the test gave it");
                const token = queue.shift();
                if (typeof token === "function") {
                    token();
                    continue;
                }
                return token;
            }
        },
        close: () => undefined,
    };
}

function lineSource(lines) {
    const queue = [...lines];
    return { next: async () => (queue.length > 0 ? queue.shift() : null), close: () => undefined };
}

function sandbox(t, overrides = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "worldlens-setup-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const home = path.join(root, "home");
    fs.mkdirSync(home);
    const c = clock();
    const out = makeOut({ tty: overrides.tty });
    const run = overrides.run ?? makeRun();
    const ctx = {
        cwd: root,
        homedir: home,
        platform: process.platform,
        env: { TERM: "xterm", NO_COLOR: "1" },
        stdin: { isTTY: Boolean(overrides.tty), setEncoding() {}, async *[Symbol.asyncIterator]() {} },
        stdout: out,
        run,
        fetchFn: overrides.fetchFn ?? healthy,
        now: c.now,
        sleep: c.sleep,
        isPortFree: overrides.isPortFree ?? (async () => true),
        interfaces: () => ({ Ethernet: [{ family: "IPv4", address: "192.168.1.20", internal: false }] }),
        ...overrides.ctx,
    };
    return { root, home, out, run, ctx, dir: path.join(home, "worldlens-hosted") };
}

const exists = (p) => fs.existsSync(p);
const count = (text, needle) => text.split(needle).length - 1;
const stdinOf = (text) => ({ isTTY: false, setEncoding() {}, async *[Symbol.asyncIterator]() { yield text; } });

/* ---------- pure helpers ---------- */

test("generated passwords are long, drawn from the alphabet and never repeat", () => {
    const seen = new Set();
    for (let i = 0; i < 300; i++) {
        const p = generatePassword();
        assert.match(p, /^[2-9a-hjkmnp-z]{5}(-[2-9a-hjkmnp-z]{5}){3}$/);
        seen.add(p);
    }
    assert.equal(seen.size, 300);
    assert.equal(validatePassword(generatePassword()), null);
});

test("the password hash is the same SHA-256 hex the hosted server computes", () => {
    assert.equal(hashPassword("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("validators refuse what the hosted server would choke on", () => {
    assert.match(validatePassword("short"), /12 characters/);
    assert.match(validatePassword("aaaaaaaaaaaaaaaa"), /different/);
    assert.match(validatePassword(" leading-space-1234"), /spaces/);
    assert.equal(validateName("worldlens-hosted"), null);
    assert.ok(validateName("Bad Name"));
    for (const bad of ["", "a,b", "a:b", "ro", "x".repeat(61)]) assert.ok(validateLabel(bad), bad);
    assert.equal(validateLabel("Worlds"), null);
});

test("folders get unique ids that avoid the reserved state volume", () => {
    const a = makeFolder("/w", "Worlds", false, []);
    const b = makeFolder("/x", "Worlds", false, [a.id]);
    const c = makeFolder("/y", "State", true, []);
    assert.deepEqual([a.id, b.id, c.id], ["worlds", "worlds-2", "state-2"]);
    assert.equal(mountsDeclaration([a, c]), "worlds:/data/worlds:ro:Worlds,state-2:/data/state-2:State");
});

test("the Compose file holds no password, quotes Windows paths and honours the access choice", () => {
    const answers = {
        name: "worldlens-hosted",
        image: HOSTED_IMAGE,
        port: 9000,
        reach: "local",
        behindTls: false,
        capabilities: ["docker-socket"],
        folders: [
            { id: "worlds", path: "C:\\Users\\me\\worlds", label: "Worlds", writable: false },
            { id: "renders", path: "/srv/renders", label: "Renders", writable: true },
        ],
    };
    const local = renderCompose(answers);
    assert.match(local, /"127\.0\.0\.1:9000:8110"/);
    assert.match(local, /source: "C:\\\\Users\\\\me\\\\worlds"/);
    assert.match(local, /read_only: true/);
    assert.match(local, /WORLDLENS_CAPABILITIES: "docker-socket"/);
    assert.match(local, /\/var\/run\/docker\.sock/);
    assert.match(local, /\$\{WORLDLENS_PASSWORD_SHA256:\?/);
    assert.doesNotMatch(local, /WORLDLENS_PASSWORD_SHA256: "[a-f0-9]{64}"/);
    assert.match(renderCompose({ ...answers, reach: "lan", capabilities: [], behindTls: true }), /- "9000:8110"[\s\S]*WORLDLENS_BEHIND_TLS: "1"/);
    assert.match(renderEnv("a".repeat(64)), /^# Created by the WorldLens setup[^\n]*\nWORLDLENS_PASSWORD_SHA256=a{64}\n$/);
});

test("lineDiff marks added and removed lines", () => {
    assert.deepEqual(lineDiff("a\nb\nc", "a\nx\nc"), ["  a", "- b", "+ x", "  c"]);
});

test("free-port probing skips a port that is really taken", async () => {
    const server = net.createServer();
    await new Promise((resolve) => server.listen(0, "0.0.0.0", resolve));
    const taken = server.address().port;
    try {
        assert.equal(await isPortFree(taken), false);
        const found = await findFreePort(taken);
        assert.ok(found !== null && found !== taken);
        assert.equal(await isPortFree(found), true);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
    assert.equal(await findFreePort(1000, async (p) => p === 1003), 1003);
    assert.equal(await findFreePort(1000, async () => false, 5), null);
});

test("the network address prefers a private LAN and skips virtual adapters", () => {
    const iface = (address, internal = false) => [{ family: "IPv4", address, internal }];
    assert.equal(
        detectLanAddress({
            "vEthernet (WSL)": iface("172.20.0.1"),
            docker0: iface("172.17.0.1"),
            lo: iface("127.0.0.1", true),
            Wifi: iface("10.0.0.7"),
            Ethernet: iface("192.168.1.20"),
            Link: iface("169.254.3.3"),
        }),
        "192.168.1.20",
    );
    assert.equal(detectLanAddress({ lo: iface("127.0.0.1", true) }), null);
});

test("flags beat variables, lists repeat, unknown flags are named", () => {
    const { opts, problems } = parseArgs(["--port", "9100", "--worlds=/a", "--worlds", "/b=Two", "-y", "--lan"], {
        WORLDLENS_SETUP_PORT: "1",
        WORLDLENS_SETUP_CAPABILITIES: "ssh,github",
    });
    assert.deepEqual(problems, []);
    assert.equal(opts.port, "9100");
    assert.deepEqual(opts.worlds, ["/a", "/b=Two"]);
    assert.deepEqual(opts.capability, ["ssh", "github"]);
    assert.equal(opts.yes, true);
    assert.match(parseArgs(["--nope"], {}).problems[0], /Unknown flag --nope/);
    assert.match(parseArgs(["--port"], {}).problems[0], /needs a value/);
    assert.deepEqual(parseFolderSpec("C:\\worlds=Main"), { path: "C:\\worlds", label: "Main" });
    assert.deepEqual(parseFolderSpec("C:\\worlds"), { path: "C:\\worlds", label: null });
});

test("the clipboard helper tries each tool and reports failure honestly", async () => {
    const run = makeRun((cmd) => (cmd === "wl-copy" ? { code: -1, stdout: "", stderr: "", missing: true } : undefined));
    assert.equal(await copyToClipboard(run, "linux", "secret"), true);
    assert.deepEqual(run.lines(), ["wl-copy ", "xclip -selection clipboard"]);
    assert.equal(await copyToClipboard(makeRun(() => ({ code: 1, stdout: "", stderr: "" })), "linux", "x"), false);
});

test("the health wait succeeds after a few tries and fails at the deadline", async () => {
    let tries = 0;
    const c = clock();
    const ok = await waitForHealth({
        fetchFn: async () => (++tries < 3 ? Promise.reject(new Error("refused")) : healthy()),
        url: "http://x/",
        timeoutMs: 30000,
        ...c,
    });
    assert.equal(ok.ok, true);
    assert.equal(tries, 3);
    const c2 = clock();
    const bad = await waitForHealth({ fetchFn: async () => Promise.reject(new Error("refused")), url: "http://x/", timeoutMs: 5000, ...c2 });
    assert.deepEqual(bad, { ok: false, last: "refused" });
    const wrong = await waitForHealth({ fetchFn: async () => ({ status: 200, json: async () => ({ hello: 1 }) }), url: "http://x/", timeoutMs: 2000, ...clock() });
    assert.match(wrong.last, /did not look like WorldLens/);
});

test("the pinned default image matches the digest the desktop app offers", () => {
    const source = fs.readFileSync(new URL("../design/packages/ui/src/components/remote/publishedImages.ts", import.meta.url), "utf8");
    assert.ok(source.includes(`"${HOSTED_IMAGE}"`), "scripts/setup.mjs and publishedImages.ts carry different hosted image digests");
});

/* ---------- unattended ---------- */

test("an unattended run writes private files, starts the container and prints the password exactly once", async (t) => {
    const s = sandbox(t);
    const code = await main(["--yes"], s.ctx);
    const text = s.out.raw();
    assert.equal(code, 0, text);
    const secret = /Generated password \(shown once[^)]*\): (\S+)/.exec(text)[1];
    assert.equal(count(text, secret), 1, "the secret must appear exactly once in everything printed");
    for (const name of ["compose.yaml", ".env", ".worldlens-setup.json"]) {
        const content = fs.readFileSync(path.join(s.dir, name), "utf8");
        assert.ok(!content.includes(secret), `${name} must not hold the password`);
        if (process.platform !== "win32") assert.equal(fs.statSync(path.join(s.dir, name)).mode & 0o077, 0, `${name} must be private`);
    }
    assert.match(fs.readFileSync(path.join(s.dir, ".env"), "utf8"), new RegExp(`WORLDLENS_PASSWORD_SHA256=${hashPassword(secret)}`));
    assert.ok(exists(path.join(s.dir, "renders")), "the default writable folder is created");
    assert.deepEqual(s.run.lines().map((l) => l.split(" --project-directory")[0]), [
        "docker --version",
        "docker compose version",
        "docker info --format {{.ServerVersion}}",
        "docker compose",
        "docker compose",
    ]);
    assert.match(s.run.lines()[3], / pull$/);
    assert.match(s.run.lines()[4], / up -d$/);
    assert.match(text, /This computer:  http:\/\/127\.0\.0\.1:8110\//);
    assert.doesNotMatch(text, /Your network/);
    assert.match(text, /one shared password and no separate accounts/);
});

test("the LAN choice publishes on the network and verifies the address from this computer", async (t) => {
    const s = sandbox(t);
    const code = await main(["--yes", "--lan", "--port", "9150", "--no-pull"], s.ctx);
    assert.equal(code, 0, s.out.raw());
    assert.match(fs.readFileSync(path.join(s.dir, "compose.yaml"), "utf8"), /- "9150:8110"/);
    assert.match(s.out.raw(), /Your network:   http:\/\/192\.168\.1\.20:9150\/  \(answered when tried from this computer; not tried from another device\)/);
    assert.ok(!s.run.lines().some((l) => l.endsWith(" pull")));
});

test("a re-run keeps the password, port and folders, and can still change one thing", async (t) => {
    const world = fs.mkdtempSync(path.join(os.tmpdir(), "worldlens-world-"));
    t.after(() => fs.rmSync(world, { recursive: true, force: true }));
    const s = sandbox(t);
    assert.equal(await main(["--yes", "--worlds", `${world}=My worlds`, "--port", "9200"], s.ctx), 0, s.out.raw());
    const first = await loadExisting(s.dir);
    assert.equal(first.port, 9200);
    assert.deepEqual(first.folders.map((f) => f.label), ["My worlds", "Renders"]);

    const again = sandbox(t, { isPortFree: async (p) => p !== 9200 });
    again.ctx.homedir = s.home;
    again.ctx.cwd = s.root;
    assert.equal(await main(["--yes", "--no-start"], again.ctx), 0, again.out.raw());
    assert.doesNotMatch(again.out.raw(), /Generated password/);
    const second = await loadExisting(s.dir);
    assert.equal(second.passwordHash, first.passwordHash);
    assert.equal(second.port, 9200);
    assert.deepEqual(second.folders, first.folders);

    const changed = sandbox(t);
    changed.ctx.homedir = s.home;
    changed.ctx.cwd = s.root;
    assert.equal(await main(["--yes", "--no-start", "--port", "9300", "--lan"], changed.ctx), 0, changed.out.raw());
    const third = await loadExisting(s.dir);
    assert.equal(third.passwordHash, first.passwordHash);
    assert.equal(third.port, 9300);
    assert.equal(third.reach, "lan");
    assert.deepEqual(third.folders, first.folders);

    const reset = sandbox(t);
    reset.ctx.homedir = s.home;
    reset.ctx.cwd = s.root;
    assert.equal(await main(["--yes", "--no-start", "--reset-password"], reset.ctx), 0);
    assert.match(reset.out.raw(), /Generated password/);
    assert.notEqual((await loadExisting(s.dir)).passwordHash, first.passwordHash);
});

test("a file this setup did not create is never replaced without the flag, and the difference is shown", async (t) => {
    const s = sandbox(t);
    fs.mkdirSync(s.dir, { recursive: true });
    const mine = "services:\n  hand-made: {}\n";
    fs.writeFileSync(path.join(s.dir, "compose.yaml"), mine);
    const code = await main(["--yes"], s.ctx);
    assert.equal(code, 2);
    assert.equal(fs.readFileSync(path.join(s.dir, "compose.yaml"), "utf8"), mine);
    assert.ok(!exists(path.join(s.dir, ".env")), "nothing else is written either");
    assert.match(s.out.raw(), / - {3}hand-made: \{\}/);
    assert.match(s.out.raw(), /--overwrite/);
    assert.doesNotMatch(s.out.raw(), /Generated password/);

    const forced = sandbox(t);
    forced.ctx.homedir = s.home;
    forced.ctx.cwd = s.root;
    assert.equal(await main(["--yes", "--overwrite", "--no-start"], forced.ctx), 0, forced.out.raw());
    assert.match(fs.readFileSync(path.join(s.dir, "compose.yaml"), "utf8"), /^# Created by the WorldLens setup/);
});

test("without Docker the files are still written, the password is still shown once and Docker is never installed", async (t) => {
    const run = makeRun((cmd, args) => (args[0] === "--version" ? { code: -1, stdout: "", stderr: "not found", missing: true } : undefined));
    const s = sandbox(t, { run });
    const code = await main(["--yes"], s.ctx);
    assert.equal(code, 3);
    assert.ok(exists(path.join(s.dir, "compose.yaml")));
    assert.match(s.out.raw(), /never installs Docker/);
    assert.equal(count(s.out.raw(), /Generated password[^:]*: (\S+)/.exec(s.out.raw())[1]), 1);
    assert.deepEqual(s.run.lines(), ["docker --version"]);

    const down = sandbox(t, { run: makeRun((_c, args) => (args[0] === "info" ? { code: 1, stdout: "", stderr: "daemon" } : undefined)) });
    assert.equal(await main(["--yes"], down.ctx), 3);
    assert.match(down.out.raw(), /not running/);
});

test("a pull failure and a start failure are reported with the tool's own words and a non-zero exit", async (t) => {
    const pull = sandbox(t, { run: makeRun((_c, args) => (args.includes("pull") ? { code: 1, stdout: "", stderr: "manifest unknown" } : undefined)) });
    assert.equal(await main(["--yes"], pull.ctx), 4);
    assert.match(pull.out.raw(), /could not be pulled \(exit 1\)[\s\S]*manifest unknown/);
    assert.doesNotMatch(pull.out.raw(), /is running/);

    const up = sandbox(t, { run: makeRun((_c, args) => (args.includes("up") ? { code: 1, stdout: "", stderr: "port is already allocated" } : undefined)) });
    assert.equal(await main(["--yes"], up.ctx), 4);
    assert.match(up.out.raw(), /port is already allocated/);
});

test("a container that never answers is a failure at the deadline, with the last log lines", async (t) => {
    const run = makeRun((_c, args) => (args.includes("logs") ? { code: 0, stdout: "boot failed: bad mounts", stderr: "" } : undefined));
    const s = sandbox(t, { run, fetchFn: async () => Promise.reject(new Error("connect ECONNREFUSED")) });
    const code = await main(["--yes", "--health-timeout", "5"], s.ctx);
    assert.equal(code, 4);
    assert.match(s.out.raw(), /did not answer within 5 seconds \(connect ECONNREFUSED\)/);
    assert.match(s.out.raw(), /boot failed: bad mounts/);
    assert.doesNotMatch(s.out.raw(), /WorldLens is running/);
});

test("a supplied password is never echoed, and a generated one can go to a private file instead of the screen", async (t) => {
    const stdin = sandbox(t, { ctx: { stdin: stdinOf("correct-horse-battery-9\nignored second line\n") } });
    assert.equal(await main(["--yes", "--password-stdin", "--no-start"], stdin.ctx), 0, stdin.out.raw());
    assert.doesNotMatch(stdin.out.raw(), /correct-horse/);
    assert.doesNotMatch(stdin.out.raw(), /Generated password/);
    assert.equal((await loadExisting(stdin.dir)).passwordHash, hashPassword("correct-horse-battery-9"));

    const envPw = sandbox(t, { ctx: { env: { WORLDLENS_SETUP_PASSWORD: "another-long-password-1" } } });
    assert.equal(await main(["--yes", "--no-start"], envPw.ctx), 0);
    assert.doesNotMatch(envPw.out.raw(), /another-long/);

    const weak = sandbox(t, { ctx: { env: { WORLDLENS_SETUP_PASSWORD: "weak" } } });
    assert.equal(await main(["--yes", "--no-start"], weak.ctx), 1);
    assert.ok(!weak.out.raw().includes("weak"));
    assert.ok(!exists(path.join(weak.dir, ".env")));

    const file = sandbox(t);
    assert.equal(await main(["--yes", "--no-start", "--password-out", "pw.txt"], file.ctx), 0);
    const generated = fs.readFileSync(path.join(file.root, "pw.txt"), "utf8").trim();
    assert.equal(count(file.out.raw(), generated), 0);
    assert.equal((await loadExisting(file.dir)).passwordHash, hashPassword(generated));
});

test("unattended input is validated with specific refusals before anything is written", async (t) => {
    const cases = [
        [["--port", "99999"], /--port: A port is a whole number/],
        [["--capability", "root"], /"root" is not a capability/],
        [["--image", "ghcr.io/x/y:latest"], /pinned by a sha256 digest/],
        [["--worlds", "/definitely/not/here"], /That folder does not exist/],
        [["--lan", "--local-only"], /either --lan or --local-only/],
        [["--name", "Bad Name"], /--name:/],
        [["--health-timeout", "soon"], /whole number of seconds/],
    ];
    for (const [args, pattern] of cases) {
        const s = sandbox(t);
        assert.equal(await main(["--yes", ...args], s.ctx), 1, args.join(" "));
        assert.match(s.out.raw(), pattern);
        assert.ok(!exists(s.dir), "nothing written after a refusal");
    }
    const label = sandbox(t);
    assert.equal(await main(["--yes", "--worlds", `${label.root}=a:b`], label.ctx), 1);
    assert.match(label.out.raw(), /cannot contain a comma, a colon/);
    const busy = sandbox(t, { isPortFree: async () => false });
    assert.equal(await main(["--yes", "--port", "9400"], busy.ctx), 1);
    assert.match(busy.out.raw(), /Port 9400 is already in use/);
});

test("answersFromOptions treats a hand-made state file as foreign", async (t) => {
    const s = sandbox(t);
    fs.mkdirSync(s.dir, { recursive: true });
    fs.writeFileSync(path.join(s.dir, ".worldlens-setup.json"), JSON.stringify({ port: 1234, createdBy: "someone-else", version: 1 }));
    assert.equal(await loadExisting(s.dir), null);
    const built = await answersFromOptions({}, s.ctx);
    assert.notEqual(built.answers.port, 1234);
});

/* ---------- arrow-key interface ---------- */

const SEVEN_ENTERS = () => Array(7).fill(K.enter);

test("the terminal interface walks every question, writes nothing before the review is accepted, and shows the password once", async (t) => {
    const s = sandbox(t, { tty: true });
    s.ctx.keysFor = () =>
        scriptKeys([
            K.enter, // folder
            K.enter, // password: generate
            K.enter, // port
            K.down, K.enter, // reach: other computers
            K.enter, // folders: continue
            K.down, K.space, K.enter, // extras: tick ssh
            K.down, K.enter, // behind a proxy: yes
            () => assert.ok(!exists(path.join(s.dir, "compose.yaml")), "nothing may be written before the review is accepted"),
            K.enter, // write and start
            typed("c"), // copy
            K.enter,
        ]);
    const code = await main([], s.ctx);
    assert.equal(code, 0, s.out.plain());
    const compose = fs.readFileSync(path.join(s.dir, "compose.yaml"), "utf8");
    assert.match(compose, /- "8110:8110"/);
    assert.match(compose, /WORLDLENS_CAPABILITIES: "ssh"/);
    assert.match(compose, /WORLDLENS_BEHIND_TLS: "1"/);
    const secret = /Your WorldLens password[^\n]*\n\s+(\S+)/.exec(s.out.raw())[1];
    assert.equal(count(s.out.raw(), secret), 1, "the password is printed once and never redrawn");
    assert.match(s.out.plain(), /Copied to the clipboard/);
    assert.equal(s.run.calls.find((c) => c.input !== undefined && c.input === secret) !== undefined, true, "the copy key hands the password to the clipboard tool");
    assert.match(s.out.plain(), /Review[\s\S]*Port:      8110 \(other computers on your network\)/);
    assert.equal((await loadExisting(s.dir)).passwordHash, hashPassword(secret));
});

test("live validation blocks Enter, Back returns to the previous question, and a typed password is masked and confirmed", async (t) => {
    const s = sandbox(t, { tty: true });
    const seen = (re) => () => assert.match(s.out.plain(), re);
    s.ctx.keysFor = () =>
        scriptKeys([
            K.enter, // folder
            K.enter, // password: generate
            K.ctrlU, typed("99999"), K.enter, // port out of range: refused
            seen(/A port is a whole number from 1 to 65535/),
            K.esc, // Back to the password question
            K.down, K.enter, // type my own
            typed("short"), K.enter,
            seen(/Use at least 12 characters \(5 so far\)/),
            K.ctrlU, typed("correct-horse-battery-9"), K.enter,
            typed("nope"), K.enter,
            seen(/These two do not match yet/),
            K.ctrlU, typed("correct-horse-battery-9"), K.enter,
            K.enter, // port
            K.enter, // local only
            K.enter, // folders
            K.enter, // extras
            K.enter, // proxy
            K.down, K.enter, // write the files only
        ]);
    const code = await main([], s.ctx);
    assert.equal(code, 0, s.out.plain());
    assert.doesNotMatch(s.out.raw(), /correct-horse/);
    assert.equal((await loadExisting(s.dir)).passwordHash, hashPassword("correct-horse-battery-9"));
    assert.equal(s.run.calls.length, 0, "files only means Docker is never touched");
    assert.doesNotMatch(s.out.plain(), /Your WorldLens password/);
});

test("cancelling at the review, or pressing Ctrl+C anywhere, changes nothing", async (t) => {
    const review = sandbox(t, { tty: true });
    review.ctx.keysFor = () => scriptKeys([...SEVEN_ENTERS(), K.down, K.down, K.enter]);
    assert.equal(await main([], review.ctx), 0, review.out.plain());
    assert.match(review.out.plain(), /Nothing was written/);
    assert.ok(!exists(review.dir));

    const hardStop = sandbox(t, { tty: true });
    hardStop.ctx.keysFor = () => scriptKeys([K.enter, K.ctrlC]);
    assert.equal(await main([], hardStop.ctx), 130);
    assert.ok(!exists(hardStop.dir));
});

test("re-running the interface keeps the earlier password by default and does not print another", async (t) => {
    const first = sandbox(t, { tty: true });
    // folder, password, port, reach, folders, extras, proxy, review (write and start), reveal
    first.ctx.keysFor = () => scriptKeys([K.enter, K.enter, K.enter, K.enter, K.enter, K.enter, K.enter, K.enter, K.enter]);
    assert.equal(await main([], first.ctx), 0, first.out.plain());
    const before = await loadExisting(first.dir);

    const again = sandbox(t, { tty: true, isPortFree: async (p) => p !== before.port });
    again.ctx.homedir = first.home;
    again.ctx.cwd = first.root;
    again.ctx.keysFor = () => scriptKeys([K.enter, K.enter, K.enter, K.enter, K.enter, K.enter, K.enter, K.enter]);
    assert.equal(await main([], again.ctx), 0, again.out.plain());
    assert.match(again.out.plain(), /Found an earlier setup/);
    assert.match(again.out.plain(), /Password:  unchanged/);
    assert.doesNotMatch(again.out.plain(), /Your WorldLens password/);
    assert.equal((await loadExisting(first.dir)).passwordHash, before.passwordHash);
});

test("a foreign file at the review shows its diff and needs an explicit replace choice", async (t) => {
    const s = sandbox(t, { tty: true });
    fs.mkdirSync(s.dir, { recursive: true });
    fs.writeFileSync(path.join(s.dir, ".env"), "SOMETHING=mine\n");
    s.ctx.keysFor = () => scriptKeys([K.enter, K.enter, K.enter, K.enter, K.enter, K.enter, K.enter, K.down, K.down, K.enter]);
    assert.equal(await main([], s.ctx), 0, s.out.plain());
    assert.match(s.out.plain(), /\.env already exists and was not created by this setup/);
    assert.match(s.out.plain(), /- SOMETHING=mine/);
    assert.equal(fs.readFileSync(path.join(s.dir, ".env"), "utf8"), "SOMETHING=mine\n");
});

/* ---------- plain line prompts ---------- */

test("without a terminal the same questions are asked one line at a time, with back and defaults", async (t) => {
    const s = sandbox(t);
    s.ctx.lines = lineSource([
        "", // folder
        "1", // password: generate
        "", // port
        "<", // at the reach question: back to the port question
        "", // port again
        "2", // other computers
        "", // folders: continue
        "", // extras
        "", // proxy
        "1", // write and start
    ]);
    const code = await main(["--plain"], s.ctx);
    assert.equal(code, 0, s.out.plain());
    const text = s.out.raw();
    const secret = /Your WorldLens password[^\n]*\n\s+(\S+)/.exec(text)[1];
    assert.equal(count(text, secret), 1);
    assert.match(text, /Choose 1-2/);
    assert.match(fs.readFileSync(path.join(s.dir, "compose.yaml"), "utf8"), /- "8110:8110"/);
    assert.equal(s.run.lines().length, 5);
});

test("a plain prompt refuses a bad answer in words and asks again; running out of input cancels cleanly", async (t) => {
    const s = sandbox(t);
    s.ctx.lines = lineSource(["", "1", "abc", "70000", "9500", "1", "", "", "", "3"]);
    assert.equal(await main([], s.ctx), 0, s.out.plain());
    assert.match(s.out.raw(), /A port is a whole number from 1 to 65535\./);
    assert.ok(!exists(s.dir));

    const cut = sandbox(t);
    cut.ctx.lines = lineSource(["", "1"]);
    assert.equal(await main([], cut.ctx), 130);
    assert.match(cut.out.raw(), /Input ended before the setup finished/);
    assert.ok(!exists(cut.dir));
});

test("BACK is a real value the wizard understands", () => {
    assert.equal(typeof BACK, "symbol");
});
