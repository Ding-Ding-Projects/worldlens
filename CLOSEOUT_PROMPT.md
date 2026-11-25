# Closeout prompt

Paste the block below into a new session to continue. Written 2026-11-25. It records state up to the commit that adds this file.

```text
Repository: Ding-Ding-Projects/worldlens (public). Default branch: main.

Goal in progress: build every required feature in docs/contracts/feature-delivery-inventory.json (127 tracked, all still "pending review"). Not finished.

Read first: design/HANDOFF.md, the two entries dated 2026-11-25.

On main now: guided tours, quick add, update coming soon card, data folders with Git history, phone-size PDF in the release job (proved in release v1.0.2490), one-command setup, TinyMCE for marker notes, type generator and JSON editor, dockview under the Work tabs (public dockview package).

Updates were broken from v1.0.2493 to v1.0.2497 (the update package passed 2,000,000,000 bytes and was split). Fixed and proved in v1.0.2500: one package of 1,989,935,163 bytes, and this PC updated to it. The margin is about 10 MB; the release job now fails rather than split an update package, so watch the size when adding anything large.

Next steps:
1. gh run list --branch main --limit 5 and confirm the newest run is green and published a release.
2. Install that release and look at, in the running app: a tab split and a saved layout in Work, the marker note editor, the type generator, Settings > Updates, a quick add entry, and a profile-folder move followed by a restart.
3. Add a captured tour step to the README and site through the screenshot evidence route (scripts/check-screenshot-evidence.mjs).
4. Change the site's hosting articles to the one-command setup.
5. Investigate the three tests that are red on a Windows checkout: two in pathFieldPolicy.test.ts, one in narrator.test.ts.

Rules: read AGENTS.md. Node 26 breaks the test runner on this machine; use Node 24. App.test.ts takes several minutes; run it alone. Commit author and committer are Claude Fable 5 <noreply@anthropic.com>. Never force-push.
```
