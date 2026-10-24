# Worldlens preservation and cleanup handoff

## Objective and latest owner direction

Preserve the unfinished continuation in the original Worldlens repository and main branch, repair the observed CI failure, then delete only the previously identified safe cleanup candidates. No separate repository is used to preserve source.

## Verified source

- Original main source snapshot: ff5d17fe627782ef44e7ae7248c6d6c60b07b86b, read back from origin. Its tree exactly matches the integrated continuation source.
- Linux ZIP repair: 149ca9cd80371b5395e2f61a1482d7cdb57e5823, read back from origin/main.
- Maintained BlueMap default branch master: cdaccf3653436db8cfc78ece21995b757a731dd8, read back from its original origin. This handoff updates the parent pin to that source.
- The unpublished earlier local history is retained on codex/worldlens-local-recovery-20261023 and its existing source branches. Do not transmit that legacy history. Resume public work from origin/main.

## What is preserved

Generation and workflow collection/recovery, protected bot accounts and connection-bound commands, hosting profiles and runtime acquisition, the Gradle batch-path repair, maintained viewer annotations and controls, and five previously uncommitted workflow integration edits. These are incomplete source checkpoints, not completed product acceptance.

## Verification

CI run 40055043848 failed its workspace build because GNU tar cannot extract the pinned Windows Node ZIP. The repair selects the existing unzip route for ZIP on Unix while retaining native tar for Windows and tar.xz. A real ZIP reproduction returned GNU tar exit 2; the repaired route extracted the executable and license and excluded an unrelated sibling. Focused hosting tests: 2 passed, 1 optional provenance integration test skipped. Replacement CI remains pending at this record. No new root build, installer run, native UI capture, installed update or full runtime acceptance is claimed.

An urgent publication review checked every previously unpublished text object. The two source candidates in the public snapshot were individually reviewed as ordinary technical content. Seven earlier local checkpoint blobs containing private wording were excluded from public ancestry. The complete local publication scanner did not produce a usable current verdict; retain its limitation rather than reporting it passed.

## Evidence gallery

https://ding-ding-projects.github.io/worldlens-evidence/ is public. The existing 15 reviewed images, inventory and provenance article returned HTTP 200, and image SHA-256 digests matched the inventory. Capture times remain unavailable. Existing exclusions and source-receipt limitations remain disclosed. This handoff adds the direct README backlink.

## Cleanup and remaining work

The proposed remote branch deletions are ai/feature/20261023-managed-workflow-integration and ai/feature/20261023-worldgen-workflow. Their tips must remain ancestors of verified origin/main, and the complete source plus Git administration archive must pass readback before deletion. Archive verification and deletion are pending at this record. Retain all ten local Worldlens checkouts, the maintained viewer checkout and every unfinished or uncertain branch. No stash exists in the inspected Worldlens or maintained viewer source.

Resume with the latest main CI result, then root build and packaged generation/hosting/bot/viewer acceptance. Keep the exact root build.bat and build-installer.bat entrypoints, existing data and credentials, safe native consent boundaries, and genuine evidence provenance. The broader feature inventory and issue 186 remain unfinished. Projects access lacks read:project; Status Hub enrollment is unavailable; no delivery to those surfaces is claimed.
