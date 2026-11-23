Continue WorldLens (Ding-Ding-Projects/worldlens) from main at the latest commit. Read design/HANDOFF.md first.

Done: decluttered Work strip; NBT editor with chunk view; "render only these chunks" picker; data pack creator; hosted image CI job; one-click container deploy; app-mode appliances (gated on a new base pin); WorldLens containers on Hosted instances; sign-in for the server site wired into the web console; player relay planner (Oracle cloud-init, SSH script, router steps) (owner-first, invitations, password/passkey/TOTP in any combination).

Next, in order: build the Minecraft server appliance: a headless entry that runs a server plus the web console started with `accounts` (persisted AccountBook), as a new appliance workload (design-sources/deploy-anywhere/McServer.dc.html, Admin.dc.html); then Bedrock LevelDB. Record the hosted-image digest from its first CI run. Commit as Claude Fable 5, push after each piece, rebase on main, never force.
