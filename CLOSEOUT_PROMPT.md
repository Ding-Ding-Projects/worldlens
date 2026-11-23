Continue WorldLens (Ding-Ding-Projects/worldlens) from main at the latest commit. Read design/HANDOFF.md first.

Done: decluttered Work strip; NBT editor with chunk view; "render only these chunks" picker; data pack creator; hosted image CI job; one-click container deploy; app-mode appliances (gated on a new base pin); WorldLens containers on Hosted instances; sign-in for the server site wired into the web console; player relay planner (Oracle cloud-init, SSH script, router steps) (owner-first, invitations, password/passkey/TOTP in any combination).

Next, in order: pin the bases from Appliance run 45277496892 (release v1.0.2311) with workloads ["map", "app", "minecraft"]; record the hosted-image and server-site-image digests from the first CI run with those jobs (design-sources/deploy-anywhere/McServer.dc.html, Admin.dc.html); then Bedrock LevelDB. Commit as Claude Fable 5, push after each piece, rebase on main, never force.
