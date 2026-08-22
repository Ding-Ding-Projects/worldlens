# Screen recordings

A still proves a surface exists. Only a recording proves the interface *moves* — that a
button responds, that a wizard advances, that a list filters as you type. A good share of
the defects worth catching cannot appear in a screenshot, because a screenshot cannot tell a
working control from a decorative one.

## What is here

| File | What it shows | Commit | How it was captured |
| --- | --- | --- | --- |
| `worldlens-tour.mp4` | Moving between Home, Map, Work and Host Server; opening the create-server wizard; the flavour cards; choosing a version from the live catalogue with its release date; stepping forward and back; cancelling. 20s, 1280×800. | `f02370eb` | The packaged unsigned build, launched on an off-screen desktop, driven through its own debugging port. Frames were taken from the application's renderer and encoded with ffmpeg. |

## How these are made, and one rule that is not negotiable

**The machine's screen is never recorded.** A screen recorder captures whatever the person
at the keyboard was actually doing, and that is their business rather than the project's. A
monitor recording that reaches a public repository is an incident, not an oversight. These
are captured from the application's own window or renderer, on an off-screen desktop, so
nothing of the visible desktop can appear in them.

They are recordings of the real built artifact at a known commit — never a mockup, never a
design file, never an animation assembled to resemble the product. The commit is recorded in
the table above so a reader can tell which version they are watching.

## Keeping them honest

A recording of an interface the project no longer builds is confidently wrong, and a reader
has no way to tell. Refresh these when the interface changes, exactly as a stale screenshot
is refreshed, and update the commit column when you do.

Where a surface genuinely cannot be recorded yet — it needs hardware, an account, or a
release that has not shipped — say so plainly here rather than leaving a gap that reads as an
oversight to the next person and as a decision to nobody.
