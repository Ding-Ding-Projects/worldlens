# Closeout prompt

```text
WorldLens (Ding-Ding-Projects/worldlens), main at the commit that adds this file.
Done: the Work strip keeps to map work. General tools (Docs, File converter, Base64, Drawing board,
Authenticator, Locks, Support Tickets, Browser downloads, Ollama, Virtual disks, Memory console) live in
one "Built-in tools" tab; the NBT editor and Convert live in an "Other tools" tab. Code:
design/packages/ui/src/components/shell/toolHubs.ts, ToolHub.vue, WorkPane.vue. Old routes open the hub
with the tool picked; saved workspaces fold once. Design boards: design/design-sources/work-strip-declutter/.
Verified: jsdom tests in App.test.ts, toolHubs.test.ts, shell/, tabs/, kid/, site (all green).
Not verified: a capture of the hubs in the packaged Windows app. Still red and untouched:
copy/catalogueCoverage.test.ts on 20 keys from the sharing work.
Next: capture both hub tabs from the built app, then fix the catalogue coverage keys.
```
