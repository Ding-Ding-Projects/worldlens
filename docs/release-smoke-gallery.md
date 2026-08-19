# Release-grade smoke and screenshot gallery evidence (issue #144)

Issue #144 tracks the release-grade smoke pass, complete screenshot refresh, and searchable
Pages gallery. This document is the public evidence contract for that work. It records what a
future acceptance run must prove and keeps source-level gallery work separate from packaged-app
evidence.

## Required evidence

The acceptance run must pin one exact candidate commit before it starts and use that same commit
for the local release-grade suite inventory, the unsigned Squirrel.Windows installer set, the
packaged-application smoke pass, and every refreshed image. The installer proof must identify the
fresh setup and update assets, their hashes, unsigned status, and the candidate commit that
produced them.

The smoke pass must drive the real packaged application through the approved hidden-desktop route.
Source previews, injected bridge state, design files, mockups, and screenshots copied from another
commit are not evidence. Each capture record must identify its screen or state, theme, viewport,
display scale, source commit, and capture method. Runtime-, account-, service-, and hardware-only
states remain explicit evidence gaps; they must not be filled with fabricated images.

Every committed screenshot in the refresh set is replaced by a newly produced capture, even when
the pixels appear unchanged. The gallery must keep a useful category, title, description, state,
theme, viewport, and source-commit record for each image. Its default search is plain text; the
adjacent regex builder is an explicit opt-in and searches title, description, category, state,
theme, viewport, and source-commit metadata. Category filters, result counts, keyboard and touch
operation, focus visibility, accessible names, responsive layouts, and an honest no-match state
are part of the same acceptance boundary.

## Failure and release boundary

A passing source build, a populated file list, or a Pages workflow result does not prove that the
packaged application rendered the state shown by an image. The release remains unverified until
the exact candidate is built, the packaged flow is driven, the captures are read back, and the
published gallery points at those records. Issue #144 stays open when any required suite,
installer, smoke, capture, release, or remote-workflow verdict is missing or still running.

No test, installer build, packaged smoke pass, screenshot capture, release publication, merge, or
cleanup is claimed by this records-only update.

## 廣東話同步

Issue #144 追蹤 release-grade smoke、全套 screenshot refresh 同 searchable Pages gallery。
呢份文件係公開 evidence contract：之後 acceptance run 要 pin 一個 exact candidate，suite、
unsigned Squirrel.Windows installer、packaged app smoke 同全部新圖都一定用同一個 commit。
每張圖要有 state、theme、viewport、display scale、source commit 同 capture method；runtime、
account、service 或 hardware-only 狀態要明確寫成 evidence gap，唔可以用假圖補數。

Gallery 預設係 plain-text search，regex builder 要喺旁邊由用戶主動開，並搜尋 title、description、
category、state、theme、viewport 同 source-commit metadata。Keyboard、touch、focus、accessible
name、responsive layout、category filter、result count 同真 no-match 都係同一個 acceptance boundary。
今次 records-only update 冇聲稱行 tests、build installer、packaged smoke、capture、release、merge
或者 cleanup；任何一項證據未有，issue 都繼續 open。
