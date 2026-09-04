/**
 * The page that says what this render actually was, published beside the map it made.
 *
 * A published map is a map and nothing else. It does not say which world it came from,
 * when, from which commit, how many shards it took, or - the part people actually come
 * back for - that the world itself was uploaded and is still sitting there as a release
 * asset they can download. All of that is known at publish time and was being thrown away.
 *
 * So it is written out, at `/render/`, beside `/map/`. Not inside the map: the map is
 * upstream's webapp and putting a page of ours inside it would be a file that upstream's
 * next release quietly overwrites.
 *
 * ## What it will not do
 *
 * It states only what it was handed. A render with no backup record shows no backups
 * rather than an empty table implying none were made; a missing duration is absent rather
 * than zero. Every number here is one somebody could check against the run, and a
 * dashboard that rounded or guessed would be worse than no dashboard, because it would be
 * believed.
 */

/** One world backup, as `worlds/index.json` records it. */
export interface DashboardBackup {
    readonly label: string;
    readonly releaseTag: string;
    readonly bytes: number;
    readonly sha256: string;
    readonly createdAt: string;
    readonly parts: number;
}

export interface RenderDashboardInput {
    readonly owner: string;
    readonly repo: string;
    /** The map this render produced, as its id and its display name. */
    readonly mapId: string;
    readonly mapName: string;
    /** The world folder the render read. */
    readonly world: string;
    /** The commit the toolchain ran from, so the page can be traced to code. */
    readonly commit: string | null;
    /** The workflow run, for the link back to its logs. */
    readonly runId: string | null;
    /** How many shards the plan produced. Null when the plan did not say. */
    readonly shards: number | null;
    /** ISO-8601, UTC. */
    readonly renderedAt: string;
    /** Newest first. Empty is a real answer and renders as such. */
    readonly backups: readonly DashboardBackup[];
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function humanBytes(bytes: number): string {
    if (bytes < 1024) return `${String(bytes)} B`;
    const units = ["KiB", "MiB", "GiB", "TiB"];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${value.toFixed(1)} ${units[unit]}`;
}

/**
 * The Material Design 3 tokens this page uses, defined inline.
 *
 * Inline because the page is published to a static host with nothing else of ours beside
 * it, and a stylesheet fetched from anywhere would be a network dependency on a page whose
 * whole point is to still work later. Both themes are defined - the light values on bare
 * `:root` and the dark ones behind `prefers-color-scheme`, so a viewer's own setting is
 * honoured rather than a single look being imposed.
 */
const STYLE = `
:root {
  color-scheme: light dark;
  --md-sys-color-surface: #faf9fd;
  --md-sys-color-on-surface: #1a1c1e;
  --md-sys-color-surface-container: #eeedf1;
  --md-sys-color-surface-container-high: #e8e7ec;
  --md-sys-color-on-surface-variant: #43474e;
  --md-sys-color-primary: #1a5ba8;
  --md-sys-color-on-primary: #ffffff;
  --md-sys-color-outline-variant: #c3c6cf;
  --md-sys-color-shadow: #000000;
}
@media (prefers-color-scheme: dark) {
  :root {
    --md-sys-color-surface: #111318;
    --md-sys-color-on-surface: #e2e2e6;
    --md-sys-color-surface-container: #1d2024;
    --md-sys-color-surface-container-high: #282a2f;
    --md-sys-color-on-surface-variant: #c3c6cf;
    --md-sys-color-primary: #a9c7ff;
    --md-sys-color-on-primary: #00325b;
    --md-sys-color-outline-variant: #43474e;
    --md-sys-color-shadow: #000000;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 24px;
  background: var(--md-sys-color-surface);
  color: var(--md-sys-color-on-surface);
  font: 400 16px/24px system-ui, sans-serif;
}
main { max-width: 900px; margin: 0 auto; }
h1 { font-size: 24px; line-height: 32px; font-weight: 500; margin: 0 0 4px; }
h2 { font-size: 16px; line-height: 24px; font-weight: 500; margin: 32px 0 8px; }
.sub { color: var(--md-sys-color-on-surface-variant); font-size: 14px; line-height: 20px; }
.card {
  background: var(--md-sys-color-surface-container);
  border-radius: 12px;
  padding: 16px;
  margin-top: 16px;
  /* Elevation level 1. A container at rest sits on the surface rather than being painted
     flat onto it, which is what separates a card from a coloured div. */
  box-shadow: 0 1px 2px rgb(from var(--md-sys-color-shadow) r g b / 0.3),
              0 1px 3px 1px rgb(from var(--md-sys-color-shadow) r g b / 0.15);
}
dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; margin: 0; }
dt { color: var(--md-sys-color-on-surface-variant); font-size: 14px; }
dd { margin: 0; overflow-wrap: anywhere; }
a { color: var(--md-sys-color-primary); }
a:focus-visible, .cta:focus-visible { outline: 3px solid var(--md-sys-color-primary); outline-offset: 2px; }
/*
 * A real Material Design 3 filled button, not a coloured rectangle.
 *
 * The state layer is the part most often left out, and it is what makes a control feel
 * answerable: an overlay of the foreground colour at the specified opacity, drawn as a
 * pseudo-element so the button's own colour is never swapped for a second hand-picked one.
 * The opacities are the specification's, not approximations of it.
 *
 * The visible pill is 40px because that is the button's height; the touch target around it is
 * 48px, because that is what a finger needs. Making the pill 48px would be a fat button
 * rather than an accessible one.
 */
.cta {
  position: relative;
  isolation: isolate;
  display: inline-flex;
  align-items: center;
  margin-top: 16px;
  padding: 10px 24px;
  min-height: 40px;
  border-radius: 9999px;
  background: var(--md-sys-color-primary);
  color: var(--md-sys-color-on-primary);
  text-decoration: none;
  font-weight: 500;
  overflow: hidden;
  transition: box-shadow 150ms cubic-bezier(0.2, 0, 0, 1);
}
.cta::after {
  content: "";
  position: absolute;
  inset: -4px 0;
  min-height: 48px;
}
.cta::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  background: currentColor;
  opacity: 0;
  transition: opacity 150ms cubic-bezier(0.2, 0, 0, 1);
}
.cta:hover::before { opacity: 0.08; }
.cta:focus-visible::before { opacity: 0.1; }
.cta:active::before { opacity: 0.1; }
.cta:hover { box-shadow: 0 1px 2px rgb(from var(--md-sys-color-shadow) r g b / 0.3), 0 1px 3px 1px rgb(from var(--md-sys-color-shadow) r g b / 0.15); }
@media (prefers-reduced-motion: reduce) {
  .cta, .cta::before { transition: none; }
}
.scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 14px; }
th, td { text-align: left; padding: 12px 16px; border-bottom: 1px solid var(--md-sys-color-outline-variant); }
th { color: var(--md-sys-color-on-surface-variant); font-weight: 500; }
code { background: var(--md-sys-color-surface-container-high); border-radius: 4px; padding: 0 4px; }
`.trim();

/** Renders the dashboard. Pure, so its output is a value a test can read. */
export function renderDashboardHtml(input: RenderDashboardInput): string {
    const base = `https://github.com/${input.owner}/${input.repo}`;
    const rows = input.backups.map(
        (backup) =>
            `<tr><td>${escapeHtml(backup.label)}</td>` +
            `<td>${escapeHtml(backup.createdAt)}</td>` +
            `<td>${escapeHtml(humanBytes(backup.bytes))}</td>` +
            `<td>${String(backup.parts)}</td>` +
            `<td><a href="${base}/releases/tag/${encodeURIComponent(backup.releaseTag)}">download</a></td></tr>`,
    );

    // Absent rather than zero. A duration or shard count nobody measured is not "0".
    const optional = (label: string, value: string | null) =>
        value === null ? "" : `<dt>${label}</dt><dd>${escapeHtml(value)}</dd>`;

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(input.mapName)} — render</title>
<style>${STYLE}</style>
</head>
<body>
<main>
  <h1>${escapeHtml(input.mapName)}</h1>
  <p class="sub">Rendered from <code>${escapeHtml(input.world)}</code> on ${escapeHtml(input.renderedAt)}.</p>

  <a class="cta" href="../map/">Open the map</a>

  <h2>This render</h2>
  <div class="card">
    <dl>
      <dt>Map</dt><dd><code>${escapeHtml(input.mapId)}</code></dd>
      <dt>World</dt><dd><code>${escapeHtml(input.world)}</code></dd>
      ${optional("Shards", input.shards === null ? null : String(input.shards))}
      ${optional("Toolchain commit", input.commit)}
      ${
          input.runId === null
              ? ""
              : `<dt>Run</dt><dd><a href="${base}/actions/runs/${encodeURIComponent(input.runId)}">${escapeHtml(input.runId)}</a></dd>`
      }
    </dl>
  </div>

  <h2>World backups</h2>
  <div class="card">
    <p class="sub">Every render uploads its world before it starts, so each one leaves a
    backup behind. These are release assets: they do not expire, and this application never
    deletes or overwrites one.</p>
    ${
        rows.length === 0
            ? `<p class="sub">No backup has been recorded for this repository yet. That means none
    was found in <code>worlds/index.json</code> - not that the world was not uploaded.</p>`
            : `<div class="scroll"><table>
      <thead><tr><th>World</th><th>Uploaded</th><th>Size</th><th>Assets</th><th></th></tr></thead>
      <tbody>${rows.join("")}</tbody>
    </table></div>`
    }
  </div>
</main>
</body>
</html>
`;
}
