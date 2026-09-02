# Universal contracts on the static site

The site exposes a dedicated **Universal contracts** tab. It documents and demonstrates the
site's own controls without pretending to be the installed application. The tab is keyboard
reachable, responsive from narrow layouts, and all state is stored locally in the visitor's
browser.

## Language and tone

The existing site language mode remains the source of truth for English, playful Hong Kong
Cantonese, and bilingual copy. The two funny-level sliders remain independent. This tab uses a
compact bilingual equivalent for its own headings and keeps security and storage facts exact.

## Appearance

The site already registers every rendered element with the per-element appearance editor. The
Universal contracts tab opens that same editor for its own color control and editor chrome, rather
than substituting a second native color picker. The visible local studio covers continuous color
entry, typography size, weight, italic, underline, strikethrough, capitalization, character
spacing, and line height. The full editor supplies state layers, font previews, color-space
translations, rainbow sentinel support, named presets, import, export, and reset. Rainbow is
represented as a sentinel, never as a CSS color string, and reduced motion settles the hue.

Every mutation appends a redacted visitor-local history entry. Passwords, TOTP secrets, QR
payloads, and file metadata are never copied into history or exports.

## Search, menus, and tabs

The tab has its own plain-text search. Its adjacent builder supports a bounded JavaScript regular
expression, flags, sample text, syntax feedback, and a valid or invalid state. The resulting
pattern and flags drive the actual predicate, not only a data attribute. Dropdowns expose a local
filter and the same builder affordance. The site's browser-style tabs, groups, overflow, bulk
actions, and four tab searches remain provided by the shared tab modules.

## Locks

Each lock record names its target, scope, method, per-lock random salt, PBKDF2-SHA-256 work factor,
and duration. A lock can be for an element, property, tab, or group. Passwords never use unsalted
SHA-256. TOTP locks keep their own algorithm, digit count, period, and tab-memory secret because a
static site has no operating-system vault; after a reload the site asks the visitor to register
the URI again rather than pretending the secret survived safely.
The lock list keeps locked targets searchable and offers an honest Support Tickets route after a
wrong answer. Every rendered element's context menu, including the ContextMenu key and Shift+F10
path, opens a non-modal wizard anchored beside that exact element. The wizard keeps an immutable
target id, tracks the anchor while open, stays inside the viewport, and returns focus to the
originating element after cancel or creation. Clearing this site's storage is the self-service
recovery route. These are toy experience locks, not encryption or security boundaries.

## Authenticator

The URI and manual secret fields are hidden until the visitor explicitly reveals them.
Registration accepts an `otpauth://totp/` URI or the same fields manually, validates issuer,
account, base32, algorithm, 6 or 8 digits, and arbitrary bounded period values, and generates
RFC 6238 codes locally. The bundled QR encoder produces a real local SVG, with the URI as its text
alternative. Local QR-image decoding and camera scanning use `BarcodeDetector` when the browser
provides it, otherwise the controls stay visible with an honest disabled-state explanation.
Registration remains pending until the current code confirms the entry. The surface shows the
current countdown and next-code boundary, groups entries, searches them with a real predicate,
supports reorder and bulk metadata export, and omits secrets from every export. The full URI is
available only through an explicit copy action and is not placed in a data attribute, history
entry, export, capture metadata, or localStorage. No secret is sent over the network.

## Support Tickets

Support Tickets are fictional, local, and non-networked. A ticket moves through received, triaged,
and resolved states. The plain disclosure is intentionally outside the funny-level treatment:
nothing is sent, no outside ticket exists, and nobody reads it. The recovery action points back to
browser storage clearing. The site never clears storage from an unconfirmed button; it requires
two exact keys and a full-range confirmation slider.

## Unlock ladder

A static site cannot perform server-side nonce grading, so the browser equivalent states that
boundary while still shipping every rung locally. The state machine runs the dim-sum choices,
five-wrong transition, ten sums, wrong-sum transition, timed whack-a-mole with one hit per visible
mole, early-submit refusal, and final clock. It generates expiring nonces, consumes a rolling
three-wait budget, persists bounded stage and escalation state across rerender or reload, and
clears waiting only. It calls the real clock rather than manufacturing a future timestamp. It does not create a session,
set a cookie, reveal a credential, or refund the attempt budget. School-mode users start at the
sums, with the hidden dim-sum rung absent.

## Privacy and browser boundary

The site uses local browser storage only. It makes no network request for these controls. Browser
storage can be cleared by the visitor or reclaimed by the browser, so the surface never claims the
strength of a desktop credential vault. The closest static equivalent is stated beside the control
when a server, native vault, or second window cannot exist on a static host.

## Verification

The hand-written inventory is `src/policy/siteUniversalInventory.ts`. Its negative regression
removes a row and proves red, then restores the row and proves green. The structural inventory
retains older captures as pending evidence when their candidate commit is not the current build.
The strict evidence check remains red until a fresh built capture is produced with a matching
screen, state, theme, viewport, scale, accessibility tuple and candidate SHA. This source lane
does not publish a new built capture, so those older images are never relabelled as current proof.
Authenticator evidence is restricted to the synthetic redacted mode: it contains no secret, URI,
or QR payload metadata, and a real enrollment QR is never captured.
Focused tests cover URI round-tripping, RFC 6238 SHA-1 vectors, malformed base32, secret exclusion,
lock digest storage, waiting-only clearing, exact-origin wizard focus return, School-mode storage
handling, synthetic QR evidence, and inventory deletion detection.

Run:

```text
pnpm --filter @worldlens/site run typecheck
pnpm exec vitest run design/packages/site/src/universal design/packages/site/src/policy/siteUniversalInventory.test.ts
pnpm --filter @worldlens/site run build
```

The built interaction capture inventory is maintained with the site's existing capture harness.
When a browser lacks a native capability such as QR image decoding, the surface says so and keeps
the URI and manual path available.

### Suggested articles

- The site's appearance and settings articles for the complete editor and scheduled values.
- The tab navigation article for groups, overflow, and bulk close behavior.
- The app lock and authenticator articles for the installed application's stronger local boundary.
