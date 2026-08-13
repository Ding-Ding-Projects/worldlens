# Dim sum surprise

A one in ten chance, at startup, of a small dish and its name.

## What happens

Ten percent of launches show a randomly chosen dim sum dish: its name in both languages, and
a picture of it. `Shrimp dumpling · 蝦餃`. The active language mode decides which name leads,
and the per-language funny level styles the copy around it while the dish's actual name
stays correct.

It is non-blocking and auto-dismissing. It never gates startup, never steals focus, never
delays the application becoming usable, and never appears during a first run, an error path,
an update flow, or any moment you are mid-task.

The alt text names the dish, so a screen reader user gets the same small pleasure. Reduced
motion and any quiet setting are respected.

## There is no off switch

Deliberately. No setting disables it, and there never was one to migrate away. The ten
percent is a fresh draw per launch: never more frequent than stated, never twice in one
launch.

What makes an un-optable surprise polite is everything in the paragraph above it. It cannot
interrupt you, because it is not allowed to.

## Where the pictures come from

The public [`Ding-Ding-Projects/dim-sum-photos`](https://github.com/Ding-Ding-Projects/dim-sum-photos)
catalog, resolved at runtime with a bounded request and cached locally. **No photo is
vendored into this repository.** When the catalog is unavailable, the dish is shown by name
with no image rather than with an invented one.

## Verification

The draw and every suppression rule are a pure function, so the ten percent and the
"not during first run" rules are testable without launching anything. The surface itself is
captured from the built application through a harness-only override that forces the draw;
that override is never written by shipped code, so the odds in a real launch are untouched.

## Suggested articles

- [Language modes and funny levels](language-and-tone.md) - which name leads, and how the copy around it moves
