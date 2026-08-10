# Backing up a world or a rendered map

A rendered map is hours of work and a Minecraft world is not reproducible at all, so both are
worth keeping a copy of somewhere that is not the machine they live on. This is that copy: the
application packs the folder into one archive, cuts it into parts, and publishes the parts as the
assets of a **new GitHub release**, with a small pointer file beside them naming every part and its
SHA-256.

**Contents**

- [Why this is not Git LFS](#why-this-is-not-git-lfs)
- [The pointer format is not ours](#the-pointer-format-is-not-ours)
- [What a backup looks like on a release](#what-a-backup-looks-like-on-a-release)
- [Behaviour](#behaviour)
  - [What can be backed up](#what-can-be-backed-up)
  - [Public and private repositories](#public-and-private-repositories)
  - [What happens, in order](#what-happens-in-order)
  - [Restoring](#restoring)
  - [Stopping, and carrying on](#stopping-and-carrying-on)
  - [Backups are append-only](#backups-are-append-only)
- [Configuration](#configuration)
- [Failure modes](#failure-modes)
- [Security considerations](#security-considerations)
- [Verification](#verification)
- [Related reading](#related-reading)

## Why this is not Git LFS

Git LFS is the obvious answer and the expensive one. On GitHub a free account gets **1 GB of LFS
storage and 1 GB of bandwidth a month**; the bandwidth is metered against every _restore_, not just
every upload, and past it you buy data packs. A rendered map or a Minecraft world is routinely
several gigabytes, so:

- one backup exhausts the free storage tier outright;
- every restore of it is billed again, against a quota that resets monthly;
- an accidental second copy of a large world is a bill, not a warning.

GitHub **release assets** have a completely different cost model. They are free on a public
repository, they are capped at 2 GB _per asset_ rather than in total, and downloading one is not
metered against an LFS bandwidth quota. The only thing they cannot do is hold a single file larger
than the cap — which is exactly the problem this project already solved, twice over:
[`@worldlens/parts`](./large-worlds.md) splits a file into checksummed parts and rejoins
them, and the downloads surface already fetches parts, verifies each one, rejoins them and unpacks
the result.

So Git LFS was not forgotten here. It was **rejected on cost, by name**, and the code says so in
`main/backup/pointer.ts`, the interface says so in one sentence above the form, and this document
says so first.

## The pointer format is not ours

The idea of "the pointer is committed, the bytes are a release asset" is a shipped subsystem of the
sibling application **Desktop Material**, where it is called **Cheap LFS**. This feature speaks that
format rather than inventing a rival one, so a backup made by either application is readable by the
other.

The canonical files, in that repository:

| File                                                                          | What it is                                                              |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `app/src/lib/cheap-lfs/pointer.ts`                                            | The canonical v1 contract: the grammar, the bounds, the parser          |
| `docs/features/repository-management/release-backed-cheap-lfs.md`             | The design, and why it is deliberately not Git LFS                      |
| `docs/features/repository-management/cheap-lfs-release-payload-encryption.md` | The optional password encryption, which this application does not write |

A v1 pointer is five head lines, plus one line per part when the file was split:

```
version desktop-material/cheap-lfs/v1
release-tag mbm-backup-world-overworld-20260804T101500Z
asset-name world-overworld-20260804T101500Z.zip
size 1100000000
sha256 9f2c...
part 1a2b... 524288000 world-overworld-20260804T101500Z.zip.001-1a2b3c4d5e6f7a8b
part 3c4d... 524288000 world-overworld-20260804T101500Z.zip.002-3c4d5e6f7a8b9c0d
part 5e6f...  51424000 world-overworld-20260804T101500Z.zip.003-5e6f7a8b9c0d1e2f
```

A file small enough to be one asset omits the part lines entirely and is the original five-line
form, byte for byte.

Three rules are followed strictly, because the canonical file says to keep the format canonical
forever:

- **Nothing is added to a pointer.** Everything this application knows about a backup that the
  format does not carry — what kind of thing it was, when, which build made it, how many files went
  in — lives in a **separate `backup.json` asset** on the same release. A pointer with an extra
  field would not parse in the application it was copied from, which is the whole property being
  traded on.
- **New parts are 500 MiB**, which is `CHEAP_LFS_PART_SIZE_BYTES` in the canonical file, not this
  project's own 1.7 GB publish size. A failed part re-transfers its whole size, so a part near the
  2 GB ceiling turns one dropped connection into gigabytes of repeated upload.
- **The reader accepts more than the writer produces.** Parts up to 2 GiB are accepted, because
  pointers exist with parts of exactly that size, and a parser may widen what it accepts and must
  never narrow it.

### What this application does not write

Only plain `part` lines. The compressed (`part-deflate`) and password-encrypted
(`part-encrypted`, `part-encrypted-deflate`) forms are **recognised** — a backup listing names one
as encrypted and says Desktop Material restores it — but they are not written here and cannot be
restored here. That is stated at the surface rather than reported as a corrupt pointer, because
somebody holding an encrypted backup needs to be told this build has no password path, not that
their file is broken.

### What has actually been verified — format conformance only, permanently

`packages/app/src/main/backup/pointer.test.ts` copies the canonical regular expressions and the
head-field rules **verbatim** out of `app/src/lib/cheap-lfs/pointer.ts` and runs every pointer this
writer produces through them, line by line. That is a real, checkable claim: what is written here
satisfies the grammar the canonical parser applies.

This project states, permanently, that the claim stops there. It is **format conformance**, not
**interoperability**, and the two are not the same claim — a backup made by this application has
never been restored through Desktop Material's own restore path, and a backup made by Desktop
Material has never been restored by this application. See
[issue #36](https://github.com/Ding-Ding-Projects/material-bluemap/issues/36) for the full
accounting of what was checked before this was settled: Desktop Material was confirmed present on
the verifying machine and does share this exact canonical pointer format and a release-asset
backend, so a round trip is not blocked by the sibling application being unavailable. It was not
run because a genuine two-application, real-GitHub round trip in both directions, over both the
single-asset and the split pointer shapes, is a substantial cross-project integration effort that
was judged to be its own piece of work rather than something to attempt inside an unrelated pass.
Outcome B — stating the limit permanently rather than proving the stronger claim — is the
explicitly sanctioned resolution the issue itself offers for exactly this situation, and this
project has taken it. A future task that wants to attempt the live round trip instead starts from
this same file, `pointer.test.ts`, and `design/ROADMAP.md`'s Backups row.

Nothing here is claiming something false in the other direction either: the code, the tests, and
this documentation have always been accurate about the limit. This section exists so the boundary
reads as a permanent, deliberate decision instead of an open question nobody answered.

## What a backup looks like on a release

One backup is one release, tagged uniquely, marked as a prerelease so it never becomes the
repository's "latest release":

```
mbm-backup-world-overworld-20260804T101500Z

  world-overworld-20260804T101500Z.zip.001-1a2b3c4d5e6f7a8b   500 MiB
  world-overworld-20260804T101500Z.zip.002-3c4d5e6f7a8b9c0d   500 MiB
  world-overworld-20260804T101500Z.zip.003-5e6f7a8b9c0d1e2f    49 MiB
  backup.json                                                   1 KB
  world-overworld-20260804T101500Z.zip.cheaplfs                 1 KB
```

The digest in each part's asset name is the first sixteen hex characters of that part's own
SHA-256. It is there for a specific reason — see [resuming](#stopping-and-carrying-on).

## Behaviour

### What can be backed up

Two kinds, and the application refuses a folder that is not the kind it was offered as:

| Kind       | What it is                                           | What is checked                              |
| ---------- | ---------------------------------------------------- | -------------------------------------------- |
| **World**  | A Minecraft save: `level.dat` and the region folders | There is a `level.dat` directly inside       |
| **Render** | One render workspace under the maps folder           | There is a `render.json`, or a `web/` folder |

Picking the folder _above_ a world is the most common mistake and the most expensive: without the
check, an hour is spent packing the wrong tree and the mistake surfaces as a restore that produces
a folder Minecraft will not open. The refusal names the folder and says what was looked for.

The folder is read before anything is packed, and the file count and byte total shown are the ones
the pack will actually use — not an estimate. Anything the pack will leave out is named on screen
with the reason, so a count that differs from a file manager's is explained rather than silent.

**Symbolic links are skipped, never followed.** A world folder with a link pointing at a home
directory would otherwise pack that home directory into a backup somebody is about to publish.

### Public and private repositories

The repository is read from GitHub — never guessed from its name — before anything is packed, and
what it is gets said plainly:

- **Public**: a loud warning. Everything uploaded can be downloaded by anybody, with no account and
  no link from you; a world carries your builds, your coordinates and whatever anyone left in a
  chest, and a rendered map carries the same information as pictures. The backup **will not
  proceed** until the acknowledgement is ticked, and the main process refuses an unacknowledged
  public repository as well — a guard that lives only in the renderer is not a guard.
- **Private**: a quieter note. Private is not the same as free: a private repository's releases
  still count against the account's storage limits, and a few large backups can reach them. The note
  says "cheap rather than free" rather than promising anything.

### Creating a repository, when nothing suitable exists yet

The repository picker used to be able to do exactly one thing: list what already existed. Somebody
with no repository to back up to had to leave the application, make one on GitHub by hand, and come
back to pick it — a dead end for the person this feature exists to help the most, the one who has
never done this before.

`createRepository` (`main/backup/github.ts`) closes that gap from the same "Where to keep it" card
the picker and the owner/repository fields already live on, rather than opening a second dialog:

- **The owner is either your own account or an organisation you belong to.** GitHub uses two
  different endpoints for the two cases — `POST /user/repos` for a personal repository, `POST
/orgs/{org}/repos` for one under an organisation — so this screen asks which one applies with a
  two-choice picker rather than guessing from the typed name.
- **Visibility is a real choice, with the consequence stated in the same words as everywhere else
  on this screen:** PUBLIC means anybody can download it, private means only granted accounts can
  see it and is not free storage.
- **It is initialised with one starter commit.** A repository with no commits at all answers a very
  specific 422 the moment anything tries to create a release on it — `"Repository is empty."` — the
  exact trap the append-only design above already had to name once, discovered against a real,
  freshly created, never-pushed-to repository. `auto_init: true` sidesteps it entirely for the very
  first repository somebody creates from this screen.
- **A taken name is told apart from every other 422** GitHub answers with the same status — an
  invalid character, a name that is only punctuation, one past the length limit — and reported with
  its own `name-taken` code so the interface can point at the name field rather than showing a
  generic failure.
- **Creating never overwrites.** GitHub itself refuses a name that already exists, so there is no
  "re-initialise an existing repository" path anywhere in this feature that would need gating behind
  the destructive-action super-confirmation — the operation that would need it simply does not exist.
- **The new repository is selected automatically.** The owner and repository fields already name
  what was just created, and creating it re-reads the repository exactly as choosing an existing one
  from the list does, landing at the same "what uploading here would mean" report rather than
  leaving somebody to press Check themselves.

### Searching the repository list

`listWritableRepositories` reads up to three pages of `/user/repos` — 300 repositories, most
recently active first — and hands the whole, already-bounded set to the screen in one answer; there
is no further paging from the interface. The repository picker's search (the shared
`ConfigSearchField`, with its own anchored regex builder, plain text by default) is therefore
complete over what was loaded and says so: the summary line reads "showing N of 300 loaded
repositories" rather than implying it searched the whole account, and if the repository you want is
not among the 300 most recently active, the owner/repository text fields beside the list remain the
honest way to reach it. Three distinguishable states cover what the list can be: nothing loaded yet,
this account genuinely has none, and no loaded repository matched the current search.

### What happens, in order

1. **Read the folder.** Count the files, total the bytes, name anything that will be left out.
2. **Read the repository.** Visibility, and whether this account may actually write to it.
3. **Pack** the folder into one deterministic Zip64 archive, streamed, hashing as it is written.
4. **Split** it into 500 MiB parts with `@worldlens/parts`, each with its own SHA-256.
5. **Publish** a new release under a unique tag.
6. **Upload** every part, then `backup.json`, then the pointer.

The pointer goes **last**, on purpose. It is the completion marker: a release that has one is a
backup that finished, and a release with parts and no pointer is an upload that stopped part-way.
Doing it the other way round — so the release looks complete while the parts are still going up —
produces the single worst failure this feature could have: a backup somebody trusts that restores as
an unverifiable fragment on the day they need it.

The archive is **deterministic**: the same folder packs to the same bytes every time, on any
machine. Entries are sorted by their UTF-8 bytes rather than a locale collation, every timestamp is
the same fixed value, modes and attributes are fixed, and nothing is compressed. Storing rather
than deflating is deliberate — a render is mostly PNG tiles and a world is mostly already-compressed
region files, so compression buys single-digit percentages while spending CPU on every byte of a
multi-gigabyte pack.

Once every part is on the release, the staged archive and its parts are deleted from disk. The
pointer and the sidecar stay: a couple of kilobytes, and the way somebody finds their backup again
when the thing that broke was the network.

### Watching it happen

Each row's **Show what it reported** disclosure holds up to 100 log lines (`LOG_LIMIT` in
`backups.ts`), and once opened it carries a **Follow new lines** checkbox, on by default — a
backup can talk for an hour, and opening the disclosure while it is still running is opening it to
watch it happen. Scrolling up to read an earlier line pauses following automatically, without
unticking the checkbox; scrolling back down, or the **Newest lines** control that appears only
while paused, resumes it. The list carries `role="log"` with `aria-live="off"`, so it is reachable
and readable with the keyboard without a screen reader narrating every line as it arrives. The
preference is remembered across restarts, shared by every open backup row rather than kept per
row, and it is the same mechanism (`components/scroll/`) `RenderConsole.vue`'s own console and
`DownloadRowCard.vue`'s own log use — see [Render console](./render-console.md) for the full
reasoning behind the pause-on-scroll-up behaviour and the `aria-live="off"` choice.

### Restoring

**Restoring has its own engine, `main/backup/restore.ts`**, not the downloads surface. This section
used to say the opposite — that a backup restored is a release downloaded through the same path
[Large worlds and rendered maps](./large-worlds.md) documents — and that was never true. That path
understands exactly one split format: a `<name>.parts.json` manifest beside `<name>.001`,
`<name>.002`, … A backup's parts are named `<archive>.<index>-<sha16>` and no `.parts.json` is ever
published beside them — the Cheap LFS pointer _is_ the manifest, in a shape that has to stay
byte-for-byte what `desktop-material`'s own parser accepts — so the downloads surface's own
discovery never recognised a Cheap LFS release as a split download at all, and nothing before
`restore.ts` existed had exercised the claim against a real release to find out.

`restore.ts` reads a release's sidecar and pointer, refuses one whose upload never finished (no
pointer, no whole-file digest to trust), fetches every part with a resumable ranged request,
translates the pointer into a `@worldlens/parts` manifest in memory so the existing rejoin —
per-part digest, resumable prefix verification, whole-file digest — is reused rather than
reimplemented, and then unpacks the verified archive. Every restored payload is hashed on arrival
and must equal the pointer's digest and byte size before it may replace anything; downloaded bytes
are untrusted input.

Proven against real `github.com`: `backup.realGithub.test.ts` (skipped without
`MBM_TEST_BACKUP_LIVE=1`) packs, publishes, cancels mid-upload, resumes under the same tag, and
restores — twice, once as a fresh backup and once as a resumed one — with the restored folder
checked byte-for-byte against the original. **Not yet done:** the application's own **Restore
this** button still only opens Downloads and asks the person to fetch the release by hand — the new
engine is not wired to a channel, a bridge method, or the button, so nobody can reach it from the
interface yet. That wiring is the one piece of this feature that remains.

A backup whose upload never finished has no pointer, so there is nothing to verify a restore
against. It is **listed** — hiding it would leave somebody hunting for a backup they thought they
made — and marked as unfinished, with no restore button and a note saying that backing the same
folder up again carries it on.

### Stopping, and carrying on

Stopping is safe at any point. A cancelled backup keeps everything it has packed and everything it
has uploaded; starting again against the same release tag carries on rather than starting over.

A resumed upload skips a part when an asset of that **exact name** and **exact size** is already on
the release. The name is what makes that a digest match rather than a guess: it carries the first
sixteen hex characters of the part's own SHA-256, so an asset under that name is one whose content
hashed to that value when it was uploaded, and a re-run of the same backup produces the same names
because the archive is deterministic.

This is stated precisely rather than overclaimed. **GitHub publishes no checksum of its own for a
release asset.** The alternative to name-and-size is downloading every part back to hash it, which
on a resumed 20 GB upload costs more than uploading it again. A part whose stored size does not
match is re-uploaded rather than trusted.

### Backups are append-only

Every backup is its own new release under its own unique tag. Nothing in this application edits a
release, deletes one, deletes an asset, or replaces an asset's bytes — `main/backup/github.ts` has
no function that could, and a tag that already exists is refused rather than adopted, with a message
saying nothing was changed.

There is therefore **no delete button** in the interface, and that is a decision rather than an
omission. A backup somebody no longer wants is removed on GitHub, deliberately, where what is being
removed is in front of them. Adding one here would put an irreversible action behind the
[super-confirmation gate](./super-confirmation.md) and one accidental click; leaving it out means
the worst an accident can do is make one more release.

## Configuration

There is nothing to configure. The pieces that could be settings are decided by the format or by
the cost model:

| Thing              | Value                         | Why it is not a setting                                                                                                           |
| ------------------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Part size          | 500 MiB                       | The canonical Cheap LFS write size. Changing it would produce pointers that differ from the sibling application's for no benefit. |
| Compression        | None                          | See above: the payload is already-compressed tiles and region files.                                                              |
| Release visibility | Prerelease                    | A backup quietly becoming somebody's "latest release" would break installer links and release feeds.                              |
| Where it is staged | `<map storage>/backups/<id>/` | Follows the map storage folder chosen during setup, so a backup does not fill a disk somebody moved away from.                    |

The GitHub sign-in is shared with the rest of the application and is configured in Settings. A
backup needs an account with **push access** to the chosen repository; the `repo` scope is what
publishing a release requires, and a refusal that is probably a missing scope says so rather than
reporting a bare 403.

When the CI-render surface uses `gh` as its credential route, it still uses this same packer,
splitter, pointer and resume logic. Before a release is read, created or uploaded, the selected
account is matched against `gh`'s real signed-in inventory, switched active when necessary, and
verified through `gh api user`. That switch affects the whole computer and is left active. Release
commands carry an enterprise host through `--repo <host>/<owner>/<repository>`; they never receive
the unsupported `--hostname` flag.

## Failure modes

| What happens                                                                                             | What is reported                                                               | What is left behind                                                                                                                       |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Nobody is signed in                                                                                      | "Sign in from Settings", before any network call is made                       | Nothing; no request was sent                                                                                                              |
| The folder is not a world                                                                                | The folder's path and what was looked for, before any network call             | Nothing                                                                                                                                   |
| The folder is empty                                                                                      | A refusal saying an empty backup is worse than none, because it looks like one | Nothing                                                                                                                                   |
| The account cannot write to the repository                                                               | Named, with the repository                                                     | Nothing; no release was created                                                                                                           |
| The repository is public and unacknowledged                                                              | The warning, and "Nothing was uploaded"                                        | Nothing                                                                                                                                   |
| The tag already exists                                                                                   | A refusal saying nothing was changed and the existing release was left alone   | Nothing                                                                                                                                   |
| The token is refused (401)                                                                               | The refusal, plus a route to sign in again at the surface where it happened    | Whatever had uploaded                                                                                                                     |
| The selected `gh` account is missing, unhealthy, cannot be switched, or verifies as a different identity | The exact account/host refusal and **Open GitHub accounts** beside it          | Existing uploaded parts remain; no new release command runs under the wrong identity                                                      |
| The connection drops mid-upload                                                                          | The failure, and the row offers to carry on                                    | The staged archive, the parts, and every asset already uploaded                                                                           |
| Cancelled                                                                                                | "Everything already packed and uploaded is kept"                               | The same                                                                                                                                  |
| The pack is cancelled or fails                                                                           | The failure                                                                    | Nothing: a partial archive is deleted, because a half-written zip looks exactly like a finished one to anything that only checks the name |

Every failure is reported in the main process's own words. Nothing is retried silently, and no
failure is reported as a success.

## Security considerations

- **The token never crosses to the renderer.** The main process holds the GitHub session and
  resolves a token per operation. Nothing on the bridge carries a credential in either direction,
  and `ipc.test.ts` walks every channel's answer asserting the token does not appear in it.
- **Publishing a world is publishing everything in it.** The public-repository warning is the whole
  point: a save carries coordinates, builds, inventories and anything a guest left behind. Once it
  is up, assume somebody has a copy — deleting the release later does not recall what was
  downloaded.
- **Links are not followed.** A link inside a world folder is skipped and named, so a backup cannot
  be talked into packing a home directory.
- **Everything read back off a release is untrusted.** Anybody with write access to that repository
  could have replaced `backup.json` or the pointer. Both are size-bounded before they are fetched,
  every field is proved before a listing shows any of it, and anything doubtful makes the whole
  record unreadable rather than a half-populated row. Part names in a pointer are plain file names;
  nothing resolves one against a directory without that check.
- **No encryption is written here.** A backup on a public repository is public. If a world needs to
  be stored where its contents cannot be read, that is Desktop Material's encrypted Cheap LFS
  payload, or a private repository — not this feature pretending to offer either.
- **Nothing existing is ever changed.** The append-only rule is not a convention; the functions that
  would break it are not in the module, and a test watches every request across a full backup and a
  resume, asserting that the only methods used are `GET` and `POST`.
- **A CLI fallback cannot drift to another identity.** The selected host/login is sourced from
  `gh auth status --json hosts`, auto-switched with `gh auth switch`, re-read, then verified with
  `gh api user` immediately before release operations. No token appears in arguments or messages.

## Verification

Everything below runs from `design/`.

```
npx tsc -p packages/app/tsconfig.json --noEmit
(cd packages/ui && npx vue-tsc -p tsconfig.json --noEmit)
npx eslint packages/app packages/ui
npx vitest run packages/app packages/ui
```

The tests for this feature, and what each one is for:

| File                                         | What it pins                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main/backup/pointer.test.ts`                | The canonical v1 regular expressions, copied verbatim, applied to what this writer produces; the five-line single-asset form; the part-sum rule; encrypted and deflated pointers named as unsupported rather than broken                                                                                                                                                                                                                                                                                                                 |
| `main/backup/archive.test.ts`                | The same folder packs to the same digest twice; what is written opens in this project's own `ZipReader` and unpacks through `extractZip` into an identical tree; a cancelled pack leaves nothing behind                                                                                                                                                                                                                                                                                                                                  |
| `main/backup/source.test.ts`                 | A world without a `level.dat` is refused; the folder above a world is refused by name; an empty folder is refused; tags and archive names are safe for a tag, a file name and a URL at once                                                                                                                                                                                                                                                                                                                                              |
| `main/backup/sidecar.test.ts`                | Every field proved before a listing trusts it; a bad version, kind, digest or count makes the record null                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `main/backup/github.test.ts`                 | Only repositories with push access are offered; a genuine taken-tag 422 (matched by GitHub's own `errors[].code`) says nothing was changed; an _empty-repository_ 422 — the same status, a different body — is told apart and named correctly rather than reported as a taken tag; an upload streams rather than buffering; no method other than `GET` or `POST` is ever sent                                                                                                                                                            |
| `main/backup/runner.test.ts`                 | A whole backup against real folders and a fake GitHub: the pointer's parts hash to what landed and rejoin to the promised archive; the pointer goes up last; a public repository is refused unacknowledged and uploads nothing; a resume skips digest-matched parts and re-uploads a truncated one; a cancel mid-part keeps what was already up and never leaves a pointer                                                                                                                                                               |
| `main/backup/restore.ts` (`restore.test.ts`) | A real `BackupRunner` upload round-tripped through the real restorer, byte for byte, including the single-asset (unsplit) form; a stopped upload with parts but no pointer is refused as incomplete rather than restored; a corrupted part is caught before anything unpacks; cancellation is reported as cancellation, not failure                                                                                                                                                                                                      |
| `main/backup/backup.realGithub.test.ts`      | Skipped unless `MBM_TEST_BACKUP_LIVE=1`. Packs, publishes, cancels mid-upload, resumes under the same tag, and restores — against real `api.github.com` and `uploads.github.com`, not a fake — with the restored folder checked byte-for-byte against the original both times                                                                                                                                                                                                                                                            |
| `main/backup/ipc.test.ts`                    | Exactly the named channels are registered and removed; the token appears in no answer; being signed out is an answer rather than a crash                                                                                                                                                                                                                                                                                                                                                                                                 |
| `components/backup/backups.test.ts`          | Events land in the right row; a refusal with no id is reported beside the form, not as a phantom row; reading a repository clears the previous answer first                                                                                                                                                                                                                                                                                                                                                                              |
| `components/backup/BackupScreen.test.ts`     | A build with no bridge says what is needed; the public warning and its acknowledgement render; restoring emits the release's coordinates and fetches nothing itself; an unfinished backup offers no restore                                                                                                                                                                                                                                                                                                                              |
| `components/backup/BackupRunCard.test.ts`    | The log toggle's `aria-controls` names the revealed list; the auto-scroll checkbox is on by default with a real accessible name; the log is a `role="log"` region with `aria-live="off"`; new lines scroll the view while checked and do not once unchecked; scrolling away pauses without unticking the checkbox and shows a jump control; scrolling back to the bottom resumes and hides it; an active text selection inside the log is never scrolled away from; keyboard focus is never moved; the preference survives a fresh mount |
| `main/cirender/transport.test.ts`            | The shared upload transport's exact `gh release` command shape on github.com and enterprise hosts; auto-switch and identity verification; success, refusal and resume; and no release call after missing-account, switch-failure or identity-mismatch guards                                                                                                                                                                                                                                                                             |
| `components/cirender/CiRenderScreen.test.ts` | A blocked selected `gh` account exposes **Open GitHub accounts** beside the route failure, not in a distant menu                                                                                                                                                                                                                                                                                                                                                                                                                         |

What has **not** been verified, stated plainly:

- The application's **Restore this** button is not wired to `restore.ts`. Pressing it today still
  only opens Downloads and asks the person to fetch the release by hand; see
  [Restoring](#restoring) above.
- The interoperability claim is checked at the level of the pointer grammar only. See
  [what has actually been verified](#what-has-actually-been-verified-about-the-interoperability).
  Nobody has restored a backup made here through Desktop Material's own restore path, or the other
  way round.
- The largest archive packed in a test — including the live one — is a few megabytes. The Zip64
  records are written for every entry rather than only for large ones precisely so the 4 GB
  boundary is not a code path that only runs on the archives nobody can afford to test with, but
  that boundary has not been crossed with real data here.
- The repaired CLI route has not uploaded the reported 1.99 GB / 6,472-piece world, and no test
  changes the machine's real active `gh` account. Command shape, account switching and failure
  containment are locally proven; a real account/network run remains external verification.

## Related reading

- [Large worlds and rendered maps](./large-worlds.md) — the split-and-rejoin machinery a backup
  uses, and the download half that restores one.
- [Rendering a world that lives in a private repository](./private-world-rendering.md) — the other
  place this project puts a world on GitHub, and what that does and does not protect.
- [Super confirmation](./super-confirmation.md) — the gate a delete would need, and why append-only
  means there is nothing here to gate.
- [Finding worlds](./finding-worlds.md) — where the worlds offered as backup sources come from.

## 廣東話

呢篇講點樣備份 (backup) 一個世界或者一張已 render 嘅地圖。

一張 render 出嚟嘅地圖係幾個鐘嘅工夫，而一個 Minecraft 世界根本冇得重造，所以兩者都值得喺佢哋所住嗰部機以外留一份副本。呢個功能就係嗰份副本：application 會將個資料夾打包成一個 archive、切成幾份，再將啲部分當成一個**新 GitHub release** 嘅 asset 咁發佈，隔籬仲有一個細細嘅 pointer 檔，列明每一份同佢嘅 SHA-256。

### 點解唔用 Git LFS

Git LFS 係最順口嘅答案，亦係貴嗰個。喺 GitHub 上面，一個免費帳戶得 **1 GB LFS 儲存同每月 1 GB 頻寬**；嗰個頻寬係每次*還原*都計，唔淨止上載，超咗就要買 data pack。一張 render 地圖或者一個 Minecraft 世界動輒幾 GB，所以：一次備份就即刻用爆免費儲存層；每次還原都會再收一次費，計落一個每月重置嘅配額；一個唔小心多整咗嘅大世界副本，換嚟嘅係一張帳單，唔係一個警告。

GitHub **release asset** 嘅成本模型完全唔同。喺公開 repository 上面免費，上限係*每個 asset* 2 GB 而唔係總量，而且下載唔會計落 LFS 頻寬配額。佢唯一做唔到嘅，就係載一個大過上限嘅單一檔案 —— 而呢個正正就係呢個專案已經解決咗兩次嘅問題：[`@worldlens/parts`](./large-worlds.md) 會將一個檔案切成有 checksum 嘅部分再駁返埋，而下載介面本身已經識攞啲部分、逐個驗證、駁返埋再解包。

所以 Git LFS 唔係喺呢度被遺忘咗。佢係**按成本、指名道姓咁被否決**，程式碼喺 `main/backup/pointer.ts` 有講，介面喺表格上面用一句講咗，而呢份文件就第一時間講。

### Pointer 格式唔係我哋嘅

「pointer 提交入 repo，bytes 做 release asset」呢個諗法，係姊妹 application **Desktop Material** 一個已出街嘅子系統，喺嗰邊叫 **Cheap LFS**。呢個功能係講嗰種格式，唔會另起爐灶整個對手出嚟，所以任何一邊 application 整嘅備份，另一邊都讀得到。

喺嗰個 repository 入面，權威檔案有三份：`app/src/lib/cheap-lfs/pointer.ts` 係 v1 嘅權威合約，即係文法、界限同 parser；`docs/features/repository-management/release-backed-cheap-lfs.md` 講設計，同埋點解佢刻意唔係 Git LFS；`docs/features/repository-management/cheap-lfs-release-payload-encryption.md` 講可選嘅密碼加密，而呢個 application 唔會寫嗰樣。

一個 v1 pointer 係五行 head，切咗檔嘅話每一份再加一行：

```
version desktop-material/cheap-lfs/v1
release-tag mbm-backup-world-overworld-20260804T101500Z
asset-name world-overworld-20260804T101500Z.zip
size 1100000000
sha256 9f2c...
part 1a2b... 524288000 world-overworld-20260804T101500Z.zip.001-1a2b3c4d5e6f7a8b
part 3c4d... 524288000 world-overworld-20260804T101500Z.zip.002-3c4d5e6f7a8b9c0d
part 5e6f...  51424000 world-overworld-20260804T101500Z.zip.003-5e6f7a8b9c0d1e2f
```

一個細到可以做單一 asset 嘅檔案會完全略去 part 行，逐 byte 就係原本嗰個五行形式。

有三條規則要嚴格跟，因為權威檔案講明呢個格式要永遠保持權威：

- **唔准加任何嘢入 pointer。** 呢個 application 知道但格式唔載嘅嘢 —— 佢係邊種嘢、幾時、邊個 build 整、入面有幾多個檔 —— 全部住喺同一個 release 上面一個**獨立嘅 `backup.json` asset**。一個多咗欄位嘅 pointer 喺佢被複製過去嗰個 application 度會 parse 唔到，而嗰樣正正就係呢單交易嘅全部價值。
- **新嘅 part 係 500 MiB**，即係權威檔案入面嘅 `CHEAP_LFS_PART_SIZE_BYTES`，唔係呢個專案自己嗰個 1.7 GB 發佈大細。一個失敗嘅 part 要重傳成份，所以一個接近 2 GB 上限嘅 part 會將一次斷線變成幾 GB 嘅重複上載。
- **讀嘅一方接受得多過寫嘅一方產出。** 最大 2 GiB 嘅 part 都接受，因為世上真係有啱啱好嗰個大細嘅 pointer 存在，而一個 parser 可以放寬佢接受嘅範圍，但永遠唔可以收窄。

#### 呢個 application 唔會寫啲乜

淨係寫純 `part` 行。壓縮 (`part-deflate`) 同密碼加密 (`part-encrypted`、`part-encrypted-deflate`) 嘅形式係**認得**嘅 —— 備份清單會標明其中一個係加密，並且講明由 Desktop Material 還原 —— 但呢度唔會寫，亦還原唔到。呢點會喺介面直接講明，而唔係報告成一個損壞 pointer，因為一個揸住加密備份嘅人，需要知道嘅係呢個 build 冇密碼路徑，而唔係佢個檔爛咗。

#### 實際驗證咗啲乜 —— 永久淨係格式符合性

`packages/app/src/main/backup/pointer.test.ts` 由 `app/src/lib/cheap-lfs/pointer.ts` **逐字**抄咗權威嘅正規表達式同 head 欄位規則，再將呢個 writer 產出嘅每個 pointer 逐行行過佢哋。呢個係一個真實而且可以查證嘅聲稱：呢度寫出嚟嘅嘢，滿足權威 parser 所套用嘅文法。

呢個專案永久聲明，個聲稱就到此為止。佢係**格式符合性 (format conformance)**，唔係**互通性 (interoperability)**，兩者唔係同一個聲稱 —— 由呢個 application 整嘅備份，從來未經 Desktop Material 自己嘅還原路徑還原過；而由 Desktop Material 整嘅備份，亦從來未由呢個 application 還原過。專案 issue #36（英文版上面有連結）記錄咗喺呢件事定案之前檢查過乜：Desktop Material 已確認存在於驗證嗰部機上面，亦確實共用呢個完全一樣嘅權威 pointer 格式同 release-asset 後端，所以一次來回並唔係因為姊妹 application 唔喺度而受阻。冇做，係因為一次真正嘅雙 application、真 GitHub、雙向、而且要涵蓋單一 asset 同分割兩種 pointer 形狀嘅來回，係一項實質嘅跨專案整合工作，判斷咗佢應該自成一件工作，而唔係喺一次唔相干嘅 pass 入面順手試。Outcome B —— 永久聲明呢個限制，而唔係去證明更強嗰個聲稱 —— 就係 issue 自己針對呢種情況明文批准嘅解決方式，而呢個專案採用咗佢。將來想真係做一次線上來回嘅任務，起點就係同一個檔案 `pointer.test.ts`，同埋 `design/ROADMAP.md` 嘅 Backups 嗰行。

另一個方向亦都冇講大話：程式碼、測試同呢份文件，一路以嚟對呢個限制都係準確嘅。呢一節存在，係為咗令呢條邊界讀落去係一個永久、刻意嘅決定，而唔係一條冇人答過嘅懸案。

### 一個備份喺 release 上面係點樣

一個備份就係一個 release，用一個唯一 tag，標記做 prerelease，令佢永遠唔會變成 repository 嘅「latest release」。個 release 入面會有三份切開嘅 archive（頭兩份各 500 MiB、最後一份 49 MiB）、一個大約 1 KB 嘅 `backup.json`，同一個大約 1 KB 嘅 `.cheaplfs` pointer 檔，英文版上面有完整清單。

每一份 part 嘅 asset 名入面嗰段 digest，係嗰份 part 自己 SHA-256 嘅頭十六個 hex 字元。佢喺度係有特定原因嘅 —— 見下面講續傳嗰段。

### 行為 (Behaviour)

#### 有咩可以備份

得兩種，而且 application 會拒絕一個唔係佢所聲稱嗰種嘅資料夾。**World** 即係一個 Minecraft 存檔，有 `level.dat` 同 region 資料夾，檢查係睇下直接入面有冇 `level.dat`。**Render** 即係 maps 資料夾底下一個 render workspace，檢查係睇下有冇 `render.json` 或者一個 `web/` 資料夾。

揀咗一個世界*上面*嗰層係最常見亦最貴嘅錯：冇呢個檢查，就會花一個鐘打包錯咗嘅目錄樹，而個錯要等到還原出一個 Minecraft 開唔到嘅資料夾嗰陣先浮面。拒絕嗰陣會講明個資料夾，同埋佢搵緊乜。

打包任何嘢之前會先讀個資料夾，而顯示嘅檔案數同 byte 總量就係 pack 實際會用嗰啲 —— 唔係估算。凡係 pack 會漏低嘅嘢都會連原因喺畫面點名，所以一個同檔案管理員唔同嘅數字會有解釋，唔會靜靜雞。

**符號連結會跳過，永遠唔會跟。** 一個 world 資料夾入面有條連結指住 home 目錄，否則就會將嗰個 home 目錄打包入一個就嚟發佈嘅備份度。

#### 公開同私有 repository

Repository 嘅資料係喺打包任何嘢之前由 GitHub 讀返嚟 —— 永遠唔會靠個名去估 —— 而且會照直講出嚟：

- **公開**：一個大聲嘅警告。上載嘅所有嘢，任何人都可以下載，唔需要帳戶、亦唔需要你畀條連結；一個世界載住你嘅建築、你嘅座標同任何人擺咗喺箱入面嘅嘢，而一張 render 地圖用圖片載住同樣嘅資訊。喺個確認勾冇剔之前，備份**唔會進行**，而且 main process 一樣會拒絕一個未確認嘅公開 repository —— 一個淨係住喺 renderer 嘅守衛唔算守衛。
- **私有**：一個細聲啲嘅提示。私有唔等於免費：一個私有 repository 嘅 release 一樣計落帳戶嘅儲存上限，幾個大備份就到得。嗰句提示講嘅係「平啲，唔係免費」，唔會亂承諾。

#### 當仲未有合適 repository 嗰陣，建立一個

以前個 repository picker 淨係做到一件事：列出已經存在嘅嘢。一個冇 repository 可以備份落去嘅人，就要離開 application、去 GitHub 手動開一個、再返嚟揀 —— 對呢個功能最想幫嗰種人，即係從來未做過呢件事嗰個，變成一條死胡同。

`createRepository`（`main/backup/github.ts`）喺 picker 同 owner/repository 欄位本身所在嗰張「Where to keep it」卡上面補咗呢個窿，唔會另開一個對話框：

- **Owner 唔係你自己個帳戶，就係你所屬嘅一個 organisation。** GitHub 呢兩種情況用兩個唔同 endpoint —— 個人 repository 用 `POST /user/repos`，organisation 底下嘅用 `POST /orgs/{org}/repos` —— 所以呢個畫面用一個二選一嘅 picker 去問邊個適用，唔會由打出嚟嘅名去估。
- **可見性係一個真選擇**，而且後果用同呢個畫面其他地方一樣嘅字眼講出嚟：PUBLIC 即係任何人都下載到，private 即係淨係獲授權嘅帳戶睇到，而且唔係免費儲存。
- **會用一個起始 commit 初始化。** 一個完全冇 commit 嘅 repository，喺有嘢試圖喺佢上面建立 release 嗰一刻會回一個好具體嘅 422 —— `"Repository is empty."` —— 正正就係上面 append-only 設計已經要點名過一次嗰個陷阱，係對住一個真實、啱啱建立、從未 push 過嘅 repository 發現嘅。`auto_init: true` 對於有人由呢個畫面建立嘅第一個 repository，完全繞開咗佢。
- **一個已被佔用嘅名，同 GitHub 用同一個 status 回嘅其他 422 分得開** —— 例如無效字元、只得標點嘅名、超出長度上限嗰啲 —— 並且用自己嘅 `name-taken` code 報告，令介面可以指住個名欄位，而唔係顯示一個通用失敗。
- **建立永遠唔會覆寫。** GitHub 自己就會拒絕一個已存在嘅名，所以呢個功能入面根本冇任何「重新初始化一個現有 repository」嘅路徑需要用破壞性操作嘅 super-confirmation 去把關 —— 嗰個需要把關嘅操作根本唔存在。
- **新建嘅 repository 會自動被選取。** Owner 同 repository 欄位已經寫住啱啱建立嗰個，而建立佢會好似由清單揀一個現有嘅咁重新讀一次 repository，落到同一份「喺呢度上載會意味住乜」嘅報告，唔會留低個人自己撳 Check。

#### 搜尋 repository 清單

`listWritableRepositories` 會讀 `/user/repos` 最多三頁 —— 300 個 repository，最近活躍嘅行先 —— 再一次過將呢個已經有界嘅集合交畀畫面；介面唔會再分頁。所以 repository picker 嘅搜尋（就係共用嗰個 `ConfigSearchField`，自帶錨定 regex builder，預設純文字）對已載入嘅嘢係完整嘅，而且佢會咁講：摘要行寫「showing N of 300 loaded repositories」，唔會令人以為佢搜咗成個帳戶；如果你想要嗰個 repository 唔喺最近活躍嘅 300 個入面，清單隔籬嗰兩個 owner/repository 文字欄位仍然係老實嘅到達方法。清單有三個分得清嘅狀態：仲未載入、呢個帳戶真係一個都冇、以及冇任何已載入 repository 夾到當前搜尋。

#### 按次序會發生啲乜

1. **讀資料夾。** 數檔案、加總 bytes、點名所有會被漏低嘅嘢。
2. **讀 repository。** 可見性，同埋呢個帳戶實際上寫唔寫得。
3. **打包**成一個確定性嘅 Zip64 archive，串流方式，一路寫一路 hash。
4. **切割**成 500 MiB 嘅 part，用 `@worldlens/parts`，每份有自己嘅 SHA-256。
5. **發佈**一個用唯一 tag 嘅新 release。
6. **上載**每一份 part，然後 `backup.json`，最後 pointer。

Pointer 係刻意行**最後**。佢係完成標記：一個有 pointer 嘅 release 就係一個做完咗嘅備份，而一個有 part 但冇 pointer 嘅 release 就係一次做到一半停低嘅上載。倒轉嚟做 —— 令個 release 喺 part 仲上緊嗰陣就睇落好完整 —— 會製造出呢個功能可能有嘅最壞失敗：一個有人信得過嘅備份，喺佢真係要用嗰日還原出一嚿驗證唔到嘅碎片。

個 archive 係**確定性**嘅：同一個資料夾，喺任何機上面，每次都打包成同一堆 bytes。Entry 按佢哋嘅 UTF-8 bytes 排序而唔係按 locale collation，每個時間戳都係同一個固定值，mode 同屬性都固定，而且乜都唔壓縮。用 store 而唔用 deflate 係刻意嘅 —— 一個 render 大部分係 PNG tile，一個世界大部分係已經壓縮咗嘅 region 檔，所以壓縮換嚟嘅係個位數百分比，但要為幾 GB 嘅 pack 每一個 byte 燒 CPU。

當每一份 part 都上咗 release 之後，staging 嘅 archive 同啲 part 會由 disk 刪走。Pointer 同 sidecar 會留低：得幾 KB，而且就係當初壞嘅係網絡嗰陣，一個人重新搵返自己個備份嘅方法。

#### 睇住佢發生

每一行嘅 **Show what it reported** 展開區最多載 100 行 log（`backups.ts` 入面嘅 `LOG_LIMIT`），一開咗就會有個預設剔咗嘅 **Follow new lines** 勾選框 —— 一次備份可以講成個鐘，而喺佢仲行緊嗰陣打開展開區，就係為咗睇住佢發生。向上捲去讀返之前一行會自動暫停跟隨，而唔會取消個剔；捲返落底，或者用嗰個淨係喺暫停時出現嘅 **Newest lines** 控件，就會恢復。個清單帶 `role="log"` 同 `aria-live="off"`，所以用鍵盤到得同讀得到，而唔會有螢幕閱讀器逐行讀出嚟。呢個偏好會跨重啟記住，而且係所有打開嘅備份行共用，唔係逐行分開，同 `RenderConsole.vue` 自己個 console 同 `DownloadRowCard.vue` 自己個 log 用嘅係同一套機制（`components/scroll/`）—— 「向上捲就暫停」同揀 `aria-live="off"` 背後嘅完整理由，見 [Render console](./render-console.md)。

#### 還原 (Restoring)

**還原有自己嘅引擎 `main/backup/restore.ts`**，唔係下載介面。呢一節以前寫住相反嘅嘢 —— 話還原一個備份即係經 [Large worlds and rendered maps](./large-worlds.md) 所記錄嗰條路徑下載一個 release —— 而嗰樣從來都唔係真。嗰條路徑淨係識一種分割格式：一個 `<name>.parts.json` manifest 加隔籬嘅 `<name>.001`、`<name>.002`… 而一個備份嘅 part 係叫 `<archive>.<index>-<sha16>`，隔籬亦永遠唔會發佈 `.parts.json` —— Cheap LFS pointer *就係*嗰個 manifest，而且個形狀要逐 byte 保持 `desktop-material` 自己個 parser 接受嗰樣 —— 所以下載介面自己嘅發現邏輯根本從來未認得一個 Cheap LFS release 係一個分割下載，而喺 `restore.ts` 出現之前，亦從來冇嘢對住一個真 release 去驗證過呢個聲稱。

`restore.ts` 會讀一個 release 嘅 sidecar 同 pointer，拒絕一個上載從未完成嘅（冇 pointer、冇整檔 digest 可信），用可續傳嘅 ranged request 攞每一份 part，喺記憶體入面將 pointer 翻譯成一個 `@worldlens/parts` manifest，令現有嘅駁合邏輯 —— 逐 part digest、可續傳嘅前綴驗證、整檔 digest —— 可以重用而唔使重新實作，最後解包已驗證嘅 archive。每一份還原到嘅 payload 一到就會 hash，而且必須等於 pointer 嘅 digest 同 byte 大細先可以取代任何嘢；下載到嘅 bytes 係不可信輸入。

已對住真 `github.com` 證明：`backup.realGithub.test.ts`（冇 `MBM_TEST_BACKUP_LIVE=1` 就跳過）會打包、發佈、上載中途取消、用同一個 tag 續傳，然後還原 —— 做兩次，一次係全新備份、一次係續傳嘅 —— 並且將還原出嚟嘅資料夾同原本逐 byte 對過。**仲未做嘅：** application 自己嗰粒 **Restore this** 掣今日仍然淨係打開 Downloads，叫人自己去攞個 release —— 個新引擎仲未接上任何 channel、bridge method 或者嗰粒掣，所以而家冇人可以由介面到達佢。嗰段接線就係呢個功能仲剩返嘅一件事。

一個上載從未完成嘅備份冇 pointer，所以冇嘢可以用嚟驗證一次還原。佢仍然會**列出嚟** —— 收埋佢會令人周圍搵一個佢以為整咗嘅備份 —— 並且標記為未完成，唔會有還原掣，附一句話講明將同一個資料夾再備份一次就會接住做落去。

#### 停止，同埋繼續

任何時候停都安全。一個被取消嘅備份會保住佢已經打包同已經上載嘅所有嘢；對住同一個 release tag 再開始，就會接住做落去，唔會由頭嚟過。

一次續傳嘅上載，如果 release 上面已經有一個**名完全一樣**而且**大細完全一樣**嘅 asset，就會跳過嗰份 part。個名就係令呢個變成 digest 比對而唔係靠估嘅關鍵：佢帶住嗰份 part 自己 SHA-256 嘅頭十六個 hex 字元，所以一個用嗰個名嘅 asset，就係一個上載嗰陣內容 hash 出嗰個值嘅 asset；而同一個備份再行一次會產生同樣嘅名，因為個 archive 係確定性嘅。

呢點係準確咁講，唔會誇大。**GitHub 唔會為一個 release asset 發佈佢自己嘅 checksum。** 名加大細以外嘅替代做法，就係將每份 part 下載返嚟 hash 一次，而喺一次續傳緊嘅 20 GB 上載上面，咁做仲貴過重新上載一次。一份儲存大細對唔上嘅 part 會重新上載，唔會當佢啱。

#### 備份係 append-only

每個備份都係佢自己嘅一個新 release，用自己嘅唯一 tag。呢個 application 入面冇任何嘢會編輯一個 release、刪除一個 release、刪除一個 asset，或者取代一個 asset 嘅 bytes —— `main/backup/github.ts` 根本冇一個做得到嘅 function，而一個已經存在嘅 tag 會被拒絕而唔會被沿用，並且會出一句話講明乜都冇改。

所以介面度**冇刪除掣**，而呢個係一個決定，唔係一個遺漏。一個人唔想要嘅備份，要喺 GitHub 上面刻意咁刪，喺嗰度佢面前擺住嘅就係佢正刪嘅嘢。喺呢度加一粒，就係將一個不可逆嘅操作擺喺 [super-confirmation gate](./super-confirmation.md) 同一次手民之誤後面；唔加，即係一次意外最壞嘅後果，就係多咗一個 release。

### 設定 (Configuration)

冇嘢可以設定。可以做設定嗰啲部分，都係由格式或者成本模型決定。Part 大細係 500 MiB，即係權威 Cheap LFS 嘅寫入大細，改咗只會產生同姊妹 application 唔同嘅 pointer 而冇任何好處。壓縮係冇，理由如上：payload 本身已經係壓縮咗嘅 tile 同 region 檔。Release 可見性係 prerelease，因為一個備份靜靜雞變成人哋嘅「latest release」會搞爛 installer 連結同 release feed。Staging 位置係 `<map storage>/backups/<id>/`，跟設定期間揀嘅 map storage 資料夾，令一個備份唔會塞爆一個人已經搬離嘅磁碟。

GitHub 登入係同 application 其他部分共用，喺 Settings 度設定。一次備份需要一個對所選 repository 有 **push access** 嘅帳戶；發佈 release 需要嘅係 `repo` scope，而一個好可能係因為缺 scope 嘅拒絕會咁講，唔會淨係報一個光脫脫嘅 403。

當 CI-render 介面用 `gh` 做佢嘅憑證路線嗰陣，佢仍然用同一套 packer、splitter、pointer 同續傳邏輯。喺讀取、建立或者上載一個 release 之前，所選帳戶會同 `gh` 真實嘅已登入清單對數，有需要就切換成 active，再用 `gh api user` 驗證。嗰個切換影響成部電腦，而且會留喺 active 狀態。Release 指令會用 `--repo <host>/<owner>/<repository>` 帶住 enterprise host；佢哋永遠唔會收到唔支援嘅 `--hostname` flag。

### 失敗情況 (Failure modes)

冇人登入：喺任何網絡呼叫之前就講「Sign in from Settings」，乜都唔會留低，因為根本冇發過請求。資料夾唔係一個世界：喺任何網絡呼叫之前講出個資料夾路徑同佢搵緊乜，乜都唔留低。資料夾係空嘅：拒絕，並講明一個空備份仲衰過冇備份，因為佢睇落似個備份。帳戶寫唔到嗰個 repository：點名連 repository 一齊報，冇建立過 release。Repository 係公開而又未確認：出警告同「Nothing was uploaded」。Tag 已經存在：拒絕，講明乜都冇改、現有 release 冇郁過。Token 被拒（401）：報告拒絕，並喺發生嗰個介面提供重新登入嘅路徑，已上載嘅嘢會留低。所選 `gh` 帳戶唔見咗、唔健康、切換唔到，或者驗證出係另一個身分：報告準確嘅帳戶/host 拒絕，隔籬有 **Open GitHub accounts**；已上載嘅 part 留低，亦唔會有任何新 release 指令用錯誤身分行。上載中途斷線：報告失敗，嗰一行提供繼續，staging archive、啲 part 同每個已上載 asset 都留低。取消：講「已經打包同上載嘅嘢全部保留」，留低嘅嘢一樣。打包被取消或者失敗：報告失敗，乜都唔留低 —— 一個半成品 archive 會刪走，因為一個寫咗一半嘅 zip，對任何淨係睇個名嘅嘢嚟講同一個完成品一模一樣。

每個失敗都用 main process 自己嘅字眼報告。冇嘢會靜靜雞重試，亦冇失敗會被報告成成功。

### 保安考慮 (Security considerations)

- **Token 永遠唔會過去 renderer。** Main process 揸住 GitHub session，逐個操作解析出一個 token。Bridge 上面兩個方向都冇任何嘢帶憑證，而 `ipc.test.ts` 會行過每條 channel 嘅回覆，斷言個 token 唔會出現喺入面。
- **發佈一個世界，即係發佈入面所有嘢。** 公開 repository 嗰個警告就係重點：一個存檔載住座標、建築、物品欄同任何訪客留低嘅嘢。一上咗去，就當有人已經有份副本 —— 之後刪咗個 release 都追唔返已經被下載嘅嘢。
- **連結唔會跟。** World 資料夾入面嘅連結會跳過同點名，令一個備份唔會被氹到去打包一個 home 目錄。
- **由 release 讀返嚟嘅所有嘢都係不可信。** 任何對嗰個 repository 有寫入權嘅人，都可能換咗 `backup.json` 或者 pointer。兩者喺攞之前都有大細上限，每個欄位喺清單顯示任何嘢之前都要證明過，而任何可疑嘅嘢會令成筆記錄變成讀唔到，而唔係變成一行填咗一半嘅嘢。Pointer 入面嘅 part 名係純檔名；冇嘢會喺冇做呢個檢查之下就將佢對住一個目錄去解析。
- **呢度唔會寫加密。** 一個喺公開 repository 上面嘅備份就係公開。如果一個世界需要儲存喺一個內容讀唔到嘅地方，嗰個係 Desktop Material 嘅加密 Cheap LFS payload，或者一個私有 repository —— 唔係呢個功能扮自己提供緊其中任何一樣。
- **現有嘅嘢永遠唔會被改。** Append-only 唔係一個慣例；會打破佢嘅 function 根本唔喺個 module 入面，而且有測試會監察一次完整備份加一次續傳嘅每一個請求，斷言用到嘅方法淨係 `GET` 同 `POST`。
- **CLI fallback 唔會漂移到另一個身分。** 所選嘅 host/login 由 `gh auth status --json hosts` 取得，用 `gh auth switch` 自動切換，再讀一次，然後喺 release 操作之前一刻用 `gh api user` 驗證。參數同訊息入面唔會出現任何 token。

### 驗證 (Verification)

以下全部喺 `design/` 度行：

```
npx tsc -p packages/app/tsconfig.json --noEmit
(cd packages/ui && npx vue-tsc -p tsconfig.json --noEmit)
npx eslint packages/app packages/ui
npx vitest run packages/app packages/ui
```

各個測試檔守住嘅嘢：`main/backup/pointer.test.ts` 守權威 v1 正規表達式（逐字抄）套用喺呢個 writer 產出嘅嘢、五行單一 asset 形式、part 加總規則，以及加密同 deflate pointer 係標示為唔支援而唔係壞咗。`main/backup/archive.test.ts` 守同一個資料夾打包兩次得出同一個 digest、寫出嚟嘅嘢可以喺本專案自己嘅 `ZipReader` 打開並經 `extractZip` 解包成一模一樣嘅目錄樹，以及一次被取消嘅打包乜都唔留低。`main/backup/source.test.ts` 守冇 `level.dat` 嘅世界會被拒絕、世界上面嗰層會被點名拒絕、空資料夾會被拒絕，以及 tag 同 archive 名同時對 tag、檔名同 URL 都安全。`main/backup/sidecar.test.ts` 守每個欄位喺清單信佢之前都要證明過，而壞嘅 version、kind、digest 或者 count 會令筆記錄變 null。`main/backup/github.test.ts` 守淨係提供有 push access 嘅 repository、一個真正嘅 tag 被佔用 422（用 GitHub 自己嘅 `errors[].code` 對到）會講乜都冇改、一個*空 repository* 嘅 422（同一個 status、唔同 body）會分得開同正確命名而唔係報成 tag 被佔用、上載係串流而唔係 buffer，以及永遠唔會送出 `GET` 或 `POST` 以外嘅方法。`main/backup/runner.test.ts` 守對住真資料夾同假 GitHub 嘅一次完整備份：pointer 嘅 part hash 對得返落地嗰啲、駁返埋等於所承諾嘅 archive、pointer 最後先上、公開 repository 未確認會被拒絕而且乜都唔上載、續傳會跳過 digest 對到嘅 part 並重新上載一份被截斷嘅，以及喺一份 part 中途取消會保住已經上咗嘅嘢而且永遠唔會留低 pointer。`restore.test.ts` 守一次真 `BackupRunner` 上載經真還原器逐 byte 來回（包括單一 asset 未分割形式）、一次有 part 但冇 pointer 嘅停止上載會以未完成拒絕而唔會還原、一份損壞 part 會喺解包任何嘢之前被捉到，以及取消會報告成取消而唔係失敗。`main/backup/backup.realGithub.test.ts` 冇 `MBM_TEST_BACKUP_LIVE=1` 就跳過，對住真 `api.github.com` 同 `uploads.github.com`（唔係假嘅）做打包、發佈、中途取消、同 tag 續傳同還原，兩次都將還原出嚟嘅資料夾逐 byte 對返原本。`main/backup/ipc.test.ts` 守啱啱好嗰批具名 channel 有註冊同移除、token 唔會出現喺任何回覆，以及未登入係一個答案而唔係一次 crash。`components/backup/backups.test.ts` 守事件落喺正確嗰行、一個冇 id 嘅拒絕會喺表格隔籬報告而唔係變成一行幽靈、讀一個 repository 之前會先清走上一個答案。`components/backup/BackupScreen.test.ts` 守一個冇 bridge 嘅 build 會講出需要乜、公開警告同佢個確認會 render、還原會 emit 個 release 嘅座標而自己乜都唔攞，以及一個未完成嘅備份唔會提供還原。`components/backup/BackupRunCard.test.ts` 守 log 開關嘅 `aria-controls` 指住被展開嗰個清單、自動捲動勾選框預設開而且有真嘅無障礙名稱、log 係一個 `role="log"` 加 `aria-live="off"` 嘅區域、剔咗嗰陣新行會捲動而取消剔就唔會、捲走會暫停但唔會取消個剔並顯示一個跳轉控件、捲返落底會恢復並隱藏佢、log 入面有 active 文字選取嗰陣永遠唔會被捲走、鍵盤 focus 永遠唔會被移動，以及偏好捱得住一次全新 mount。`main/cirender/transport.test.ts` 守共用上載傳輸喺 github.com 同 enterprise host 上面準確嘅 `gh release` 指令形狀、自動切換同身分驗證、成功/拒絕/續傳，以及喺帳戶缺失、切換失敗或者身分唔符嘅守衛之後唔會有 release 呼叫。`components/cirender/CiRenderScreen.test.ts` 守一個被封鎖嘅所選 `gh` 帳戶會喺路線失敗隔籬露出 **Open GitHub accounts**，而唔係收埋喺一個好遠嘅選單度。

**未曾驗證**嘅，照直講：

- application 嗰粒 **Restore this** 掣仲未接上 `restore.ts`。今日撳落去仍然淨係打開 Downloads，叫人自己攞個 release；見上面還原嗰節。
- 互通性聲稱淨係喺 pointer 文法呢一層檢查過。冇人試過用 Desktop Material 自己嘅還原路徑去還原一個喺呢度整嘅備份，反方向都冇。
- 測試入面打包過最大嘅 archive —— 包括線上嗰個 —— 都只係幾 MB。Zip64 記錄係為每一個 entry 都寫，而唔係淨係為大嘅寫，正正就係為咗令 4 GB 邊界唔會變成一條淨係喺冇人負擔得起去測試嗰啲 archive 上面先行到嘅程式路徑；但呢度未曾用真實資料越過嗰條邊界。
- 修好咗嘅 CLI 路線未曾上載過所報告嗰個 1.99 GB / 6,472 件嘅世界，而且冇任何測試會改變部機真實嘅 active `gh` 帳戶。指令形狀、帳戶切換同失敗圍堵都喺本地證明咗；一次真帳戶、真網絡嘅執行仍然屬於外部驗證。

### 相關閱讀 (Related reading)

英文版最後指向四篇：[Large worlds and rendered maps](./large-worlds.md)，即係備份用嘅切割同駁合機制，以及還原用嘅下載嗰半；[Rendering a world that lives in a private repository](./private-world-rendering.md)，即係呢個專案另一個將世界放上 GitHub 嘅地方，同埋嗰樣保護到同保護唔到啲乜；[Super confirmation](./super-confirmation.md)，即係一個刪除操作會需要嘅關卡，同埋點解 append-only 令呢度冇嘢需要把關；同埋 [Finding worlds](./finding-worlds.md)，即係做備份來源嘅世界由邊度嚟。
