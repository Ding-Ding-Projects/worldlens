# Closeout prompt

Paste the block below into a new session to continue. Written 2026-11-25. It records state up to the commit that adds this file.

```text
Repository: Ding-Ding-Projects/worldlens (public). Default branch: main.

Goal that was in progress: build every remaining required feature in docs/contracts/feature-delivery-inventory.json. It is not finished.

Read first: design/HANDOFF.md, the entry dated 2026-11-25. It lists what is on main, what was only tested, and what was seen in a running build.

First thing to check:
1. gh run list --branch main --limit 5. The release job gained a step that builds a phone-size PDF of the documentation (commit fecebcb8). It had not run on a hosted runner when the last session stopped. If the release job fails at that step, fix it before anything else, because no release publishes while it fails.
2. When a release newer than v1.0.2476 is published from a572e49f or later, update the installed app and look at: Work tabs, the tour from the command palette, Settings > Data folders and history, and the Updates section.

Unfinished work, each on its own remote branch, none tested or merged:
- ai/wip/20261125-rich-text-editor (0ce8085e): TinyMCE field for marker notes.
- ai/wip/20261125-type-generator (3ad9184b): type generator and JSON editor.
- ai/wip/20261125-dockview-workspace (3268d1f2): dockview under the Work tabs, public dockview package. Stopped mid-edit.

For each: check it out, install, build, run the focused tests and the type check, finish it, then merge to main.

Still owed after those: tour capture in the README and site, the hosted-mode site articles showing the one-command setup, pressing "Generate and start project" in the running app, and a real move of the profile folder followed by a restart.

Rules: read AGENTS.md. Node 26 breaks the test runner on this machine; use Node 24. Commit author and committer are Claude Fable 5 <noreply@anthropic.com>. Never force-push.
```
