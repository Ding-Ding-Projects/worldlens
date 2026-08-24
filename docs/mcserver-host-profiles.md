# SSH host profiles for Minecraft servers

## Behaviour

The Minecraft server manager can save a named SSH host profile for a remote Docker server.
The profile wizard validates the host name, account, port, remote working folder, optional
container image, and optional identity-file path before saving. The app-owned record is bounded,
versioned, and stores only connection metadata plus the identity-file path. It never accepts or
persists key bytes, passphrases, or passwords.

Before a remote server is used, the wizard can scan the host's offered fingerprints. An unknown
fingerprint is shown as an explicit decision. Trusting one rescans the host and records only the
matching key in the app-owned `known_hosts` file. A changed fingerprint is refused and has no
trust action. OpenSSH always runs with strict host-key checking, public-key authentication only,
and the user's known-hosts file is read without being modified.

Remote RCON stays loopback-only. When the server's RCON socket is bound to loopback on the remote
host, the app creates a bounded SSH local forward bound to `127.0.0.1` on this computer and uses
that short-lived endpoint for the vault-backed password. The forward is owned by the app session,
is closed on app shutdown, and never publishes a new network port.

Choosing an SSH profile in the server wizard opens remote container discovery rather than trying
to create a local record with a remote-looking id. Discovery reads the remote Docker daemon,
shows the actual container identity, mount layout, published ports, evidence and blockers, and
then opens the same four-switch consent review used for local adoption. Confirming it saves an
`ssh-docker` server record with the selected host profile and the detected server directory. The
remote image supplies Java, so the local Java installer is skipped for this route.

## External integrations and automatic repair

SSH and Docker are optional integration targets, not prerequisites for the app itself. The local
server list, local process route, typed configuration editor, offline documentation, and profile
validation remain usable when either integration is unavailable. The manager detects missing SSH,
unreachable hosts, stopped daemons, authentication refusal, and host-key refusal as distinct
states and gives the next in-app action. It does not instruct the user to type shell commands or
silently install software, and it never accepts a license or writes credentials on the user's
behalf. A remote profile becomes usable only after the chosen host and Docker daemon pass the
typed health checks.

## Failure modes

- A malformed or oversized profile file is refused instead of becoming an empty list.
- A host-key mismatch is refused, even when the host is otherwise reachable.
- A missing SSH client, unreachable host, stopped Docker daemon, and missing container remain
  separate statuses.
- A remote RCON tunnel that exits before its bounded readiness window is reported as unreachable.
- A profile forget action removes only this app's record. It never deletes a remote container,
  world, key, or known-hosts entry.

## Verification

`hostProfiles.test.ts` covers bounded versioned persistence, traversal and command validation,
secret-field exclusion, and app-owned trust-store paths. `rcon/sshTunnel.test.ts` covers the
loopback-only forward shape, early process exit, invalid ports, and no-spawn refusal.
`flavours/catalogue.test.ts` covers complete build retention and paginated Paper responses.
`transport/sshDocker.typedOperations.test.ts` covers health, lifecycle, logs, and scope refusal
through a fake SSH host. `sshAdoption.test.ts` covers remote discovery and `ssh-docker` record
creation when the app workspace packages are built. Real-host verification and packaged captures
remain separate evidence work and are not claimed.
