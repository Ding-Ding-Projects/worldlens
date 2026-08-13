# The vendored BlueMap engine, and keeping up with it

Worldlens does not render anything itself. Every tile it produces is produced by BlueMap, which
is somebody else's program, and this document is about what that means in practice: where that
program comes from, how you can tell which version of it is sitting on your disk, how the app
decides whether it has fallen behind, and who moves it forward.

The short version is that the engine is BlueMap's own source code, vendored at a fixed commit,
compiled unmodified, and never advanced without somebody deciding to advance it.

## The jars are upstream's code, built here

`vendor/BlueMap` is a git submodule of
[BlueMap-Minecraft/BlueMap](https://github.com/BlueMap-Minecraft/BlueMap), pinned to one commit.
A submodule pin is a commit hash, not a branch, so a fresh clone of this repository at any point
in its history gets exactly the BlueMap source that was current when that commit was made. It
does not drift, and it cannot be moved by anything happening upstream.

`scripts/bootstrap.mjs` compiles that source with BlueMap's own Gradle wrapper, from the
submodule, with no patches applied. There is no fork, no vendored diff, and no local
modification to review, which is deliberate: a rendering engine everybody else can reproduce
from upstream is a rendering engine whose bugs are upstream's bugs, reportable upstream, and
fixed by upstream. A patched one would be ours forever.

`.github/workflows/build-jars.yml` builds all seven implementations from that same submodule, so
what CI publishes and what a local bootstrap produces come from the same source at the same
commit.

## How the app knows which BlueMap it has

It cannot know from the jar. Upstream's build derives its version string from `git describe` and
writes it into the archive name, so `cli-5.22-27-shadow.jar` says `5.22-27` on the tin. That is
a label. It says nothing about which commit produced the file, it is trivially wrong for a jar
copied in by hand, and it does not distinguish a jar built this morning from one built in March.

So the build writes a record beside the jars instead. `scripts/bootstrap-helpers.mjs` writes
`worldlens-jar-provenance.json` into the same directory, holding the submodule commit the jars
were compiled from and when the build ran. That file, and only that file, is what the
application reads when it reports which BlueMap this installation runs.

Two consequences follow, and both are visible in the interface:

- **No record means no answer.** Jars that arrived some other way genuinely cannot be shown to
  have come from any particular commit, and the app says exactly that. It does not read the pin
  out of the checkout and present it as though it described the file on disk. Those two are the
  same sentence and a completely different claim.
- **The record is what decides a rebuild.** `bootstrap.mjs` no longer treats "a jar exists" as
  "the jars are current". The check is conjunctive: the jar must be there **and** its recorded
  commit must match the submodule's current commit. A matching record over a deleted jar
  rebuilds, and a jar with a stale record rebuilds, which is the case that used to go silently
  unnoticed after the pin moved.

## Deciding whether it is behind: releases, not the default branch

Upstream's default branch moves several times a week, and much of what lands on it is work in
flight. Measuring this repository's pin against it would report every installation as
permanently behind by some double-digit number that changes daily, which teaches everybody to
ignore the number, which makes the whole exercise worse than not doing it.

So the default comparison is against the **newest published release**. A release is a point
upstream has chosen to stand behind, so being behind one is a fact somebody can act on, and
being level with one is a state that stays true for weeks at a time.

The branch is still available deliberately, for the times when the question really is "has the
fix landed yet":

```
node scripts/check-bluemap-upstream.mjs            # against the newest release
node scripts/check-bluemap-upstream.mjs --branch   # against the default branch
node scripts/check-bluemap-upstream.mjs --json     # the same, as JSON
```

Two details of the comparison are worth knowing, because both are easy to get backwards and
neither is visible in the output when you do:

- **Annotated tags are peeled.** `v5.23`'s ref object is the tag object, not the release commit.
  Reporting the former would print a hash nobody can check out.
- **GitHub phrases a comparison from the head's point of view.** In `compare/<pin>...<release>`,
  `ahead` means the release is ahead of the pin, which is the pin being behind. The inversion is
  done once, in a named function, because an inverted comparison reads perfectly plausibly in
  either direction.

## Offline, rate limited, or refused

An upstream check that could not be made is reported as a check that could not be made. It is
never reported as being up to date, in the script, in the bootstrap output, or in the settings
section.

This is the one wrong answer this whole arrangement could give that nobody would ever notice,
which is why it is stated the same way in every one of those places: no network, an
unauthenticated rate limit, a missing `gh`, and GitHub returning something unexpected all
produce a sentence naming what went wrong, followed by the observation that this is not the same
as being current.

The local half keeps working regardless. Which commit the jars record, which version they are,
and when they were built are facts on this disk, and an unreachable GitHub is no reason to stop
reporting them.

## Seeing it in the app

Settings has a **BlueMap engine** section. It shows the commit and version the jars in this
installation were built from, when they were built, and the jar it is describing. A **Check for
a newer BlueMap** button asks GitHub for the newest release and reports where the installed
engine sits relative to it.

Two things it deliberately does not do:

- It never checks on its own. The local half is read when the section opens because that costs
  a file read; the upstream half happens when you press the button, so opening a settings screen
  never waits on the internet.
- It never advances anything. There is no update button here, and that is not an omission.

In a browser tab the section says it cannot look at the jars on disk, rather than showing a
button that does nothing.

## Advancing the pin, which is somebody's decision

Moving to a newer BlueMap compiles and ships new third-party code into everything this project
produces. That is a decision with a review attached, not a background task, so nothing in the
app or in `bootstrap.mjs` does it automatically. Both of them will tell you the pin is behind,
and then stop.

When you have decided:

```
node scripts/check-bluemap-upstream.mjs --advance
```

It refuses unless the pin is genuinely behind, refuses on a dirty submodule, and stages nothing:
the working tree is left with a moved submodule for you to review, build and commit yourself.
Rebuilding is the ordinary `node scripts/bootstrap.mjs`, which now sees a stale provenance
record and rebuilds the jars rather than trusting the ones already there.

## Related

- [Fetching a Java runtime for itself](./java-runtime-provisioning.md), which is the other half
  of "what does it take to run the engine at all".
- [Running the engine on this computer, or in a container](./docker-and-local.md), for what the
  jars are actually driven by once they exist.
- [Automatic updates](./automatic-updates.md), which is the same question asked about this
  application rather than about the engine it drives.
