/**
 * The page a signed-in person gets on the server management site.
 *
 * Before this, signing in reloaded `/` and the site answered 404: the sign-in page was the
 * only page there was, and every server control existed only as an API. This page is built on
 * those same routes and nothing else: the server list, its status, start, stop and restart,
 * the live console over server-sent events with a command box, the players the server knows
 * with operator, whitelist, kick and ban actions, putting a data pack into the server's world, and,
 * when the site runs with named accounts, the people who can manage it, invitations and
 * removal. Removing a person goes through a two-key and slider gate on the page itself.
 *
 * Plain HTML, CSS and script with no outside assets, the same as the sign-in page, so the
 * site works on an appliance with no internet. Design: `design-sources/deploy-anywhere/Admin.dc.html`.
 */

export const MANAGE_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Server management</title>
<style>
:root{color-scheme:dark}
body{margin:0;font:15px/1.5 system-ui,sans-serif;background:#101418;color:#e1e2e8}
header{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid #42474e}
h1{font-weight:400;font-size:24px;margin:0}
h2{font-weight:500;font-size:16px;margin:0}
main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:16px;padding:16px 24px 32px}
section{background:#1d2024;border-radius:24px;padding:16px 20px;display:flex;flex-direction:column;gap:10px;min-width:0}
.wide{grid-column:1/-1}
.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:#c2c7cf}
select,input[type=text]{height:40px;border-radius:8px;border:1px solid #8c9199;background:#101418;color:inherit;padding:0 10px;font:inherit}
button{min-height:40px;border-radius:20px;border:0;padding:0 18px;font:500 14px system-ui;background:#8fcdff;color:#003351;cursor:pointer}
button.alt{background:transparent;color:#8fcdff;border:1px solid #8c9199}
button.danger{background:#ffb4ab;color:#690005}
button:disabled{opacity:.45;cursor:not-allowed}
button[aria-pressed=true]{background:#cfe5ff;color:#001d33}
.pill{display:inline-flex;align-items:center;gap:6px;padding:2px 12px;border-radius:12px;background:#2b3036;font-size:13px}
.pill.on{background:#1b5e20;color:#c8f5c9}
#log{margin:0;background:#0b0e11;border-radius:12px;padding:10px 12px;font:12px/1.5 ui-monospace,Consolas,monospace;height:320px;overflow:auto;white-space:pre-wrap}
ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
li{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;padding:8px 12px;border-radius:12px;background:#272a2f}
.note{margin:0;font-size:13px;color:#c2c7cf}
.gate{display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:12px;border:1px solid #ffb4ab}
input[type=range]{width:100%}
[hidden]{display:none!important}
:focus-visible{outline:3px solid #8fcdff;outline-offset:2px}
@media (prefers-reduced-motion:no-preference){.gate.done{animation:flash .6s}@keyframes flash{from{background:#690005}to{background:transparent}}}
</style>
</head>
<body>
<header>
  <h1>Server management</h1>
  <div class="row"><span id="who" class="note"></span><button type="button" class="alt" id="signout">Sign out</button></div>
</header>
<main>
  <section aria-labelledby="h-server">
    <h2 id="h-server">Server</h2>
    <label id="pick-row" hidden>Server<select id="pick"></select></label>
    <p class="note" id="none" hidden>No server is registered on this site yet.</p>
    <div class="row"><span class="pill" id="state">Checking…</span><span class="note" id="checked"></span></div>
    <div class="row">
      <button type="button" id="start">Start</button>
      <button type="button" class="alt" id="stop">Stop</button>
      <button type="button" class="alt" id="restart">Restart</button>
    </div>
    <p class="note" id="server-why"></p>
  </section>
  <section aria-labelledby="h-pack">
    <h2 id="h-pack">Add a data pack</h2>
    <p class="note">Choose a .zip made in the WorldLens data pack studio or anywhere else. It goes into this server's world datapacks folder; a pack with the same name is backed up and replaced. Run /reload in the console to turn it on.</p>
    <label>Data pack (.zip)<input type="file" id="pack" accept=".zip,application/zip"></label>
    <div class="row"><button type="button" id="upload" disabled>Add to the world</button></div>
    <p class="note" id="upload-why">Choose a .zip first.</p>
  </section>
  <section class="wide" aria-labelledby="h-console">
    <h2 id="h-console">Console</h2>
    <pre id="log" role="log" aria-live="polite" tabindex="0" aria-label="Server console"></pre>
    <form class="row changes" id="cmd-form">
      <label style="flex:1 1 260px">Send a command (no slash needed)<input type="text" id="cmd" maxlength="256" autocomplete="off"></label>
      <button type="submit" id="cmd-send">Send</button>
      <button type="button" class="alt" id="online">Who is online</button>
    </form>
  </section>
  <section class="wide" aria-labelledby="h-players">
    <h2 id="h-players">Players</h2>
    <p class="note">Everyone this server has seen, from its own player files. Who is online right now shows in the console when you press Who is online.</p>
    <label>Find a player<input type="text" id="player-find" autocomplete="off"></label>
    <ul id="players"></ul>
    <p class="note" id="players-why"></p>
    <label class="changes">Reason for a kick or ban (optional)<input type="text" id="reason" maxlength="200" autocomplete="off"></label>
  </section>
  <section class="wide" id="people" hidden aria-labelledby="h-people">
    <h2 id="h-people">People who can manage this server</h2>
    <ul id="accounts"></ul>
    <div class="row">
      <label>Role for a new person<select id="role"><option value="viewer">Viewer: sees everything, changes nothing</option><option value="operator">Operator: starts, stops and adds packs</option><option value="admin">Admin: also invites and removes people</option></select></label>
      <button type="button" id="invite">Invite someone</button>
    </div>
    <p class="note" id="invite-code" role="status"></p>
    <fieldset id="policy-box" class="changes" style="border:1px solid #42474e;border-radius:16px;display:flex;flex-wrap:wrap;gap:12px;align-items:center">
      <legend>What everyone must use to sign in</legend>
      <label style="flex-direction:row;align-items:center"><input type="checkbox" id="p-password"> Password</label>
      <label style="flex-direction:row;align-items:center"><input type="checkbox" id="p-passkey"> Passkey</label>
      <label style="flex-direction:row;align-items:center"><input type="checkbox" id="p-totp"> Authenticator code</label>
      <button type="button" id="policy-save">Save</button>
      <span class="note" id="policy-why"></span>
    </fieldset>
    <div class="gate" id="gate" hidden role="group" aria-labelledby="gate-title">
      <strong id="gate-title"></strong>
      <p class="note">Both keys, then slide all the way to confirm. Cancel or Escape stops it; nothing is removed until the slider reaches the end.</p>
      <div class="row"><button type="button" class="alt" id="key1" aria-pressed="false">First key</button><button type="button" class="alt" id="key2" aria-pressed="false">Second key</button><button type="button" class="alt" id="gate-cancel">Cancel</button></div>
      <label>Slide to remove<input type="range" id="slide" min="0" max="100" value="0" disabled></label>
    </div>
  </section>
  <p class="note wide" id="status" role="status" aria-live="polite"></p>
</main>
<script src="/manage.js"></script>
</body>
</html>
`;

export const MANAGE_SCRIPT = `"use strict";
const $ = (id) => document.getElementById(id);
let servers = [];
let current = null;
let source = null;
let removing = null;
let returnFocus = null;
let role = null;
let players = [];
const canChange = () => role !== "viewer";
const say = (text) => { $("status").textContent = text; };
async function api(path, init) {
  const r = await fetch(path, init);
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}
const reason = (b) => (b && (b.error || (b.failure && b.failure.message))) || "That did not work.";
async function loadServers() {
  const r = await api("/api/servers");
  if (r.status === 401) { location.reload(); return; }
  servers = r.body.ok ? r.body.value : [];
  $("none").hidden = servers.length > 0;
  $("pick-row").hidden = servers.length < 2;
  $("pick").innerHTML = "";
  for (const s of servers) { const o = document.createElement("option"); o.value = s.id; o.textContent = s.name; $("pick").append(o); }
  choose(servers.length ? servers[0].id : null);
}
function choose(id) {
  current = id;
  $("log").textContent = "";
  if (source) source.close();
  source = null;
  for (const b of ["start", "stop", "restart"]) $(b).disabled = id === null;
  $("server-why").textContent = id === null ? "Nothing to control until a server is registered." : "";
  refreshUpload();
  if (id === null) { $("state").textContent = "No server"; return; }
  source = new EventSource("/api/servers/" + encodeURIComponent(id) + "/console");
  source.addEventListener("line", (e) => {
    try {
      const line = JSON.parse(e.data);
      const log = $("log");
      const atEnd = log.scrollTop + log.clientHeight >= log.scrollHeight - 8;
      log.textContent += line.text + "\\n";
      if (log.textContent.length > 200000) log.textContent = log.textContent.slice(-150000);
      if (atEnd) log.scrollTop = log.scrollHeight;
    } catch {}
  });
  refreshStatus();
  loadPlayers();
}
async function loadPlayers() {
  players = [];
  if (current !== null) {
    const r = await api("/api/servers/" + encodeURIComponent(current) + "/players");
    players = r.body.ok ? r.body.value : [];
    $("players-why").textContent = r.body.ok ? (players.length ? "" : "No players yet.") : reason(r.body);
  }
  drawPlayers();
}
function drawPlayers() {
  const q = $("player-find").value.trim().toLowerCase();
  const list = $("players");
  list.innerHTML = "";
  for (const p of players.filter((x) => q === "" || x.name.toLowerCase().includes(q))) {
    const li = document.createElement("li");
    const text = document.createElement("span");
    text.textContent = p.name + [p.op ? " · operator" : "", p.whitelisted ? " · whitelisted" : "", p.banned ? " · banned" + (p.banReason ? " (" + p.banReason + ")" : "") : ""].join("");
    li.append(text);
    if (canChange()) {
      const row = document.createElement("span");
      row.className = "row";
      const actions = [[p.op ? "deop" : "op", p.op ? "Remove operator" : "Make operator"], [p.whitelisted ? "whitelist-remove" : "whitelist-add", p.whitelisted ? "Take off whitelist" : "Whitelist"], ["kick", "Kick"], [p.banned ? "pardon" : "ban", p.banned ? "Unban" : "Ban"]];
      for (const [action, label] of actions) {
        const b = document.createElement("button");
        b.type = "button"; b.className = action === "ban" ? "danger" : "alt"; b.textContent = label;
        b.setAttribute("aria-label", label + " " + p.name);
        b.addEventListener("click", () => playerAction(action, p.name));
        row.append(b);
      }
      li.append(row);
    }
    list.append(li);
  }
}
async function playerAction(action, name) {
  if (current === null) return;
  const body = { action, name };
  if ((action === "kick" || action === "ban") && $("reason").value.trim()) body.reason = $("reason").value.trim();
  const r = await api("/api/servers/" + encodeURIComponent(current) + "/players", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  say(r.body.ok ? "Sent: " + r.body.value.command : reason(r.body));
  setTimeout(loadPlayers, 1500);
}
async function sendCmd(command) {
  if (current === null) return;
  const r = await api("/api/servers/" + encodeURIComponent(current) + "/command", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ command }) });
  say(r.body.ok ? "Sent: " + r.body.value.command : reason(r.body));
}
async function refreshStatus() {
  if (current === null) return;
  const r = await api("/api/servers/" + encodeURIComponent(current) + "/status");
  if (!r.body.ok) { $("state").textContent = "Unknown"; $("state").className = "pill"; $("checked").textContent = reason(r.body); return; }
  const s = r.body.value;
  $("state").textContent = s.running ? "Running" : (s.state || "Stopped");
  $("state").className = s.running ? "pill on" : "pill";
  $("checked").textContent = "Checked " + new Date(s.checkedAt).toLocaleTimeString();
}
async function lifecycle(action) {
  if (current === null) return;
  for (const b of ["start", "stop", "restart"]) $(b).disabled = true;
  say(action === "start" ? "Starting…" : action === "stop" ? "Stopping…" : "Restarting…");
  try {
    const path = (a) => "/api/servers/" + encodeURIComponent(current) + "/" + a;
    const post = (a) => api(path(a), { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    let r = action === "restart" ? await post("stop") : await post(action);
    if (action === "restart" && r.body.ok) r = await post("start");
    say(r.body.ok ? (action === "stop" ? "Stopped." : action === "start" ? "Started." : "Restarted.") : reason(r.body));
  } finally {
    for (const b of ["start", "stop", "restart"]) $(b).disabled = false;
    refreshStatus();
  }
}
function refreshUpload() {
  const file = $("pack").files[0];
  const why = current === null ? "There is no server to add it to." : !file ? "Choose a .zip first." : !/\\.zip$/i.test(file.name) ? "That is not a .zip file." : "";
  $("upload").disabled = why !== "";
  $("upload-why").textContent = why;
}
async function upload() {
  const file = $("pack").files[0];
  if (!file || current === null) return;
  $("upload").disabled = true;
  say("Adding " + file.name + "…");
  try {
    const r = await api("/api/servers/" + encodeURIComponent(current) + "/datapacks?name=" + encodeURIComponent(file.name), { method: "POST", headers: { "content-type": "application/zip" }, body: file });
    say(r.body.ok ? (r.body.value.replaced ? "Replaced " : "Added ") + r.body.value.path + ". Run /reload to turn it on." : reason(r.body));
  } finally {
    refreshUpload();
  }
}
async function loadPeople() {
  const r = await api("/api/accounts");
  if (!r.body.ok) { $("people").hidden = true; return; }
  $("people").hidden = false;
  for (const f of ["password", "passkey", "totp"]) $("p-" + f).checked = (r.body.policy || []).includes(f);
  const list = $("accounts");
  list.innerHTML = "";
  for (const a of r.body.accounts) {
    const li = document.createElement("li");
    const ways = [a.password ? "password" : null, a.passkeys ? a.passkeys + " passkey" + (a.passkeys > 1 ? "s" : "") : null, a.totp ? "authenticator code" : null].filter(Boolean).join(", ");
    const text = document.createElement("span");
    text.textContent = a.name + " · " + a.role + " · signs in with " + (ways || "nothing yet");
    li.append(text);
    if (a.role !== "owner" && (role === "owner" || role === "admin")) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "danger"; b.textContent = "Remove";
      b.setAttribute("aria-label", "Remove " + a.name);
      b.addEventListener("click", () => openGate(a, b));
      li.append(b);
    }
    list.append(li);
  }
}
function openGate(account, from) {
  removing = account; returnFocus = from;
  $("gate-title").textContent = "Remove " + account.name + " (" + account.role + "). They can no longer sign in to this site.";
  for (const k of ["key1", "key2"]) $(k).setAttribute("aria-pressed", "false");
  $("slide").value = "0"; $("slide").disabled = true;
  $("gate").hidden = false; $("gate").classList.remove("done");
  $("key1").focus();
}
function closeGate() {
  $("gate").hidden = true; removing = null;
  if (returnFocus) returnFocus.focus();
}
function keyToggle(id) {
  const k = $(id); k.setAttribute("aria-pressed", k.getAttribute("aria-pressed") === "true" ? "false" : "true");
  const both = $("key1").getAttribute("aria-pressed") === "true" && $("key2").getAttribute("aria-pressed") === "true";
  $("slide").disabled = !both; if (!both) $("slide").value = "0";
}
async function slid() {
  if (!removing || Number($("slide").value) < 100) return;
  const who = removing;
  $("slide").disabled = true;
  const r = await api("/api/accounts/remove", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: who.id }) });
  $("gate").classList.add("done");
  say(r.body.ok ? who.name + " was removed." : reason(r.body));
  setTimeout(() => { closeGate(); loadPeople(); }, 600);
}
$("pick").addEventListener("change", (e) => choose(e.target.value));
$("player-find").addEventListener("input", drawPlayers);
$("cmd-form").addEventListener("submit", (e) => { e.preventDefault(); const c = $("cmd").value; if (c.trim()) { sendCmd(c); $("cmd").value = ""; } });
$("online").addEventListener("click", () => sendCmd("list"));
$("policy-save").addEventListener("click", async () => {
  const policy = ["password", "passkey", "totp"].filter((f) => $("p-" + f).checked);
  if (!policy.length) { $("policy-why").textContent = "Choose at least one."; return; }
  const r = await api("/api/accounts/policy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ policy }) });
  $("policy-why").textContent = r.body.ok ? "Saved. Everyone signs in with: " + r.body.policy.join(", ") + "." : reason(r.body);
});
$("start").addEventListener("click", () => lifecycle("start"));
$("stop").addEventListener("click", () => lifecycle("stop"));
$("restart").addEventListener("click", () => lifecycle("restart"));
$("pack").addEventListener("change", refreshUpload);
$("upload").addEventListener("click", upload);
$("key1").addEventListener("click", () => keyToggle("key1"));
$("key2").addEventListener("click", () => keyToggle("key2"));
$("gate-cancel").addEventListener("click", closeGate);
$("gate").addEventListener("keydown", (e) => { if (e.key === "Escape") closeGate(); });
$("slide").addEventListener("change", slid);
$("invite").addEventListener("click", async () => {
  const r = await api("/api/accounts/invite", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: $("role").value }) });
  $("invite-code").textContent = r.body.ok ? "Give this single-use code to the new person: " + r.body.code : reason(r.body);
});
$("signout").addEventListener("click", async () => { await api("/api/auth/signout", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); location.reload(); });
api("/api/auth/status").then((r) => {
  const a = r.body.account;
  role = a ? a.role : null;
  $("who").textContent = a ? "Signed in as " + a.name + " (" + a.role + ")" : "Signed in";
  // A viewer sees everything and changes nothing, so the change controls are not shown at all.
  for (const el of document.querySelectorAll(".changes")) el.hidden = !canChange();
  for (const b of ["start", "stop", "restart", "upload", "invite"]) $(b).hidden = !canChange();
  $("policy-box").hidden = !(role === "owner" || role === "admin");
  loadServers();
  loadPeople();
});
setInterval(refreshStatus, 15000);
`;
