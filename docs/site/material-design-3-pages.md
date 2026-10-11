# Material Design 3 Expressive Pages rewrite

## Behaviour

The Worldlens documentation site is rebuilt around one explicit application shell:

1. a sticky M3 top app bar with a functional Worldlens lens-and-voxel mark;
2. an adaptive navigation surface containing the real browser-style tab workspace;
3. a bounded content canvas that renders Home, documentation, screenshots, settings, search,
   changelog and notification history; and
4. a persistent local-assets/no-tracking footer.

`ExpressiveSiteShell.ts` owns that hierarchy. The former entry-point append order is no longer the
layout model. The shell consumes the existing `TabModel`, `SidebarNavigation`, `I18n`, appearance,
notification and command-palette controllers, so the rewrite does not create parallel state that
can drift from the controls users already configured.

The visual language uses the repository's Material Design 3 reference and system tokens for every
colour, type scale, shape, elevation, state layer, spacing value and motion duration. The shell
adds no second theme. Its distinctive asymmetric lens mark, frosted top app bar, rounded adaptive
navigation surface, tonal content background and expressive hero all re-derive under light, dark,
accent, density and per-element appearance changes.

## Configuration

- **Navigation:** Settings controls left, right, top or bottom placement. Left and right surfaces
  have a persisted collapse state. A compact first visit starts collapsed and keeps a 64 CSS-pixel
  control rail reachable.
- **Language and tone:** English, Hong Kong Cantonese and compact bilingual modes remain available,
  with independent persisted funny-level controls for English and Cantonese.
- **Appearance:** theme, density, accent, typography, presets, import/export, per-element editors and
  reset use the same existing settings store and live M3 tokens.
- **Discovery:** the app bar provides real Search, Notifications, Settings and command-palette
  actions. `Ctrl+Shift+F` remains the only global palette shortcut.
- **Tabs:** overflow, reorder, pinning, groups, four independent tab searches, anchored regex
  builders and protected bulk-close previews are unchanged behind the new navigation surface.

## Failure modes

- Browser storage unavailable: the site stays usable for the current load and exposes truthful
  default provenance instead of pretending persistence worked.
- Compact navigation data corrupt or missing: the responsive default is used, and the toggle stays
  reachable.
- Content wider than the viewport: the content canvas has `min-width: 0`, cards wrap long bilingual
  text, overlays scroll internally, and no parent hides accidental overflow.
- Reduced motion: shell transitions collapse and animated walkthroughs are replaced with still
  images.
- Forced colours: top app bar, navigation and footer paint explicit Canvas/CanvasText surfaces and
  discard decorative shadows.
- JavaScript boot failure: the existing localized recovery surface replaces the mount point rather
  than leaving a blank deployment.

## Security considerations

The production site bundles scripts, styles, fonts, screenshots, GIFs and still images. It loads no
CDN, analytics, advertising, tracking pixel or third-party runtime. Ordinary repository and release
links navigate only after the visitor activates them. Visitor preferences stay in namespaced browser
storage. Home Assistant schedule credentials, when deliberately supplied, remain in page-session
memory and never enter storage, exports, URLs or logs.

The action walkthroughs are explanatory media. Their documented capture provenance is not presented
as deployment proof; only a capture of the exact built commit and the terminal Pages workflow can
prove the public site.

## Verification

- `ExpressiveSiteShell.test.ts` mounts the actual shell and proves labelled regions, quick actions,
  palette activation, compact collapse/expand state and a persistent toggle.
- `shellChrome.test.ts` guards the ground-up region hierarchy, M3-only colour roles, scroll-linked
  app-bar elevation, adaptive drawer/scrim, bounded content canvas, quick-action wiring,
  reduced-motion and forced-colour branches.
- `globalFeatureCoverage.test.ts` checks the hand-written Pages inventory and its implementation/test
  evidence.
- `walkthroughs.test.ts` validates the twelve GIF/still pairs, dimensions, decode headers, size
  budgets, lazy loading, finite playback, bilingual alt text and narrow layout.
- The compact runtime gate covers 360×640, 390×844, 414×896, desktop, and 390×844 bilingual at 200%
  with zero document/body overflow, no clipped controls and no undersized targets.

Source checks and local captures do not claim that the public deployment changed. Live proof is
recorded only after the exact commit is deployed and read back.

## Suggested articles

- [Action walkthrough animations](action-walkthroughs.md)
- [Pages feature parity](../pages-feature-parity.md)
- [Tabbed navigation](../tabbed-navigation.md)
- [Appearance editors](../appearance-editors.md)
- [Regex builder](../regex-builder.md)


## Current server articles in the production archive

The production entry uses archive-site-plugin.mjs and its 59-entry archive catalogue. Membership in the older TypeScript article list alone does not prove production inclusion. server-articles.mjs reads three current Markdown sources directly: docs/mcserver-hosting.md, docs/server-management/adoption-ownership.md and docs/server-management/ssh-process-lifecycle.md. The merged runtime contains 62 articles and preserves the original 59 entries unchanged.

Titles and headings become article and outline data. Fenced code and table rows use the existing safe code block consumer; ordered and unordered groups use real list blocks. Other text uses the existing text-only paragraph consumer. Inline Markdown links remain literal text, so full link and anchor parity is still pending. Missing sources, invalid initial titles, unclosed fences, missing merged entries and duplicate IDs/titles fail assembly. No raw HTML or new network API is introduced.

Four focused Node cases cover production inclusion, content/block structure, preservation of all 59 originals and rejection of incomplete or duplicate merged catalogues. A deliberate missing-current-article mutation was observed red before byte-exact restoration returned green. Independent bounded source review is dry. Rebuilt geometry, keyboard/accessibility, article navigation and live delivery remain pending; source inclusion is not evidence of those outcomes.

### 廣東話

正式網站實際用 archive pipeline；舊 TypeScript 清單有篇文章，唔代表正式輸出真係有。新接駁直接讀三篇現行 Markdown，保留原本五十九篇，合共六十二篇。表格各行同程式碼保留分行，清單用真正列表，其他內容維持安全文字渲染。缺檔、標題／圍欄格式錯誤、漏文章或者重複身分都會令組裝失敗。行內 Markdown 連結仍係文字，完整連結、導覽、版面同已部署網站驗收未完成。

### Article chrome and initial template parsing

A rebuilt diagnostic at 94b73f9c rendered the new SSH lifecycle article at 1440x1000 and emulated390x844, with zero body overflow or unnamed interactive controls. It also recorded26 console messages and one placeholder-image404, so that run did not pass runtime acceptance. Initial HTML was letting unresolved image URLs load and literal SVG bindings reach the browser parser before hydration. The production transform now stores dynamic src/d attributes inertly and the runtime compiler maps them back only when evaluating bindings.

The generic article chrome no longer claims every article is built/verified, has five named test files or was updated at one historical date/revision. It directs readers to the actual verification section and marks unavailable update provenance honestly. The three current Markdown articles carry their exact source paths. Unrelated generic article thumbnails were removed from presentation while preserving their original files. The ignored frame-ancestors meta directive was removed; effective framing restrictions require a supported HTTP response header, and are not claimed for the static deployment. Other CSP directives remain in place. Six focused cases cover assembly and these source regressions; rebuilt and live proof remain pending.
