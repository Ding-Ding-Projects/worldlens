# Rendering Bayville, and putting your own markers on it

A worked example. One real world, from picking its folder to standing a marker of your own on
the finished map, with the numbers taken from the render this repository actually has on disk
rather than from a plausible-sounding example.

The world is **Bayville World v10.1**, a survival world under the default Minecraft folder. It
was rendered on this machine into
`C:\Users\<you>\Documents\Worldlens\maps\bayville-world-v10-1-61865723ee99`, and every figure
below comes from that render's own records, from the engine's log beside them, or from a
capture committed under `docs/screenshots/`. Where a capture in this repository shows the right
step against a different world, this article says so at that step rather than letting the
picture imply something it does not show.

The other feature documents explain one surface each and explain it properly. This one explains
none of them, and instead walks the path a person actually takes, linking out at each turn. It
is filed under Rendering because that is what most of the walk is; the last two steps belong to
the marker studio.

## Step 1: choose the world folder

The wizard's first step wants a Minecraft save folder, meaning the folder holding `level.dat`
and a `region` folder. You can type it, browse to it, drop it from a file manager, or pick one
out of the list of worlds the application found for itself.

![The make-a-map wizard's World step in the real application. A world path is typed into the World folder field, and underneath it a green result reads "A Minecraft world with 1 dimensions and 1 region files" with an Overworld chip. Below that, a "Your Minecraft worlds" section lists the .minecraft folder found automatically at C:\Users\<you>\AppData\Roaming\.minecraft\saves, a search field over those worlds, and one world: Bayville, last played Jul 5, 2026, 5:11 AM, 1.21.11, Survival, cheats on, 1 dimensions, 27 region files, 110 MB, seed 227290, in Bayville World v10.1](screenshots/wizard-1-world-read.png)

That row is where Bayville's own facts come from, read off the world rather than typed in by
anybody:

| Read from the world | Value                              |
| ------------------- | ---------------------------------- |
| Folder              | `Bayville World v10.1`             |
| Minecraft version   | 1.21.11                            |
| Game mode           | Survival, cheats on                |
| Dimensions          | 1                                  |
| Region files        | 27                                 |
| Size                | 110 MB                             |
| Seed                | 227290                             |
| Last played         | Jul 5, 2026, 5:11 AM               |

The green banner above the list belongs to whatever is in the folder field at that moment, so
in this capture it reports the one region file of the small world that was typed in, not
Bayville's twenty-seven. Choosing Bayville from the list fills the field in and the banner
re-reads.

The full account of how worlds are found, including Bedrock's own saves layout and multi
instance launchers, is in [Finding worlds](finding-worlds.md). Reading a world that is not on
this machine at all is covered by [Worlds hosted on your own SSH
server](ssh-world-sources.md), [A world that lives inside Docker](docker-world-source.md) and
[Worlds from somebody else's release](world-sources.md).

## Step 2: decide where the render runs

The same engine can run in four places, and the panel says plainly what each one buys, because
speed is not what separates them.

![The "Where this render runs" card, cropped from the real application. Three radio choices: On this computer, selected; In a container on this computer, disabled with the note that Docker 29.6.2 is installed and the part that is not running is its daemon; and On another machine, over SSH, disabled because no machine has been set up. A bold line reads "This render will run on this computer, as an ordinary program and nothing more." Below it a warning card explains what Docker said and what to do next, then sections for machines you can render on and for GitHub's runners](screenshots/run-location.png)

This capture is of the same card on the same machine but from a different run, which is why it
shows Docker's daemon stopped. What it demonstrates is the choice and the honest reporting of
each route's real state. The Bayville render took the first of them: its record has
`"runtime": "local"`.

The routes have documents of their own: [Running the engine on this computer, or in a
container](docker-and-local.md), [Rendering on a remote host](remote-render.md), and [Rendering
a world in GitHub Actions](render-in-actions.md) for a computer too slow to do it at all.

## Step 3: read the review, and accept the one download

The last step restates what is about to happen before anything is written, and it is also
where the Mojang download consent is enforced: BlueMap builds its blocks out of the Minecraft
client files, so a render on a machine that has never agreed to that download stops before it
starts, with a link straight to the setting.

![The wizard's Review step in the real application, headed "What is about to happen", listing World, Dimension, Map, Written to, Engine and Java runtime for the render, followed by an orange warning that BlueMap builds its blocks from the Minecraft client files downloaded from Mojang, that the download has not been accepted yet so this render would stop before it started, and an "Open the setting" button. Underneath, a "How to run it" row of checkboxes for rendering everything again, redrawing the map edges, and letting the engine report anonymous usage](screenshots/wizard-5-review.png)

This repository holds no capture of the Review step taken against Bayville, so the capture above
is that step from another run, against a small test world. The layout and the consent gate are
what it is here to show. Bayville's own answers to the same six fields were these, taken from
the render record and the map config the run left behind:

| Review field | Bayville's value                                                        |
| ------------ | ----------------------------------------------------------------------- |
| World        | `C:\Users\<you>\AppData\Roaming\.minecraft\saves\Bayville World v10.1`   |
| Dimension    | `minecraft:overworld`                                                   |
| Map          | `bayville-world-v10-1`, named `Bayville World v10.1`                     |
| Written to   | `C:\Users\<you>\Documents\Worldlens\maps`                               |
| Engine       | upstream BlueMap Java engine, version 5.22-27                            |
| Java runtime | 25.0.4                                                                  |

The consent and the licence text behind it are in [The Minecraft licence and the consent that
cites it](eula-and-consent.md). Where that Java came from, if the machine did not already have
one, is in [Fetching a Java runtime for itself](java-runtime-provisioning.md).

## Step 4: watch it run

The render panel names the world and the exact engine build, keeps a per-map and an overall
progress bar, and offers the console rather than hiding it.

![The render panel of a run under way in the real application, headed Rendering and tagged with the world test-world-seed-1 and the engine "BlueMap engine (Java) 5.22-27 on Java 25.0.3". It shows "Starting the engine", an overall bar reading 0 of 1 maps done at 0%, running and last-heard-from timers, a "Stop the render" button noting that stopping keeps every tile already drawn and carrying on later picks up from where it stopped, a control to show the two console lines so far, and a green note that the answers given are now a project at the root of that world so the render can be repeated without setting anything up again](screenshots/render-5-running.png)

That capture is from an earlier build, still titled Material BlueMap, and again from a run
against the small test world rather than against Bayville. Its engine tag reads Java 25.0.3
where Bayville's record says 25.0.4; those are two different runs and not a disagreement about
one. The Bayville run recorded this:

| Recorded            | Value                                    |
| ------------------- | ---------------------------------------- |
| Started             | `2026-08-12T22:28:15.595Z`               |
| Finished            | `2026-08-12T22:28:18.475Z`               |
| Duration            | 2874 ms                                  |
| Outcome             | `finished`                               |
| Engine              | `upstream-java`, 5.22-27                 |
| Application version | 1.0.1068                                 |

**Do not read that 2874 ms as how long it takes to render Bayville.** The engine's own log for
that run ends `Start updating 1 maps ...` followed immediately by `Your maps are now all
up-to-date!`, so this run found nothing that needed drawing and drew nothing. It is the cost of
re-running a render that is already current, which is a real and useful number, and it is not
the cost of the first one. This repository holds no record of Bayville's first render, so this
article does not claim one.

That "already up-to-date" behaviour, and what happens when a run is interrupted rather than
finished, is [Renders that survive being interrupted](resumable-renders.md). Watching a render
in a browser tab while it is still going is [Watching a render live, in a real browser
tab](live-preview.md).

## What landed on disk

The whole render is one folder, and it is worth knowing its shape, because everything after
this point reads out of it.

```
maps/bayville-world-v10-1-61865723ee99/
  render.json     the record quoted above
  session.json    the map list and the exact BlueMap config used
  config/         core, webapp, webserver, storages, and maps/bayville-world-v10-1.conf
  data/           the engine's log, the Minecraft client jar, resource extensions
  web/            the viewer, and the tiles
```

Inside `web/`, `settings.json` is what the viewer reads first. Bayville's says version
`5.22-27`, a `mapDataRoot` of `maps`, and one map: `bayville_world_v10_1`. The map's own
`settings.json` beside the tiles gives its display name `Bayville World v10.1`, a start
position of `[0, 0]`, hires tiles of 32 by 32 and lowres tiles of 500 by 500 over three levels
of detail. The tiles themselves sit under `web/maps/bayville_world_v10_1/tiles/` in four
level-of-detail folders, `0` through `3`.

The map id is spelled two ways, and both are real. The config file the render wrote is
`config/maps/bayville-world-v10-1.conf`, with hyphens, and the engine's log reports `Loading
map 'bayville_world_v10_1'`, with underscores. The underscored form is the one the viewer uses
and the one that ends up in the tile path, and it is the one that matters for the next section,
because it is what a marker gets filed under. Why the engine rewrites it that way is upstream
BlueMap's business and is not documented here.

## Step 5: open the marker menu

With the map open, the main menu's Markers entry lists the marker sets the map has. For a world
of your own that has never had a marker file, that list is short: the studio's own set, called
"My markers", and its switch.

![The marker menu open over the rendered Bayville map in the real application. The panel on the left is headed Markers and holds a "Make your own markers" button and one marker set row, a folder icon labelled "My markers" with its toggle on. To the right, the Bayville map is drawn in the viewer: a green landmass with a town, roads, fields and woodland, a bay of blue water to the lower right, and the viewer's own control bar with its x and z readouts across the top](screenshots/menu-markers.png)

The button at the top of that panel is the route out of an empty map. It exists because before
the studio, this panel could tell you a marker set had nothing in it and offer nothing anywhere
in the application that could put something in.

Searching and filtering marker sets, including the regex builder on that field, is
[Regex builder](regex-builder.md).

## Step 6: open the studio

Pressing "Make your own markers" opens the studio underneath the set list, in the same panel,
over the same map.

![The marker studio open over the rendered Bayville map in the real application. Below the "Make your own markers" button and the "My markers" set row, a section headed "Marker studio" carries an "Add a marker" button and explains that these are markers you make yourself, kept separate from anything a server publishes so a refresh cannot take them away, and that they stay on this computer. Underneath, an empty state reads "No markers on this map yet. Add one and it appears here and on the map." The Bayville map fills the rest of the frame](screenshots/marker-studio.png)

That empty state is a real answer, and it is deliberately not the only one the studio can give.
The store fails closed: if the saved markers cannot be read, the studio says so, in its own
warning, and it **refuses to write anything at all** until that is resolved. Answering an
unreadable store with an empty list would render as "you have no markers", which invites
somebody to make them all again on top of the ones still sitting there, and the write that
followed would be the moment they genuinely were gone. So an unreadable studio and an empty one
look different on purpose, and the unreadable one says nothing has been overwritten.

## Step 7: add a marker

"Add a marker" opens one form, used for making and for editing alike.

| Field   | What it takes                                                                             |
| ------- | ----------------------------------------------------------------------------------------- |
| Name    | Required. Refused when blank, because a list of blanks is not a list.                     |
| X, Y, Z | Numbers. Rounded to whole blocks when saved.                                              |
| Note    | Free text, optional. Shown when the marker is opened.                                     |
| Colour  | Six hexadecimal digits after a hash. Defaults to `#4f8cff`.                               |

The coordinates are filled in for you from wherever the camera is, which is what "add a marker"
means when you are looking at a place. That is the whole point of the field: typing three
numbers read off another screen is the work this saves. With no viewer running at all, a blank
draft starts at X 0, Y 64, Z 0.

Validation reports every problem at once rather than one per attempt, and it bounds the
coordinates where a bound is meaningful. Y is refused outside -2048 to 2048, because a Y of
40000 is a mistake every time. X and Z are refused past 30,000,000, which is the world border's
own maximum, so the check rejects a number that could not be a position at all while accepting
every number that could, including perfectly ordinary far-flung ones.

A marker made here is filed against the map the viewer currently has open, which for this
walkthrough is `bayville_world_v10_1`. That is not decoration: a marker dropped while looking
at the nether belongs to the nether, and a panel that assumed the overworld would file it
somewhere it is never seen again.

This article does not print a specimen coordinate for Bayville. No marker on this map exists in
this repository to quote, and an invented one dressed up as a real place would be the exact
thing these documents refuse to do. Any coordinates you see in a tutorial elsewhere, including
the `200, 70, -450` that the studio's own source uses when explaining why coordinates are
searchable, are illustrations.

Once saved, the marker appears in the studio list and on the map itself, in one fixed marker
set that is updated in place rather than stacked, exactly the same call BlueMap's own marker
file loader makes on every poll. Hidden markers are left out of that set rather than added and
switched off, because the set is rebuilt wholesale and "added but invisible" is a state that
survives only until the next rebuild.

The full account of the surface, its list, its search, and the two-key gate in front of bulk
deletion is in [Marker studio](marker-studio.md).

## What this walkthrough deliberately leaves out

- **Publishing.** The map above is served from this computer. Putting it on the web is
  [Publishing a rendered map to GitHub Pages](pages-hosting.md) or [Hosting a rendered map on
  your own server](remote-hosting.md).
- **Repeating the render.** The wizard writes a project at the root of the world so the same
  render can be repeated without answering anything twice. Every setting the wizard did not ask
  about lives in [Project editor](project-editor.md).
- **A world too big for one asset.** [Large worlds and rendered maps](large-worlds.md).
- **When something fails to start.** [Automatic repair when a render or the web server fails to
  start](automatic-repair.md).

## Verification

This article is a walkthrough, so it has no code of its own to test. The behaviour it describes
is tested where it lives:

| What                                                     | Where                            |
| -------------------------------------------------------- | -------------------------------- |
| Marker validation, rounding, search text, viewer shape   | `markerStudio.test.ts`           |
| The studio store, its persistence and its fail-closed read | `markerStudio.test.ts`         |
| The studio surface, driven as a person drives it         | `MarkerStudio.test.ts`           |
| Markers reaching the actual map                          | `useStudioMarkerLayer.test.ts`   |
| This article being indexed and categorised               | `docsIndexCoverage.test.ts`      |

The Bayville figures quoted above were read from `render.json`, `session.json`,
`web/settings.json`, `web/maps/bayville_world_v10_1/settings.json` and `data/logs/cli.log`
inside that render folder on this machine. They are not reproduced by any test in this
repository, because that render folder is not part of it.

## Suggested articles

- [Marker studio](marker-studio.md) for the surface step 7 only summarises
- [Running the engine on this computer, or in a container](docker-and-local.md) for step 2 in full
- [Finding worlds](finding-worlds.md) for where the list in step 1 comes from
- [Renders that survive being interrupted](resumable-renders.md) for why step 4 finished in under three seconds
- [Publishing a rendered map to GitHub Pages](pages-hosting.md) for the step after this one
