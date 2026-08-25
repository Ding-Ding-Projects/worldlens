# Wharf

A second desktop application, in this repository, that deploys a container image to a machine —
the local Docker daemon or another machine over SSH.

## Behaviour

That is the whole scope. It is not a Docker client, it is not a way to inspect somebody else's
containers, and it is not a shell.

Those exclusions are the design rather than missing features. Every destructive operation works
only on containers carrying Wharf's own ownership labels, which means the set of things it can
break is exactly the set of things it made. A tool that can stop any container on the host is a
tool that will eventually stop the wrong one, and once it can, every other safeguard becomes a
matter of the interface being careful.

The flow is: choose a machine, choose an image, choose the folder, see the plan, deploy. The
plan is not a preview somebody may skip — the Deploy button is disabled until one has been
shown, and the plan is how it becomes usable.

## Configuration

Nothing is configured in a file. Hosts, images and folders are chosen in the interface, and the
record of what this application has deployed lives beside its own data.

SSH uses the system OpenSSH client and the user's own `known_hosts`, not a private store Wharf
invents. A host somebody has already verified in a terminal is therefore already known here;
being asked to trust a key twice teaches people to click through the question.

## The main folder

The control worth arguing about, and the reason this document exists.

"Pick the folder this application should use" is the most dangerous control a deployment tool
offers, and it does not look dangerous. A free-text field accepting a host path is how a
graphical tool produces `-v /:/host`, and the person who typed it was filling in a box.

So there is no text field. A host path becomes a mount only by being:

1. **browsed to**, in the platform's own file picker, so the path exists and the person saw
   where they were;
2. **checked against the refusal list for that host's own platform** — `/etc` and `/usr` mean
   nothing on Windows and `C:\Windows` means nothing on Linux, and a list written for the wrong
   platform is not a weaker guard but an absent one;
3. **confirmed with both sides written out** — "`/srv/data` on the host, appearing as `/data`
   inside the container, read-only". "Use this folder" is not a confirmation.

The container side is checked too, and that one is nastier. Mounting over `/usr` does not fail
loudly: the container starts and then behaves inexplicably, because the image's own files at
that path have been replaced by somebody's photographs.

## Failure modes

**A floating tag is refused**, and the refusal says why it matters rather than stating a rule: a
tag can be moved under you, so what was deployed and what was reviewed would not have to be the
same thing.

**Every problem is reported, not the first.** Somebody correcting a form wants to see all of it;
stopping at the first turns one mistake into three round trips.

**The plan is re-checked at deploy** rather than trusted from the interface. A caller that showed
one plan and sent a different request would otherwise deploy the second under the first's
confirmation, and the interface would have told the truth about something that did not happen.

**A port that is not answering is reported as not answering.** `docker run` exiting 0 means the
container was created, not that anything inside it is listening. That gap is the difference
between "deployed" and "working", so a deployment with a port says "deployed, and port 8080 is
answering" or "deployed, but nothing is answering yet" — never just "deployed".

**Windows hosts are detected rather than assumed**, because three things differ there and each
fails in a way that does not look like an operating-system problem: quoting has no complete
answer when the login shell may be `cmd.exe` or PowerShell; the POSIX port probe reads
`/dev/tcp`, which does not exist, so a service that started perfectly reports as not listening
and the deployment rolls back a container that worked; and the refused-directories list names
the wrong directories.

## Security considerations

- **Wharf's containers carry Wharf's labels**, never the WorldLens desktop application's.
  Sharing a namespace would mean each application listing the other's containers, offering to
  stop them, and being right to by its own labels.
- **The bridge is five channels.** No channel accepts a path the renderer composed; a path
  reaches the main process only by having been returned from a real file picker.
- **Images are digest-pinned**, enforced in the main process rather than by the form.
- **SSH is public-key only**, with `StrictHostKeyChecking=yes` and no password authentication. A
  changed host key stops the connection rather than being accepted.
- **No global prune, ever**, and no operation accepts a raw container id — only ids returned from
  the ownership-filtered listing.

## Verification

- The ownership boundary is pinned by a test that spells both literals out rather than reading
  them from the constant it checks, and it has been watched fail: changing the owner prefix turns
  it red, and so does ignoring the identity option.
- The folder refusals are tested from both directions — that the dangerous paths are refused and
  that the ordinary ones are not, because a list that refused a home directory would be one
  people work around rather than one they trust.
- The application was launched on an off-screen desktop and photographed. See
  [the capture](screenshots/wharf-first-run.caption.txt): three cards, Deploy disabled until a
  plan has been shown, and a folder card with no text field in it.

Still to come: the Squirrel.Windows installer and its own release line, the lifecycle surfaces
(logs, restart, rollback), and the universal feature contracts this repository holds every
user-facing application to. The deployment path itself is real and tested; the shell around it
is one screen.
