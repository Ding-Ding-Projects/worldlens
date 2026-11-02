# Contour: a fresh visual direction for WorldLens (2026-11-02)

**Status:** design proposal, not implemented. The approved prototype is still
`design/Worldlens.dc.html`; this folder is an alternative look built on the same
design system (`design/tokens.css`), the same Material Design 3 rules and the same
feature set. Nothing has been removed.

Canvas: six artboards, each a clickable, full-window page with a `theme` tweak
(dark, light, contrast) that switches every colour role at once.

| File | Screen |
| --- | --- |
| `Main.dc.html` | Home: the last-opened map, what is happening now, the six catalogues |
| `Map.dc.html` | Map viewer with a floating toolbar and an opaque map menu side sheet |
| `Work.dc.html` | Work, showing the Renders job: stages, throughput, live thread count, repair offer |
| `Settings.dc.html` | Settings as a full destination: list of sections on the left, one section on the right |
| `Appearance.dc.html` | Appearance editor taking the whole window, with the element lock dialog over a scrim |
| `Servers.dc.html` | Minecraft servers: list, start and stop, console, configuration, plugins, players, web console |

`canvas.json` is the canvas index. Images are referenced as uploaded canvas
assets (`/_blob/...`); the source files are in `assets/` (`worldlens-logo-256.png`
is the logo, `map-render.png` the map render).

## What changed, and why

1. **One surface in focus.** A screenshot of 1.0.2130 showed the appearance
   editor, the settings drawer and the lock dialog all open at once and
   translucent, so three layers of text printed over each other. In Contour,
   Settings is a rail destination, an editor takes the whole window, and a dialog
   always sits on a scrim. No surface is translucent and nothing stacks.
2. **Panes, not chrome.** The rail and the top bar sit on the background; content
   sits on one raised pane with a 28px corner. Side sheets are separate panes
   beside the content, never drawn over it.
3. **Global search moves to the top bar** as a Material 3 search bar with the
   Ctrl+Shift+F hint, so it is visible on every screen.
4. **Settings returns to the rail** (Home, Map, Work, Servers, then Settings at the
   bottom). Notifications stay a bell in the top bar.
5. **Expressive shapes for wayfinding.** Each Home catalogue gets its own tonal
   container shape, so the six read apart at a glance without new colours.
6. **Status reads as status.** Running work is a primary-container chip in the top
   bar and a card on Home; failures use the error container, interruptions the
   tertiary container with the proposed repair inline.

## Contrast notes

- Light and contrast schemes use the exact role values from `tokens.css`. The light
  scheme's `surface` is pure white here so panes separate from the `#F7F9FF`
  background; bring that back to `#F1F4FA` if the panes should be flatter.
- The servers screen adds one role, `--wl-ok` (running status dot), which is not in
  `tokens.css` yet. Add it there before implementing.

## To implement

Decide first whether Contour replaces `Worldlens.dc.html` as the approved
prototype. If it does, the unfinished checkpoint described in `design/HANDOFF.md`
should be finished against Contour instead, starting with the overlay rule in
point 1, because that is the defect users can see today.
