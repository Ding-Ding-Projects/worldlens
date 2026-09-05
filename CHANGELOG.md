# Changelog

Every entry here is one commit from this repository's history, carrying the full SHA of
that commit so the claim can be checked. Versions are the tags the release workflow
published; a version's entries are the commits reachable from its tag and from no earlier
tag. The date shown is the tagged commit's own date, because the tags are lightweight and
the GitHub Release for a tag is published minutes later by the same run.

Entries are grouped by the area of the repository they changed, which is derived from the
paths each commit touched. They are deliberately not classified as features or fixes: the
commits here carry no such marker, so any such label would be inferred from the wording of
a subject line, and a changelog that infers is a changelog that eventually says something
nobody wrote.

This file is generated. Run `node scripts/build-changelog.mjs` to rebuild it, and
`node scripts/build-changelog.mjs --check` to prove it is current. Generation fails rather
than emitting a reference to a commit that cannot be resolved. The same command writes
`design/packages/ui/src/components/changelog/changelogData.generated.ts`, which carries each commit's
full message for the in-app changelog viewer.

## Unreleased

### Interface

- Merge commit 'b8751e26' - [`800af5a5e2`](https://github.com/Ding-Ding-Projects/worldlens/commit/800af5a5e25e205e48e9b7cd175d7b55c273554b) _(summary of 2 commits, also listed here)_
- Let a rail shortcut label wrap, and let the More button be the only thing that opens its menu - [`b8751e2623`](https://github.com/Ding-Ding-Projects/worldlens/commit/b8751e2623d47dd8e58b00071569127cefa33de5)
- Merge commit '9bc6f0f4' - [`05497ad29d`](https://github.com/Ding-Ding-Projects/worldlens/commit/05497ad29d256d9252c5e2a813afc8514c72093d) _(summary of 2 commits, also listed here)_
- Reach the folder picker the screen actually has, so the world browse buttons work - [`9bc6f0f479`](https://github.com/Ding-Ding-Projects/worldlens/commit/9bc6f0f479e8a26b11472c0ee1d181b1f4987eb1)

## 1.0.2026 - 2026-09-05

Tagged at [`350887af56`](https://github.com/Ding-Ding-Projects/worldlens/commit/350887af56eb9d79a6ed0520d19490035c93426a).

### Documentation

- Retire the stale 'Docker blocked' handoff row now that the render completed - [`350887af56`](https://github.com/Ding-Ding-Projects/worldlens/commit/350887af56eb9d79a6ed0520d19490035c93426a)

## 1.0.2025 - 2026-09-05

Tagged at [`46e026d688`](https://github.com/Ding-Ding-Projects/worldlens/commit/46e026d688049a0b3013df2735bb7be579cff34a).

### Documentation

- Record the Docker render of the 1 GB world in the handoff and roadmap - [`46e026d688`](https://github.com/Ding-Ding-Projects/worldlens/commit/46e026d688049a0b3013df2735bb7be579cff34a)

## 1.0.2024 - 2026-09-05

Tagged at [`e82717b41e`](https://github.com/Ding-Ding-Projects/worldlens/commit/e82717b41ed2f4863232672130115c19d68f7b66).

### Interface

- Merge commit 'cda9d25b' - [`15f6ec193b`](https://github.com/Ding-Ding-Projects/worldlens/commit/15f6ec193bec7fa8fec2bafb83d9799f6ff37202) _(summary of 2 commits, also listed here)_
- Replace informal house wording with plain terms and add an externally-configured wording guard - [`cda9d25b24`](https://github.com/Ding-Ding-Projects/worldlens/commit/cda9d25b249b6fcf60358183dcef0ed5d16865ef)

### Build, release and tooling

- Move the vendored fork to vendor/BlueMap-Material on branch material-design-3 - [`e82717b41e`](https://github.com/Ding-Ding-Projects/worldlens/commit/e82717b41ed2f4863232672130115c19d68f7b66)

## 1.0.2022 - 2026-09-05

Tagged at [`f04e46c070`](https://github.com/Ding-Ding-Projects/worldlens/commit/f04e46c0704e498e11828d80df147c89cbfbd6f2).

### Documentation

- Record that the fetch-elsewhere card registers a foreign render in the packaged build - [`f04e46c070`](https://github.com/Ding-Ding-Projects/worldlens/commit/f04e46c0704e498e11828d80df147c89cbfbd6f2)

## 1.0.2020 - 2026-09-05

Tagged at [`00a9dbd733`](https://github.com/Ding-Ding-Projects/worldlens/commit/00a9dbd73335b3c940342b30a87f441886a6a2ff).

### Documentation

- Record the clean 10 GB Chunker round trip and keep its evidence file - [`00a9dbd733`](https://github.com/Ding-Ding-Projects/worldlens/commit/00a9dbd73335b3c940342b30a87f441886a6a2ff)

## 1.0.2018 - 2026-09-05

Tagged at [`ac1f8f2727`](https://github.com/Ding-Ding-Projects/worldlens/commit/ac1f8f2727c83ba1f41fd861ed98e121e36c4414).

### Desktop shell

- Merge commit '450fe89d' - [`b062ee4d67`](https://github.com/Ding-Ding-Projects/worldlens/commit/b062ee4d67c4fa2a9ef54a1567ebff89157dd1bf) _(summary of 2 commits, also listed here)_
- Fix attach() forcing a foreign render under this project's own map id - [`450fe89dfd`](https://github.com/Ding-Ding-Projects/worldlens/commit/450fe89dfda7f7f851a6444dcd0d38ae2bed787f)

### Documentation

- Record the attach map-id fix in the handoff, roadmap and changelog - [`ac1f8f2727`](https://github.com/Ding-Ding-Projects/worldlens/commit/ac1f8f2727c83ba1f41fd861ed98e121e36c4414)

## 1.0.2016 - 2026-09-05

Tagged at [`24de773d93`](https://github.com/Ding-Ding-Projects/worldlens/commit/24de773d936c8811b41148d03649698706a7889c).

### Build, release and tooling

- Merge commit '8f2473cf' - [`ad8405565c`](https://github.com/Ding-Ding-Projects/worldlens/commit/ad8405565ca2466308d40ebac7f6a5ff61f3088e) _(summary of 3 commits, also listed here)_
- Bound the comparison's chunk-key recorders so a big diff can't segfault the process - [`0ffcf0af10`](https://github.com/Ding-Ding-Projects/worldlens/commit/0ffcf0af10ff771111e4c55c0d4b9b967e84d895)

### Documentation

- Write down the 10 GB segfault, the fix, and the honest status of the retry - [`8f2473cfe3`](https://github.com/Ding-Ding-Projects/worldlens/commit/8f2473cfe3f1f0bb0c059330e2c2730bb5b2264b)

## 1.0.2014 - 2026-09-05

Tagged at [`994d10f0cd`](https://github.com/Ding-Ding-Projects/worldlens/commit/994d10f0cde554023b5d26c0b545ebd2fe77186c).

### Desktop shell

- Merge commit 'ef213554' - [`010ac69594`](https://github.com/Ding-Ding-Projects/worldlens/commit/010ac695941ad2598c8072dc537d066772e6fdcd) _(summary of 2 commits, also listed here)_
- Fetch a completed render this app never dispatched itself; 收返一個唔係自己 dispatch 嘅 render - [`ef2135548a`](https://github.com/Ding-Ding-Projects/worldlens/commit/ef2135548a392052bcab5cc1edcc845dbfe12a55)

### Documentation

- Record the fetch-elsewhere card in the handoff, roadmap and changelog - [`994d10f0cd`](https://github.com/Ding-Ding-Projects/worldlens/commit/994d10f0cde554023b5d26c0b545ebd2fe77186c)

## 1.0.2012 - 2026-09-05

Tagged at [`7d98e18147`](https://github.com/Ding-Ding-Projects/worldlens/commit/7d98e1814738672ffa86724bae4c62c60d4adc54).

### Interface

- Gate the Chunker Actions screen's copy in the coverage test - [`c50be6fc26`](https://github.com/Ding-Ding-Projects/worldlens/commit/c50be6fc2681f64da011ec70e5c2737f78953d83)

## 1.0.2010 - 2026-09-05

Tagged at [`e4cd9efb40`](https://github.com/Ding-Ding-Projects/worldlens/commit/e4cd9efb4053d8a49059e1ebb8b6269face0ead1).

### Interface

- Merge commit '28294f9d' - [`8d47d86cd4`](https://github.com/Ding-Ding-Projects/worldlens/commit/8d47d86cd42dbd03bf67f086218c3964e451bb9c) _(summary of 2 commits, also listed here)_
- Cover every chunk-world.yml dispatch input in the Chunker Actions UI - [`28294f9dfd`](https://github.com/Ding-Ding-Projects/worldlens/commit/28294f9dfd40589f1a343f6fd8a7f9decf0e88ac)

### Desktop shell

- Merge commit '545b74e3' - [`273b7db1af`](https://github.com/Ding-Ding-Projects/worldlens/commit/273b7db1af1211a53ad9184f7433c373090f63e4) _(summary of 2 commits, also listed here)_
- Fetch and assemble a multi-group rendered map, not just refuse it - [`545b74e34f`](https://github.com/Ding-Ding-Projects/worldlens/commit/545b74e34fc0ab77a96b23abb7ec32c85d8b5de0)

### Documentation

- Record the Chunker input sweep and multi-group fetch in the handoff, roadmap and changelog - [`e4cd9efb40`](https://github.com/Ding-Ding-Projects/worldlens/commit/e4cd9efb4053d8a49059e1ebb8b6269face0ead1)

## 1.0.2008 - 2026-09-05

Tagged at [`a924d330d6`](https://github.com/Ding-Ding-Projects/worldlens/commit/a924d330d6c59cf8c5f46de59db0cfbff1310703).

### Build, release and tooling

- Advance the managed workflows' toolchain pin to the merge-memory fix - [`a924d330d6`](https://github.com/Ding-Ding-Projects/worldlens/commit/a924d330d6c59cf8c5f46de59db0cfbff1310703)

## 1.0.2006 - 2026-09-05

Tagged at [`40680d795a`](https://github.com/Ding-Ding-Projects/worldlens/commit/40680d795ae388e5a4de05fa299e95ee2af39ab8).

### Interface

- Register ConfigRegexBuilder once, not twice, in both overlay inventories - [`6c6412e8a0`](https://github.com/Ding-Ding-Projects/worldlens/commit/6c6412e8a0c180a64ccce3f2349223d565e5380b)
- Merge the downloader lane's guard fixes into integrate/puppies - [`60f54763ed`](https://github.com/Ding-Ding-Projects/worldlens/commit/60f54763ed60dabc4ef08cbe2d9dcc7d1a7302a8) _(summary of 2 commits, also listed here)_
- Fix six red tests from the world downloader lane: honest seeding, hosted classification, Kid Mode labels, More-menu registries, a real browse button, and a token that never touches the renderer - [`e1a43b7cae`](https://github.com/Ding-Ding-Projects/worldlens/commit/e1a43b7cae6c08a89925dd86433e0a0726b682fa)
- Merge commit 'b67eea6a' into integrate/puppies - [`74d40c12ed`](https://github.com/Ding-Ding-Projects/worldlens/commit/74d40c12ed870a56e472b9e5bbdef3342b297ef3) _(summary of 2 commits, also listed here)_
- Register ConfigRegexBuilder.vue in both overlay/menu hand-written inventories - [`b67eea6a89`](https://github.com/Ding-Ding-Projects/worldlens/commit/b67eea6a891ce3a55b231688653e7e0c9e308650)
- Merge commit 'ca7dc046' into integrate/puppies - [`8e7d931464`](https://github.com/Ding-Ding-Projects/worldlens/commit/8e7d93146412791fa062dfc7dbfb6a70ec9efabc) _(summary of 3 commits, also listed here)_
- Two more real bugs the previous fix's own captures were still showing - [`ca7dc04620`](https://github.com/Ding-Ding-Projects/worldlens/commit/ca7dc04620acd4f4b5f92de862579083a0f6e743)
- Give every rail shortcut its own short label, not an ellipsis on the full one - [`ed5ff28c2c`](https://github.com/Ding-Ding-Projects/worldlens/commit/ed5ff28c2c629bb2c2a1f57040d8675a51d0744f)
- Merge commit '2afb99b3' into integrate/puppies - [`84b57dd4b1`](https://github.com/Ding-Ding-Projects/worldlens/commit/84b57dd4b19574985d744fbcd45312f7fd03a5ee) _(summary of 3 commits, also listed here)_
- Fix the rail overflow the jsdom test could never have caught - [`2afb99b3cc`](https://github.com/Ding-Ding-Projects/worldlens/commit/2afb99b3ccc6212998ad00fc3c626dc417ca7e1d)
- Stop the rail eating its own destinations, and the Home row bleeding sideways - [`14d6e1f210`](https://github.com/Ding-Ding-Projects/worldlens/commit/14d6e1f210908b9f2dc0941a54f042c6fbd1217c)
- Give the narrow settings search its own catalogue entry - [`62eefb07ee`](https://github.com/Ding-Ding-Projects/worldlens/commit/62eefb07ee2f21246d83aa2e09c68d06cc945c0e)
- Merge commit 'f413d34b' into integrate/puppies - [`6db5c74222`](https://github.com/Ding-Ding-Projects/worldlens/commit/6db5c74222ac98a25fea70918f8ea523c4990b77) _(summary of 2 commits, also listed here)_
- Actually go single-column below 600px: real overflow found and fixed at 320px - [`f413d34bfa`](https://github.com/Ding-Ding-Projects/worldlens/commit/f413d34bfa88bfe6bd94ca49f63ded4460366ace)
- Anchor the changelog trailer guard to line starts - [`dc958181f5`](https://github.com/Ding-Ding-Projects/worldlens/commit/dc958181f5e3b21271999e995ad82a5e96267675)
- Merge commit 'd72cecc4' into integrate/puppies - [`1f2e726bb2`](https://github.com/Ding-Ding-Projects/worldlens/commit/1f2e726bb266caf2eb228bf031554018c0cbbde2) _(summary of 3 commits, also listed here)_
- Give the rail shortcuts, without lying about what four means - [`d72cecc430`](https://github.com/Ding-Ding-Projects/worldlens/commit/d72cecc430a480ef62fc323a9f19197e740fcceb)
- Actually reach the world downloader from the shell, and type the fakes properly - [`4f4e0cc742`](https://github.com/Ding-Ding-Projects/worldlens/commit/4f4e0cc74298fbfadd7975fe9a488b2283bb6750)
- Merge commit '400fc284' into integrate/puppies - [`ee2a61f523`](https://github.com/Ding-Ding-Projects/worldlens/commit/ee2a61f523bcd9227f00fa5e9e2ebfa6d46059a7) _(summary of 2 commits, also listed here)_
- Real M3 card group anatomy for Settings, plus a genuine narrow-window Clipping found and fixed - [`400fc28449`](https://github.com/Ding-Ding-Projects/worldlens/commit/400fc2844941e887ee379f7da782ad595ffc9f53)
- Merge commit 'e87377ac' into integrate/puppies - [`e5462a9ffb`](https://github.com/Ding-Ding-Projects/worldlens/commit/e5462a9ffb8422d45bb6d90e5b9eae995fcf2ad3) _(summary of 5 commits, also listed here)_
- Give the world downloader a face: a real MD3 settings screen - [`8835c9b314`](https://github.com/Ding-Ding-Projects/worldlens/commit/8835c9b3141a91f46cfc09aa402272b8d00513dc)
- Merge commit '1b63fd34' into integrate/puppies - [`5c9dfe6c14`](https://github.com/Ding-Ding-Projects/worldlens/commit/5c9dfe6c1493167d236255488e28c90a791aa2a6) _(summary of 2 commits, also listed here)_
- Fix regex-builder popover crash, sweep clipped card titles, revamp Settings card spacing - [`1b63fd348b`](https://github.com/Ding-Ding-Projects/worldlens/commit/1b63fd348bf852a6fe3950ade8e1c425a4075dfd)
- Finish Chunker review fixes: schema editor types, i18n, cleanup - [`c65df076cc`](https://github.com/Ding-Ding-Projects/worldlens/commit/c65df076ccecd197f472b538d92795ec76b60a3d)
- Connect container conversion routes and inspect complete world settings - [`f09457d399`](https://github.com/Ding-Ding-Projects/worldlens/commit/f09457d3999f28ba1492e9687967e9555656bba3)
- Localize measured world generation and document its workflow - [`b713cda934`](https://github.com/Ding-Ding-Projects/worldlens/commit/b713cda934ef8510c40625a95f3135bdca5eafe8)

### Rendering and world data

- Merge commit 'cbd07077' into integrate/puppies - [`a79d63bee6`](https://github.com/Ding-Ding-Projects/worldlens/commit/a79d63bee62565cb15775f75b9912b36c76b01bf) _(summary of 2 commits, also listed here)_
- Stop a 30-shard merge group from being killed for memory, and stream lowres decode - [`cbd0707795`](https://github.com/Ding-Ding-Projects/worldlens/commit/cbd070779521d2647a61f335ede79bd4598d7da6)

### Desktop shell

- Merge commit 'ae00618d' into integrate/puppies - [`586e742903`](https://github.com/Ding-Ding-Projects/worldlens/commit/586e742903ebf967865d335b347f2e27f71d2486) _(summary of 2 commits, also listed here)_
- Fix three integration-tip defects: hosted classification, workflow drift, packaging split - [`ae00618d12`](https://github.com/Ding-Ding-Projects/worldlens/commit/ae00618d1285581214d285bf8e50c23570c1e8a7)
- Register the world downloader with the main process, at long last - [`9a5aa19089`](https://github.com/Ding-Ding-Projects/worldlens/commit/9a5aa19089c90ecb14e8119d456a91e1889c6124)
- Merge commit 'c65df076' into integrate/puppies - [`8e7f0185d3`](https://github.com/Ding-Ding-Projects/worldlens/commit/8e7f0185d38eeb7f5619e47222d3e2a8629e81d1) _(summary of 10 commits, also listed here)_
- Preserve partial Chunker review fixes - [`d60939076f`](https://github.com/Ding-Ding-Projects/worldlens/commit/d60939076f5626ffb7bb7e6a8f0c093565b6bd2e)
- Connect guided Chunker dispatch and complete configuration transport - [`0a5d87cb51`](https://github.com/Ding-Ding-Projects/worldlens/commit/0a5d87cb5115ae64ffd37b5e5d2051bdeb1586e5)
- Reject forged Chunker NBT preservation - [`17a02f3562`](https://github.com/Ding-Ding-Projects/worldlens/commit/17a02f35628a8d9afc4deb6ff04b906b362f0763)
- Validate Chunker converter settings - [`04e7b88b3b`](https://github.com/Ding-Ding-Projects/worldlens/commit/04e7b88b3b5ec897434d30f9186de5f926d40cf1)
- Cover Chunker config batch wiring - [`441ed4da23`](https://github.com/Ding-Ding-Projects/worldlens/commit/441ed4da23f2cc872e2654b672fcf90f42fe3fa4)
- Wire complete Chunker CLI configuration - [`c20f86af98`](https://github.com/Ding-Ding-Projects/worldlens/commit/c20f86af9862414b03184d1d621f78fcc75532c6)
- Integrate the two green large-world and server-creation branches, and fix what meeting main broke - [`7f6f4e4096`](https://github.com/Ding-Ding-Projects/worldlens/commit/7f6f4e4096b8ad3c38019a557d3e892e07a63bef)
- Merge remote-tracking branches 'origin/task/large-world-proof-20260904' and 'origin/task/server-creation-proof-20260904' into integrate/puppies - [`59cefc6593`](https://github.com/Ding-Ding-Projects/worldlens/commit/59cefc65935dbe2125536e08c65874acfbf70da8) _(summary of 7 commits, also listed here)_
- Create local Spigot servers through official BuildTools - [`0ef6a5696c`](https://github.com/Ding-Ding-Projects/worldlens/commit/0ef6a5696ce445085e033bbfed3008ad528ebac3)
- Install local mod loaders before recording server launchers - [`0219a86b2c`](https://github.com/Ding-Ding-Projects/worldlens/commit/0219a86b2c5c5b8f78d901d806bf6f0d455ca0dd)
- Map container flavours and roll back unsaved creation - [`b230fa1413`](https://github.com/Ding-Ding-Projects/worldlens/commit/b230fa1413dea7cc0c1aad449880d9980154ef9b)
- Connect container server creation to local and SSH destinations - [`d500f79577`](https://github.com/Ding-Ding-Projects/worldlens/commit/d500f79577f999cc287348c5f0d603d7c8ae0895)
- Carry server ports through creation - [`b76e3f7cd0`](https://github.com/Ding-Ding-Projects/worldlens/commit/b76e3f7cd05ade8bdb059f989b8eda51aceb385e)

### Landing page and documentation site

- Document the world downloader, bilingually, and walk it into the site - [`e87377ac6b`](https://github.com/Ding-Ding-Projects/worldlens/commit/e87377ac6b7f3681ee875beac80be0d5a114299c)

### Build, release and tooling

- Stop the settings capture script writing the retired rail filename - [`ded937e797`](https://github.com/Ding-Ding-Projects/worldlens/commit/ded937e797e4a23737ba9105634920b9b3be64bd)
- Merge commit '671ff6d6' into integrate/puppies - [`88593a0cc7`](https://github.com/Ding-Ding-Projects/worldlens/commit/88593a0cc771dd0218c8bf6380f5028c36033398) _(summary of 3 commits, also listed here)_
- Auto-scale Chunker round-trip timeout with world size, report real partial bytes - [`671ff6d6fa`](https://github.com/Ding-Ding-Projects/worldlens/commit/671ff6d6fa7d6bf3b967a4c934979eb72ca3ea35)
- Add fixture generation and real-Chunker round-trip proof scripts - [`d856f150ef`](https://github.com/Ding-Ding-Projects/worldlens/commit/d856f150ef9dcd2086b0fe89009d45431cb008a2)
- Merge remote-tracking branch 'origin/main' into task/chunker-complete-finish - [`a30b8afd8e`](https://github.com/Ding-Ding-Projects/worldlens/commit/a30b8afd8ed34086bfab3446e976a1d34ba92330) _(summary of 11 commits, also listed here)_

### Documentation

- Say plainly what was stopped and what was verified before landing - [`40680d795a`](https://github.com/Ding-Ding-Projects/worldlens/commit/40680d795ae388e5a4de05fa299e95ee2af39ab8)
- Record the large-world pass in the handoff and roadmap, pending rows named - [`5870386174`](https://github.com/Ding-Ding-Projects/worldlens/commit/5870386174f8e5a0a946a76a102c3d73c4925376)
- Merge commit '29695c32' into integrate/puppies - [`772c3df31a`](https://github.com/Ding-Ding-Projects/worldlens/commit/772c3df31a0ee698ee7129a19c705ae78c662fab) _(summary of 2 commits, also listed here)_
- Replace the stale rail evidence with fresh captures of the actual fix - [`29695c325c`](https://github.com/Ding-Ding-Projects/worldlens/commit/29695c325c41aead7d26ae3558957318ab87aba1)
- Merge commit '3ce03dc7' into integrate/puppies - [`d52fc852ef`](https://github.com/Ding-Ding-Projects/worldlens/commit/d52fc852efbec010a084efacf29a5b6f0fd3bd97) _(summary of 2 commits, also listed here)_
- Commit the CDP capture script and land its 12 evidence images under guard - [`3ce03dc7d2`](https://github.com/Ding-Ding-Projects/worldlens/commit/3ce03dc7d2531284bb843f54324ba5cec55bc0b0)

### Elsewhere in the repository

- Give the renderer a door into the world downloader - [`7746bfac3d`](https://github.com/Ding-Ding-Projects/worldlens/commit/7746bfac3dcb3fca52dcd3a262752c4dc782087e)

## 1.0.1978 - 2026-09-04

Tagged at [`365fb3be6f`](https://github.com/Ding-Ding-Projects/worldlens/commit/365fb3be6fdeacb576500a1f2e4cdc393e03d019).

### Documentation

- Drive the packaged UI through the cheap headless CLI - [`365fb3be6f`](https://github.com/Ding-Ding-Projects/worldlens/commit/365fb3be6fdeacb576500a1f2e4cdc393e03d019)

## 1.0.1976 - 2026-09-04

Tagged at [`8fbee4ad64`](https://github.com/Ding-Ding-Projects/worldlens/commit/8fbee4ad64e0b05fb8d3af5d89c46a9a9d8ee96c).

### Build, release and tooling

- Invalidate TypeScript state when preparing fresh build outputs - [`8fbee4ad64`](https://github.com/Ding-Ding-Projects/worldlens/commit/8fbee4ad64e0b05fb8d3af5d89c46a9a9d8ee96c)

## 1.0.1974 - 2026-09-04

Tagged at [`4b34244724`](https://github.com/Ding-Ding-Projects/worldlens/commit/4b3424472496533e8e85640d57b622848dfd7e02).

### Interface

- Integrate measured world generation through the desktop UI - [`4b34244724`](https://github.com/Ding-Ding-Projects/worldlens/commit/4b3424472496533e8e85640d57b622848dfd7e02) _(summary of 5 commits, also listed here)_
- Cancel world generation when its renderer disappears - [`49d9199635`](https://github.com/Ding-Ding-Projects/worldlens/commit/49d919963500c12c4eb4f8d9e191c65f5640a55f)
- Wire synthetic world generation from the UI - [`610f22d9cb`](https://github.com/Ding-Ding-Projects/worldlens/commit/610f22d9cb5f0035351b753d21ad40748179f680)

### Rendering and world data

- Generate measured byte targets with validated resume - [`c3e98c3d82`](https://github.com/Ding-Ding-Projects/worldlens/commit/c3e98c3d82765b24fb4a37e13e91d3152c3175ca)

### Desktop shell

- Bound synthetic world generation requests - [`3145693343`](https://github.com/Ding-Ding-Projects/worldlens/commit/3145693343fca4d582a0446a6aae62ed3268c856)

## 1.0.1972 - 2026-09-04

Tagged at [`acb66ae972`](https://github.com/Ding-Ding-Projects/worldlens/commit/acb66ae972241d1fa52b02066ec6c3a0a0751c9f).

### Build, release and tooling

- Verify the exact Java runtime build without repeat downloads - [`acb66ae972`](https://github.com/Ding-Ding-Projects/worldlens/commit/acb66ae972241d1fa52b02066ec6c3a0a0751c9f)

## 1.0.1967 - 2026-09-04

Tagged at [`b782521f7d`](https://github.com/Ding-Ding-Projects/worldlens/commit/b782521f7d059ec908fee79d316f664d7dfa3353).

### Build, release and tooling

- Verify portable archives without optional PowerShell cmdlets - [`b782521f7d`](https://github.com/Ding-Ding-Projects/worldlens/commit/b782521f7d059ec908fee79d316f664d7dfa3353)

## 1.0.1966 - 2026-09-04

Tagged at [`560dc421e9`](https://github.com/Ding-Ding-Projects/worldlens/commit/560dc421e95d0faad361e0f015defd4b218e03da).

### Documentation

- Redact renderer access URLs from smoke evidence - [`560dc421e9`](https://github.com/Ding-Ding-Projects/worldlens/commit/560dc421e95d0faad361e0f015defd4b218e03da)

## 1.0.1964 - 2026-09-04

Tagged at [`79e27c48bb`](https://github.com/Ding-Ding-Projects/worldlens/commit/79e27c48bbb77b71d8013ecbcd234101b9de88f2).

### Documentation

- Record the 1 GB and 10 GB smoke test, and what it measured - [`79e27c48bb`](https://github.com/Ding-Ding-Projects/worldlens/commit/79e27c48bbb77b71d8013ecbcd234101b9de88f2)

## 1.0.1962 - 2026-09-04

Tagged at [`3fc4c794c3`](https://github.com/Ding-Ding-Projects/worldlens/commit/3fc4c794c3b8c340e9601c80f999eef1120680ce).

### Interface

- Clear the typecheck baselines: 39 in the app and 10 in the interface, now zero - [`3fc4c794c3`](https://github.com/Ding-Ding-Projects/worldlens/commit/3fc4c794c3b8c340e9601c80f999eef1120680ce)

## 1.0.1959 - 2026-09-04

Tagged at [`1168f7aab5`](https://github.com/Ding-Ding-Projects/worldlens/commit/1168f7aab59962691de8b453c9c9f77688b16959).

### Interface

- Double-clicking Install Java ran the whole download twice and left the spinner up - [`1168f7aab5`](https://github.com/Ding-Ding-Projects/worldlens/commit/1168f7aab59962691de8b453c9c9f77688b16959)

## 1.0.1957 - 2026-09-04

Tagged at [`f12ec3fe5d`](https://github.com/Ding-Ding-Projects/worldlens/commit/f12ec3fe5d5ff3a330542389df62dd7649931bac).

### Interface

- A validator nothing called, three sites a lint pass missed, and two labels in the wrong set - [`f12ec3fe5d`](https://github.com/Ding-Ding-Projects/worldlens/commit/f12ec3fe5d5ff3a330542389df62dd7649931bac)

## 1.0.1955 - 2026-09-04

Tagged at [`c0fa4481a3`](https://github.com/Ding-Ding-Projects/worldlens/commit/c0fa4481a3d62ade15ac72d8a03cede8810bdb6c).

### Documentation

- Refresh the handoff: it named a baseline 233 releases stale - [`c0fa4481a3`](https://github.com/Ding-Ding-Projects/worldlens/commit/c0fa4481a3d62ade15ac72d8a03cede8810bdb6c)

## 1.0.1953 - 2026-09-04

Tagged at [`d7505bf59d`](https://github.com/Ding-Ding-Projects/worldlens/commit/d7505bf59d9965026ee4e268afb10e6e6d75eafd).

### Interface

- Fix what the full suite caught: two of mine, one stale, one path bug - [`d7505bf59d`](https://github.com/Ding-Ding-Projects/worldlens/commit/d7505bf59d9965026ee4e268afb10e6e6d75eafd)

## 1.0.1951 - 2026-09-04

Tagged at [`cccade075e`](https://github.com/Ding-Ding-Projects/worldlens/commit/cccade075ead063984351a1b6075bea246ce11b1).

### Build, release and tooling

- Preserve what the primary checkout was holding, before it moves to main - [`a16046a7ca`](https://github.com/Ding-Ding-Projects/worldlens/commit/a16046a7ca5ea89b0fcbd2905c0f8fbb650d9481)

### Elsewhere in the repository

- Record the preserved primary-checkout work, without taking it - [`cccade075e`](https://github.com/Ding-Ding-Projects/worldlens/commit/cccade075ead063984351a1b6075bea246ce11b1) _(summary of 2 commits, also listed here)_

## 1.0.1948 - 2026-09-04

Tagged at [`02bf6dacfb`](https://github.com/Ding-Ding-Projects/worldlens/commit/02bf6dacfb3197d3a5219470bdf61ce79845bdd6).

### Build, release and tooling

- Take the complete Material Design 3 token set into the build - [`02bf6dacfb`](https://github.com/Ding-Ding-Projects/worldlens/commit/02bf6dacfb3197d3a5219470bdf61ce79845bdd6)

## 1.0.1946 - 2026-09-04

Tagged at [`e4038a0da2`](https://github.com/Ding-Ding-Projects/worldlens/commit/e4038a0da27bd72c580dce3752458ceb5ba2d4b9).

### Build, release and tooling

- Take the filled coordinate fields into the build - [`e4038a0da2`](https://github.com/Ding-Ding-Projects/worldlens/commit/e4038a0da27bd72c580dce3752458ceb5ba2d4b9)

## 1.0.1944 - 2026-09-04

Tagged at [`11e4d0c0aa`](https://github.com/Ding-Ding-Projects/worldlens/commit/11e4d0c0aa1bd8c109630adf039caea848cc6be3).

### Rendering and world data

- The static-host check called a working map unservable - [`11e4d0c0aa`](https://github.com/Ding-Ding-Projects/worldlens/commit/11e4d0c0aa1bd8c109630adf039caea848cc6be3)

## 1.0.1940 - 2026-09-04

Tagged at [`325e18a311`](https://github.com/Ding-Ding-Projects/worldlens/commit/325e18a311aeb17cfbb85b13b938ce113c16be10).

### Desktop shell

- Run the purity guard from the suite, and prove it both ways - [`325e18a311`](https://github.com/Ding-Ding-Projects/worldlens/commit/325e18a311aeb17cfbb85b13b938ce113c16be10)

## 1.0.1939 - 2026-09-04

Tagged at [`59b3b79412`](https://github.com/Ding-Ding-Projects/worldlens/commit/59b3b79412bde3c04e3bceb51ab604c949e5752b).

### Interface

- Pure Material Design 3 on every surface, with the exemptions written down - [`59b3b79412`](https://github.com/Ding-Ding-Projects/worldlens/commit/59b3b79412bde3c04e3bceb51ab604c949e5752b)

## 1.0.1936 - 2026-09-04

Tagged at [`41970600df`](https://github.com/Ding-Ding-Projects/worldlens/commit/41970600df414e856bcf1adad1951d00e08c5e3d).

### Interface

- Pure Material Design 3 across every surface, and a guard that will not accept prose - [`41970600df`](https://github.com/Ding-Ding-Projects/worldlens/commit/41970600df414e856bcf1adad1951d00e08c5e3d)

## 1.0.1931 - 2026-09-04

Tagged at [`f13f9fb2bb`](https://github.com/Ding-Ding-Projects/worldlens/commit/f13f9fb2bb600614838bbcb8c7938eda503d02de).

### Documentation

- Every gap this file named is closed - [`f13f9fb2bb`](https://github.com/Ding-Ding-Projects/worldlens/commit/f13f9fb2bb600614838bbcb8c7938eda503d02de)

## 1.0.1930 - 2026-09-04

Tagged at [`07a95f7c26`](https://github.com/Ding-Ding-Projects/worldlens/commit/07a95f7c268d73d9c99a1334587faca8224439e3).

### Landing page and documentation site

- Read a local model runtime from the site, and say what a page cannot do - [`07a95f7c26`](https://github.com/Ding-Ding-Projects/worldlens/commit/07a95f7c268d73d9c99a1334587faca8224439e3)

## 1.0.1928 - 2026-09-04

Tagged at [`4038166d21`](https://github.com/Ding-Ding-Projects/worldlens/commit/4038166d2177b9932a8d234c5797a2882709e775).

### Landing page and documentation site

- File conversion on the site: what a page can really do, and what it cannot, by name - [`4038166d21`](https://github.com/Ding-Ding-Projects/worldlens/commit/4038166d2177b9932a8d234c5797a2882709e775)

## 1.0.1926 - 2026-09-04

Tagged at [`86190bb23f`](https://github.com/Ding-Ding-Projects/worldlens/commit/86190bb23f9aa01cec2a93d825da9b1ef874db93).

### Landing page and documentation site

- A visitor can put their own mark on the site, and the bytes decide what it is - [`86190bb23f`](https://github.com/Ding-Ding-Projects/worldlens/commit/86190bb23f9aa01cec2a93d825da9b1ef874db93)

## 1.0.1923 - 2026-09-04

Tagged at [`cb9f122b8b`](https://github.com/Ding-Ding-Projects/worldlens/commit/cb9f122b8b6817c3eae646b3af809d1a99b97e9d).

### Landing page and documentation site

- The site could not say which version of itself you were looking at - [`cb9f122b8b`](https://github.com/Ding-Ding-Projects/worldlens/commit/cb9f122b8b6817c3eae646b3af809d1a99b97e9d)

## 1.0.1921 - 2026-09-04

Tagged at [`2409b49204`](https://github.com/Ding-Ding-Projects/worldlens/commit/2409b4920453d3c95d18e245600570c88b8cdccc).

### Landing page and documentation site

- ADHD modes on the site: five of them, every one off - [`2409b49204`](https://github.com/Ding-Ding-Projects/worldlens/commit/2409b4920453d3c95d18e245600570c88b8cdccc)

## 1.0.1920 - 2026-09-04

Tagged at [`16443590d6`](https://github.com/Ding-Ding-Projects/worldlens/commit/16443590d64c109a191f2c70eca7dfefdc71af0a).

### Documentation

- Correct the webapp entry after actually measuring it - [`16443590d6`](https://github.com/Ding-Ding-Projects/worldlens/commit/16443590d64c109a191f2c70eca7dfefdc71af0a)

## 1.0.1919 - 2026-09-04

Tagged at [`fd4187e565`](https://github.com/Ding-Ding-Projects/worldlens/commit/fd4187e5654cbbb5bedfd3ce8b1d2794ea41c56d).

### Build, release and tooling

- Nothing was watching the map's Material Design 3 layer - [`fd4187e565`](https://github.com/Ding-Ding-Projects/worldlens/commit/fd4187e5654cbbb5bedfd3ce8b1d2794ea41c56d)

## 1.0.1918 - 2026-09-04

Tagged at [`5461fdb5ee`](https://github.com/Ding-Ding-Projects/worldlens/commit/5461fdb5eef97acc2ecb63ca078e49b93cea9a13).

### Landing page and documentation site

- School mode was shipped on the site and absent from the inventory - [`5461fdb5ee`](https://github.com/Ding-Ding-Projects/worldlens/commit/5461fdb5eef97acc2ecb63ca078e49b93cea9a13)

## 1.0.1916 - 2026-09-04

Tagged at [`30c5f94682`](https://github.com/Ding-Ding-Projects/worldlens/commit/30c5f946826b8b8817317831b12cc05b0a60dd83).

### Documentation

- Tick what actually landed, and say plainly what did not - [`30c5f94682`](https://github.com/Ding-Ding-Projects/worldlens/commit/30c5f946826b8b8817317831b12cc05b0a60dd83)

## 1.0.1914 - 2026-09-04

Tagged at [`d93c28f017`](https://github.com/Ding-Ding-Projects/worldlens/commit/d93c28f017841cf687ec829ae2efc227f0d35ac9).

### Interface

- Convert on Amazon's machines, and say what that costs before it is picked - [`d93c28f017`](https://github.com/Ding-Ding-Projects/worldlens/commit/d93c28f017841cf687ec829ae2efc227f0d35ac9)

## 1.0.1911 - 2026-09-04

Tagged at [`70f1f29822`](https://github.com/Ding-Ding-Projects/worldlens/commit/70f1f2982265336041b2bd778a58c6b543fd8c7e).

### Desktop shell

- Commit the backup record, so an uploaded world is findable from a clone - [`70f1f29822`](https://github.com/Ding-Ding-Projects/worldlens/commit/70f1f2982265336041b2bd778a58c6b543fd8c7e)

## 1.0.1908 - 2026-09-04

Tagged at [`1a5dc40f5d`](https://github.com/Ding-Ding-Projects/worldlens/commit/1a5dc40f5d28708113c56b60ba5e95b4585d2aed).

### Rendering and world data

- Publish the render page, not just the map - [`1a5dc40f5d`](https://github.com/Ding-Ding-Projects/worldlens/commit/1a5dc40f5d28708113c56b60ba5e95b4585d2aed)

## 1.0.1907 - 2026-09-04

Tagged at [`184b0eff72`](https://github.com/Ding-Ding-Projects/worldlens/commit/184b0eff720515f8f4631d727d0337214f51d76f).

### Build, release and tooling

- The workflow was converting worlds with a Chunker nine versions older than the app - [`184b0eff72`](https://github.com/Ding-Ding-Projects/worldlens/commit/184b0eff720515f8f4631d727d0337214f51d76f)

## 1.0.1906 - 2026-09-04

Tagged at [`c66cfa4005`](https://github.com/Ding-Ding-Projects/worldlens/commit/c66cfa400545b729d5975869ec6f308da756a153).

### Build, release and tooling

- Vendor Chunker, and hold it to the version the workflow downloads - [`c66cfa4005`](https://github.com/Ding-Ding-Projects/worldlens/commit/c66cfa400545b729d5975869ec6f308da756a153)

## 1.0.1905 - 2026-09-04

Tagged at [`f3c7da4718`](https://github.com/Ding-Ding-Projects/worldlens/commit/f3c7da47181aa8763f13e2375304ac0652691c96).

### Rendering and world data

- Publish a page that says what the render was, beside the map - [`f3c7da4718`](https://github.com/Ding-Ding-Projects/worldlens/commit/f3c7da47181aa8763f13e2375304ac0652691c96)

## 1.0.1904 - 2026-09-04

Tagged at [`0f5f9b4169`](https://github.com/Ding-Ding-Projects/worldlens/commit/0f5f9b41697dd1ee92e330c0fb102e2d59a674e5).

### Interface

- Offer to create the repository on the line that just said it is free - [`221e52769c`](https://github.com/Ding-Ding-Projects/worldlens/commit/221e52769c9a23f3d7cd7c47ef0d638f7a3396ea)

### Desktop shell

- Notice when a world predates the flattening - [`e2cff98766`](https://github.com/Ding-Ding-Projects/worldlens/commit/e2cff98766a3fea8d6ca2588213f6532f060fe6f)
- Commit the world-backup record into the repository, not only onto releases - [`be35fac8b8`](https://github.com/Ding-Ding-Projects/worldlens/commit/be35fac8b85f1cd5132b06ee5091661701edea70)
- Gate the operator's own wording behind consent and a fresh privacy check - [`075177371c`](https://github.com/Ding-Ding-Projects/worldlens/commit/075177371c5cfd9eb5a25cb3e90dc5142235d269)
- Read Mojang's version details in parallel, and lose one version at a time - [`7acadf826a`](https://github.com/Ding-Ding-Projects/worldlens/commit/7acadf826a5652ac38fe086f5992c39ac2e13b80)

### Build, release and tooling

- Point the BlueMap fork at the 1.12.2 decoder - [`24c5f557fb`](https://github.com/Ding-Ding-Projects/worldlens/commit/24c5f557fb0b408a7628c11679fcacbdc322a1a2)
- Offer the Chunker formats as a list, and keep that list honest - [`f7eb58cd1c`](https://github.com/Ding-Ding-Projects/worldlens/commit/f7eb58cd1c18561600515f7bbc5437874d327430)
- Make the workflows follow the app instead of restating where it lives - [`7de6d9e1ae`](https://github.com/Ding-Ding-Projects/worldlens/commit/7de6d9e1ae1bebce249bb991a609660d8d6c948e)

### Documentation

- Record the parity requirement for the two non-app surfaces - [`0f5f9b4169`](https://github.com/Ding-Ding-Projects/worldlens/commit/0f5f9b41697dd1ee92e330c0fb102e2d59a674e5)

## 1.0.1893 - 2026-09-03

Tagged at [`d5faa910e6`](https://github.com/Ding-Ding-Projects/worldlens/commit/d5faa910e6787af0658d1cb4436a5a0bdb41d014).

### Documentation

- Record the release, and what was proven about it - [`d5faa910e6`](https://github.com/Ding-Ding-Projects/worldlens/commit/d5faa910e6787af0658d1cb4436a5a0bdb41d014)

## 1.0.1892 - 2026-09-03

Tagged at [`a8e36ce93b`](https://github.com/Ding-Ding-Projects/worldlens/commit/a8e36ce93b425014ef8b213e4fc63ca408ed1cea).

### Interface

- Write the progress listener to the variable the assertions read - [`0fe4447beb`](https://github.com/Ding-Ding-Projects/worldlens/commit/0fe4447bebc6b8122d537dbb5701f58b91c40de2)

### Documentation

- Record the two suite failures that outlive this work - [`a8e36ce93b`](https://github.com/Ding-Ding-Projects/worldlens/commit/a8e36ce93b425014ef8b213e4fc63ca408ed1cea)

## 1.0.1888 - 2026-09-03

Tagged at [`d18a7fc936`](https://github.com/Ding-Ding-Projects/worldlens/commit/d18a7fc93643a47a5120bb72bfba59f4325d1e09).

### Interface

- Merge commit '61709a335156ae43dceddd8efb418d488813a5a9' - [`79ed78a714`](https://github.com/Ding-Ding-Projects/worldlens/commit/79ed78a7149aa00179d09cee2686791c6eeea980) _(summary of 2 commits, also listed here)_
- Preserve final integration work before repository cleanup - [`61709a3351`](https://github.com/Ding-Ding-Projects/worldlens/commit/61709a335156ae43dceddd8efb418d488813a5a9)
- Merge main again, after it moved during the pass - [`20e56c418f`](https://github.com/Ding-Ding-Projects/worldlens/commit/20e56c418f93fabf81541b0588252479282527ee) _(summary of 11 commits, also listed here)_
- Merge remote-tracking branch 'origin/main' - [`0f1b3d75ac`](https://github.com/Ding-Ding-Projects/worldlens/commit/0f1b3d75acf940e9857ef14f34228eb7cfccab68) _(summary of 47 commits, also listed here)_
- Merge commit 'f053e84e51204982ebd491740577814d927e3f33' - [`02632910cf`](https://github.com/Ding-Ding-Projects/worldlens/commit/02632910cf3f761952ecabcf0b6867a10105c6d0) _(summary of 2 commits, also listed here)_
- Preserve existing work before repository consolidation - [`f053e84e51`](https://github.com/Ding-Ding-Projects/worldlens/commit/f053e84e51204982ebd491740577814d927e3f33)
- Merge commit 'a8f951c18cb4d92de93598e33f6485e0b088cfae' - [`f314857155`](https://github.com/Ding-Ding-Projects/worldlens/commit/f3148571552019a0b9357f43c23d5b5896423bf5) _(summary of 2 commits, also listed here)_
- Preserve existing work before repository consolidation - [`a8f951c18c`](https://github.com/Ding-Ding-Projects/worldlens/commit/a8f951c18cb4d92de93598e33f6485e0b088cfae)
- Merge main, and take the managed template version to 4 - [`66a3b6e409`](https://github.com/Ding-Ding-Projects/worldlens/commit/66a3b6e40930c3efd9a0bd4ccd1391a3d105c964) _(summary of 47 commits, also listed here)_
- Preserve existing work before repository consolidation - [`ea55014527`](https://github.com/Ding-Ding-Projects/worldlens/commit/ea55014527122e43e0b6ab34ed6c8caa0e81ab8b)

### Desktop shell

- Merge commit '20e56c418f93fabf81541b0588252479282527ee' - [`f775b266db`](https://github.com/Ding-Ding-Projects/worldlens/commit/f775b266db1eec5e96270cc89921005185d424c1) _(summary of 6 commits, also listed here)_
- Fix the seams that made local servers impossible to create or start - [`419374f608`](https://github.com/Ding-Ding-Projects/worldlens/commit/419374f608952508fef7837361ea38202075525d)

### Landing page and documentation site

- Merge commit 'a24657e70f66c4a540f72eeb4b103d3de6a19588' - [`7d544ac4b0`](https://github.com/Ding-Ding-Projects/worldlens/commit/7d544ac4b026e24fa3ea16ce14ef08c9594822a9) _(summary of 3 commits, also listed here)_
- Reconcile docs with integrated feature inventory - [`9234aa3079`](https://github.com/Ding-Ding-Projects/worldlens/commit/9234aa3079b0b113815760f3fd1484570d07b1b4)

### Build, release and tooling

- Name the fork in the jar manifest, so staging stops refusing its own jar - [`a99c107553`](https://github.com/Ding-Ding-Projects/worldlens/commit/a99c1075533b3aea5db6fc31525f085e98f15979)
- Build BlueMap from the fork, so the map ships the new interface - [`aaa44b016d`](https://github.com/Ding-Ding-Projects/worldlens/commit/aaa44b016d8a6c60c21dd6964131455b1080df27)
- Add the Material Design 3 BlueMap fork as a submodule - [`0c6885fec4`](https://github.com/Ding-Ding-Projects/worldlens/commit/0c6885fec4bc3590fba978408585315c1d80f0b3)

### Documentation

- Merge commit 'e3c9bbb5f686470394369b20cbae1bb4aa18defc' - [`9070aa3027`](https://github.com/Ding-Ding-Projects/worldlens/commit/9070aa302732dca18e76cd488b6bb9d038bfc000) _(summary of 2 commits, also listed here)_
- Preserve existing work before repository consolidation - [`e3c9bbb5f6`](https://github.com/Ding-Ding-Projects/worldlens/commit/e3c9bbb5f686470394369b20cbae1bb4aa18defc)
- Replace private terminology in public handoff notes - [`a24657e70f`](https://github.com/Ding-Ding-Projects/worldlens/commit/a24657e70f66c4a540f72eeb4b103d3de6a19588)

### Elsewhere in the repository

- Merge remote-tracking branch 'origin/main' into feature/unbreak-local-servers-and-material-design-3 - [`d18a7fc936`](https://github.com/Ding-Ding-Projects/worldlens/commit/d18a7fc93643a47a5120bb72bfba59f4325d1e09) _(summary of 3 commits, also listed here)_

## 1.0.1873 - 2026-09-03

Tagged at [`4624ec4756`](https://github.com/Ding-Ding-Projects/worldlens/commit/4624ec475657967cfb9774e9d8d7e8afea49ee21).

### Documentation

- Record the gate state that was actually measured, on a quiet machine - [`4624ec4756`](https://github.com/Ding-Ding-Projects/worldlens/commit/4624ec475657967cfb9774e9d8d7e8afea49ee21)

## 1.0.1871 - 2026-09-03

Tagged at [`50359e899b`](https://github.com/Ding-Ding-Projects/worldlens/commit/50359e899bd06c8e13538472ca0ee6136f9b06a4).

### Desktop shell

- Read the build constants without assuming the bundler replaced them - [`50359e899b`](https://github.com/Ding-Ding-Projects/worldlens/commit/50359e899bd06c8e13538472ca0ee6136f9b06a4)

## 1.0.1867 - 2026-09-03

Tagged at [`8979e902c6`](https://github.com/Ding-Ding-Projects/worldlens/commit/8979e902c66ed8ede09c7c3d76e4f844adb23567).

### Documentation

- Tick the container provenance, and leave the hosted CI gap unticked - [`8979e902c6`](https://github.com/Ding-Ding-Projects/worldlens/commit/8979e902c66ed8ede09c7c3d76e4f844adb23567)

## 1.0.1866 - 2026-09-03

Tagged at [`1ac0bbd13c`](https://github.com/Ding-Ding-Projects/worldlens/commit/1ac0bbd13ced18577a4290f425b529d195b900e4).

### Documentation

- Document the revision label, and give this article the Cantonese section it never had - [`1ac0bbd13c`](https://github.com/Ding-Ding-Projects/worldlens/commit/1ac0bbd13ced18577a4290f425b529d195b900e4)

## 1.0.1865 - 2026-09-03

Tagged at [`0e360474ad`](https://github.com/Ding-Ding-Projects/worldlens/commit/0e360474ad4dc6bfe28bd6413007376f6b56f6de).

### Desktop shell

- Stamp the commit into the images, and give the hosted route the provenance it never had - [`0e360474ad`](https://github.com/Ding-Ding-Projects/worldlens/commit/0e360474ad4dc6bfe28bd6413007376f6b56f6de)

## 1.0.1862 - 2026-09-03

Tagged at [`449506ade8`](https://github.com/Ding-Ding-Projects/worldlens/commit/449506ade841e7fd182990458dd7f57de4374256).

### Documentation

- Correct the watcher entry in both records: it is not an arming race - [`449506ade8`](https://github.com/Ding-Ding-Projects/worldlens/commit/449506ade841e7fd182990458dd7f57de4374256)

## 1.0.1861 - 2026-09-03

Tagged at [`c335b98cd1`](https://github.com/Ding-Ding-Projects/worldlens/commit/c335b98cd1a926ef3e727206fc7bc0724e84750f).

### Server, CLI and configuration

- Make the flaky watcher tests say what happened, and measure why they flake - [`c335b98cd1`](https://github.com/Ding-Ding-Projects/worldlens/commit/c335b98cd1a926ef3e727206fc7bc0724e84750f)

## 1.0.1858 - 2026-09-03

Tagged at [`abc9a0faf1`](https://github.com/Ding-Ding-Projects/worldlens/commit/abc9a0faf1a52908b11206077ce3fe72aae6295b).

### Interface

- The lock wiring guard read the preload and never asked it anything - [`abc9a0faf1`](https://github.com/Ding-Ding-Projects/worldlens/commit/abc9a0faf1a52908b11206077ce3fe72aae6295b)

## 1.0.1857 - 2026-09-03

Tagged at [`f9e7bf12bf`](https://github.com/Ding-Ding-Projects/worldlens/commit/f9e7bf12bf42826e59a418132ce3da1ed31b8ba2).

### Interface

- pnpm typecheck exits 0 - [`f9e7bf12bf`](https://github.com/Ding-Ding-Projects/worldlens/commit/f9e7bf12bf42826e59a418132ce3da1ed31b8ba2)

## 1.0.1855 - 2026-09-03

Tagged at [`a804d9b51b`](https://github.com/Ding-Ding-Projects/worldlens/commit/a804d9b51ba766a86e23e3d5bfc890f5fbb0a8da).

### Interface

- Four user-visible defects the real typecheck had been reporting all along - [`a804d9b51b`](https://github.com/Ding-Ding-Projects/worldlens/commit/a804d9b51ba766a86e23e3d5bfc890f5fbb0a8da)

## 1.0.1852 - 2026-09-03

Tagged at [`5db7cbe143`](https://github.com/Ding-Ding-Projects/worldlens/commit/5db7cbe1439bee9f5fe0b8cfaad87f3ae3a7d77d).

### Documentation

- Write down the two guards, the language contract, and the one thing left open - [`5db7cbe143`](https://github.com/Ding-Ding-Projects/worldlens/commit/5db7cbe1439bee9f5fe0b8cfaad87f3ae3a7d77d)

## 1.0.1851 - 2026-09-03

Tagged at [`a37a7b6959`](https://github.com/Ding-Ding-Projects/worldlens/commit/a37a7b695993fa2da8333a41ba641be6d9c34a10).

### Desktop shell

- Three tests testing a contract the code had already outgrown, and one honest reason - [`a37a7b6959`](https://github.com/Ding-Ding-Projects/worldlens/commit/a37a7b695993fa2da8333a41ba641be6d9c34a10)

## 1.0.1847 - 2026-09-03

Tagged at [`01cbf66978`](https://github.com/Ding-Ding-Projects/worldlens/commit/01cbf66978791fc3f6a311e35c963483dfa8edd3).

### Elsewhere in the repository

- A changed SSH host key was accepted, and the file said it must be refused - [`01cbf66978`](https://github.com/Ding-Ding-Projects/worldlens/commit/01cbf66978791fc3f6a311e35c963483dfa8edd3)

## 1.0.1846 - 2026-09-03

Tagged at [`fad9d69679`](https://github.com/Ding-Ding-Projects/worldlens/commit/fad9d696794e33c376f978718af96462e1e787e3).

### Interface

- The home screen had no headings at all, only divs that looked like headings - [`fad9d69679`](https://github.com/Ding-Ding-Projects/worldlens/commit/fad9d696794e33c376f978718af96462e1e787e3)

## 1.0.1844 - 2026-09-03

Tagged at [`0d3b954d89`](https://github.com/Ding-Ding-Projects/worldlens/commit/0d3b954d89f5d4a321bfd5e1355e6d6e88af8069).

### Interface

- The creative studio had a bespoke regex builder beside the real one - [`0d3b954d89`](https://github.com/Ding-Ding-Projects/worldlens/commit/0d3b954d89f5d4a321bfd5e1355e6d6e88af8069)

## 1.0.1842 - 2026-09-03

Tagged at [`4bc2cb3e71`](https://github.com/Ding-Ding-Projects/worldlens/commit/4bc2cb3e717d53361097093258b5a5b4695270fe).

### Interface

- Three inventories that had drifted from what they inventory - [`4bc2cb3e71`](https://github.com/Ding-Ding-Projects/worldlens/commit/4bc2cb3e717d53361097093258b5a5b4695270fe)

## 1.0.1841 - 2026-09-03

Tagged at [`fe4f265613`](https://github.com/Ding-Ding-Projects/worldlens/commit/fe4f265613bb5c19f4256c986bf910aa3fab483e).

### Build, release and tooling

- A pre-publication check for internal shorthand, and one real leak it found - [`fe4f265613`](https://github.com/Ding-Ding-Projects/worldlens/commit/fe4f265613bb5c19f4256c986bf910aa3fab483e)

## 1.0.1839 - 2026-09-03

Tagged at [`213112f86b`](https://github.com/Ding-Ding-Projects/worldlens/commit/213112f86bbdb1c3cdba68a500bf8e6efc702ffb).

### Build, release and tooling

- The workflow linter had drifted for two weeks, and the commit that broke it also removed the job that ran it - [`213112f86b`](https://github.com/Ding-Ding-Projects/worldlens/commit/213112f86bbdb1c3cdba68a500bf8e6efc702ffb)

## 1.0.1836 - 2026-09-03

Tagged at [`1993dd1a13`](https://github.com/Ding-Ding-Projects/worldlens/commit/1993dd1a138afd6fa2a5d7d810bb71bb995833a0).

### Interface

- Git trailers were reaching the published changelog through a door nobody watched - [`1993dd1a13`](https://github.com/Ding-Ding-Projects/worldlens/commit/1993dd1a138afd6fa2a5d7d810bb71bb995833a0)

## 1.0.1835 - 2026-09-03

Tagged at [`7401fd4a1c`](https://github.com/Ding-Ding-Projects/worldlens/commit/7401fd4a1cb3c609578e71a6fd695928d3f6c1b5).

### Interface

- Two console defects, and a test that was failing on a rule somebody retired - [`7401fd4a1c`](https://github.com/Ding-Ding-Projects/worldlens/commit/7401fd4a1cb3c609578e71a6fd695928d3f6c1b5)

## 1.0.1832 - 2026-09-03

Tagged at [`e9d9f99891`](https://github.com/Ding-Ding-Projects/worldlens/commit/e9d9f998918a9b014ca3488b35634b3b697aced0).

### Interface

- Finish the catalogue: nothing renders English in Cantonese mode any more - [`e9d9f99891`](https://github.com/Ding-Ding-Projects/worldlens/commit/e9d9f998918a9b014ca3488b35634b3b697aced0)

## 1.0.1826 - 2026-09-03

Tagged at [`7a6f2be934`](https://github.com/Ding-Ding-Projects/worldlens/commit/7a6f2be934339f9ed2349b70cbab10073102015e).

### Interface

- Translate the sentences that explain what the app just decided - [`7a6f2be934`](https://github.com/Ding-Ding-Projects/worldlens/commit/7a6f2be934339f9ed2349b70cbab10073102015e)

## 1.0.1825 - 2026-09-03

Tagged at [`3fea11aa70`](https://github.com/Ding-Ding-Projects/worldlens/commit/3fea11aa70c9c015d348d67ec95526e32c8054ae).

### Interface

- Translate the settings sections' own explanations - [`3fea11aa70`](https://github.com/Ding-Ding-Projects/worldlens/commit/3fea11aa70c9c015d348d67ec95526e32c8054ae)

## 1.0.1823 - 2026-09-03

Tagged at [`a778ef6515`](https://github.com/Ding-Ding-Projects/worldlens/commit/a778ef6515db7dfdda41d22ae2edc8dd686f42a4).

### Interface

- Finish the engine-choice and runtime settings copy - [`a778ef6515`](https://github.com/Ding-Ding-Projects/worldlens/commit/a778ef6515db7dfdda41d22ae2edc8dd686f42a4)

## 1.0.1822 - 2026-09-03

Tagged at [`9a3f307511`](https://github.com/Ding-Ding-Projects/worldlens/commit/9a3f3075113dbe2ef17ac61f9e173216e243ecfc).

### Interface

- Answer the add-ons and engine-choice settings in both languages - [`9a3f307511`](https://github.com/Ding-Ding-Projects/worldlens/commit/9a3f3075113dbe2ef17ac61f9e173216e243ecfc)

## 1.0.1821 - 2026-09-03

Tagged at [`bd94f6d169`](https://github.com/Ding-Ding-Projects/worldlens/commit/bd94f6d1692db6dcf83633c51f059155f5a27820).

### Interface

- Answer twenty more strings in both languages - [`bd94f6d169`](https://github.com/Ding-Ding-Projects/worldlens/commit/bd94f6d1692db6dcf83633c51f059155f5a27820)

## 1.0.1820 - 2026-09-03

Tagged at [`e2e30bb8bb`](https://github.com/Ding-Ding-Projects/worldlens/commit/e2e30bb8bb26e76c8c3b88e42b1374c7b3e8e386).

### Interface

- Give the AWS accounts section a catalogue, and Docker hosting its words - [`e2e30bb8bb`](https://github.com/Ding-Ding-Projects/worldlens/commit/e2e30bb8bb26e76c8c3b88e42b1374c7b3e8e386)

## 1.0.1818 - 2026-09-03

Tagged at [`eb02ac8656`](https://github.com/Ding-Ding-Projects/worldlens/commit/eb02ac8656b7ee6ec978c0018d5c1f43b36d9c33).

### Interface

- Give fifty-two strings a Cantonese answer, and stop the orphan check lying twice - [`eb02ac8656`](https://github.com/Ding-Ding-Projects/worldlens/commit/eb02ac8656b7ee6ec978c0018d5c1f43b36d9c33)

## 1.0.1815 - 2026-09-03

Tagged at [`e74a7f38b3`](https://github.com/Ding-Ding-Projects/worldlens/commit/e74a7f38b3e8a58cf2df51b54c51aaa909a62077).

### Interface

- Make the fact check read the alternations its own table is written in - [`e74a7f38b3`](https://github.com/Ding-Ding-Projects/worldlens/commit/e74a7f38b3e8a58cf2df51b54c51aaa909a62077)

## 1.0.1813 - 2026-09-03

Tagged at [`d5b0ad8696`](https://github.com/Ding-Ding-Projects/worldlens/commit/d5b0ad8696d098ed748de60eefe7a0ef497d9223).

### Desktop shell

- Classify fifty channels a hosted deployment was silently refusing - [`d5b0ad8696`](https://github.com/Ding-Ding-Projects/worldlens/commit/d5b0ad8696d098ed748de60eefe7a0ef497d9223)

## 1.0.1812 - 2026-09-03

Tagged at [`dfbaf62119`](https://github.com/Ding-Ding-Projects/worldlens/commit/dfbaf6211933cc30572ee7a841cad9d6e3367671).

### Interface

- Ask whether a channel is reachable the way it is now decided - [`dfbaf62119`](https://github.com/Ding-Ding-Projects/worldlens/commit/dfbaf6211933cc30572ee7a841cad9d6e3367671)

## 1.0.1811 - 2026-09-03

Tagged at [`49ce4684cc`](https://github.com/Ding-Ding-Projects/worldlens/commit/49ce4684cced053e0346af77fd26f27801ae8744).

### Desktop shell

- Take the lint from sixty-four errors to none - [`49ce4684cc`](https://github.com/Ding-Ding-Projects/worldlens/commit/49ce4684cced053e0346af77fd26f27801ae8744)

## 1.0.1809 - 2026-09-03

Tagged at [`d5e64b9def`](https://github.com/Ding-Ding-Projects/worldlens/commit/d5e64b9defb7c9dfdd7377116780a22c73e83c97).

### Interface

- Give the identity field a picker that still works, and the export a browse - [`d5e64b9def`](https://github.com/Ding-Ding-Projects/worldlens/commit/d5e64b9defb7c9dfdd7377116780a22c73e83c97)

## 1.0.1807 - 2026-09-03

Tagged at [`7796e601b1`](https://github.com/Ding-Ding-Projects/worldlens/commit/7796e601b1d9c946d1945f2e9a1364c6e9140fcf).

### Desktop shell

- Send one Content-Security-Policy header, so the fonts are allowed to load - [`7796e601b1`](https://github.com/Ding-Ding-Projects/worldlens/commit/7796e601b1d9c946d1945f2e9a1364c6e9140fcf)

## 1.0.1805 - 2026-09-03

Tagged at [`001e213afa`](https://github.com/Ding-Ding-Projects/worldlens/commit/001e213afac23f6d360110e8ab60e1c0871c3e99).

### Interface

- Declare where thirteen destructive calls stand, and correct three counts - [`001e213afa`](https://github.com/Ding-Ding-Projects/worldlens/commit/001e213afac23f6d360110e8ab60e1c0871c3e99)

## 1.0.1803 - 2026-09-03

Tagged at [`de5d61ee69`](https://github.com/Ding-Ding-Projects/worldlens/commit/de5d61ee692c3db5768f60d30f3c17c1ffc22fcf).

### Interface

- Enrol twelve surfaces in the two registries they shipped past - [`de5d61ee69`](https://github.com/Ding-Ding-Projects/worldlens/commit/de5d61ee692c3db5768f60d30f3c17c1ffc22fcf)

## 1.0.1800 - 2026-09-03

Tagged at [`ab1d1db520`](https://github.com/Ding-Ding-Projects/worldlens/commit/ab1d1db5200e9e88256f4ba5755fe9d3fafe11c1).

### Interface

- Give Kid Mode a word for the two surfaces it had no word for - [`ab1d1db520`](https://github.com/Ding-Ding-Projects/worldlens/commit/ab1d1db5200e9e88256f4ba5755fe9d3fafe11c1)

## 1.0.1799 - 2026-09-03

Tagged at [`0223217a7f`](https://github.com/Ding-Ding-Projects/worldlens/commit/0223217a7fa50dc340b0ba74caa2d427adc66472).

### Interface

- Point the reachability guard at the components that actually render - [`0223217a7f`](https://github.com/Ding-Ding-Projects/worldlens/commit/0223217a7fa50dc340b0ba74caa2d427adc66472)

## 1.0.1797 - 2026-09-03

Tagged at [`844a29e0a9`](https://github.com/Ding-Ding-Projects/worldlens/commit/844a29e0a9e2b245e25944d514604b88e6cc19e3).

### Interface

- Put nine articles back where a reader can find them - [`844a29e0a9`](https://github.com/Ding-Ding-Projects/worldlens/commit/844a29e0a9e2b245e25944d514604b88e6cc19e3)

## 1.0.1794 - 2026-09-03

Tagged at [`2fb99b223e`](https://github.com/Ding-Ding-Projects/worldlens/commit/2fb99b223eef7363eba7bcbaafb9e98ec4737af7).

### Documentation

- Record what this session ran, and what it deliberately did not - [`2fb99b223e`](https://github.com/Ding-Ding-Projects/worldlens/commit/2fb99b223eef7363eba7bcbaafb9e98ec4737af7)

## 1.0.1793 - 2026-09-03

Tagged at [`9755846866`](https://github.com/Ding-Ding-Projects/worldlens/commit/9755846866a14ff4b92289ca3c9d619c29cba87e).

### Desktop shell

- Let a remote render that names no engine choose the default one - [`9755846866`](https://github.com/Ding-Ding-Projects/worldlens/commit/9755846866a14ff4b92289ca3c9d619c29cba87e)

## 1.0.1791 - 2026-09-03

Tagged at [`9a46a028a1`](https://github.com/Ding-Ding-Projects/worldlens/commit/9a46a028a1c6007f56f2725212643a16de9a036c).

### Desktop shell

- Believe a sign-out that leaves no accounts behind - [`9a46a028a1`](https://github.com/Ding-Ding-Projects/worldlens/commit/9a46a028a1c6007f56f2725212643a16de9a036c)

## 1.0.1789 - 2026-09-03

Tagged at [`46e1ee0048`](https://github.com/Ding-Ding-Projects/worldlens/commit/46e1ee0048cae4760277c713fa3c3b7eeadb7e99).

### Interface

- Make each inline copy fallback say what its catalogue entry says - [`46e1ee0048`](https://github.com/Ding-Ding-Projects/worldlens/commit/46e1ee0048cae4760277c713fa3c3b7eeadb7e99)

## 1.0.1787 - 2026-09-03

Tagged at [`68d2dd143a`](https://github.com/Ding-Ding-Projects/worldlens/commit/68d2dd143a36df98277ea20f38f38661b85de53a).

### Interface

- Reach through the map app the way the comment beside it already says to - [`68d2dd143a`](https://github.com/Ding-Ding-Projects/worldlens/commit/68d2dd143a36df98277ea20f38f38661b85de53a)

## 1.0.1785 - 2026-09-03

Tagged at [`7dacba5146`](https://github.com/Ding-Ding-Projects/worldlens/commit/7dacba5146719e15669c7bcfc1a1096bc325a172).

### Desktop shell

- Check Pages can take the map before rendering it, not after - [`7dacba5146`](https://github.com/Ding-Ding-Projects/worldlens/commit/7dacba5146719e15669c7bcfc1a1096bc325a172)

## 1.0.1783 - 2026-09-02

Tagged at [`9b2bbef7a1`](https://github.com/Ding-Ding-Projects/worldlens/commit/9b2bbef7a12a39bd895affd8265095a132d533f8).

### Desktop shell

- Give an empty repository its first commit instead of sending you away - [`9b2bbef7a1`](https://github.com/Ding-Ding-Projects/worldlens/commit/9b2bbef7a12a39bd895affd8265095a132d533f8)

## 1.0.1781 - 2026-09-02

Tagged at [`e09430ee4a`](https://github.com/Ding-Ding-Projects/worldlens/commit/e09430ee4a64a13126a922e2ab6d6b2f11cccdd8).

### Interface

- Preserve the in-flight type, copy and picker work - [`e09430ee4a`](https://github.com/Ding-Ding-Projects/worldlens/commit/e09430ee4a64a13126a922e2ab6d6b2f11cccdd8)

## 1.0.1778 - 2026-09-02

Tagged at [`adc4ae5fba`](https://github.com/Ding-Ding-Projects/worldlens/commit/adc4ae5fba2ec2d97e5b50c999feef126bd53d85).

### Rendering and world data

- Bring nine red tests back to green, and stop re-dispatching a settled recovery - [`adc4ae5fba`](https://github.com/Ding-Ding-Projects/worldlens/commit/adc4ae5fba2ec2d97e5b50c999feef126bd53d85)

## 1.0.1777 - 2026-09-02

Tagged at [`debf983e4a`](https://github.com/Ding-Ding-Projects/worldlens/commit/debf983e4a0c0986fc8db7333dc1104e74126cff).

### Interface

- Offer the upload consent on the row that is asking for it - [`debf983e4a`](https://github.com/Ding-Ding-Projects/worldlens/commit/debf983e4a0c0986fc8db7333dc1104e74126cff)

## 1.0.1775 - 2026-09-02

Tagged at [`df12151614`](https://github.com/Ding-Ding-Projects/worldlens/commit/df12151614623dc7260a2b8288390cd8f6d57dd0).

### Interface

- Make the Java step tell the truth and the install button do something - [`df12151614`](https://github.com/Ding-Ding-Projects/worldlens/commit/df12151614623dc7260a2b8288390cd8f6d57dd0)

## 1.0.1771 - 2026-09-02

Tagged at [`7774dd7843`](https://github.com/Ding-Ding-Projects/worldlens/commit/7774dd78434844f1b7d57ceadf25b15fcbe1ec52).

### Interface

- Preserve incomplete Java bridge repair for reconciliation - [`41d106a476`](https://github.com/Ding-Ding-Projects/worldlens/commit/41d106a476cb9943271be4a7c3e8a5d388cc2584)

### Build, release and tooling

- Publish a map preview to Pages, keep the full map in the download - [`7774dd7843`](https://github.com/Ding-Ding-Projects/worldlens/commit/7774dd78434844f1b7d57ceadf25b15fcbe1ec52)

## 1.0.1770 - 2026-09-02

Tagged at [`10aecea86c`](https://github.com/Ding-Ding-Projects/worldlens/commit/10aecea86c8cd06dd0282de5cbae58fe673809a1).

### Rendering and world data

- Let a world with empty space in the middle be planned - [`10aecea86c`](https://github.com/Ding-Ding-Projects/worldlens/commit/10aecea86c8cd06dd0282de5cbae58fe673809a1)

## 1.0.1769 - 2026-09-02

Tagged at [`394e5233e9`](https://github.com/Ding-Ding-Projects/worldlens/commit/394e5233e9436d7b305247652c1d5030f2898670).

### Interface

- Preserve in-flight copy, console and changelog work - [`394e5233e9`](https://github.com/Ding-Ding-Projects/worldlens/commit/394e5233e9436d7b305247652c1d5030f2898670)
- Merge the creative appearance studio - [`fa85dd3d93`](https://github.com/Ding-Ding-Projects/worldlens/commit/fa85dd3d939323749f5ab5dec812d26a652c52c7) _(summary of 8 commits, also listed here)_
- Preserve the in-flight creative appearance studio work - [`e8cffaeeb7`](https://github.com/Ding-Ding-Projects/worldlens/commit/e8cffaeeb74f145aabd45464e941cba7ff9c0fb7)
- Finish transactional creative ownership - [`eaed1883d2`](https://github.com/Ding-Ding-Projects/worldlens/commit/eaed1883d2985785ad6812e348ba9281874a33a8)
- Replay active logo variants transactionally - [`ef9ff1655e`](https://github.com/Ding-Ding-Projects/worldlens/commit/ef9ff1655e1ce27473cafbce583b7025fbd56a7a)
- Complete creative history and logo replay - [`72ecdffcf3`](https://github.com/Ding-Ding-Projects/worldlens/commit/72ecdffcf3e2805b654475413dc970d9f17b0a86)
- Harden creative logo and document migration - [`fe00e4fa68`](https://github.com/Ding-Ding-Projects/worldlens/commit/fe00e4fa682cfe8eca95e3316fcf50080e00b554)
- Integrate the creative appearance studio - [`aec261c367`](https://github.com/Ding-Ding-Projects/worldlens/commit/aec261c367bca43ffb46fd665df3543943de839e)
- Add creative appearance studio adapter - [`87f1d9c6f3`](https://github.com/Ding-Ding-Projects/worldlens/commit/87f1d9c6f3bea0cb35ea1561f2323e5e07670f8a)
- Merge runtime settings and accommodations - [`a032499fe9`](https://github.com/Ding-Ding-Projects/worldlens/commit/a032499fe93f1a62987598058571bfcf3822486b) _(summary of 16 commits, also listed here)_
- Keep runtime coverage browser safe - [`2d40a23781`](https://github.com/Ding-Ding-Projects/worldlens/commit/2d40a237818ec370238710f4da91c032d7dd43c1)
- Index runtime settings documentation - [`b427eae783`](https://github.com/Ding-Ding-Projects/worldlens/commit/b427eae7835c64d089cd34c8f37c0fb4dfdb0c8e)
- Keep runtime voice levels distinct - [`44f3153e4d`](https://github.com/Ding-Ding-Projects/worldlens/commit/44f3153e4dfcfdaa71aa8189de9ef387c000b38b)
- Harden runtime credentials and evidence - [`8248370a0e`](https://github.com/Ding-Ding-Projects/worldlens/commit/8248370a0e91b54471b4f13047af7f5bd85735c9)
- Complete protected runtime settings flows - [`e6ee1999df`](https://github.com/Ding-Ding-Projects/worldlens/commit/e6ee1999dff9b0d12346cebe8008f2e32e916afa)
- Route runtime headings through locale levels - [`2b99bbc2c4`](https://github.com/Ding-Ding-Projects/worldlens/commit/2b99bbc2c46dfdcb1541124f64a58535a2684850)
- Localize and coordinate runtime settings - [`827979401e`](https://github.com/Ding-Ding-Projects/worldlens/commit/827979401e280755ebd8956239043b7efd866bf5)
- Use full runtime settings tabs - [`b2536de712`](https://github.com/Ding-Ding-Projects/worldlens/commit/b2536de71223bce4c522809e3d566e67e706f564)
- Pin runtime sources and apply live coordination - [`2c39d22f12`](https://github.com/Ding-Ding-Projects/worldlens/commit/2c39d22f1243dd1a45d0997193f8038225e49d68)
- Harden runtime settings integration - [`3f94074846`](https://github.com/Ding-Ding-Projects/worldlens/commit/3f94074846350250ed0577e90dadd6cd4dc90c0f)
- Add runtime settings and accommodations panel - [`f2693d51d4`](https://github.com/Ding-Ding-Projects/worldlens/commit/f2693d51d45c3bc8ed0ef0e8e109d9f5d1f65ad6)
- Merge remaining remote profile history - [`c987c4d3ec`](https://github.com/Ding-Ding-Projects/worldlens/commit/c987c4d3ec82b7c10eb62dd6d64520a56f7aa94b) _(summary of 2 commits, also listed here)_
- Internal maintenance message omitted from the public changelog - [`aa65e18cbd`](https://github.com/Ding-Ding-Projects/worldlens/commit/aa65e18cbdb1e0f9c199dc1cdd20a22b7f923005)
- Preserve an in-flight search-filter test change - [`260ec9f0a0`](https://github.com/Ding-Ding-Projects/worldlens/commit/260ec9f0a08ae807bf717f2a0ab92b12e18467e4)
- Harden staged backup identity and confirmation input - [`ec6ab0542e`](https://github.com/Ding-Ding-Projects/worldlens/commit/ec6ab0542e4771629a82775a13a92ba4754c1d1c)
- Internal maintenance message omitted from the public changelog - [`c379b29c5a`](https://github.com/Ding-Ding-Projects/worldlens/commit/c379b29c5ae51a07d490375bcc1dc29a86b1096c)
- Internal maintenance message omitted from the public changelog - [`aaf748c9af`](https://github.com/Ding-Ding-Projects/worldlens/commit/aaf748c9af8c3a711151775c15c6579a33d3b75d)
- Internal maintenance message omitted from the public changelog - [`71f7d54c19`](https://github.com/Ding-Ding-Projects/worldlens/commit/71f7d54c19833732a76229f90bbad28404ba0cee)
- Internal maintenance message omitted from the public changelog - [`747517b448`](https://github.com/Ding-Ding-Projects/worldlens/commit/747517b4482489ed4fdf98b39d4864f30442afc8)
- Add cancellable backup progress and mounted world choice - [`347e68436c`](https://github.com/Ding-Ding-Projects/worldlens/commit/347e68436c450698cdc80dd425bd3593eab881a2)
- Repair remote container paths and port evidence - [`96ae9af71e`](https://github.com/Ding-Ding-Projects/worldlens/commit/96ae9af71edf6798899f8f450c4a5cc209b45ef7)
- Merge complete version catalogue history - [`f0a039ad8c`](https://github.com/Ding-Ding-Projects/worldlens/commit/f0a039ad8c6aeb5cbd5b2a10432ca7113bb1b2e7) _(summary of 10 commits, also listed here)_
- Close catalogue type safety gaps - [`7f90854fa9`](https://github.com/Ding-Ding-Projects/worldlens/commit/7f90854fa94e64434d7809b5379f75bc2feffe4f)
- Keep catalogue copy publication safe - [`61c6f8af6a`](https://github.com/Ding-Ding-Projects/worldlens/commit/61c6f8af6af526ab4b9d4db807c4eb8e5855a2b4)
- Harden complete version catalogue flows - [`eea9b9c32c`](https://github.com/Ding-Ding-Projects/worldlens/commit/eea9b9c32cc6c712951fc35822fcd32f670a7c7e)
- Complete Mojang version catalogue grouping - [`b54c5ce012`](https://github.com/Ding-Ding-Projects/worldlens/commit/b54c5ce012fddcef678703a53c38112073f7ccce)
- Merge server management integration history - [`994d317a8d`](https://github.com/Ding-Ding-Projects/worldlens/commit/994d317a8da747bcc673df6d1ccb184e2acbdf73) _(summary of 79 commits, also listed here)_
- Integrate complete appearance-core controls - [`67deda7b4d`](https://github.com/Ding-Ding-Projects/worldlens/commit/67deda7b4d1275bb0882714cc430c5d02e2f1ad3) _(summary of 8 commits, also listed here)_
- Show honest font identity status in the editor - [`343ecde130`](https://github.com/Ding-Ding-Projects/worldlens/commit/343ecde13080dd8fd4f5d4d1a95ff1713b12e8a2)
- Fix compound state group writes and effect colour validation - [`19b9501467`](https://github.com/Ding-Ding-Projects/worldlens/commit/19b9501467c5bc30350bd0cf4fbecd750563b27d)
- Reconcile every state group through locked source changes - [`3edda54055`](https://github.com/Ding-Ding-Projects/worldlens/commit/3edda5405568dcc6eeffe5f043d210d935da6204)
- Preserve locked appearance state across source changes - [`cce1d219d1`](https://github.com/Ding-Ding-Projects/worldlens/commit/cce1d219d154b0e8f88489757cd8f78a9c122dca)
- Close appearance reset accessibility and migration gaps - [`aff317b646`](https://github.com/Ding-Ding-Projects/worldlens/commit/aff317b646aadc5f2fbc123b043eab4ba51331d7)
- Repair stateful appearance rendering and lock enforcement - [`847b367a4b`](https://github.com/Ding-Ding-Projects/worldlens/commit/847b367a4b323a6340e7438fa8c15ae2ddd2c97f)
- Expand appearance chrome state layers and picker search - [`37530e0a84`](https://github.com/Ding-Ding-Projects/worldlens/commit/37530e0a843c711e660e92d027f5b78c82de065b)
- Integrate guided render destinations and imports - [`7a7a92965f`](https://github.com/Ding-Ding-Projects/worldlens/commit/7a7a92965f277820d88ee467481749bbd1676792) _(summary of 8 commits, also listed here)_
- Keep SSH cancellation pending until confirmed - [`e496825c01`](https://github.com/Ding-Ding-Projects/worldlens/commit/e496825c015bb857bf52575311e5d5694db67061)
- Reject stale render and publication responses - [`13349c88e9`](https://github.com/Ding-Ding-Projects/worldlens/commit/13349c88e923cd6f005af1ca870ce298aaf7c11f)
- Internal maintenance message omitted from the public changelog - [`16ea9bb0a4`](https://github.com/Ding-Ding-Projects/worldlens/commit/16ea9bb0a42d80562ae60a79d6d1cd533a78ee2d)
- Internal maintenance message omitted from the public changelog - [`bc567dfac1`](https://github.com/Ding-Ding-Projects/worldlens/commit/bc567dfac1a8027e04040677078d5fc2b1dd1eac)
- Harden project destination state handoffs - [`04ffd35b31`](https://github.com/Ding-Ding-Projects/worldlens/commit/04ffd35b31bed96ae32b5a927e66ec0fa1c20aa1)
- Complete remote project import handoff - [`c74894eb5b`](https://github.com/Ding-Ding-Projects/worldlens/commit/c74894eb5be5fb59b277689d889daf97b182bb37)
- Add project render destination chooser - [`db34c7c3ad`](https://github.com/Ding-Ding-Projects/worldlens/commit/db34c7c3ad6dc8277a1fc40098a39a3b55dd11ed)
- Integrate guarded server navigation and Java flows - [`31f91b22ad`](https://github.com/Ding-Ding-Projects/worldlens/commit/31f91b22ad19197457df3dd3c107e2ec9dc12a60) _(summary of 7 commits, also listed here)_
- Invalidate stale wizard sessions - [`1bb697b834`](https://github.com/Ding-Ding-Projects/worldlens/commit/1bb697b83440756e9050c9780c6211bc7751d016)
- Harden server creation and return focus - [`9999d12708`](https://github.com/Ding-Ding-Projects/worldlens/commit/9999d1270821cfa4758feac8ce6cf6c19b309c67)
- Internal maintenance message omitted from the public changelog - [`dcd8729a69`](https://github.com/Ding-Ding-Projects/worldlens/commit/dcd8729a69f38aa3407bec13ea935b7fd5faca5c)
- Internal maintenance message omitted from the public changelog - [`b221c805cd`](https://github.com/Ding-Ding-Projects/worldlens/commit/b221c805cd614bbb8cc1bd750e6baa1e20049b04)
- Internal maintenance message omitted from the public changelog - [`5a116c8e21`](https://github.com/Ding-Ding-Projects/worldlens/commit/5a116c8e2183c34bcf725cd109ee4cf4ac417821)
- Repair server navigation and version catalog UI - [`c9a2ca4b55`](https://github.com/Ding-Ding-Projects/worldlens/commit/c9a2ca4b552b05d1f097547e0fc5d65da1ddc328)
- Expose verified BlueMap provenance in Settings - [`131f0a8db6`](https://github.com/Ding-Ding-Projects/worldlens/commit/131f0a8db65391eb682552348af7c80b3c034641) _(summary of 3 commits, also listed here)_
- Bind verified engine facts from the settings report - [`ae0567539c`](https://github.com/Ding-Ding-Projects/worldlens/commit/ae0567539c730a41a8f28ea659229a19bad68109)
- Show verified engine facts in AppSettings - [`6c7b6e3380`](https://github.com/Ding-Ding-Projects/worldlens/commit/6c7b6e3380350e4c13fe5ada2e42a1537900db24)
- Integrate rich feature discovery - [`5e3615a141`](https://github.com/Ding-Ding-Projects/worldlens/commit/5e3615a14108bd37f4714dd79742386f268e7d30) _(summary of 4 commits, also listed here)_
- Harden palette discovery boundaries - [`578df69a17`](https://github.com/Ding-Ding-Projects/worldlens/commit/578df69a17f20ddc1a095f25a4dc86b7e233922f)
- Repair rich palette routing and controls - [`011614956d`](https://github.com/Ding-Ding-Projects/worldlens/commit/011614956d9f4fbb8c351f41278ada2ba2ed54cc)
- Improve feature discovery with rich palette results - [`e8f09136d4`](https://github.com/Ding-Ding-Projects/worldlens/commit/e8f09136d4284de70bbed2d5d2494a2cd2f46b88)
- Show engine repair progress and verified availability - [`ddb7fa39b1`](https://github.com/Ding-Ding-Projects/worldlens/commit/ddb7fa39b102b6aee78a769936aa445673c1b7eb)

### Desktop shell

- Restrict server edits to non-privileged metadata - [`265e7d441d`](https://github.com/Ding-Ding-Projects/worldlens/commit/265e7d441d92edc3d31f0a0bce24cdbb6ed324ad)
- Merge file conversion and local model tooling - [`2991df58a3`](https://github.com/Ding-Ding-Projects/worldlens/commit/2991df58a3e8a428c5de7a36c5833834eff3fb87) _(summary of 8 commits, also listed here)_
- Verify managed runtime rollback smoke - [`9e23288a07`](https://github.com/Ding-Ding-Projects/worldlens/commit/9e23288a07c777780f221717277a8f9ca0e3f8cd)
- Close converter and Ollama review blockers - [`ff00909dee`](https://github.com/Ding-Ding-Projects/worldlens/commit/ff00909dee27d558bf895786244d3815f7c3219b)
- Harden guided PDF and published model flows - [`fdbf2b1c22`](https://github.com/Ding-Ding-Projects/worldlens/commit/fdbf2b1c2276f4a0edbb795d4c8cd1fd6f87528a)
- Add guided PDF and truthful runtime controls - [`7bc9a8f0b6`](https://github.com/Ding-Ding-Projects/worldlens/commit/7bc9a8f0b678b796cda3dd77ced8d2695473498b)
- Repair bounded converter and Ollama runtime flows - [`76c4d0cb71`](https://github.com/Ding-Ding-Projects/worldlens/commit/76c4d0cb712ec385528f84820191a78223e2c61c)
- Repair packaged converter and local model delivery - [`3bd97e300b`](https://github.com/Ding-Ding-Projects/worldlens/commit/3bd97e300b70f631227d4d00b6de9e267ec2bc21)
- Add bundled-first file conversion and local model tools - [`43fbc6d5fe`](https://github.com/Ding-Ding-Projects/worldlens/commit/43fbc6d5fe8d0b2e9bb33b0bd02bba3228a8bc2d)
- Internal maintenance message omitted from the public changelog - [`05d73d6402`](https://github.com/Ding-Ding-Projects/worldlens/commit/05d73d64023dba6fc41455d1b1d6cad0e678f73a) _(summary of 19 commits, also listed here)_
- Enforce backup quiesce and restart recovery - [`7347049eb6`](https://github.com/Ding-Ding-Projects/worldlens/commit/7347049eb60b734c382f399ca7b527281acbd37d)
- Quiesce servers and harden source identity - [`5b246bbe7d`](https://github.com/Ding-Ding-Projects/worldlens/commit/5b246bbe7d332c53d98d62df0d8077db1c8f5cf2)
- Internal maintenance message omitted from the public changelog - [`c6cc1d2445`](https://github.com/Ding-Ding-Projects/worldlens/commit/c6cc1d2445007a71978189f09a414ac6183ba808)
- Stream typed remote backup progress - [`8604cf745b`](https://github.com/Ding-Ding-Projects/worldlens/commit/8604cf745b6c715226a53e278a2cddf43fb61196)
- Verify stable remote backup manifests - [`b1bafbd2f2`](https://github.com/Ding-Ding-Projects/worldlens/commit/b1bafbd2f2166c954e1a9825bd3bdb1375d2f954)
- Wire native restore confirmation in the app shell - [`10447e96ba`](https://github.com/Ding-Ding-Projects/worldlens/commit/10447e96ba33c6df77154a5a899570d373b8ab97)
- Bind restore authorization to a main challenge - [`2208478033`](https://github.com/Ding-Ding-Projects/worldlens/commit/2208478033ff0dddee248bd775fcf90fbb51fcbe)
- Complete remote backup cleanup and restore controls - [`f038d404a2`](https://github.com/Ding-Ding-Projects/worldlens/commit/f038d404a2ef7d33c294e7d792787688aa9fdb26)
- Harden host trust, consent and remote backup transport - [`cea0153689`](https://github.com/Ding-Ding-Projects/worldlens/commit/cea015368919d076af9866f6c8c0af16f7674deb)
- Add guided remote server profiles and complete catalogues - [`f984534bad`](https://github.com/Ding-Ding-Projects/worldlens/commit/f984534bad2723a73120acce964905f60492034c)
- Preserve the in-flight version catalogue and wiki work - [`67da4114b3`](https://github.com/Ding-Ding-Projects/worldlens/commit/67da4114b3b82287c8dcb777a24a5896f54cb653)
- Integrate durable completed-render promotion - [`9e94135192`](https://github.com/Ding-Ding-Projects/worldlens/commit/9e94135192a441f005e1dbe9148560d41418a1d7) _(summary of 5 commits, also listed here)_
- Persist exact render provenance and lease live locks - [`312011a558`](https://github.com/Ding-Ding-Projects/worldlens/commit/312011a55829dd23b46d5406de1ae62416235d15)
- Verify completed output manifests before promotion - [`0b5cc49f30`](https://github.com/Ding-Ding-Projects/worldlens/commit/0b5cc49f30818fc0b66cf6e675d6d395f29ce63a)
- Harden durable render promotion and recovery - [`820f00fe3a`](https://github.com/Ding-Ding-Projects/worldlens/commit/820f00fe3a19c174bbfa6aa980f935b96170425d)
- Recover finished renders into the map catalogue - [`ae8bd4b8b8`](https://github.com/Ding-Ding-Projects/worldlens/commit/ae8bd4b8b8bfb5f1343e15c033c0d1ac6eaca048)
- Integrate verified BlueMap engine provisioning - [`b41f55ad21`](https://github.com/Ding-Ding-Projects/worldlens/commit/b41f55ad21e9f386c316a399ca4478c4c998023e) _(summary of 9 commits, also listed here)_
- Require canonical roots for archive verification - [`ad7281c47e`](https://github.com/Ding-Ding-Projects/worldlens/commit/ad7281c47ef26fc2bda7fa7ef07b0ec2f88a9d42)
- Make render ownership and archive races idempotent - [`5c6e794c4f`](https://github.com/Ding-Ding-Projects/worldlens/commit/5c6e794c4f720a6fb23ac71919e70a7108c6e585)
- Internal maintenance message omitted from the public changelog - [`285990e1e2`](https://github.com/Ding-Ding-Projects/worldlens/commit/285990e1e2b261c899e3803283cd1ed9db07c240)
- Internal maintenance message omitted from the public changelog - [`1e1b99aba1`](https://github.com/Ding-Ding-Projects/worldlens/commit/1e1b99aba103fe7c7a6d51aa989cb2f7d2fd4370)
- Harden engine staging and transfer safety - [`c7b4e3306d`](https://github.com/Ding-Ding-Projects/worldlens/commit/c7b4e3306d284f5a93765c625fe35fbfbcab054e)
- Keep bundled engine provenance and repair cancellation truthful - [`9e96875587`](https://github.com/Ding-Ding-Projects/worldlens/commit/9e96875587380de629f365e26eb2c3a4936b85d9)
- Repair and validate the packaged BlueMap engine - [`bc8692b6d1`](https://github.com/Ding-Ding-Projects/worldlens/commit/bc8692b6d13b618542bcf7d3f4fa612c6e0399c8)

### Landing page and documentation site

- Integrate complete site safety contracts - [`cb6e6a0342`](https://github.com/Ding-Ding-Projects/worldlens/commit/cb6e6a0342145b2c37ccca2fb9b5ad91ccc08b69) _(summary of 8 commits, also listed here)_
- Support ContextMenu key for exact lock wizard - [`149c47f3ad`](https://github.com/Ding-Ding-Projects/worldlens/commit/149c47f3adf1dcdf603f2e1e6f87a96ad6456fcb)
- Anchor exact site lock wizard and mark evidence pending - [`e0826904df`](https://github.com/Ding-Ding-Projects/worldlens/commit/e0826904dfdfaafa53d018265948930641ddaa87)
- Bound exact-origin site lock menus - [`1fdad79212`](https://github.com/Ding-Ding-Projects/worldlens/commit/1fdad79212ef5dd9a5dcb55f181545e0757ec4c7)
- Finish site evidence and state contracts - [`7a711a0308`](https://github.com/Ding-Ding-Projects/worldlens/commit/7a711a0308d18eb18cad7894fe84ca73d2af1521)
- Seal site secrets and persist ladder state - [`09eb0d45ee`](https://github.com/Ding-Ding-Projects/worldlens/commit/09eb0d45eedd72b8c8c5e6022ab9bafbe7be5dd6)
- Harden site universal contract verification - [`e83f131462`](https://github.com/Ding-Ding-Projects/worldlens/commit/e83f13146237e7abd944b0f655ee5a11f187ca75)
- Add site universal contract surface - [`a4b124efce`](https://github.com/Ding-Ding-Projects/worldlens/commit/a4b124efce7e3533b63b0f76128e89a3e75df98e)

### Build, release and tooling

- Merge fail-closed UI smoke planning - [`22eb8844ce`](https://github.com/Ding-Ding-Projects/worldlens/commit/22eb8844ce475b2cff5abd52d2381de356c1a4a0) _(summary of 3 commits, also listed here)_
- Internal maintenance message omitted from the public changelog - [`d48c8110fc`](https://github.com/Ding-Ding-Projects/worldlens/commit/d48c8110fc59fa539b17bb601f53ccef90f9d120)
- Add built-app smoke matrix - [`422c8eb3be`](https://github.com/Ding-Ding-Projects/worldlens/commit/422c8eb3be69911fc6b1af97b51b40275b372df2)
- Integrate one-command fresh Windows bootstrap - [`fc06a62f43`](https://github.com/Ding-Ding-Projects/worldlens/commit/fc06a62f438474bbcd76d54a430f617faf595c4e) _(summary of 8 commits, also listed here)_
- Honor digest preference before tool probes - [`221432c90f`](https://github.com/Ding-Ding-Projects/worldlens/commit/221432c90f1553cee58450ed70bc685b9ae7d249)
- Verify managed pnpm handoffs and rollback recovery - [`a996b6b1a6`](https://github.com/Ding-Ding-Projects/worldlens/commit/a996b6b1a6159c36004d63306ebc14290a820e2c)
- Pin pnpm and scope dependency handoff - [`4bcbaa8f12`](https://github.com/Ding-Ding-Projects/worldlens/commit/4bcbaa8f126d7a05e42320c6f23dcb567f09f8e2)
- Close fresh build review gaps - [`8abdede506`](https://github.com/Ding-Ding-Projects/worldlens/commit/8abdede506f82eb2a5e9fa17907d570935d7828b)
- Harden fresh Windows build provenance - [`eacbfdef20`](https://github.com/Ding-Ding-Projects/worldlens/commit/eacbfdef2002dd90f96aef52b9ce59a4a4011158)
- Emit BlueMap JAR versions from the producer - [`2fd4a53f83`](https://github.com/Ding-Ding-Projects/worldlens/commit/2fd4a53f830671a0ccf65424e24d6608257b0389) _(summary of 2 commits, also listed here)_
- Emit BlueMap JAR versions from the producer - [`316a6c5b21`](https://github.com/Ding-Ding-Projects/worldlens/commit/316a6c5b21f698b0fbcc3359be5125a761bbff9e)
- Align BlueMap package manifest version fields - [`173f04a403`](https://github.com/Ding-Ding-Projects/worldlens/commit/173f04a403e15ddab11ab2084f91b525eb6a1742) _(summary of 2 commits, also listed here)_
- Align BlueMap manifest version fields - [`52bd38744e`](https://github.com/Ding-Ding-Projects/worldlens/commit/52bd38744eca11b291a361c44285bff5ee8bdf9d)
- Internal maintenance message omitted from the public changelog - [`ccc9ed5a58`](https://github.com/Ding-Ding-Projects/worldlens/commit/ccc9ed5a5876e5e58222a68cf7a4a8cb337dc2ef) _(summary of 2 commits, also listed here)_
- Internal maintenance message omitted from the public changelog - [`500bd3b3ba`](https://github.com/Ding-Ding-Projects/worldlens/commit/500bd3b3ba8d06beae93e4941fe2c90efd91d906)
- Integrate authoritative BlueMap package manifest - [`8f71fd086e`](https://github.com/Ding-Ding-Projects/worldlens/commit/8f71fd086e928ee61509ad646889029260065342) _(summary of 5 commits, also listed here)_
- Harden BlueMap staging identity and workflow contracts - [`e2a74db73e`](https://github.com/Ding-Ding-Projects/worldlens/commit/e2a74db73e31a6b3ed52dfe2f5ab3d02f244ef5d)
- Require verified BlueMap CLI manifest before packaging - [`fc1c606770`](https://github.com/Ding-Ding-Projects/worldlens/commit/fc1c60677081a0e31cd4c7be3ae990941afaba3b)

### Documentation

- Add fresh Windows build and run entry - [`7d5b7b2e9e`](https://github.com/Ding-Ding-Projects/worldlens/commit/7d5b7b2e9e649b0af283699b1a5ee6b882c2c0f9)
- Date the verified engine Settings capture - [`417c2aa179`](https://github.com/Ding-Ding-Projects/worldlens/commit/417c2aa179333eb5baf99b553a1825314a8ae216)
- Capture verified BlueMap provenance in Settings - [`e718254000`](https://github.com/Ding-Ding-Projects/worldlens/commit/e7182540007a5bc1e3455c5e9467228cfd3c2958)
- Date the packaged smoke captures - [`94bcc4607b`](https://github.com/Ding-Ding-Projects/worldlens/commit/94bcc4607bbd680e15c0a175eb881c71db6770be)
- Record packaged engine and promotion smoke failures - [`d8de120933`](https://github.com/Ding-Ding-Projects/worldlens/commit/d8de1209330143660a1b5fd874b332e73bd380d0)
- Capture the missing direct-world browse action - [`1f55f1402f`](https://github.com/Ding-Ding-Projects/worldlens/commit/1f55f1402f49018c96326a158d0f92a9e391bbdf)
- Add the project render-route baseline - [`8dc5c65a0b`](https://github.com/Ding-Ding-Projects/worldlens/commit/8dc5c65a0bb834fcccde08c134870c7d16c8af8a)
- Record pre-fix server and engine evidence - [`366e90b994`](https://github.com/Ding-Ding-Projects/worldlens/commit/366e90b994f354798bb921bc058463e19844cfd7)

### Elsewhere in the repository

- Validate the pinned pnpm version exactly - [`098624459b`](https://github.com/Ding-Ding-Projects/worldlens/commit/098624459bdc366f19b1779a38416f8389eee0a7)

## 1.0.1767 - 2026-09-02

Tagged at [`cbd68338cf`](https://github.com/Ding-Ding-Projects/worldlens/commit/cbd68338cf57fd45cc8f82284aac05844c857090).

### Desktop shell

- Keep watching a render that GitHub answered badly once - [`1ea18c8166`](https://github.com/Ding-Ding-Projects/worldlens/commit/1ea18c81664535c1df9b59cda12516131bb437fe)

### Documentation

- Record what the test suite actually does before this branch touched it - [`cbd68338cf`](https://github.com/Ding-Ding-Projects/worldlens/commit/cbd68338cf57fd45cc8f82284aac05844c857090)

## 1.0.1763 - 2026-08-26

Tagged at [`87a7c3ae49`](https://github.com/Ding-Ding-Projects/worldlens/commit/87a7c3ae490ca00876ff6505aec4186954ed2427).

### Documentation

- Record what this session actually did, including what it did not - [`87a7c3ae49`](https://github.com/Ding-Ding-Projects/worldlens/commit/87a7c3ae490ca00876ff6505aec4186954ed2427)

## 1.0.1760 - 2026-08-25

Tagged at [`8d52fe2d13`](https://github.com/Ding-Ding-Projects/worldlens/commit/8d52fe2d1372d665fbca823240f1d6cb619b0f1c).

### Desktop shell

- Work out that "overworld" is a dimension, not a missing map - [`8d52fe2d13`](https://github.com/Ding-Ding-Projects/worldlens/commit/8d52fe2d1372d665fbca823240f1d6cb619b0f1c)

## 1.0.1758 - 2026-08-25

Tagged at [`e715a1ab0e`](https://github.com/Ding-Ding-Projects/worldlens/commit/e715a1ab0ee6594db368880280a0d6458b9beb80).

### Interface

- Stop the server dashboard being frozen by a reply that never comes - [`e715a1ab0e`](https://github.com/Ding-Ding-Projects/worldlens/commit/e715a1ab0ee6594db368880280a0d6458b9beb80)

## 1.0.1756 - 2026-08-25

Tagged at [`d64700dbb3`](https://github.com/Ding-Ding-Projects/worldlens/commit/d64700dbb306db3da7dd9247c3c48e00d4d3818b).

### Build, release and tooling

- Write the render-engine manifest after the jar exists, not 81 seconds before - [`d64700dbb3`](https://github.com/Ding-Ding-Projects/worldlens/commit/d64700dbb306db3da7dd9247c3c48e00d4d3818b)

## 1.0.1755 - 2026-08-25

Tagged at [`472ea8e567`](https://github.com/Ding-Ding-Projects/worldlens/commit/472ea8e567fe68f65bb0c528daf2729146c00de8).

### Interface

- Give the canvas tab something to show, and tabs their lock - [`472ea8e567`](https://github.com/Ding-Ding-Projects/worldlens/commit/472ea8e567fe68f65bb0c528daf2729146c00de8)

## 1.0.1752 - 2026-08-25

Tagged at [`33e055ee9b`](https://github.com/Ding-Ding-Projects/worldlens/commit/33e055ee9b6b0ec668d90616774346f7241e83a7).

### Desktop shell

- Install the render engine automatically when a build arrived without one - [`33e055ee9b`](https://github.com/Ding-Ding-Projects/worldlens/commit/33e055ee9b6b0ec668d90616774346f7241e83a7)

## 1.0.1751 - 2026-08-25

Tagged at [`28cf52a1fb`](https://github.com/Ding-Ding-Projects/worldlens/commit/28cf52a1fbe47eb47edd04c2c12e8954c72fb0bd).

### Interface

- Stop the host screen from stealing the canvas's own name - [`18d95ef6a7`](https://github.com/Ding-Ding-Projects/worldlens/commit/18d95ef6a73112c251c37e1d75dcf155e6b29305)

### Desktop shell

- Stop the capture harness waiting on retired components and phantom navigations - [`28cf52a1fb`](https://github.com/Ding-Ding-Projects/worldlens/commit/28cf52a1fbe47eb47edd04c2c12e8954c72fb0bd)
- The engine was always installed; the paperwork said otherwise - [`102e1ad143`](https://github.com/Ding-Ding-Projects/worldlens/commit/102e1ad14367e4c279a54f324d2d1fb087c976e6)
- Budget a surface by how long it has been idle, not how long it has run - [`3f4e887972`](https://github.com/Ding-Ding-Projects/worldlens/commit/3f4e887972cde8f3cc6051ebdae2f24b0434fd8a)
- Stop the screenshots photographing the operator's private vocabulary - [`4a04f9a91c`](https://github.com/Ding-Ding-Projects/worldlens/commit/4a04f9a91c2ef4a1e513100adbdaf6380d4414c9)
- Photograph the build that was built, and prove the editor actually closed - [`75eca0c92f`](https://github.com/Ding-Ding-Projects/worldlens/commit/75eca0c92fbb08c42ae76bf5e0a9f7c5d8ccca61)

## 1.0.1745 - 2026-08-25

Tagged at [`598e97708d`](https://github.com/Ding-Ding-Projects/worldlens/commit/598e97708d229e312e3a88da77cba25322c08975).

### Interface

- Make the project canvas findable, and say honestly that the site does not have it - [`598e97708d`](https://github.com/Ding-Ding-Projects/worldlens/commit/598e97708d229e312e3a88da77cba25322c08975)

## 1.0.1744 - 2026-08-25

Tagged at [`2eb09d1c0a`](https://github.com/Ding-Ding-Projects/worldlens/commit/2eb09d1c0aa0e8f827a8a43d2ade0da2a9813df4).

### Documentation

- Document the project canvas, including what it cannot do yet - [`2eb09d1c0a`](https://github.com/Ding-Ding-Projects/worldlens/commit/2eb09d1c0aa0e8f827a8a43d2ade0da2a9813df4)

## 1.0.1743 - 2026-08-25

Tagged at [`ff8a1688b8`](https://github.com/Ding-Ding-Projects/worldlens/commit/ff8a1688b83cf07574325115d3c8ed2205fe5121).

### Desktop shell

- Photograph the project canvas, and require the pictures to exist - [`ff8a1688b8`](https://github.com/Ding-Ding-Projects/worldlens/commit/ff8a1688b83cf07574325115d3c8ed2205fe5121)

## 1.0.1741 - 2026-08-25

Tagged at [`5608e21f57`](https://github.com/Ding-Ding-Projects/worldlens/commit/5608e21f57659483b8d23e4742f44cfdcbc843c8).

### Interface

- Let the creation screen switch between steps and canvas without losing answers - [`5608e21f57`](https://github.com/Ding-Ding-Projects/worldlens/commit/5608e21f57659483b8d23e4742f44cfdcbc843c8)

## 1.0.1740 - 2026-08-25

Tagged at [`8c0bcfee0d`](https://github.com/Ding-Ding-Projects/worldlens/commit/8c0bcfee0df60a326140570458fc3b0456ebfbfe).

### Interface

- Register the project canvas as a job so it can actually be opened - [`8c0bcfee0d`](https://github.com/Ding-Ding-Projects/worldlens/commit/8c0bcfee0df60a326140570458fc3b0456ebfbfe)

## 1.0.1738 - 2026-08-25

Tagged at [`721905cc80`](https://github.com/Ding-Ding-Projects/worldlens/commit/721905cc800de56453871515ae1dcac8837b5f64).

### Interface

- Draw the project as a graph, reading and writing the wizard's own model - [`721905cc80`](https://github.com/Ding-Ding-Projects/worldlens/commit/721905cc800de56453871515ae1dcac8837b5f64)

## 1.0.1735 - 2026-08-25

Tagged at [`861e347567`](https://github.com/Ding-Ding-Projects/worldlens/commit/861e3475673adce1e91cacf88228232686edb694).

### Interface

- Add the canvas node, and a guard that cannot be satisfied by prose - [`861e347567`](https://github.com/Ding-Ding-Projects/worldlens/commit/861e3475673adce1e91cacf88228232686edb694)
- Add the project canvas's layout model, which owns layout and nothing else - [`33054b4325`](https://github.com/Ding-Ding-Projects/worldlens/commit/33054b4325d9c90e9ca9522481785666603cb543)

## 1.0.1734 - 2026-08-25

Tagged at [`0fb07efac7`](https://github.com/Ding-Ding-Projects/worldlens/commit/0fb07efac7c3b0a46ddee8178e2bf6b3e5d3fd00).

### Desktop shell

- Repair two long-red tests: a dead import and an unexported build helper - [`0fb07efac7`](https://github.com/Ding-Ding-Projects/worldlens/commit/0fb07efac7c3b0a46ddee8178e2bf6b3e5d3fd00)

## 1.0.1733 - 2026-08-25

Tagged at [`9b518b7429`](https://github.com/Ding-Ding-Projects/worldlens/commit/9b518b742973551aa659409b07effdbd18fef49c).

### Desktop shell

- Drop a coverage test that asserted behaviour the contradiction rule replaced - [`9b518b7429`](https://github.com/Ding-Ding-Projects/worldlens/commit/9b518b742973551aa659409b07effdbd18fef49c)
- Merge branch 'coverage-chunk-verdict' - [`aa50f728e8`](https://github.com/Ding-Ding-Projects/worldlens/commit/aa50f728e801ad9474e2a5661d1c64caac5ede6e) _(summary of 2 commits, also listed here)_
- Let a chunked capture run judge coverage on the artifacts it actually produced - [`f7415c8e93`](https://github.com/Ding-Ding-Projects/worldlens/commit/f7415c8e93a22e7c85bcf4d14b8543c23115f0e0)
- Give the largest capture spec enough time to attempt every surface it owns - [`6e34cdaae4`](https://github.com/Ding-Ding-Projects/worldlens/commit/6e34cdaae4224c8c3f409e89d9a9c033eaa66fbe)

## 1.0.1731 - 2026-08-25

Tagged at [`8832e4596f`](https://github.com/Ding-Ding-Projects/worldlens/commit/8832e4596f646e3d33734b75797b16a22e049511).

### Desktop shell

- Let a chunked capture run keep the evidence its earlier chunks recorded - [`8832e4596f`](https://github.com/Ding-Ding-Projects/worldlens/commit/8832e4596f646e3d33734b75797b16a22e049511)

## 1.0.1729 - 2026-08-25

Tagged at [`076bedb6ef`](https://github.com/Ding-Ding-Projects/worldlens/commit/076bedb6ef84dae3f2704713ab61f1cccaec20d3).

### Desktop shell

- Reset the renderer between specs, so the capture run stops dying of exhaustion - [`076bedb6ef`](https://github.com/Ding-Ding-Projects/worldlens/commit/076bedb6ef84dae3f2704713ab61f1cccaec20d3)

## 1.0.1727 - 2026-08-25

Tagged at [`3ceb06f032`](https://github.com/Ding-Ding-Projects/worldlens/commit/3ceb06f032ea4550ea31116a4c5955b22e036df4).

### Desktop shell

- Bound the capture harness's unbounded waits so one bad surface stops costing the whole run - [`3ceb06f032`](https://github.com/Ding-Ding-Projects/worldlens/commit/3ceb06f032ea4550ea31116a4c5955b22e036df4)
- Bound each surface so one unreachable screen cannot cost the whole manifest - [`c14a180714`](https://github.com/Ding-Ding-Projects/worldlens/commit/c14a180714986c0aca81c991dd847fea05e9328d)
- Say why the harness cannot reattach, instead of retrying something that cannot work - [`2151d78041`](https://github.com/Ding-Ding-Projects/worldlens/commit/2151d78041142be5a66749ea66ffdc938fb5e30a)
- Stop the capture matrix waiting for a screen the product no longer has - [`d480ee7fd7`](https://github.com/Ding-Ding-Projects/worldlens/commit/d480ee7fd708ded9b24292f47931c4b0378afb13)
- Stop the capture matrix ending its own run on the first hang - [`d99ac35754`](https://github.com/Ding-Ding-Projects/worldlens/commit/d99ac3575419131be1fe59c3c5fea62fd2fa4ce1)

### Documentation

- Record what shipped, and why one gate stays red on purpose - [`14c779c17c`](https://github.com/Ding-Ding-Projects/worldlens/commit/14c779c17cc8f750f7adb85dca17dae27cda6569)
- Give the hosted captures a harness anybody can run - [`d4b9afac72`](https://github.com/Ding-Ding-Projects/worldlens/commit/d4b9afac72a7b2a7c3417a95020b209a40540405)

## 1.0.1718 - 2026-08-25

Tagged at [`618b628de9`](https://github.com/Ding-Ding-Projects/worldlens/commit/618b628de9c3674f4cae23100f5505f86188ab42).

### Interface

- Ask for the password before mounting, because nothing ever asked for it - [`618b628de9`](https://github.com/Ding-Ding-Projects/worldlens/commit/618b628de9c3674f4cae23100f5505f86188ab42)
- Point the browse button at the mount browser when there is no desktop to draw on - [`3fe82ad5a2`](https://github.com/Ding-Ding-Projects/worldlens/commit/3fe82ad5a294b6d6b4bd9901888157a6e016a915)

### Desktop shell

- Give a hosted deployment the folder browser its refusals already promised - [`6b8910779a`](https://github.com/Ding-Ding-Projects/worldlens/commit/6b8910779a10633f94e0758c1a87cc8dfd0692f5)

## 1.0.1713 - 2026-08-25

Tagged at [`fa2f5abba5`](https://github.com/Ding-Ding-Projects/worldlens/commit/fa2f5abba5693736ceae902adb5cd556c4271291).

### Interface

- Internal maintenance message omitted from the public changelog - [`fa2f5abba5`](https://github.com/Ding-Ding-Projects/worldlens/commit/fa2f5abba5693736ceae902adb5cd556c4271291)
- Say when this build was made, and refuse to guess when it does not know - [`e00bcd2c54`](https://github.com/Ding-Ding-Projects/worldlens/commit/e00bcd2c541b683163a06979db5906458bd3e1f8)

### Server, CLI and configuration

- Give the hosted route its channel inventory, its refusals, and its transport - [`4d0f8595b7`](https://github.com/Ding-Ding-Projects/worldlens/commit/4d0f8595b79e01258f983db6ef0ac10d6107f9e1)
- Build the vendored webapp inside the image, so a clean checkout can build it at all - [`b04c2deac4`](https://github.com/Ding-Ding-Projects/worldlens/commit/b04c2deac4d0f8d2227aac067cfc8fb42704500a)

### Desktop shell

- Let a hosted copy tell you what it is, because you cannot tell by looking - [`e32341f72a`](https://github.com/Ding-Ding-Projects/worldlens/commit/e32341f72a3d09b3fa32a6ce4b07296ea0f4933c)
- Ship the hosted image, and stop it promising what it cannot do - [`87aa673614`](https://github.com/Ding-Ding-Projects/worldlens/commit/87aa67361416cb4e24810dc4baae4839865abe30)
- Make the hosted deployment actually run, and stop Electron sneaking into it - [`0e094310ca`](https://github.com/Ding-Ding-Projects/worldlens/commit/0e094310ca53c1b6fca4892f3aa2da161ef704ee)
- Put a boundary around the filesystem and a password in front of the door - [`1ae0cf1dbf`](https://github.com/Ding-Ding-Projects/worldlens/commit/1ae0cf1dbfafcaceb65c508ee48058f1e0e596f9)

### Landing page and documentation site

- Put the three new features on the site, and let its own gates tell me what I missed - [`9c3b2078da`](https://github.com/Ding-Ding-Projects/worldlens/commit/9c3b2078dac7c8d7033f7483d42e03a2a22e3a6f)

### Build, release and tooling

- Use the workflow's own token for the registry, not the release-token chain - [`b0840a4d17`](https://github.com/Ding-Ding-Projects/worldlens/commit/b0840a4d175c818b0ebed1b875e7a07c360fffa5)
- Build and publish the container image, for both architectures people actually run - [`19b4449e16`](https://github.com/Ding-Ding-Projects/worldlens/commit/19b4449e161c0f5c1f0634ffc161fdba8f749432)

### Documentation

- Document the three ways to run this, and say what each one does not protect - [`3c222e1405`](https://github.com/Ding-Ding-Projects/worldlens/commit/3c222e14050a925049467a88257ec94bae655222)
- Stop the interface refusing to zoom, and photograph it on a phone-sized screen - [`22ddad98b5`](https://github.com/Ding-Ding-Projects/worldlens/commit/22ddad98b5854c320572e91e257c5b601f1042fd)

### Elsewhere in the repository

- Exclude the vendored JRE from the local installer signature check - [`fc24515788`](https://github.com/Ding-Ding-Projects/worldlens/commit/fc24515788cce9419c418381731ae517770da0a6)
- Give Wharf a window, and prove it opens rather than only that it compiles - [`3b11f31edc`](https://github.com/Ding-Ding-Projects/worldlens/commit/3b11f31edc4bd39928a45de112c32bed4d08a846)
- Add Wharf, and make "pick the folder" the safe control rather than the dangerous one - [`43c0234a72`](https://github.com/Ding-Ding-Projects/worldlens/commit/43c0234a7247b4d4f37c3d373827437331cd2b33)
- Let two applications share a Docker host, and teach the deploy core about Windows - [`89b35cb40d`](https://github.com/Ding-Ding-Projects/worldlens/commit/89b35cb40db87088987ed97569e8914749557086)
- Lift the machine-talking half out of the app, so a second application can use it - [`72deaae5bc`](https://github.com/Ding-Ding-Projects/worldlens/commit/72deaae5bce3a9a9aee4e459bf5f0d3a6070d439)
- Lift the bridge out of the preload, so the renderer is no longer welded to Electron - [`43e71745d8`](https://github.com/Ding-Ding-Projects/worldlens/commit/43e71745d8bb6438e3850b5af4157a839b81b281)

## 1.0.1692 - 2026-08-24

Tagged at [`58d054d89b`](https://github.com/Ding-Ding-Projects/worldlens/commit/58d054d89bfdbf5acf5b4f69235d7a15bf442cf3).

### Interface

- Propose the server's id and name instead of demanding them - [`58d054d89b`](https://github.com/Ding-Ding-Projects/worldlens/commit/58d054d89bfdbf5acf5b4f69235d7a15bf442cf3)

## 1.0.1691 - 2026-08-24

Tagged at [`ee4365bb9d`](https://github.com/Ding-Ding-Projects/worldlens/commit/ee4365bb9d268d890e12ad68edf6bc84c6a836ad).

### Interface

- Carry the suggested-folder seam across the one gap that dropped it - [`ee4365bb9d`](https://github.com/Ding-Ding-Projects/worldlens/commit/ee4365bb9d268d890e12ad68edf6bc84c6a836ad)

## 1.0.1688 - 2026-08-24

Tagged at [`91de3122b4`](https://github.com/Ding-Ding-Projects/worldlens/commit/91de3122b4d3a3c1d72ce362fe6a8893a1ff9482).

### Interface

- Load the wizard's catalogue even when it opens on its first render - [`91de3122b4`](https://github.com/Ding-Ding-Projects/worldlens/commit/91de3122b4d3a3c1d72ce362fe6a8893a1ff9482)

## 1.0.1686 - 2026-08-24

Tagged at [`2aee5d05b6`](https://github.com/Ding-Ding-Projects/worldlens/commit/2aee5d05b667c374720c1965ec4b3b21005b6dd0).

### Interface

- Give Forge and NeoForge the version lists they never had - [`2aee5d05b6`](https://github.com/Ding-Ding-Projects/worldlens/commit/2aee5d05b667c374720c1965ec4b3b21005b6dd0)

## 1.0.1685 - 2026-08-24

Tagged at [`b9e64d8a93`](https://github.com/Ding-Ding-Projects/worldlens/commit/b9e64d8a93ca05b00f4da7e6a10e7c368005b822).

### Interface

- Stop opening the create-server wizard twice, and stop claiming an engine works - [`b9e64d8a93`](https://github.com/Ding-Ding-Projects/worldlens/commit/b9e64d8a93ca05b00f4da7e6a10e7c368005b822)

## 1.0.1647 - 2026-08-22

Tagged at [`ff7ddb32ee`](https://github.com/Ding-Ding-Projects/worldlens/commit/ff7ddb32ee7c0014d49edeb2c93d4e493b72a8de).

### Documentation

- Internal maintenance message omitted from the public changelog - [`ff7ddb32ee`](https://github.com/Ding-Ding-Projects/worldlens/commit/ff7ddb32ee7c0014d49edeb2c93d4e493b72a8de)

## 1.0.1644 - 2026-08-22

Tagged at [`e27ddd9edf`](https://github.com/Ding-Ding-Projects/worldlens/commit/e27ddd9edfc326d94c155b2dfdf79322dda1e2a3).

### Documentation

- Record the measured installer size, and why my estimate was wrong - [`e27ddd9edf`](https://github.com/Ding-Ding-Projects/worldlens/commit/e27ddd9edfc326d94c155b2dfdf79322dda1e2a3)

## 1.0.1640 - 2026-08-22

Tagged at [`214f32f83d`](https://github.com/Ding-Ding-Projects/worldlens/commit/214f32f83d346b24b96358d0c4c47c0bf6eee1ff).

### Desktop shell

- Wire the fourth call site, the one my own guard could not see - [`214f32f83d`](https://github.com/Ding-Ding-Projects/worldlens/commit/214f32f83d346b24b96358d0c4c47c0bf6eee1ff)

## 1.0.1637 - 2026-08-22

Tagged at [`966590b4e3`](https://github.com/Ding-Ding-Projects/worldlens/commit/966590b4e385921ca76eb3154ef745837e524f02).

### Desktop shell

- Actually offer the bundled runtime to the code that resolves a JVM - [`966590b4e3`](https://github.com/Ding-Ding-Projects/worldlens/commit/966590b4e385921ca76eb3154ef745837e524f02)

## 1.0.1635 - 2026-08-22

Tagged at [`ec7b80addf`](https://github.com/Ding-Ding-Projects/worldlens/commit/ec7b80addfd7fff62a254495a9b33d57bb1ca648).

### Interface

- Internal maintenance message omitted from the public changelog - [`68b7d8066e`](https://github.com/Ding-Ding-Projects/worldlens/commit/68b7d8066eaa94909edd2690867015911bdfefa9)

### Desktop shell

- Put the runtimes inside the installer, and fix three screens that proved it was needed - [`72585824f9`](https://github.com/Ding-Ding-Projects/worldlens/commit/72585824f9e4910eb82a5939685bd72f314ab9db)

### Build, release and tooling

- Compare the vendored path as an absolute path, so the exclusion can match - [`ec7b80addf`](https://github.com/Ding-Ding-Projects/worldlens/commit/ec7b80addfd7fff62a254495a9b33d57bb1ca648)
- Repair the workflow file my own escaping corrupted - [`78bd28f959`](https://github.com/Ding-Ding-Projects/worldlens/commit/78bd28f959ed1a70f86d5fd9ee1fe454d67f1ca8)

## 1.0.1626 - 2026-08-22

Tagged at [`0c464f7003`](https://github.com/Ding-Ding-Projects/worldlens/commit/0c464f70035401440e53a572b6bf421fcedd3ce3).

### Interface

- Internal maintenance message omitted from the public changelog - [`0c464f7003`](https://github.com/Ding-Ding-Projects/worldlens/commit/0c464f70035401440e53a572b6bf421fcedd3ce3) _(summary of 2 commits, also listed here)_
- Give adoption the candidate browser its button always implied - [`2c2769ccda`](https://github.com/Ding-Ding-Projects/worldlens/commit/2c2769ccda9a6ad07f9e7c8e1ccdbf405b99c6be)

### Landing page and documentation site

- Merge the capture provenance lane - [`8e588389f1`](https://github.com/Ding-Ding-Projects/worldlens/commit/8e588389f1566b41693c528f0590dfa200da4cfd) _(summary of 2 commits, also listed here)_
- Point the capture tooling at the route that still exists - [`8ef8316e79`](https://github.com/Ding-Ding-Projects/worldlens/commit/8ef8316e7988791bc75127d86065d9c16963dbd4)

## 1.0.1622 - 2026-08-22

Tagged at [`1c4f4fa558`](https://github.com/Ding-Ding-Projects/worldlens/commit/1c4f4fa558f1dd7f50949ca567ff27afb03bd7fd).

### Server, CLI and configuration

- Reconcile the hosted-runner inventory with the workflows it describes - [`1c4f4fa558`](https://github.com/Ding-Ding-Projects/worldlens/commit/1c4f4fa558f1dd7f50949ca567ff27afb03bd7fd)

## 1.0.1619 - 2026-08-22

Tagged at [`7a62413e6e`](https://github.com/Ding-Ding-Projects/worldlens/commit/7a62413e6e33d399723e4001b3edfc4958093434).

### Interface

- Bring the GUI's colours and elevation back onto the design system - [`917ffa8a9a`](https://github.com/Ding-Ding-Projects/worldlens/commit/917ffa8a9a059d668c49628e47286d9b779270d6)

### Documentation

- Record the colour transcription and the elevation guard in the article - [`7a62413e6e`](https://github.com/Ding-Ding-Projects/worldlens/commit/7a62413e6e33d399723e4001b3edfc4958093434)

## 1.0.1615 - 2026-08-22

Tagged at [`09f9ca3573`](https://github.com/Ding-Ding-Projects/worldlens/commit/09f9ca3573e8327c0b1c6a4635d1c155300ab0a8).

### Elsewhere in the repository

- Design system update - [`09f9ca3573`](https://github.com/Ding-Ding-Projects/worldlens/commit/09f9ca3573e8327c0b1c6a4635d1c155300ab0a8)

## 1.0.1613 - 2026-08-22

Tagged at [`e10b86011d`](https://github.com/Ding-Ding-Projects/worldlens/commit/e10b86011d6b8997f7897030c3835a62a8549d89).

### Interface

- Put a five-level message back in the table that holds five-level messages - [`e10b86011d`](https://github.com/Ding-Ding-Projects/worldlens/commit/e10b86011d6b8997f7897030c3835a62a8549d89)

## 1.0.1611 - 2026-08-22

Tagged at [`c36d43df88`](https://github.com/Ding-Ding-Projects/worldlens/commit/c36d43df88a959c536a167dda6b93fe46cbf3603).

### Interface

- Fix workspace package staging and Vue template build - [`c36d43df88`](https://github.com/Ding-Ding-Projects/worldlens/commit/c36d43df88a959c536a167dda6b93fe46cbf3603)
- Extract the reusable WorldLens design system - [`d32e7a24be`](https://github.com/Ding-Ding-Projects/worldlens/commit/d32e7a24be60fddfa6e95d2a4d84c080c19a37dc)
- Merge remote-tracking branch 'origin/lane/issue153-reconcile-worldgen' - [`d679692410`](https://github.com/Ding-Ding-Projects/worldlens/commit/d679692410a0f3121e9aea0908fcbcd2be884940) _(summary of 2 commits, also listed here)_
- Reconcile UI world generation with Anvil writer - [`c41c24b54a`](https://github.com/Ding-Ding-Projects/worldlens/commit/c41c24b54a5b2df8b1744dee9764ca30dd87e217)
- Run vanilla world generation with Chunky - [`678e7b7b16`](https://github.com/Ding-Ding-Projects/worldlens/commit/678e7b7b16c19092cbd175833412db28bc083b48)
- Merge remote-tracking branch 'origin/lane/issue156-world-drop' - [`c6bd881738`](https://github.com/Ding-Ding-Projects/worldlens/commit/c6bd8817387858a9a16e81e28a71190820c22dfe) _(summary of 2 commits, also listed here)_
- Handle dropped Minecraft worlds - [`16f09c4c58`](https://github.com/Ding-Ding-Projects/worldlens/commit/16f09c4c58c8c49c78a2dd27ccde0741659317be)
- Merge remote-tracking branch 'origin/lane/issue161-two-corner' - [`41f5f5e99e`](https://github.com/Ding-Ding-Projects/worldlens/commit/41f5f5e99e56aa5647ee51f5dac20cfe435ac55e) _(summary of 2 commits, also listed here)_
- Add two-corner map picking to fill and clone - [`39104ae276`](https://github.com/Ding-Ding-Projects/worldlens/commit/39104ae2768ef2781c371528f124e181da9912c3)
- Merge remote-tracking branch 'origin/lane/issue155-modloader-profiles' - [`4d5a10d588`](https://github.com/Ding-Ding-Projects/worldlens/commit/4d5a10d588fc96ef7e92b1394bb91e2369b236d2) _(summary of 2 commits, also listed here)_
- Add interactive mod-loader profiles - [`b429d5de82`](https://github.com/Ding-Ding-Projects/worldlens/commit/b429d5de82d6ba76877461b52536b9e42b8ca6a4)
- test: cover remaining Minecraft server searches - [`58e87518c2`](https://github.com/Ding-Ding-Projects/worldlens/commit/58e87518c2a2c1521e2688874d42f73d549bc63f)
- Internal maintenance message omitted from the public changelog - [`83bc94050e`](https://github.com/Ding-Ding-Projects/worldlens/commit/83bc94050e872289b04c5ced1d65a0af5bfff77d)
- Merge remote-tracking branch 'origin/lane/issue152-aws-interface' - [`c61a156ae5`](https://github.com/Ding-Ding-Projects/worldlens/commit/c61a156ae5b04d4c801c86510229a068ca2172de) _(summary of 2 commits, also listed here)_
- Expose AWS EC2 hosting in the server wizard - [`6edd68e984`](https://github.com/Ding-Ding-Projects/worldlens/commit/6edd68e98464cad8c07039e97ac699283d5e70bb)

### Desktop shell

- Merge remote-tracking branch 'origin/lane/issue158-typed-schemas' - [`c2004a3d9b`](https://github.com/Ding-Ding-Projects/worldlens/commit/c2004a3d9babcaaf518126702462497326f710f6) _(summary of 2 commits, also listed here)_
- Add typed mod-loader and player record schemas - [`9ec36bd4c8`](https://github.com/Ding-Ding-Projects/worldlens/commit/9ec36bd4c86594105b4fcb3337c94a4d20a30eb7)
- Merge remote-tracking branch 'origin/lane/issue159-schema-verify' - [`2dc9827076`](https://github.com/Ding-Ding-Projects/worldlens/commit/2dc9827076d5166d1a5ccc43da3a3a5cbf19dd7d) _(summary of 2 commits, also listed here)_
- Verify upstream config schema defaults - [`7e3d4a4c04`](https://github.com/Ding-Ding-Projects/worldlens/commit/7e3d4a4c04fc5834d49705a998b91e4b651a5a24)

### Build, release and tooling

- Register the design-system workspace lock - [`7dee8c66fc`](https://github.com/Ding-Ding-Projects/worldlens/commit/7dee8c66fcda8f0f34b3123cf9fe11040ec07b5f)

### Documentation

- Integrate the reusable WorldLens design system - [`e6638a7e60`](https://github.com/Ding-Ding-Projects/worldlens/commit/e6638a7e608e221c6bdd77f638d014368ae3d04f) _(summary of 4 commits, also listed here)_
- Document the reusable design-system contract - [`2a15644093`](https://github.com/Ding-Ding-Projects/worldlens/commit/2a1564409317f4b10291803448b46f1b8105b8e1)

## 1.0.1577 - 2026-08-22

Tagged at [`331d0579ea`](https://github.com/Ding-Ding-Projects/worldlens/commit/331d0579ea333c3e76bfa43000ffb5a2486782c6).

### Interface

- Merge remote-tracking branch 'origin/lane/issue151-config-ipc' - [`331d0579ea`](https://github.com/Ding-Ding-Projects/worldlens/commit/331d0579ea333c3e76bfa43000ffb5a2486782c6) _(summary of 2 commits, also listed here)_
- Wire schema config editor through IPC - [`21775b3e1b`](https://github.com/Ding-Ding-Projects/worldlens/commit/21775b3e1b0126878f5b1416416d3ed579ad6fb5)

## 1.0.1575 - 2026-08-22

Tagged at [`53f596cd07`](https://github.com/Ding-Ding-Projects/worldlens/commit/53f596cd0782fbc34f7063a715768d3381aa9ae4).

### Interface

- Merge remote-tracking branch 'origin/lane/issue150-adoption-wiring' - [`53f596cd07`](https://github.com/Ding-Ding-Projects/worldlens/commit/53f596cd0782fbc34f7063a715768d3381aa9ae4) _(summary of 2 commits, also listed here)_
- Wire Minecraft server adoption review - [`3a8adcfd4f`](https://github.com/Ding-Ding-Projects/worldlens/commit/3a8adcfd4f151f213b8e2766466de94101e075fe)

## 1.0.1573 - 2026-08-22

Tagged at [`f67c07380c`](https://github.com/Ding-Ding-Projects/worldlens/commit/f67c07380c0dc733a7e12bda8f48b9932be7fca3).

### Interface

- Replace remaining raw UI elements - [`f67c07380c`](https://github.com/Ding-Ding-Projects/worldlens/commit/f67c07380c0dc733a7e12bda8f48b9932be7fca3)

## 1.0.1570 - 2026-08-22

Tagged at [`f3065d1e5c`](https://github.com/Ding-Ding-Projects/worldlens/commit/f3065d1e5ce7791423c0a629c3c14fc394e17088).

### Interface

- Replace mcserver HTML text with Vuetify primitives - [`f3065d1e5c`](https://github.com/Ding-Ding-Projects/worldlens/commit/f3065d1e5ce7791423c0a629c3c14fc394e17088)

## 1.0.1568 - 2026-08-22

Tagged at [`69d919e4bb`](https://github.com/Ding-Ding-Projects/worldlens/commit/69d919e4bbf5d7ea39386beafadc00514d0eae99).

### Interface

- Replace generic controls with Vuetify primitives - [`69d919e4bb`](https://github.com/Ding-Ding-Projects/worldlens/commit/69d919e4bbf5d7ea39386beafadc00514d0eae99)

## 1.0.1565 - 2026-08-22

Tagged at [`acfc5f073e`](https://github.com/Ding-Ding-Projects/worldlens/commit/acfc5f073ecc00604c701f2fede13b0ec84868b4).

### Documentation

- Merge remote-tracking branch 'origin/lane/issue160-captures' - [`acfc5f073e`](https://github.com/Ding-Ding-Projects/worldlens/commit/acfc5f073ecc00604c701f2fede13b0ec84868b4) _(summary of 2 commits, also listed here)_
- Document issue 160 screenshot refresh boundary - [`d2525043eb`](https://github.com/Ding-Ding-Projects/worldlens/commit/d2525043eb76d367b566bfae3427af957282c0ef)

## 1.0.1564 - 2026-08-22

Tagged at [`c5824a93c8`](https://github.com/Ding-Ding-Projects/worldlens/commit/c5824a93c8cf6c54ac05a2ddbcc05bff95638ac7).

### Interface

- Align docs model with cloud hosting index - [`ac68506120`](https://github.com/Ding-Ding-Projects/worldlens/commit/ac685061202886fffadcbf2c07d4b5b2b1b1bf49)
- Update KidHome language coverage for six tiles - [`21b9e22b7a`](https://github.com/Ding-Ding-Projects/worldlens/commit/21b9e22b7a43f04012373c5b32d028f0e3447d51)

### Desktop shell

- Merge remote-tracking branch 'origin/lane/issue162-gates' - [`c5824a93c8`](https://github.com/Ding-Ding-Projects/worldlens/commit/c5824a93c8cf6c54ac05a2ddbcc05bff95638ac7) _(summary of 6 commits, also listed here)_
- Keep CI render fixture on the Java engine - [`ff39386608`](https://github.com/Ding-Ding-Projects/worldlens/commit/ff393866083b85d7209dbabbe20450c2b8a45663)
- Clear app typecheck errors and trim UI baseline - [`4a57871c5d`](https://github.com/Ding-Ding-Projects/worldlens/commit/4a57871c5d0ca79608a0e92d026b6a0635802b8b)

### Documentation

- Index AWS and Cloudflare documentation - [`ae9199339c`](https://github.com/Ding-Ding-Projects/worldlens/commit/ae9199339cf655f0793f564f5861709c5d4453bc)

## 1.0.1560 - 2026-08-22

Tagged at [`2de2566ebe`](https://github.com/Ding-Ding-Projects/worldlens/commit/2de2566ebe654d9ccb141f19d8de36b8259b9332).

### Interface

- Merge branch 'lane/home-redesign' - [`2de2566ebe`](https://github.com/Ding-Ding-Projects/worldlens/commit/2de2566ebe654d9ccb141f19d8de36b8259b9332) _(summary of 2 commits, also listed here)_
- feat(ui): replace the home page index with a state-led dashboard - [`8f417d73e5`](https://github.com/Ding-Ding-Projects/worldlens/commit/8f417d73e57f2bbf96f4cdc8c4b8be5cb27d6a73)

## 1.0.1558 - 2026-08-22

Tagged at [`b4163b3f3e`](https://github.com/Ding-Ding-Projects/worldlens/commit/b4163b3f3eff1c0de3caa756cd8e13a485e10d53).

### Interface

- Internal maintenance message omitted from the public changelog - [`b4163b3f3e`](https://github.com/Ding-Ding-Projects/worldlens/commit/b4163b3f3eff1c0de3caa756cd8e13a485e10d53)

### Documentation

- Merge branch 'lane/handoff-reconcile-2026-08-22' - [`4140788a4c`](https://github.com/Ding-Ding-Projects/worldlens/commit/4140788a4ce12043c05bcbed3035c23d2d0bc1f3) _(summary of 2 commits, also listed here)_
- Reconcile handoff and roadmap evidence - [`6e6e6aaf48`](https://github.com/Ding-Ding-Projects/worldlens/commit/6e6e6aaf48b2056068373783a1db4c095961d9b3)
- Merge branch 'lane/docs-refresh-2026-08-22' - [`46514f4eb0`](https://github.com/Ding-Ding-Projects/worldlens/commit/46514f4eb0fbee6c09e1a96d6930873d85e10c28) _(summary of 2 commits, also listed here)_
- Refresh documentation indexes and article counts - [`bc7b1afa3e`](https://github.com/Ding-Ding-Projects/worldlens/commit/bc7b1afa3ed81b77d00fbd3f044e7f85dc529d82)

## 1.0.1554 - 2026-08-22

Tagged at [`ec48f79312`](https://github.com/Ding-Ding-Projects/worldlens/commit/ec48f79312428bfeb311f08e4116c39d594aa4af).

### Interface

- Merge branch 'lane/world-generator' - [`ec48f79312`](https://github.com/Ding-Ding-Projects/worldlens/commit/ec48f79312428bfeb311f08e4116c39d594aa4af) _(summary of 5 commits, also listed here)_
- Put the caveat on screen, and make the dialog compile - [`ea3c6e4821`](https://github.com/Ding-Ding-Projects/worldlens/commit/ea3c6e4821ae37a5f47342e02009d7f03aefd0b4)
- Make Generate actually generate, and say loudly what it is not - [`f5a6dbfcb2`](https://github.com/Ding-Ding-Projects/worldlens/commit/f5a6dbfcb2ec31e1de121ae4de952c98184768a7)
- Do not assume the map app has a material shell - [`d90cba33a7`](https://github.com/Ding-Ding-Projects/worldlens/commit/d90cba33a7d9a2b23034f661157b9edff2d0ad5c)
- Merge branch 'lane/ui-aws' - [`62d3518f82`](https://github.com/Ding-Ding-Projects/worldlens/commit/62d3518f8293993ac149dccb0345a67af3dbae56) _(summary of 2 commits, also listed here)_
- feat(ui): wire up the AWS hosting panel nobody could reach, and give it a proper suit - [`e777725db0`](https://github.com/Ding-Ding-Projects/worldlens/commit/e777725db085c254feb4e7989124d874a5a5f3e8)
- Merge branch 'lane/aws-settings' - [`81fc4ed5dd`](https://github.com/Ding-Ding-Projects/worldlens/commit/81fc4ed5ddef613aa49fbacba1ba4dca6eea919b) _(summary of 2 commits, also listed here)_
- feat(settings,palette): wire AWS accounts into Settings and fill palette gaps - [`9c9b027428`](https://github.com/Ding-Ding-Projects/worldlens/commit/9c9b027428c14a06b12dc89302b814772911066a)
- Index the five documents nothing linked to - [`0224cc0b4b`](https://github.com/Ding-Ding-Projects/worldlens/commit/0224cc0b4b61cf923d73a1b14dfe296a68b01fb6)
- Merge branch 'lane/command-builder' - [`4bd8fe5c66`](https://github.com/Ding-Ding-Projects/worldlens/commit/4bd8fe5c669fcd646cbd590c1a2bc0854c2df716) _(summary of 2 commits, also listed here)_
- feat(mcserver): add a fully interactive Minecraft command builder - [`4f1eca5003`](https://github.com/Ding-Ding-Projects/worldlens/commit/4f1eca50039dff75b05753eb8eace0c34b320a22)
- Merge branch 'lane/search-bars' - [`e617ef2630`](https://github.com/Ding-Ding-Projects/worldlens/commit/e617ef2630688787e5d97d922e3568253b0e645f) _(summary of 2 commits, also listed here)_
- feat(ui): add search filters to installed plugins and adoption review; write search-coverage inventory - [`9077dc5093`](https://github.com/Ding-Ding-Projects/worldlens/commit/9077dc509343c2dcd5cbcbf7cfd9e5647ab57dc4)

### Rendering and world data

- Give the map's build-command action a name of its own - [`b8c728bcbc`](https://github.com/Ding-Ding-Projects/worldlens/commit/b8c728bcbcae5b061567aaf0531f4a42544caf9a)

### Desktop shell

- Delete the second world generator, keep the one that was already here - [`06e5579bfe`](https://github.com/Ding-Ding-Projects/worldlens/commit/06e5579bfe406258c439d753d44efeb52fb1ecf7)
- World generator: settings model, plan builder, and GUI dialog (checkpoint, unreconciled duplicate) - [`dc00e3f652`](https://github.com/Ding-Ding-Projects/worldlens/commit/dc00e3f652000be6ead4873fe697715484b72a4a)
- Merge branch 'lane/flavour-configs' - [`f5e7ffa944`](https://github.com/Ding-Ding-Projects/worldlens/commit/f5e7ffa944bbb03f3d959dff9cd3d5401bf8873b) _(summary of 3 commits, also listed here)_
- Add the Velocity proxy configuration schema - [`f77359264f`](https://github.com/Ding-Ding-Projects/worldlens/commit/f77359264fa7b759fe1eb15c92abfef263bb0546)
- Add typed FieldMeta schemas for Paper, Spigot, Bukkit and Purpur YAML configs; preserve in-flight TOML parser wiring - [`31c60dee62`](https://github.com/Ding-Ding-Projects/worldlens/commit/31c60dee62072c84a6655c4a6e895b9e83e36f9b)

### Documentation

- Merge branch 'lane/screenshot-notes' - [`4dd206ad13`](https://github.com/Ding-Ding-Projects/worldlens/commit/4dd206ad13553f6da4a1cd528c66e72ce699877a) _(summary of 2 commits, also listed here)_
- docs: explain the screenshot staleness check and why a moving tree can't be captured - [`017acad805`](https://github.com/Ding-Ding-Projects/worldlens/commit/017acad8051e38ec09765b90d976fce89729c88f)
- Merge branch 'lane/docs-refresh' - [`5918ccb49c`](https://github.com/Ding-Ding-Projects/worldlens/commit/5918ccb49c027ae5030cdab348dfe5070669994f) _(summary of 3 commits, also listed here)_
- docs: describe the live version catalogue and link the screen recording - [`82c88f5a3b`](https://github.com/Ding-Ding-Projects/worldlens/commit/82c88f5a3bfc990784f1f06ae26d0e16a11121e6)
- docs: cover the Minecraft server manager in README, ROADMAP and the site - [`44328b6e03`](https://github.com/Ding-Ding-Projects/worldlens/commit/44328b6e030ff74b3e04c9e934b50d48d63e2939)

## 1.0.1549 - 2026-08-22

Tagged at [`a90f588f7c`](https://github.com/Ding-Ding-Projects/worldlens/commit/a90f588f7c13b93cc43d83acedd116e724a0471d).

### Documentation

- Record the handoff for the server hosting manager - [`a90f588f7c`](https://github.com/Ding-Ding-Projects/worldlens/commit/a90f588f7c13b93cc43d83acedd116e724a0471d)

## 1.0.1542 - 2026-08-22

Tagged at [`9ee1037da5`](https://github.com/Ding-Ding-Projects/worldlens/commit/9ee1037da525105eec0a53e51f57946c17b24533).

### Documentation

- Write down the rule this project is actually built on - [`9ee1037da5`](https://github.com/Ding-Ding-Projects/worldlens/commit/9ee1037da525105eec0a53e51f57946c17b24533)

## 1.0.1541 - 2026-08-22

Tagged at [`f7984e3ac0`](https://github.com/Ding-Ding-Projects/worldlens/commit/f7984e3ac095772ceefc33da3e3449faef3739ce).

### Documentation

- Move the recordings beside the rest of the documentation - [`f7984e3ac0`](https://github.com/Ding-Ding-Projects/worldlens/commit/f7984e3ac095772ceefc33da3e3449faef3739ce)

## 1.0.1540 - 2026-08-22

Tagged at [`4967c08ba4`](https://github.com/Ding-Ding-Projects/worldlens/commit/4967c08ba4b77e161111f3c58513b3ab7559d2d8).

### Documentation

- Publish a screen recording of the app, and say how it was made - [`4967c08ba4`](https://github.com/Ding-Ding-Projects/worldlens/commit/4967c08ba4b77e161111f3c58513b3ab7559d2d8)

## 1.0.1539 - 2026-08-22

Tagged at [`f02370ebb9`](https://github.com/Ding-Ding-Projects/worldlens/commit/f02370ebb9b3965fa1dc0c139de7885d9ab7421f).

### Desktop shell

- Move Paper and Velocity to the API that still exists - [`f02370ebb9`](https://github.com/Ding-Ding-Projects/worldlens/commit/f02370ebb9b3965fa1dc0c139de7885d9ab7421f)

## 1.0.1538 - 2026-08-22

Tagged at [`07dfa52938`](https://github.com/Ding-Ding-Projects/worldlens/commit/07dfa52938838211a8cf408c907754779e70ca74).

### Interface

- Stop the version step arguing with itself - [`07dfa52938`](https://github.com/Ding-Ding-Projects/worldlens/commit/07dfa52938838211a8cf408c907754779e70ca74)

## 1.0.1537 - 2026-08-22

Tagged at [`e2ed371f33`](https://github.com/Ding-Ding-Projects/worldlens/commit/e2ed371f33b49947c6adbbff8b6a870e2611350b).

### Interface

- Add-player dialog picks a known name instead of demanding one be typed - [`e2ed371f33`](https://github.com/Ding-Ding-Projects/worldlens/commit/e2ed371f33b49947c6adbbff8b6a870e2611350b)
- Choose a Minecraft version instead of typing one - [`a2d927e738`](https://github.com/Ding-Ding-Projects/worldlens/commit/a2d927e73812057b7c8a13f15d1d7c1326738850)
- Stop the server wizard asking for things it can answer itself - [`b7ed090986`](https://github.com/Ding-Ding-Projects/worldlens/commit/b7ed090986a29dd8a750ddd8756f2947655a2fea)
- Make the Host Server buttons actually do something - [`289b8e9837`](https://github.com/Ding-Ding-Projects/worldlens/commit/289b8e9837fda1b99d0ac1fc790253afe0d32008)

### Desktop shell

- Refuse a version cache written before the fields this build reads - [`4490154de7`](https://github.com/Ding-Ding-Projects/worldlens/commit/4490154de7d70d08766e672013abc8c1914de09e)

### Landing page and documentation site

- Repair the site's red typecheck and its stale vocabulary tests - [`fcc7de483b`](https://github.com/Ding-Ding-Projects/worldlens/commit/fcc7de483b9bda1ecb2314ffbaeb1fe277383ef9)

## 1.0.1525 - 2026-08-21

Tagged at [`464b95892c`](https://github.com/Ding-Ding-Projects/worldlens/commit/464b95892c7951b4fa7989e30d6c7fbf0c1d9803).

### Build, release and tooling

- Stop tracking a linked worktree I accidentally committed into main - [`464b95892c`](https://github.com/Ding-Ding-Projects/worldlens/commit/464b95892c7951b4fa7989e30d6c7fbf0c1d9803)

## 1.0.1524 - 2026-08-21

Tagged at [`e7eb996b28`](https://github.com/Ding-Ding-Projects/worldlens/commit/e7eb996b28942acc8b25751bf77b8eaefb96e844).

### Desktop shell

- Read every AWS account this machine can reach, and be honest about credits - [`e7eb996b28`](https://github.com/Ding-Ding-Projects/worldlens/commit/e7eb996b28942acc8b25751bf77b8eaefb96e844)

## 1.0.1521 - 2026-08-21

Tagged at [`d46480a50d`](https://github.com/Ding-Ding-Projects/worldlens/commit/d46480a50df3a8d9aa066f7636162e7a6363cc14).

### Interface

- Wire AWS's known-hosts file, and clear one lint error - [`d46480a50d`](https://github.com/Ding-Ding-Projects/worldlens/commit/d46480a50df3a8d9aa066f7636162e7a6363cc14)

## 1.0.1519 - 2026-08-21

Tagged at [`3b4152de95`](https://github.com/Ding-Ding-Projects/worldlens/commit/3b4152de9512e8b1df5cb3d3e6ae01d5b70fb226).

### Desktop shell

- Merge branch 'lane/mcserver-aws': a fourth place to run a server - [`3b4152de95`](https://github.com/Ding-Ding-Projects/worldlens/commit/3b4152de9512e8b1df5cb3d3e6ae01d5b70fb226) _(summary of 2 commits, also listed here)_
- feat(mcserver): add AWS EC2 as a fourth server hosting target - [`0c404bfe1d`](https://github.com/Ding-Ding-Projects/worldlens/commit/0c404bfe1ddfc6bfa6cbb7250654c3eb8d15f1c3)

## 1.0.1515 - 2026-08-21

Tagged at [`5176cd7175`](https://github.com/Ding-Ding-Projects/worldlens/commit/5176cd71758ccd64438774b01947a60e131be3f8).

### Interface

- Test split rendering properly, and find the bug the examples missed - [`5176cd7175`](https://github.com/Ding-Ding-Projects/worldlens/commit/5176cd71758ccd64438774b01947a60e131be3f8)

## 1.0.1512 - 2026-08-21

Tagged at [`84eb4596d0`](https://github.com/Ding-Ding-Projects/worldlens/commit/84eb4596d0bce6418176e987ca4dd7d48c519b46).

### Interface

- Give Host Server somewhere to actually go - [`84eb4596d0`](https://github.com/Ding-Ding-Projects/worldlens/commit/84eb4596d0bce6418176e987ca4dd7d48c519b46)

## 1.0.1511 - 2026-08-21

Tagged at [`2ee5c03192`](https://github.com/Ding-Ding-Projects/worldlens/commit/2ee5c031929e5e158f4d07ba9de8b136785d7c8b).

### Desktop shell

- Bridge the config layer, so no surface needs a schema of its own - [`2ee5c03192`](https://github.com/Ding-Ding-Projects/worldlens/commit/2ee5c031929e5e158f4d07ba9de8b136785d7c8b)

## 1.0.1510 - 2026-08-21

Tagged at [`10357c4423`](https://github.com/Ding-Ding-Projects/worldlens/commit/10357c44231474718aa5b7026c93435e1d3d7583).

### Interface

- Merge branch 'lane/ui-wizard': a wizard that asks real questions - [`10357c4423`](https://github.com/Ding-Ding-Projects/worldlens/commit/10357c44231474718aa5b7026c93435e1d3d7583) _(summary of 2 commits, also listed here)_
- feat(ui): real multi-step create-server wizard and card-based server list - [`8ed396f7dc`](https://github.com/Ding-Ding-Projects/worldlens/commit/8ed396f7dc1fdd630f51e6c4ef3f2626d6772959)

## 1.0.1508 - 2026-08-21

Tagged at [`565019294d`](https://github.com/Ding-Ding-Projects/worldlens/commit/565019294d6a20bdc9d3b1855eba1259c3f982c9).

### Interface

- Merge branch 'lane/ui-panels': the panels stop being placeholders - [`565019294d`](https://github.com/Ding-Ding-Projects/worldlens/commit/565019294d6a20bdc9d3b1855eba1259c3f982c9) _(summary of 2 commits, also listed here)_
- feat(ui): wire the mcserver panels to the real bridge, not just its shadow - [`146c23139d`](https://github.com/Ding-Ding-Projects/worldlens/commit/146c23139d482f6d0dd3db7658aca8f9ecd4af6c)

## 1.0.1506 - 2026-08-21

Tagged at [`4e2dcd737d`](https://github.com/Ding-Ding-Projects/worldlens/commit/4e2dcd737de32771a2f87d77bea5c794a35b9c51).

### Interface

- Add a refresh button, and finish the owner fix I only half did - [`4e2dcd737d`](https://github.com/Ding-Ding-Projects/worldlens/commit/4e2dcd737de32771a2f87d77bea5c794a35b9c51)

## 1.0.1504 - 2026-08-21

Tagged at [`db69d9c312`](https://github.com/Ding-Ding-Projects/worldlens/commit/db69d9c312c97125f4e99abcca5408f5ff202cc9).

### Interface

- Make choosing an organization actually change the repository list - [`db69d9c312`](https://github.com/Ding-Ding-Projects/worldlens/commit/db69d9c312c97125f4e99abcca5408f5ff202cc9)

## 1.0.1502 - 2026-08-21

Tagged at [`76495cf609`](https://github.com/Ding-Ding-Projects/worldlens/commit/76495cf6091c083fb9eaf794e84014b6f4baa264).

### Desktop shell

- Give the missing Java runtime a button instead of a shrug - [`76495cf609`](https://github.com/Ding-Ding-Projects/worldlens/commit/76495cf6091c083fb9eaf794e84014b6f4baa264)

## 1.0.1500 - 2026-08-21

Tagged at [`e4e3779fb8`](https://github.com/Ding-Ding-Projects/worldlens/commit/e4e3779fb87c7481692635977327937f7b591c26).

### Interface

- Stop the vocabulary eating words, and stop the progress line moving - [`e4e3779fb8`](https://github.com/Ding-Ding-Projects/worldlens/commit/e4e3779fb87c7481692635977327937f7b591c26)

## 1.0.1498 - 2026-08-21

Tagged at [`4a49213ee9`](https://github.com/Ding-Ding-Projects/worldlens/commit/4a49213ee9fae1f66f9ff500e63399d0004334bf).

### Interface

- Let a project say where it renders, where it is served, and on whose domain - [`52937c75ce`](https://github.com/Ding-Ding-Projects/worldlens/commit/52937c75ce6298109e43d42ccadd22e7077b2bb7)

### Desktop shell

- Clear the lint the seven lanes left behind - [`4a49213ee9`](https://github.com/Ding-Ding-Projects/worldlens/commit/4a49213ee9fae1f66f9ff500e63399d0004334bf)
- Merge branch 'feat/aws-render' - [`1e8a5c8bbc`](https://github.com/Ding-Ding-Projects/worldlens/commit/1e8a5c8bbcbe8066ff670e520fb4ee99b4eb6f3e) _(summary of 8 commits, also listed here)_
- Put a map on your own domain, and out of your own house - [`d56989d353`](https://github.com/Ding-Ding-Projects/worldlens/commit/d56989d353c53db141a6f7ec6a046fe568c6dbee)
- Hold the one credential this app is actually responsible for - [`4aa52af25c`](https://github.com/Ding-Ding-Projects/worldlens/commit/4aa52af25c1ebca682ddddcb4088e6e6d4433471)
- Show the bill before creating anything that sends one - [`014acab9e3`](https://github.com/Ding-Ding-Projects/worldlens/commit/014acab9e3d96ae32b763279a35ea9ee8119211d)
- Run a render on AWS Batch, and tell the truth about what it is doing - [`532b2d51fd`](https://github.com/Ding-Ding-Projects/worldlens/commit/532b2d51fdc7e18e02b6765a01b90a563a4c175f)
- Teach cloud rendering that GitHub is a place, not the only place - [`c78acd1e4e`](https://github.com/Ding-Ding-Projects/worldlens/commit/c78acd1e4e17f05046c1747a3b89da8ea0bce4fa)
- Start Docker from the button, and stop blaming Docker for SSH - [`a86e780e7a`](https://github.com/Ding-Ding-Projects/worldlens/commit/a86e780e7a37e90ecf17b2ebcaaf850d4450cbd5)

### Documentation

- Write down what the AWS and Cloudflare routes actually do, and fix a doc that lied - [`a961463402`](https://github.com/Ding-Ding-Projects/worldlens/commit/a9614634020209e132d13487580c71b5a8afe637)

## 1.0.1491 - 2026-08-21

Tagged at [`4efb00a166`](https://github.com/Ding-Ding-Projects/worldlens/commit/4efb00a1664b5654ab188bb126e372233d0a4208).

### Interface

- feat(ui): Minecraft server hosting screens, wired end to end - [`fd7fd36fbb`](https://github.com/Ding-Ding-Projects/worldlens/commit/fd7fd36fbb9b385e4369190e5442fc68c0226df1)

### Documentation

- Merge branch 'lane/mcserver-ui' properly, recording the parent it lost - [`4efb00a166`](https://github.com/Ding-Ding-Projects/worldlens/commit/4efb00a1664b5654ab188bb126e372233d0a4208) _(summary of 2 commits, also listed here)_

## 1.0.1490 - 2026-08-21

Tagged at [`ef851c6af4`](https://github.com/Ding-Ding-Projects/worldlens/commit/ef851c6af465e09831bcce67a68069c2f65a471e).

### Interface

- Merge branch 'lane/mcserver-ui' - [`92d2ebcbb7`](https://github.com/Ding-Ding-Projects/worldlens/commit/92d2ebcbb7280f5e8958a78117590be577ec636e)

### Desktop shell

- Merge branch 'feat/mcserver': run Minecraft servers, not only draw their maps - [`ef851c6af4`](https://github.com/Ding-Ding-Projects/worldlens/commit/ef851c6af465e09831bcce67a68069c2f65a471e) _(summary of 22 commits, also listed here)_
- Merge branch 'lane/mcserver-adopt' - [`f729de791f`](https://github.com/Ding-Ding-Projects/worldlens/commit/f729de791f187f9329eef393f36b946f48d210ca) _(summary of 2 commits, also listed here)_
- feat(mcserver): adopt existing Docker containers, plus world/backup handling - [`efa1d6722c`](https://github.com/Ding-Ding-Projects/worldlens/commit/efa1d6722cc860af87313f68a64937356f434db6)
- Merge branch 'lane/mcserver-console' - [`74341a5f00`](https://github.com/Ding-Ding-Projects/worldlens/commit/74341a5f0023b7a9b5019a0bef14f409a1b5378d) _(summary of 2 commits, also listed here)_
- feat(mcserver): add RCON client, console supervisor and player management - [`b5321248cd`](https://github.com/Ding-Ding-Projects/worldlens/commit/b5321248cd681252f6fb4205e67bb5aba59f6963)
- Merge branch 'lane/mcserver-webconsole' - [`665a4dfab1`](https://github.com/Ding-Ding-Projects/worldlens/commit/665a4dfab189b871a0a3043251226e4bc9ad1169) _(summary of 2 commits, also listed here)_
- feat(mcserver): add password-gated web console with the full unlock ladder - [`db7ac20a71`](https://github.com/Ding-Ding-Projects/worldlens/commit/db7ac20a7116c824a2bf506146aa4c1d3fd2d5e5)
- Merge branch 'lane/mcserver-flavours' - [`382b8c3f56`](https://github.com/Ding-Ding-Projects/worldlens/commit/382b8c3f56f73e4fca5aab12352b4b26d7de2aba) _(summary of 2 commits, also listed here)_
- feat(mcserver): fetch real flavour catalogues and wire up server creation - [`361bcb2ae6`](https://github.com/Ding-Ding-Projects/worldlens/commit/361bcb2ae636e99812501ea615143eb0a60a034e)
- Merge branch 'lane/mcserver-plugins' - [`ad7efb2c83`](https://github.com/Ding-Ding-Projects/worldlens/commit/ad7efb2c83164c0c8d711d14e5a8a5c5d7f58bf9) _(summary of 2 commits, also listed here)_
- feat(mcserver): add plugin/mod browsing and installs from Modrinth, Hangar and SpigotMC - [`04d48178a1`](https://github.com/Ding-Ding-Projects/worldlens/commit/04d48178a1c48d0369d7b2d8278ee0d9b4dc7580)
- Merge branch 'lane/mcserver-config' - [`fceff8a4b2`](https://github.com/Ding-Ding-Projects/worldlens/commit/fceff8a4b21356d5152617bb00930699c47f8004) _(summary of 2 commits, also listed here)_
- feat(mcserver): typed config document model and server.properties schema - [`bd0c709c6a`](https://github.com/Ding-Ding-Projects/worldlens/commit/bd0c709c6ad3c5e332b895f88713e73bb0fc566d)
- Give the server module one front door - [`a40f07a17a`](https://github.com/Ding-Ding-Projects/worldlens/commit/a40f07a17ab22ba8682c349416c7f0c0f46dcf5f)
- Make the server layer reachable, and prove it is actually plugged in - [`2962022fb0`](https://github.com/Ding-Ding-Projects/worldlens/commit/2962022fb0ef8d5b2cb4e5a9b8cf06159544f175)
- Reach a container's server, whether the daemon is here or in another country - [`8c718cd3df`](https://github.com/Ding-Ding-Projects/worldlens/commit/8c718cd3df50f555ba195185c38c650e356d0a9b)
- Run a server as a local process, and teach scope.ts that Windows exists - [`950d940f24`](https://github.com/Ding-Ding-Projects/worldlens/commit/950d940f245fc00e449a951484671305d21bf375)
- Internal maintenance message omitted from the public changelog - [`f6524ab4fe`](https://github.com/Ding-Ding-Projects/worldlens/commit/f6524ab4fe05bf3b9343dcbd05ba7d9212bb62d1)

### Documentation

- Tell the README the app is learning to run servers, not just draw them - [`e2c55e53da`](https://github.com/Ding-Ding-Projects/worldlens/commit/e2c55e53dab9d4d953a84c996ee69e8ce2e74362)
- Document the transport layer, including what it has not proven - [`4656287027`](https://github.com/Ding-Ding-Projects/worldlens/commit/465628702770615706a538fcd993185929b516aa)
- Record the server manager on the roadmap, with its evidence boundary - [`70949c1c36`](https://github.com/Ding-Ding-Projects/worldlens/commit/70949c1c3620f06193647b1e45d9ed1279d57c24)

## 1.0.1481 - 2026-08-21

Tagged at [`3182146332`](https://github.com/Ding-Ding-Projects/worldlens/commit/318214633224df7b8052cfb598edb7842ea9dda0).

### Rendering and world data

- Run the tests the speed pass skipped, and fix what they caught - [`3182146332`](https://github.com/Ding-Ding-Projects/worldlens/commit/318214633224df7b8052cfb598edb7842ea9dda0)

## 1.0.1471 - 2026-08-21

Tagged at [`50983bfd7f`](https://github.com/Ding-Ding-Projects/worldlens/commit/50983bfd7f54f43874e47b3d72efe8d52d170bc0).

### Interface

- Merge branch 'lane/adult-default' - [`50983bfd7f`](https://github.com/Ding-Ding-Projects/worldlens/commit/50983bfd7f54f43874e47b3d72efe8d52d170bc0) _(summary of 2 commits, also listed here)_
- Open in Adult Mode on a fresh install - [`f3dc0d765e`](https://github.com/Ding-Ding-Projects/worldlens/commit/f3dc0d765ebf7525c8e28de32648ce5d16ffb217)

### Landing page and documentation site

- Merge branch 'lane/site-refresh' - [`e03f05390e`](https://github.com/Ding-Ding-Projects/worldlens/commit/e03f05390e1f5c5919e7560c6dd95473c5cd156c) _(summary of 2 commits, also listed here)_
- site: register the orphaned issue-139 capture and link the orphaned engine-choice article - [`519fc13fb7`](https://github.com/Ding-Ding-Projects/worldlens/commit/519fc13fb7ee1888bdab05ea62673caf47212a9c)

## 1.0.1468 - 2026-08-21

Tagged at [`4e700ec360`](https://github.com/Ding-Ding-Projects/worldlens/commit/4e700ec3605b415201439e1af33b1add26c935ff).

### Documentation

- Move the capture inventory's hand-written total to 229 - [`4e700ec360`](https://github.com/Ding-Ding-Projects/worldlens/commit/4e700ec3605b415201439e1af33b1add26c935ff)

## 1.0.1464 - 2026-08-21

Tagged at [`9d0c0944d5`](https://github.com/Ding-Ding-Projects/worldlens/commit/9d0c0944d5e7ba429bbffa6ad7a7291fc1dfaebc).

### Interface

- Merge branch 'lane/reauth' - [`3baea57b4b`](https://github.com/Ding-Ding-Projects/worldlens/commit/3baea57b4bdf6b3105daa98e56a3268e44e71ddb) _(summary of 2 commits, also listed here)_
- Stop telling a rate-limited upload to go reauthenticate; retry it instead - [`b905a5d47e`](https://github.com/Ding-Ding-Projects/worldlens/commit/b905a5d47ef8479a0234aeeb2fc70796d2018042)
- Connect toy locks to the shell, and make a locked element actually locked - [`f53399e9a3`](https://github.com/Ding-Ding-Projects/worldlens/commit/f53399e9a39285fa82c9fd210c33efcdbacd7d8a)
- Merge branch 'lane/clone' - [`b19e512802`](https://github.com/Ding-Ding-Projects/worldlens/commit/b19e512802b57505e5b4161c9228c827bebc8d58) _(summary of 2 commits, also listed here)_
- fix(ui): name which bridge call failed in the project save banner - [`26ffea6fc7`](https://github.com/Ding-Ding-Projects/worldlens/commit/26ffea6fc765c1ceea2f662fd49351d99f50312f)
- Merge branch 'lane/pages' - [`e739df1a4c`](https://github.com/Ding-Ding-Projects/worldlens/commit/e739df1a4cfc2860ad839c3603c0d3c9a4c296bd) _(summary of 2 commits, also listed here)_
- Catch Pages-publish 404s the root-URL probe can never see - [`67dfc9786d`](https://github.com/Ding-Ding-Projects/worldlens/commit/67dfc9786d65ff8dd6914d58b12a6e8a1d96e04e)
- Show the cloud-config refusal inside its dialog, and the upload as it happens - [`7b6afc048f`](https://github.com/Ding-Ding-Projects/worldlens/commit/7b6afc048f8104c4496ac5319b01d73b527a42a1)
- Render worlds of any size by uploading them as 1.5 GB verified parts - [`e75736d229`](https://github.com/Ding-Ding-Projects/worldlens/commit/e75736d229b1b6422eae5a7babc9981bfbc1f9ce)
- Merge current main before issue-80 continuation - [`44a5e5cf2b`](https://github.com/Ding-Ding-Projects/worldlens/commit/44a5e5cf2b396df7933e1a38498ad94db65b35e7) _(summary of 63 commits, also listed here)_
- Merge the shared Kid-mode transition repair - [`05886abbc7`](https://github.com/Ding-Ding-Projects/worldlens/commit/05886abbc75f432ead4b6acbff0e83ec00f65422) _(summary of 2 commits, also listed here)_
- Keep shared mode transitions honest across the Kid surface - [`db9e7e8544`](https://github.com/Ding-Ding-Projects/worldlens/commit/db9e7e85448cd422f7e78b4f2011360d25d05dfc)
- Merge the reviewed issue-reporting surface - [`03c2c3a0ea`](https://github.com/Ding-Ding-Projects/worldlens/commit/03c2c3a0ea28384a3547492bd7351564fb59edb0) _(summary of 2 commits, also listed here)_
- Mount reviewed issue reporting surface - [`ea3222be51`](https://github.com/Ding-Ding-Projects/worldlens/commit/ea3222be51f6a61eca51a09de459c84c4e3925b5)
- fix(ui): clone project payloads before IPC - [`261c528b32`](https://github.com/Ding-Ding-Projects/worldlens/commit/261c528b32832be8b4aff8059455509ba79b536e)
- Merge the save-clone IPC safety repair - [`0c78fc4a6e`](https://github.com/Ding-Ding-Projects/worldlens/commit/0c78fc4a6e38b5dae5e418aa163978209929771d) _(summary of 2 commits, also listed here)_
- fix(ui): clone project payloads before IPC - [`fe1dec62e1`](https://github.com/Ding-Ding-Projects/worldlens/commit/fe1dec62e1aea10accc988658ee39af76d995d8f)

### Rendering and world data

- fix(viewer): stop map WASD controls from eating keystrokes typed into text fields - [`06c6d0e96a`](https://github.com/Ding-Ding-Projects/worldlens/commit/06c6d0e96ad37750d28acdc12cb9891201e2c76d)

### Desktop shell

- Merge branch 'lane/pause' - [`7d67272bb4`](https://github.com/Ding-Ding-Projects/worldlens/commit/7d67272bb41d092283c12c2d456fb1fce41e98c3) _(summary of 2 commits, also listed here)_
- Give the backup pipeline a real pause, and stop the split re-cutting 8.69 GB on every resume - [`b1dcb86d13`](https://github.com/Ding-Ding-Projects/worldlens/commit/b1dcb86d1361486659883df95f2d9525efd97c2c)
- Merge branch 'lane/artifact' - [`fa3b5c32c5`](https://github.com/Ding-Ding-Projects/worldlens/commit/fa3b5c32c5b6810c51620d9ce9814c33a2ecf22a) _(summary of 2 commits, also listed here)_
- Make the unregistered-CI-map refusal say what it actually found - [`1629cd69e5`](https://github.com/Ding-Ding-Projects/worldlens/commit/1629cd69e53ff43f5b8f51d198e5a796b42405b5)
- Merge verified artifact recovery for failed render runs - [`4bda51bbf7`](https://github.com/Ding-Ding-Projects/worldlens/commit/4bda51bbf7ef00f29d0b706eb92bde969420f9ea) _(summary of 2 commits, also listed here)_
- Recover verified maps from Pages-only render failures - [`37fda1177d`](https://github.com/Ding-Ding-Projects/worldlens/commit/37fda1177dcbb3980b4cb72bb9266423beaebe33)
- Merge the privacy-safe issue-reporting bridge - [`296f5fc974`](https://github.com/Ding-Ding-Projects/worldlens/commit/296f5fc974fc79b9daf78806d9d0916b814ca475) _(summary of 2 commits, also listed here)_
- Wire privacy-safe diagnostic issue reporting bridge - [`d223f946b7`](https://github.com/Ding-Ding-Projects/worldlens/commit/d223f946b787259cb26a947d79a792c2cb5a6425)
- Merge packaged TypeScript renderer dependency staging - [`d0153330ec`](https://github.com/Ding-Ding-Projects/worldlens/commit/d0153330ec46c12ed9ae06ae4895b1ca78fe4475) _(summary of 2 commits, also listed here)_
- Stage TypeScript render runtime dependencies in the package - [`de679bc2c8`](https://github.com/Ding-Ding-Projects/worldlens/commit/de679bc2c88dc48f27e3d7d681a3a1fcd77a5670)
- Harden profile migration recovery and receipts - [`f803b814e2`](https://github.com/Ding-Ding-Projects/worldlens/commit/f803b814e252b8fec9dd42e108642728657fd639)
- Harden profile migration recovery and receipts - [`9e1a5309c4`](https://github.com/Ding-Ding-Projects/worldlens/commit/9e1a5309c4793c110e0ccfb16236cc81487f1be9)
- Repair managed map publication workflow - [`2adea2747a`](https://github.com/Ding-Ding-Projects/worldlens/commit/2adea2747a970f3f8f3415f8e019a13635bdc0f2)
- Merge the managed render workflow repair - [`fda617e5d0`](https://github.com/Ding-Ding-Projects/worldlens/commit/fda617e5d0227a05bfef4c38245c5a5562ab658c) _(summary of 2 commits, also listed here)_
- Repair managed map publication workflow - [`eb4272c877`](https://github.com/Ding-Ding-Projects/worldlens/commit/eb4272c87711cd20a7585a9424868a1c06facf4e)

### Landing page and documentation site

- Merge the Pages hydration proof - [`95f27fe311`](https://github.com/Ding-Ding-Projects/worldlens/commit/95f27fe3115f325252088c4c68ec3ffae6bb1b16) _(summary of 2 commits, also listed here)_
- Internal maintenance message omitted from the public changelog - [`59057c15d2`](https://github.com/Ding-Ding-Projects/worldlens/commit/59057c15d282de0047254fc0937d63148280972b)

### Build, release and tooling

- Internal maintenance message omitted from the public changelog - [`0eb136de7e`](https://github.com/Ding-Ding-Projects/worldlens/commit/0eb136de7e65afa5acac775eafc965a603091a3f) _(summary of 2 commits, also listed here)_

### Documentation

- Register the issue 139 capture, and recapture it from the real build - [`9d0c0944d5`](https://github.com/Ding-Ding-Projects/worldlens/commit/9d0c0944d5e7ba429bbffa6ad7a7291fc1dfaebc)
- Merge the issue 80 evidence correction - [`a4ea5ec1b3`](https://github.com/Ding-Ding-Projects/worldlens/commit/a4ea5ec1b335cba4b520b4514bc3e1d5b1d79043) _(summary of 2 commits, also listed here)_
- Clarify Issue #80 source versus packaged evidence - [`b9598583d6`](https://github.com/Ding-Ding-Projects/worldlens/commit/b9598583d6575f9c2962fc697d16d907ca18d7de)
- Correct render-engine documentation with the open wiring audit - [`9b4f825797`](https://github.com/Ding-Ding-Projects/worldlens/commit/9b4f825797b921a4755636b8e89a5ccff7c70cdb)
- Document public update-feed continuity - [`ea13d441ac`](https://github.com/Ding-Ding-Projects/worldlens/commit/ea13d441ac2ebc4558b44a56ca1c45701f93b22c)
- Document public update-feed continuity - [`38a3f92664`](https://github.com/Ding-Ding-Projects/worldlens/commit/38a3f9266461598cd2c07d25b5ed46d911478e9d)
- Internal maintenance message omitted from the public changelog - [`209f9624a3`](https://github.com/Ding-Ding-Projects/worldlens/commit/209f9624a3302c9f0c138dfdf47d1fff98d01d81) _(summary of 2 commits, also listed here)_
- Record the issue 62 cleanup evidence boundary - [`0d16a2ed08`](https://github.com/Ding-Ding-Projects/worldlens/commit/0d16a2ed080195c9cd976107cf0011aec3e3ebce)
- Merge the save-render workflow and evidence lane - [`2bd480f0d9`](https://github.com/Ding-Ding-Projects/worldlens/commit/2bd480f0d91cb7d6d59083b7f3dc602b1d55e36f) _(summary of 4 commits, also listed here)_
- Internal maintenance message omitted from the public changelog - [`75f2197df3`](https://github.com/Ding-Ding-Projects/worldlens/commit/75f2197df3bc888e5df9e4a05fd6b0ca9dccb316)

### Elsewhere in the repository

- Merge the privacy reporting history marker - [`3f424746e7`](https://github.com/Ding-Ding-Projects/worldlens/commit/3f424746e7c6fdd2f79047142ddce7ade4803843) _(summary of 2 commits, also listed here)_
- Merge the render-engine documentation audit - [`6e4de2af06`](https://github.com/Ding-Ding-Projects/worldlens/commit/6e4de2af065392e967dbe4d1af32c3efee1aed42) _(summary of 2 commits, also listed here)_
- Merge the alternate migration lane history - [`436c82b3f4`](https://github.com/Ding-Ding-Projects/worldlens/commit/436c82b3f4ef36fea9985afe3f9a09e73f39c929) _(summary of 3 commits, also listed here)_
- Merge the profile migration recovery hardening - [`2391662229`](https://github.com/Ding-Ding-Projects/worldlens/commit/23916622290625e77beedc20d54c06faf420bf52) _(summary of 3 commits, also listed here)_
- Merge the runtime reachability regression proof - [`ba7de25e4f`](https://github.com/Ding-Ding-Projects/worldlens/commit/ba7de25e4ffcd01644cea464b4e17292a17a4156) _(summary of 2 commits, also listed here)_

## 1.0.1420 - 2026-08-19

Tagged at [`e400633874`](https://github.com/Ding-Ding-Projects/worldlens/commit/e40063387404ebbf97ce50403d99d3e072d93eab).

### Documentation

- Integrate Issue 78 engine records - [`e400633874`](https://github.com/Ding-Ding-Projects/worldlens/commit/e40063387404ebbf97ce50403d99d3e072d93eab) _(summary of 2 commits, also listed here)_
- Reconcile Issue 78 engine records - [`cac8017ad7`](https://github.com/Ding-Ding-Projects/worldlens/commit/cac8017ad7f4682038757b9603c704188488626a)

## 1.0.1418 - 2026-08-19

Tagged at [`80eefd172d`](https://github.com/Ding-Ding-Projects/worldlens/commit/80eefd172d35b9329f95b464e20b56d415826025).

### Desktop shell

- Integrate the packaged TypeScript runtime closure - [`80eefd172d`](https://github.com/Ding-Ding-Projects/worldlens/commit/80eefd172d35b9329f95b464e20b56d415826025) _(summary of 3 commits, also listed here)_
- Stage the TypeScript runtime dependency closure - [`f4872eeeaa`](https://github.com/Ding-Ding-Projects/worldlens/commit/f4872eeeaac81a9db5edab94121f4612e83b9c90)
- Stage workspace packages for TypeScript engine - [`728bca0b7d`](https://github.com/Ding-Ding-Projects/worldlens/commit/728bca0b7d448be66a38c49c24d52c29bd9f6844)

## 1.0.1416 - 2026-08-19

Tagged at [`e3cf7f30b4`](https://github.com/Ding-Ding-Projects/worldlens/commit/e3cf7f30b40989d83a6b8833b1f42894efa55623).

### Interface

- Integrate global engine choice for new projects - [`e3cf7f30b4`](https://github.com/Ding-Ding-Projects/worldlens/commit/e3cf7f30b40989d83a6b8833b1f42894efa55623) _(summary of 2 commits, also listed here)_
- Honor the global engine choice for new projects - [`91fde17cc4`](https://github.com/Ding-Ding-Projects/worldlens/commit/91fde17cc4ab20344df9a063f563ce941cc6bfbd)

## 1.0.1411 - 2026-08-19

Tagged at [`36c1d4d7c9`](https://github.com/Ding-Ding-Projects/worldlens/commit/36c1d4d7c97cfe05ff9ef5b273125317a8a92224).

### Documentation

- Integrate Issue 84 navigation record correction - [`36c1d4d7c9`](https://github.com/Ding-Ding-Projects/worldlens/commit/36c1d4d7c97cfe05ff9ef5b273125317a8a92224) _(summary of 2 commits, also listed here)_
- Correct Issue 84 navigation records - [`c7d05989c9`](https://github.com/Ding-Ding-Projects/worldlens/commit/c7d05989c98e160c184632a75cb0f73869cc2735)

## 1.0.1406 - 2026-08-19

Tagged at [`44080e74cf`](https://github.com/Ding-Ding-Projects/worldlens/commit/44080e74cf5bb48152fff15e36d9f4a35bf37bcd).

### Documentation

- Integrate render history audit correction - [`44080e74cf`](https://github.com/Ding-Ding-Projects/worldlens/commit/44080e74cf5bb48152fff15e36d9f4a35bf37bcd) _(summary of 2 commits, also listed here)_
- Clarify render-history storage records - [`e2895acfb3`](https://github.com/Ding-Ding-Projects/worldlens/commit/e2895acfb3c22f999f355e907f00d2662d5235be)

## 1.0.1405 - 2026-08-19

Tagged at [`c067621ef3`](https://github.com/Ding-Ding-Projects/worldlens/commit/c067621ef3e0838ee54d9b16f86634004c786c11).

### Documentation

- Integrate banner renderer boundary records - [`c067621ef3`](https://github.com/Ding-Ding-Projects/worldlens/commit/c067621ef3e0838ee54d9b16f86634004c786c11) _(summary of 2 commits, also listed here)_
- Clarify banner acceptance renderer boundary - [`1df406a84b`](https://github.com/Ding-Ding-Projects/worldlens/commit/1df406a84bf27c20e72ea62a37df8fb3c5428d20)
- Integrate account-routing records correction - [`cabb2d5624`](https://github.com/Ding-Ding-Projects/worldlens/commit/cabb2d56241889b0f4bb7c6d691e15c04d38f04f) _(summary of 2 commits, also listed here)_
- Reconcile Issue 52 account restoration records - [`c3ebb488a2`](https://github.com/Ding-Ding-Projects/worldlens/commit/c3ebb488a229ddba812c7ba027b0f888170c3eeb)

## 1.0.1404 - 2026-08-19

Tagged at [`a8c6ead546`](https://github.com/Ding-Ding-Projects/worldlens/commit/a8c6ead546311b245a3292e805f6c20ca3389bdf).

### Documentation

- Integrate packaged Docker IPC evidence - [`a8c6ead546`](https://github.com/Ding-Ding-Projects/worldlens/commit/a8c6ead546311b245a3292e805f6c20ca3389bdf) _(summary of 2 commits, also listed here)_
- docs: record packaged Docker IPC proof - [`8bca0774ae`](https://github.com/Ding-Ding-Projects/worldlens/commit/8bca0774ae48912df990303a90a848d3939c59a6)

## 1.0.1398 - 2026-08-19

Tagged at [`761d9c5be8`](https://github.com/Ding-Ding-Projects/worldlens/commit/761d9c5be80475908093554da2174a6de13c2c6f).

### Documentation

- Integrate packaged ledger runtime evidence - [`761d9c5be8`](https://github.com/Ding-Ding-Projects/worldlens/commit/761d9c5be80475908093554da2174a6de13c2c6f) _(summary of 2 commits, also listed here)_
- Record packaged release ledger runtime proof - [`cd38fbedd3`](https://github.com/Ding-Ding-Projects/worldlens/commit/cd38fbedd3ef1d9d6f00c9b20bcb72bad4d636a6)

## 1.0.1394 - 2026-08-19

Tagged at [`ad07eb0aea`](https://github.com/Ding-Ding-Projects/worldlens/commit/ad07eb0aea6fd0e31aeb7ac59235eaf103860a39).

### Desktop shell

- Integrate absolute packaged-profile validation - [`ad07eb0aea`](https://github.com/Ding-Ding-Projects/worldlens/commit/ad07eb0aea6fd0e31aeb7ac59235eaf103860a39) _(summary of 2 commits, also listed here)_
- Require absolute direct-launch profiles - [`36fabc542a`](https://github.com/Ding-Ding-Projects/worldlens/commit/36fabc542a95a89a915e675bd92d8e3547e0027d)

## 1.0.1392 - 2026-08-19

Tagged at [`06a9fda182`](https://github.com/Ding-Ding-Projects/worldlens/commit/06a9fda1823672ef4feaa8d3f681550c5fff8074).

### Desktop shell

- Integrate safe packaged direct-launch seam - [`06a9fda182`](https://github.com/Ding-Ding-Projects/worldlens/commit/06a9fda1823672ef4feaa8d3f681550c5fff8074) _(summary of 2 commits, also listed here)_
- Add a safe direct-launch smoke switch - [`f361b377e6`](https://github.com/Ding-Ding-Projects/worldlens/commit/f361b377e667ed2b505626158e507cd582f38829)

## 1.0.1388 - 2026-08-19

Tagged at [`ce80f03c7c`](https://github.com/Ding-Ding-Projects/worldlens/commit/ce80f03c7c86612afcdf9d882037eac87fb24c89).

### Documentation

- Integrate Docker lifecycle proof records - [`ce80f03c7c`](https://github.com/Ding-Ding-Projects/worldlens/commit/ce80f03c7c86612afcdf9d882037eac87fb24c89) _(summary of 2 commits, also listed here)_
- Record Issue 69 daemon lifecycle proof - [`b817845833`](https://github.com/Ding-Ding-Projects/worldlens/commit/b817845833142501dbed2fbb21a8be3a9e0272e7)

## 1.0.1386 - 2026-08-19

Tagged at [`35a70b5f47`](https://github.com/Ding-Ding-Projects/worldlens/commit/35a70b5f47455350e3d77ecee348c617eb02cf56).

### Documentation

- Integrate Docker evidence baseline correction - [`35a70b5f47`](https://github.com/Ding-Ding-Projects/worldlens/commit/35a70b5f47455350e3d77ecee348c617eb02cf56) _(summary of 2 commits, also listed here)_
- Refresh Issue 69 evidence baseline - [`4db4d3317a`](https://github.com/Ding-Ding-Projects/worldlens/commit/4db4d3317a12be554426c3c597046a7b1337eced)
- Integrate Docker daemon boundary records - [`af33021bc1`](https://github.com/Ding-Ding-Projects/worldlens/commit/af33021bc16ecaf43d4fbe1e249da76788eb4c73) _(summary of 2 commits, also listed here)_
- docs: record Docker daemon probe - [`c428a8da75`](https://github.com/Ding-Ding-Projects/worldlens/commit/c428a8da75a4da221df173af71d22a848d15e14c)

## 1.0.1380 - 2026-08-19

Tagged at [`b5dd1fd332`](https://github.com/Ding-Ding-Projects/worldlens/commit/b5dd1fd332de7e0eee3e9b3a5b233fceae4e6170).

### Documentation

- Integrate terminal two-wave receipt records - [`b5dd1fd332`](https://github.com/Ding-Ding-Projects/worldlens/commit/b5dd1fd332de7e0eee3e9b3a5b233fceae4e6170) _(summary of 2 commits, also listed here)_
- Record terminal two-wave receipt evidence - [`8878a079ca`](https://github.com/Ding-Ding-Projects/worldlens/commit/8878a079ca5f97a4077a88065c888bf945afe4de)

## 1.0.1378 - 2026-08-19

Tagged at [`c305df9635`](https://github.com/Ding-Ding-Projects/worldlens/commit/c305df96357b2ada1286d5842d663d6a795fadde).

### Desktop shell

- Integrate packaged release-ledger hardening - [`cde827c40d`](https://github.com/Ding-Ding-Projects/worldlens/commit/cde827c40d16302761fdd73a9f0b20bb39f77bde) _(summary of 2 commits, also listed here)_
- Reject malformed packaged release-ledger rows - [`8e3969f5f6`](https://github.com/Ding-Ding-Projects/worldlens/commit/8e3969f5f64d7e429b9db7fff9f8ecfc6ff73735)

### Documentation

- Integrate release ledger publication trail - [`c305df9635`](https://github.com/Ding-Ding-Projects/worldlens/commit/c305df96357b2ada1286d5842d663d6a795fadde) _(summary of 2 commits, also listed here)_
- Clarify the release ledger publication trail - [`cb3bd3f9d1`](https://github.com/Ding-Ding-Projects/worldlens/commit/cb3bd3f9d197f43b88cc501adb0dcb59b0d84ba4)

## 1.0.1373 - 2026-08-19

Tagged at [`873eb0eae7`](https://github.com/Ding-Ding-Projects/worldlens/commit/873eb0eae7c5b9208c3570a15cf81cf9704a29c7).

### Documentation

- Reconcile six-phase release ledger records - [`873eb0eae7`](https://github.com/Ding-Ding-Projects/worldlens/commit/873eb0eae7c5b9208c3570a15cf81cf9704a29c7) _(summary of 2 commits, also listed here)_
- Align six-phase release ledger records - [`4729256126`](https://github.com/Ding-Ding-Projects/worldlens/commit/472925612661e8ca040a41f4c3dfffcb707569a6)

## 1.0.1371 - 2026-08-19

Tagged at [`82a723bba0`](https://github.com/Ding-Ding-Projects/worldlens/commit/82a723bba0fc671e9880334c669086f2e07dc8b2).

### Documentation

- Merge current main before receipt rerun - [`82a723bba0`](https://github.com/Ding-Ding-Projects/worldlens/commit/82a723bba0fc671e9880334c669086f2e07dc8b2) _(summary of 2 commits, also listed here)_
- Repair multi-group receipt assembly - [`f749940e02`](https://github.com/Ding-Ding-Projects/worldlens/commit/f749940e028b9f8b1184e023b3fcd2913b6c69c1)

## 1.0.1368 - 2026-08-19

Tagged at [`43065ebc69`](https://github.com/Ding-Ding-Projects/worldlens/commit/43065ebc697c50dab42e69907a79841aa93087b4).

### Documentation

- Recover malformed banner layers safely - [`43065ebc69`](https://github.com/Ding-Ding-Projects/worldlens/commit/43065ebc697c50dab42e69907a79841aa93087b4)

## 1.0.1364 - 2026-08-19

Tagged at [`bc2a2017d6`](https://github.com/Ding-Ding-Projects/worldlens/commit/bc2a2017d662771e1a12ca7f12585362828623c2).

### Documentation

- Repair the hosted receipt action pin - [`bc2a2017d6`](https://github.com/Ding-Ding-Projects/worldlens/commit/bc2a2017d662771e1a12ca7f12585362828623c2)

## 1.0.1361 - 2026-08-19

Tagged at [`69ff3df8bb`](https://github.com/Ding-Ding-Projects/worldlens/commit/69ff3df8bbfc57f8126b7e676a63201aee34c74e).

### Documentation

- Preserve every release-producing workflow run - [`69ff3df8bb`](https://github.com/Ding-Ding-Projects/worldlens/commit/69ff3df8bbfc57f8126b7e676a63201aee34c74e)

## 1.0.1359 - 2026-08-19

Tagged at [`f901b527c3`](https://github.com/Ding-Ding-Projects/worldlens/commit/f901b527c3b77943d59d9f1e5950615550bc0006).

### Documentation

- Preserve Docker image startup commands - [`f901b527c3`](https://github.com/Ding-Ding-Projects/worldlens/commit/f901b527c3b77943d59d9f1e5950615550bc0006)
- Enforce complete phase release evidence - [`4a7aad1eda`](https://github.com/Ding-Ding-Projects/worldlens/commit/4a7aad1eda64b24337de2e50d4dd50fb625167ff)

## 1.0.1354 - 2026-08-19

Tagged at [`2dab83bfdf`](https://github.com/Ding-Ding-Projects/worldlens/commit/2dab83bfdf9e782e0e797c70913235272c80da6c).

### Interface

- Expose guided Docker container creation - [`2dab83bfdf`](https://github.com/Ding-Ding-Projects/worldlens/commit/2dab83bfdf9e782e0e797c70913235272c80da6c)
- Segment retained render history and expose retention facts - [`ec5d9a0ca8`](https://github.com/Ding-Ding-Projects/worldlens/commit/ec5d9a0ca8fa54863fea5e656c929fa44c602558)

## 1.0.1349 - 2026-08-19

Tagged at [`86024f0ffe`](https://github.com/Ding-Ding-Projects/worldlens/commit/86024f0ffeb2599ffd653a09e4fae3d020b7becc).

### Documentation

- Limit GitHub Actions to build and release work - [`86024f0ffe`](https://github.com/Ding-Ding-Projects/worldlens/commit/86024f0ffeb2599ffd653a09e4fae3d020b7becc)

## 1.0.1345 - 2026-08-19

Tagged at [`2ab8c85883`](https://github.com/Ding-Ding-Projects/worldlens/commit/2ab8c85883c46dc871b2405212b976df42f88500).

### Documentation

- Harden migration writes and legacy key boundaries - [`2ab8c85883`](https://github.com/Ding-Ding-Projects/worldlens/commit/2ab8c85883c46dc871b2405212b976df42f88500)

## 1.0.1342 - 2026-08-19

Tagged at [`bf13113d59`](https://github.com/Ding-Ding-Projects/worldlens/commit/bf13113d592792cc576a38e6222135bce41045a2).

### Documentation

- Use retained render history across console actions - [`bf13113d59`](https://github.com/Ding-Ding-Projects/worldlens/commit/bf13113d592792cc576a38e6222135bce41045a2)

## 1.0.1339 - 2026-08-19

Tagged at [`9702e6daac`](https://github.com/Ding-Ding-Projects/worldlens/commit/9702e6daac6483ce7b2eeb268110c87cfbe5c55e).

### Build, release and tooling

- Merge remote-tracking branch 'origin/main' into codex/issue-70-marker-editor - [`9702e6daac`](https://github.com/Ding-Ding-Projects/worldlens/commit/9702e6daac6483ce7b2eeb268110c87cfbe5c55e) _(summary of 15 commits, also listed here)_

### Documentation

- Complete marker geometry controls and live preview - [`6fc95e22db`](https://github.com/Ding-Ding-Projects/worldlens/commit/6fc95e22db2a696ea36b0a8181f74e4a276abae2)

## 1.0.1336 - 2026-08-19

Tagged at [`98aac09930`](https://github.com/Ding-Ding-Projects/worldlens/commit/98aac099304cddd0228b6dc51da3cbf07c557277).

### Build, release and tooling

- Pin render workflows to the current toolchain - [`98aac09930`](https://github.com/Ding-Ding-Projects/worldlens/commit/98aac099304cddd0228b6dc51da3cbf07c557277)

## 1.0.1333 - 2026-08-19

Tagged at [`9f52322cdf`](https://github.com/Ding-Ding-Projects/worldlens/commit/9f52322cdfe284553499486bb1a8ffd2916331e3).

### Build, release and tooling

- Separate live launch proof from cleanup proof - [`9f52322cdf`](https://github.com/Ding-Ding-Projects/worldlens/commit/9f52322cdfe284553499486bb1a8ffd2916331e3)
- Write Lowlevel receipts before app cleanup - [`bdd8758910`](https://github.com/Ding-Ding-Projects/worldlens/commit/bdd8758910e901627edff29488a7ac9b2cdf32de)
- Target the teleported settings overflow - [`d7f29c01f1`](https://github.com/Ding-Ding-Projects/worldlens/commit/d7f29c01f18e698b6ebe20eb0f6eac54c14081bf)

## 1.0.1325 - 2026-08-19

Tagged at [`25e3f2f1ce`](https://github.com/Ding-Ding-Projects/worldlens/commit/25e3f2f1ce282a3d4464ea40e2763d7aab96c045).

### Build, release and tooling

- Package the app before Lowlevel smoke - [`25e3f2f1ce`](https://github.com/Ding-Ding-Projects/worldlens/commit/25e3f2f1ce282a3d4464ea40e2763d7aab96c045)
- Pin the generated site seed to LF - [`7b868bf17d`](https://github.com/Ding-Ding-Projects/worldlens/commit/7b868bf17d86e5b784518947bd0941eafc0c4b4b)
- Report bounded dirty-checkout evidence - [`b53e6252b5`](https://github.com/Ding-Ding-Projects/worldlens/commit/b53e6252b54d581d7865aed369d8a72c714180f6)

## 1.0.1318 - 2026-08-19

Tagged at [`ca069aaa4e`](https://github.com/Ding-Ding-Projects/worldlens/commit/ca069aaa4e039b7debb41a02892764433ec7f853).

### Build, release and tooling

- Keep the CI check job build-only - [`ca069aaa4e`](https://github.com/Ding-Ding-Projects/worldlens/commit/ca069aaa4e039b7debb41a02892764433ec7f853)
- Accept native line endings in Lowlevel evidence wiring - [`ee7b3f145f`](https://github.com/Ding-Ding-Projects/worldlens/commit/ee7b3f145fe23c1e56846bcbf1069b2e2f903452)

## 1.0.1313 - 2026-08-19

Tagged at [`d4169f87c0`](https://github.com/Ding-Ding-Projects/worldlens/commit/d4169f87c06ce352d721b59b0fbf08c98caaf7f9).

### Interface

- Export the persistent marker-layer host - [`ade3e1ef9f`](https://github.com/Ding-Ding-Projects/worldlens/commit/ade3e1ef9f801e9bfd2490cdd791f518ae4b0dd2)
- Repair release-ledger Markdown export syntax - [`9dbc61ee19`](https://github.com/Ding-Ding-Projects/worldlens/commit/9dbc61ee1981da0baeca558e91f0dbc1caace8c9)
- Merge current main into packaged release-smoke evidence - [`3fcda8e0d3`](https://github.com/Ding-Ding-Projects/worldlens/commit/3fcda8e0d35d927ea00e4b070e6da349db59adce) _(summary of 2 commits, also listed here)_
- Unify local personal-vocabulary upload and cache handling - [`6f92672033`](https://github.com/Ding-Ding-Projects/worldlens/commit/6f9267203397041950967ab892e76253ce810d6f)
- Merge current main into two-wave receipt support - [`2bae2162ed`](https://github.com/Ding-Ding-Projects/worldlens/commit/2bae2162ed8c097f55a9af7712b708a8238fd328) _(summary of 5 commits, also listed here)_
- Remove trailing blank lines from the release ledger UI - [`8d162f01cb`](https://github.com/Ding-Ding-Projects/worldlens/commit/8d162f01cb24bbbfed8bf7a698120e1a0fd037e4)
- Merge current main into Docker hosting management - [`5544bc821d`](https://github.com/Ding-Ding-Projects/worldlens/commit/5544bc821d69d1c9f0aa9d26b84b8654e7104594) _(summary of 7 commits, also listed here)_
- Add an installation-owned Docker hosting manager - [`29b4639f2a`](https://github.com/Ding-Ding-Projects/worldlens/commit/29b4639f2a920bb54f1dc1db51463ad472f11103)
- Merge current main into marker authoring - [`a77f502a30`](https://github.com/Ding-Ding-Projects/worldlens/commit/a77f502a30b2b040967e1118b5de617df1aecb94) _(summary of 5 commits, also listed here)_
- Add a fail-closed JavaScript add-on foundation - [`e5bfc2a1e2`](https://github.com/Ding-Ding-Projects/worldlens/commit/e5bfc2a1e2faff0f9914cbbec24eaf2b94acca31)
- Expand marker authoring across BlueMap schemas - [`e322ea2e0d`](https://github.com/Ding-Ding-Projects/worldlens/commit/e322ea2e0d66d2cb468751909964fbb67336dbd3)

### Rendering and world data

- Narrow hosted receipt timestamps and tile counts - [`805270d722`](https://github.com/Ding-Ding-Projects/worldlens/commit/805270d722a8f2db8e99bd157e1e1bde384fe874)
- Preserve validated annotation narrowing - [`50dd2ffe5a`](https://github.com/Ding-Ding-Projects/worldlens/commit/50dd2ffe5a692c9a7ba13821457853f711b370b2)
- Allow live-player metadata to clear cleanly - [`d0d5a3833f`](https://github.com/Ding-Ding-Projects/worldlens/commit/d0d5a3833f6aa3749b019d9561cf7a84b4779280)
- Type marker event payload after runtime validation - [`b2a786a131`](https://github.com/Ding-Ding-Projects/worldlens/commit/b2a786a131b35b8a7abd66c202b3a13982efa023)
- Add deterministic two-wave merge receipts - [`07fb94fa64`](https://github.com/Ding-Ding-Projects/worldlens/commit/07fb94fa64335f204a49a94af76554e615e763e7)
- Merge current main into live-player tracking - [`68c9225d89`](https://github.com/Ding-Ding-Projects/worldlens/commit/68c9225d89ef12c8fb0248cd2cde050f69dfd933) _(summary of 3 commits, also listed here)_
- Upgrade the viewer to Three.js 0.180 - [`646eab780a`](https://github.com/Ding-Ding-Projects/worldlens/commit/646eab780a8b8776eabe7c1ea4fb38b703e96390)

### Server, CLI and configuration

- Omit absent local-live mount options - [`d4169f87c0`](https://github.com/Ding-Ding-Projects/worldlens/commit/d4169f87c06ce352d721b59b0fbf08c98caaf7f9)
- Narrow remote health versions without undefined - [`c8ba7f2e58`](https://github.com/Ding-Ding-Projects/worldlens/commit/c8ba7f2e58df37413cb5b5f480bd6e58cfc79091)
- Add the add-on persistence helper - [`e4de3ea357`](https://github.com/Ding-Ding-Projects/worldlens/commit/e4de3ea357b93cb2ab6d4fac4cc32a26241eaea1)
- Remove trailing blank line from the live-player provider - [`7fbc6c8149`](https://github.com/Ding-Ding-Projects/worldlens/commit/7fbc6c814987832bf117e378b61b6be4a9301977)

### Desktop shell

- Merge current main into the add-on foundation - [`e80a24f448`](https://github.com/Ding-Ding-Projects/worldlens/commit/e80a24f44864a5194b967fb710f25797549fe72e) _(summary of 3 commits, also listed here)_
- Add bounded resumable static map export - [`e11d424a38`](https://github.com/Ding-Ding-Projects/worldlens/commit/e11d424a383a6cae6530964c90a7baa53a65c5c9)
- Merge current main into the screenshot gallery - [`6dc0bf3e86`](https://github.com/Ding-Ding-Projects/worldlens/commit/6dc0bf3e862637efd5af33cfe8ab198717928a2e) _(summary of 4 commits, also listed here)_
- Merge current main into map tools - [`684774d89a`](https://github.com/Ding-Ding-Projects/worldlens/commit/684774d89a734753645c140aca25cfadb6e69522) _(summary of 2 commits, also listed here)_
- Add a real multi-server operations dashboard - [`d3482a3421`](https://github.com/Ding-Ding-Projects/worldlens/commit/d3482a34215ed7c81a21e3728ad04cef6fd08c46)
- Add a private user-owned screenshot gallery - [`e2b67bc248`](https://github.com/Ding-Ding-Projects/worldlens/commit/e2b67bc248035b9c61cbd40d7f527b7ddb51b352)
- Merge current main into Linux scope record - [`4c0c928b4e`](https://github.com/Ding-Ding-Projects/worldlens/commit/4c0c928b4e58be283fb5465e018eec2428a36f57) _(summary of 2 commits, also listed here)_
- Harden updater handoff records and evidence contract - [`094ff9633b`](https://github.com/Ding-Ding-Projects/worldlens/commit/094ff9633b46dfb1976708e9a7e734b690f14ce5)
- Remove trailing blank line from issue report backend - [`85758d9498`](https://github.com/Ding-Ding-Projects/worldlens/commit/85758d94983e978d1a0955364fea957ba4bbd980)

### Landing page and documentation site

- Merge current main into CI-render reachability - [`27d2538055`](https://github.com/Ding-Ding-Projects/worldlens/commit/27d2538055ccc6acf509667a641e345109a67536) _(summary of 4 commits, also listed here)_
- Bind release smoke evidence to packaged artifacts - [`56a2017775`](https://github.com/Ding-Ding-Projects/worldlens/commit/56a2017775dd665c0ff6e91844ec6e8a75e87563)

### Build, release and tooling

- Declare live-player NBT input and fix recursive typing - [`e8577a9a58`](https://github.com/Ding-Ding-Projects/worldlens/commit/e8577a9a581ba4e1c81b6b783c1757ac03ff6524)
- Use ordinary wording in the render workflow - [`235fec3d75`](https://github.com/Ding-Ding-Projects/worldlens/commit/235fec3d75589744ea5045b78f78029a35d83177)
- Harden CI-render reachability and receipt provenance - [`fef3e7bc6d`](https://github.com/Ding-Ding-Projects/worldlens/commit/fef3e7bc6d15187eb91a6c04f8dfef9dac9e68fb)

### Documentation

- Add a verified historical phase-release ledger - [`ebc044f599`](https://github.com/Ding-Ding-Projects/worldlens/commit/ebc044f59968c9870cb67f347969bd09f9fba048)
- Merge current main into static map export - [`8c471fedf2`](https://github.com/Ding-Ding-Projects/worldlens/commit/8c471fedf27c78a0209c7a8daea64f1452030d2c) _(summary of 6 commits, also listed here)_
- Use ordinary public wording in the Three.js parity article - [`6aa3852424`](https://github.com/Ding-Ding-Projects/worldlens/commit/6aa3852424cfc623adab5f4059701789a4e695f3)
- Add optional local live-player tracking - [`02e9101b5c`](https://github.com/Ding-Ding-Projects/worldlens/commit/02e9101b5c9a3e87a5164462695a1c2064bd7002)
- Add scoped map measurements and waypoints - [`8454cf6da0`](https://github.com/Ding-Ding-Projects/worldlens/commit/8454cf6da00972097fd701f66b29c5c3a4cb7ecd)
- Use ordinary wording in the screenshot-gallery handoff - [`9823d8576c`](https://github.com/Ding-Ding-Projects/worldlens/commit/9823d8576cc79a3aa06fb5a110547c7a3feb719e)
- Merge current main into privacy-safe issue reporting - [`652b9e572f`](https://github.com/Ding-Ding-Projects/worldlens/commit/652b9e572ff338151badf51268007d75b28f445b) _(summary of 4 commits, also listed here)_
- Record the deferred Linux desktop support boundary - [`235615fb2f`](https://github.com/Ding-Ding-Projects/worldlens/commit/235615fb2f8c1e02d944c1436827355038e10655)

### Elsewhere in the repository

- Add privacy-safe local issue report drafts - [`45de168691`](https://github.com/Ding-Ding-Projects/worldlens/commit/45de168691852ad234fea36b16d99d83a361343a)

## 1.0.1257 - 2026-08-19

Tagged at [`86190b9f42`](https://github.com/Ding-Ding-Projects/worldlens/commit/86190b9f4222cb3866af703a92488a2711a22f7a).

### Interface

- Merge current main into Java runtime proof - [`86190b9f42`](https://github.com/Ding-Ding-Projects/worldlens/commit/86190b9f4222cb3866af703a92488a2711a22f7a) _(summary of 4 commits, also listed here)_
- Merge current main into adapter smoke contract - [`95ddab6c60`](https://github.com/Ding-Ding-Projects/worldlens/commit/95ddab6c601837ea4a07574587e81d7b804da3c1) _(summary of 2 commits, also listed here)_
- Mount remote hosting in real application navigation - [`8e78a95c75`](https://github.com/Ding-Ding-Projects/worldlens/commit/8e78a95c752b074112d8548086d3a68de4b00a93)

### Desktop shell

- Harden managed Java provisioning and render evidence - [`e95dc79588`](https://github.com/Ding-Ding-Projects/worldlens/commit/e95dc79588d8475d50f2553b6d7e60119cc60884)

### Documentation

- Internal maintenance message omitted from the public changelog - [`1950350193`](https://github.com/Ding-Ding-Projects/worldlens/commit/1950350193a08bc6bd58c2a6a77e4c07f9bff4f9)

## 1.0.1250 - 2026-08-19

Tagged at [`b2f5a9de63`](https://github.com/Ding-Ding-Projects/worldlens/commit/b2f5a9de6349bd7e7d2c3149a926b2a0e00cf998).

### Interface

- Merge current main into SSH flow hardening - [`b2f5a9de63`](https://github.com/Ding-Ding-Projects/worldlens/commit/b2f5a9de6349bd7e7d2c3149a926b2a0e00cf998) _(summary of 11 commits, also listed here)_
- Merge current main into Docker world import - [`4d5ddb5a39`](https://github.com/Ding-Ding-Projects/worldlens/commit/4d5ddb5a399c7872e332dfcc9af9ade563c3ebeb) _(summary of 9 commits, also listed here)_
- Merge current main into sign-out confirmation - [`9b0dd60e90`](https://github.com/Ding-Ding-Projects/worldlens/commit/9b0dd60e9091916d315521daaa406da45fb59ce9) _(summary of 7 commits, also listed here)_
- Merge remote-tracking branch 'origin/main' into codex/issue-89-typed-banner-patterns - [`0a23b8c622`](https://github.com/Ding-Ding-Projects/worldlens/commit/0a23b8c622009b8bd9d5795f09daf25fe41819b4) _(summary of 13 commits, also listed here)_
- Gate GitHub sign-out with truthful super confirmation - [`653b9e748d`](https://github.com/Ding-Ding-Projects/worldlens/commit/653b9e748dc1b5cb24917bd4e5dcb22a6994cece)

### Rendering and world data

- Render patterned banners from real block entities - [`5315eb9cc7`](https://github.com/Ding-Ding-Projects/worldlens/commit/5315eb9cc70bdce61b8430314924868124dca85e)

### Desktop shell

- Merge current main into patterned-banner proof - [`b7f2baf988`](https://github.com/Ding-Ding-Projects/worldlens/commit/b7f2baf98852f14b4a219a9ad419a17ac9f05249) _(summary of 41 commits, also listed here)_
- Harden Docker world import acknowledgements and failures - [`45bec2a451`](https://github.com/Ding-Ding-Projects/worldlens/commit/45bec2a451b5b14da92cabe5565528ed57c58b4b)
- Harden SSH transfer cancellation and remote hosting ownership - [`05138f9efa`](https://github.com/Ding-Ding-Projects/worldlens/commit/05138f9efa1417ca73a2d36f87bbcf537cd578d3)

### Documentation

- Render and prove typed banner patterns - [`204452506f`](https://github.com/Ding-Ding-Projects/worldlens/commit/204452506f85ac89869317fc508e09029e1bfe06)

## 1.0.1242 - 2026-08-19

Tagged at [`cef51bcfb3`](https://github.com/Ding-Ding-Projects/worldlens/commit/cef51bcfb34d620f6dce98e3e09ea33d334fd46f).

### Interface

- Persist complete render-console history - [`b4d5d9da53`](https://github.com/Ding-Ding-Projects/worldlens/commit/b4d5d9da53f7c88647a198984deb8ab7c3fe3ed2)

### Desktop shell

- Merge current main into render-console history - [`cef51bcfb3`](https://github.com/Ding-Ding-Projects/worldlens/commit/cef51bcfb34d620f6dce98e3e09ea33d334fd46f) _(summary of 3 commits, also listed here)_
- Harden profile migration and update continuity - [`28c60eb2ab`](https://github.com/Ding-Ding-Projects/worldlens/commit/28c60eb2abe09427b5645c402e3ebb1c6efadce8)
- Route release commands through the selected GitHub host - [`5032119cce`](https://github.com/Ding-Ding-Projects/worldlens/commit/5032119cced250dd29ce1ed91317e2d819a8d361)

## 1.0.1233 - 2026-08-19

Tagged at [`ac46de28ba`](https://github.com/Ding-Ding-Projects/worldlens/commit/ac46de28bab162ab58e045e5e46af23620f07f54).

### Build, release and tooling

- Internal maintenance message omitted from the public changelog - [`ac46de28ba`](https://github.com/Ding-Ding-Projects/worldlens/commit/ac46de28bab162ab58e045e5e46af23620f07f54) _(summary of 2 commits, also listed here)_
- Make Lowlevel E2E decline consent and use overflow - [`ba265790b9`](https://github.com/Ding-Ding-Projects/worldlens/commit/ba265790b97869e12e0a371ef069c696177fd6d2)

## 1.0.1230 - 2026-08-19

Tagged at [`25ac596dc9`](https://github.com/Ding-Ding-Projects/worldlens/commit/25ac596dc9186dfc6273a203e4ad563f62325852).

### Desktop shell

- Fix cloud-first engine selection - [`25ac596dc9`](https://github.com/Ding-Ding-Projects/worldlens/commit/25ac596dc9186dfc6273a203e4ad563f62325852) _(summary of 2 commits, also listed here)_
- Use the supported cloud render engine - [`1e74e2f6e5`](https://github.com/Ding-Ding-Projects/worldlens/commit/1e74e2f6e553f607f9c3cc9bdf35334ce66f547a)

## 1.0.1227 - 2026-08-19

Tagged at [`8cbf12be33`](https://github.com/Ding-Ding-Projects/worldlens/commit/8cbf12be33b890e0eace0d9a566689b1050b9491).

### Interface

- Verify render engine selection contracts - [`f016570ad5`](https://github.com/Ding-Ding-Projects/worldlens/commit/f016570ad5306487e9913bebff70f709e175688e)

### Server, CLI and configuration

- Recognize generated SQL storage fields - [`e437ccd2bc`](https://github.com/Ding-Ding-Projects/worldlens/commit/e437ccd2bcc388bd88e2356dc8cd3861f86ca1f6)

### Desktop shell

- Integrate per-project render engine choice - [`8cbf12be33`](https://github.com/Ding-Ding-Projects/worldlens/commit/8cbf12be33b890e0eace0d9a566689b1050b9491) _(summary of 4 commits, also listed here)_
- Add per-project render engine choice - [`e9e4850c12`](https://github.com/Ding-Ding-Projects/worldlens/commit/e9e4850c1227269f9de41e59f6fd5341bd79454d)

### Build, release and tooling

- Merge remote-tracking branch 'origin/main' into codex/issue-78-render-engine-choice - [`90dd65451b`](https://github.com/Ding-Ding-Projects/worldlens/commit/90dd65451bbb4ebaa24f20fc5b0b249ac3c7c4a8) _(summary of 10 commits, also listed here)_
- Merge remote-tracking branch 'origin/main' into codex/issue-65-cli-resource-sql-parity - [`68cec06923`](https://github.com/Ding-Ding-Projects/worldlens/commit/68cec0692352076f7098130ffb690792afd5cab3) _(summary of 8 commits, also listed here)_

### Documentation

- Integrate standalone CLI parity proof - [`950ff5bea9`](https://github.com/Ding-Ding-Projects/worldlens/commit/950ff5bea9f1f6965a6a80472235b8c5cdaa5d9e) _(summary of 6 commits, also listed here)_
- Record verified CLI Docker and PostgreSQL proof - [`fc8b3399ce`](https://github.com/Ding-Ding-Projects/worldlens/commit/fc8b3399ce031a11d5cd42efe568aa346e24f298)
- Merge current main into CLI parity proof - [`538b40f4ad`](https://github.com/Ding-Ding-Projects/worldlens/commit/538b40f4ad9a483bbabe7da2d097c267412cae7a) _(summary of 39 commits, also listed here)_
- Complete CLI resource and SQL parity - [`82b2388d78`](https://github.com/Ding-Ding-Projects/worldlens/commit/82b2388d786bf45390cb6870cb1252f829c425c5)

## 1.0.1223 - 2026-08-19

Tagged at [`227b18d40b`](https://github.com/Ding-Ding-Projects/worldlens/commit/227b18d40b92d8b0976256f20a246eb1693db978).

### Interface

- Verify cloud-first configuration wiring - [`b095b1c45a`](https://github.com/Ding-Ding-Projects/worldlens/commit/b095b1c45a581d65acf94193f2202748088d135e)

### Documentation

- Integrate cloud-first render configuration - [`227b18d40b`](https://github.com/Ding-Ding-Projects/worldlens/commit/227b18d40b92d8b0976256f20a246eb1693db978) _(summary of 4 commits, also listed here)_
- Merge remote-tracking branch 'origin/main' into codex/issue-57-cloud-first-config - [`0f4c2e23d4`](https://github.com/Ding-Ding-Projects/worldlens/commit/0f4c2e23d4755ee4122a774bee888c8d4da506c4) _(summary of 7 commits, also listed here)_
- Add cloud-first render configuration - [`14797c90aa`](https://github.com/Ding-Ding-Projects/worldlens/commit/14797c90aa7638112843282bd852dd7e785f10a8)

## 1.0.1222 - 2026-08-19

Tagged at [`8bded64312`](https://github.com/Ding-Ding-Projects/worldlens/commit/8bded643122313852a2acea65be0c4776c769203).

### Rendering and world data

- Internal maintenance message omitted from the public changelog - [`e11537c462`](https://github.com/Ding-Ding-Projects/worldlens/commit/e11537c462ab4788485bddb3ed30e4551b6938a8)
- Make SQL oracle negatives and cleanup exact - [`f3b916c4b1`](https://github.com/Ding-Ding-Projects/worldlens/commit/f3b916c4b1003c057d79105b2dd460abaafbc69f)

### Landing page and documentation site

- Enforce the public compatibility contract - [`4873f150e2`](https://github.com/Ding-Ding-Projects/worldlens/commit/4873f150e272866135e93e280ce0ad879c2eb44e)

### Build, release and tooling

- Integrate Lowlevel error evidence - [`8bded64312`](https://github.com/Ding-Ding-Projects/worldlens/commit/8bded643122313852a2acea65be0c4776c769203) _(summary of 3 commits, also listed here)_
- Integrate public compatibility contract proof - [`647a65ba7d`](https://github.com/Ding-Ding-Projects/worldlens/commit/647a65ba7d42df1371849d9ed44c02caf9776dee) _(summary of 4 commits, also listed here)_
- Make SQL compatibility reports self-verifying - [`f3c94d2ff7`](https://github.com/Ding-Ding-Projects/worldlens/commit/f3c94d2ff74d007249996850e32b16b96b268ce5)
- Fix SQL oracle authentication and driver probes - [`ec9e8eb591`](https://github.com/Ding-Ding-Projects/worldlens/commit/ec9e8eb59128336d64d5789b273f75bd6ff4edfb)
- Use real SQL adapters in compatibility oracle - [`5ecc6d7f12`](https://github.com/Ding-Ding-Projects/worldlens/commit/5ecc6d7f1241a0ccb25993386ec6ab2cb3f5ef76)
- Constrain SQL oracle drivers and cleanup - [`ad40362ea7`](https://github.com/Ding-Ding-Projects/worldlens/commit/ad40362ea751d3ece123bfb900e0aa756aa7e767)
- Merge remote-tracking branch 'origin/main' into codex/issue-66-sql-cross-engine-proof - [`8f881833c1`](https://github.com/Ding-Ding-Projects/worldlens/commit/8f881833c132ff4430329e233555e47fbf560d37) _(summary of 9 commits, also listed here)_
- Preserve Lowlevel runtime error evidence - [`1942885129`](https://github.com/Ding-Ding-Projects/worldlens/commit/1942885129bb8dadac3b5bae14d60d25ca2a2f0b)
- Make headless onboarding decline consent - [`f54af41581`](https://github.com/Ding-Ding-Projects/worldlens/commit/f54af41581a33b878682a7f0f0490e8b15084375)

### Documentation

- Merge remote-tracking branch 'origin/main' into codex/issue-60-public-compatibility-contract - [`2691fe4c01`](https://github.com/Ding-Ding-Projects/worldlens/commit/2691fe4c01f6a84445b0befee438338b2e62cef7) _(summary of 25 commits, also listed here)_
- Integrate SQL cross-engine compatibility proof - [`179bae4c6b`](https://github.com/Ding-Ding-Projects/worldlens/commit/179bae4c6b0b4919eb948ffd761528ac9221218e) _(summary of 11 commits, also listed here)_
- Merge current main into SQL compatibility proof - [`22488af6a6`](https://github.com/Ding-Ding-Projects/worldlens/commit/22488af6a63bc3d7cd6072eaf7c17514f177d925) _(summary of 20 commits, also listed here)_
- Record verified SQL cross-engine matrix - [`6a39709f8f`](https://github.com/Ding-Ding-Projects/worldlens/commit/6a39709f8fff18c7a2a8743e91df0883c4ab8717)
- Add SQLite and PostgreSQL compatibility oracle - [`2db3574c3a`](https://github.com/Ding-Ding-Projects/worldlens/commit/2db3574c3a24e66ce40e49f1fbfb80634d58f910)
- Internal maintenance message omitted from the public changelog - [`5a78cb5e7d`](https://github.com/Ding-Ding-Projects/worldlens/commit/5a78cb5e7d304a1e6881527b9724bdeb3b7a443a) _(summary of 25 commits, also listed here)_

## 1.0.1214 - 2026-08-19

Tagged at [`f148a5385d`](https://github.com/Ding-Ding-Projects/worldlens/commit/f148a5385d801bd4c3acea2a5c417e7a70b0c900).

### Interface

- Integrate render queue restart recovery - [`f148a5385d`](https://github.com/Ding-Ding-Projects/worldlens/commit/f148a5385d801bd4c3acea2a5c417e7a70b0c900) _(summary of 9 commits, also listed here)_
- Complete render queue restart recovery - [`1aa02093c9`](https://github.com/Ding-Ding-Projects/worldlens/commit/1aa02093c98a01e7066e9762e91e21f5758805b4)

### Rendering and world data

- Add focused render-queue acceptance coverage - [`0a3b1d2e3f`](https://github.com/Ding-Ding-Projects/worldlens/commit/0a3b1d2e3fbaa516e270079dfef4d7e30e76846a)

### Build, release and tooling

- Merge remote-tracking branch 'origin/main' into codex/issue-64-render-queue-persistence - [`538575a4e4`](https://github.com/Ding-Ding-Projects/worldlens/commit/538575a4e49c29de38a96c2ca621c78e5cdcc038) _(summary of 5 commits, also listed here)_
- Merge remote-tracking branch 'origin/main' into codex/issue-64-render-queue-persistence - [`76e368de58`](https://github.com/Ding-Ding-Projects/worldlens/commit/76e368de58f40ca6abe1b4e24f306c6fba9f92b2) _(summary of 2 commits, also listed here)_

### Documentation

- Merge current main into queue restart proof - [`326fc6e583`](https://github.com/Ding-Ding-Projects/worldlens/commit/326fc6e5834b486341a6bb318a68e2244d2e7853) _(summary of 45 commits, also listed here)_
- Record render-queue acceptance evidence - [`b6784d9a79`](https://github.com/Ding-Ding-Projects/worldlens/commit/b6784d9a79883ec57c5b4316077454709f3d8c5b)

## 1.0.1212 - 2026-08-19

Tagged at [`81229a31f9`](https://github.com/Ding-Ding-Projects/worldlens/commit/81229a31f91d8606270b0d1de936236f422ee675).

### Server, CLI and configuration

- Integrate render queue priority proof - [`81229a31f9`](https://github.com/Ding-Ding-Projects/worldlens/commit/81229a31f91d8606270b0d1de936236f422ee675) _(summary of 3 commits, also listed here)_
- Prove render queue priority under load - [`5f2fe71136`](https://github.com/Ding-Ding-Projects/worldlens/commit/5f2fe71136127e818e53862807d5a30e1611592a)

### Build, release and tooling

- Verify persisted cloud-render removal without another dispatch - [`b0aa932181`](https://github.com/Ding-Ding-Projects/worldlens/commit/b0aa932181114ae0ee12409ec38eb7927bb267bf)
- Start live capture timing after the HTML artifact exists - [`d1d6335392`](https://github.com/Ding-Ding-Projects/worldlens/commit/d1d6335392a5a1f71782b5ab0f672c0824e41a4b)
- Write promotion receipts for live Pages captures - [`ddc07860d0`](https://github.com/Ding-Ding-Projects/worldlens/commit/ddc07860d04568e15e3bd94654fbb480e3c46409)
- Hold Pages routes stable for three seconds - [`8f5bb1d77a`](https://github.com/Ding-Ding-Projects/worldlens/commit/8f5bb1d77aa909538991d5536267f1044bf5cab9)
- Wait for Pages hash routes to settle before capture - [`50c6e7ef20`](https://github.com/Ding-Ding-Projects/worldlens/commit/50c6e7ef2035765d7a7fd0c96e973398e1ac04e9)
- Resolve the exact Pages hash before every proof phase - [`aaed8f1913`](https://github.com/Ding-Ding-Projects/worldlens/commit/aaed8f191394f6ec92fa56a9a14d6368d709606f)
- Verify exact hash-routed Pages targets during capture - [`ea9704e14b`](https://github.com/Ding-Ding-Projects/worldlens/commit/ea9704e14bdf9caddbc50e76bf8802eb9f2f1c13)
- Allow the live repository preflight two minutes - [`4ba56523cd`](https://github.com/Ding-Ding-Projects/worldlens/commit/4ba56523cd7fa1a2106b15c64122ae12926f5f70)
- Keep the Lowlevel retry alive until GitHub lists the run - [`7070f6fd54`](https://github.com/Ding-Ding-Projects/worldlens/commit/7070f6fd5409846f39d11a4c7c51d9b385b70234)

### Documentation

- Merge remote-tracking branch 'origin/main' into codex/issue-68-render-priority-parity - [`2bb87a7ebc`](https://github.com/Ding-Ding-Projects/worldlens/commit/2bb87a7ebc97163d9d0d5fc70749d37283e98c63) _(summary of 2 commits, also listed here)_
- Refresh the complete Lowlevel UI evidence set - [`faadd0aea6`](https://github.com/Ding-Ding-Projects/worldlens/commit/faadd0aea6141b4b013688760d7fa6b72354289a)
- Document the live Bayville Pages deployment - [`8e6247f261`](https://github.com/Ding-Ding-Projects/worldlens/commit/8e6247f26164122ffac80ba31d62d9d80f60d356)
- Publish Pages after skipped render waves - [`edd98f2957`](https://github.com/Ding-Ding-Projects/worldlens/commit/edd98f2957933e42eaf2ca54029107c55e8809da)

## 1.0.1194 - 2026-08-19

Tagged at [`0eae8eda0d`](https://github.com/Ding-Ding-Projects/worldlens/commit/0eae8eda0d3458b9c4f9e387ce1d41dd4230bacd).

### Rendering and world data

- Preserve the BlueMap web shell across resumed shards - [`0eae8eda0d`](https://github.com/Ding-Ding-Projects/worldlens/commit/0eae8eda0d3458b9c4f9e387ce1d41dd4230bacd)
- Merge current main into compatibility contract - [`563b7e8240`](https://github.com/Ding-Ding-Projects/worldlens/commit/563b7e8240b9bffe7ad79db66366ba3cbb0cce31) _(summary of 19 commits, also listed here)_

### Desktop shell

- Clear terminal run metadata during retry dispatch - [`a084b15761`](https://github.com/Ding-Ding-Projects/worldlens/commit/a084b157616141d165e2418d66744bb810d3339f)
- Dispatch a fresh run after a failed cloud render - [`84f41e2fb6`](https://github.com/Ding-Ding-Projects/worldlens/commit/84f41e2fb6767f24a22c6ac3d3ec37d62d1e1be6)

### Build, release and tooling

- Internal maintenance message omitted from the public changelog - [`e8bb0cb431`](https://github.com/Ding-Ding-Projects/worldlens/commit/e8bb0cb431363f6b68ac311c474bbd8347cc8d91) _(summary of 2 commits, also listed here)_
- Complete the two-phase public render dispatch - [`8972a84f70`](https://github.com/Ding-Ding-Projects/worldlens/commit/8972a84f70d0fd7e8f02ff6b7eb90f243149e250)
- Target the mandatory public disclosure directly - [`7abbf94fd7`](https://github.com/Ding-Ding-Projects/worldlens/commit/7abbf94fd77652535a4b2d62b7e941f4ab136c16)
- Handle unchanged-world retries in the public Pages journey - [`db43392a60`](https://github.com/Ding-Ding-Projects/worldlens/commit/db43392a607a8e08d4ea313905346bc747ac7071)

### Documentation

- Merge current main before failed-run retry delivery - [`3354ec6fcb`](https://github.com/Ding-Ding-Projects/worldlens/commit/3354ec6fcbb324315e6a1702eb5d61551bab2800) _(summary of 9 commits, also listed here)_
- Internal maintenance message omitted from the public changelog - [`e86b0b60b3`](https://github.com/Ding-Ding-Projects/worldlens/commit/e86b0b60b3a551384a7fa8c9dff924e5e2967b59)
- Merge issue #60 Windows compatibility contract - [`b002286bf1`](https://github.com/Ding-Ding-Projects/worldlens/commit/b002286bf1e345b708ac2ce6f1540f253e2577aa) _(summary of 4 commits, also listed here)_
- Reconcile compatibility handoff status - [`e4a54b89c9`](https://github.com/Ding-Ding-Projects/worldlens/commit/e4a54b89c9cf3ef329c2a8f4ebb6cee27fc48acd)
- Document Windows 1.0 compatibility contract - [`ec7e80011d`](https://github.com/Ding-Ding-Projects/worldlens/commit/ec7e80011da149398731398f8baf372edfbc0926)

## 1.0.1183 - 2026-08-19

Tagged at [`39c920626a`](https://github.com/Ding-Ding-Projects/worldlens/commit/39c920626a9f900a299ee577d0e0f38e7ed8b31f).

### Interface

- Fix generated Pages verification for new repositories - [`3366bfcc5a`](https://github.com/Ding-Ding-Projects/worldlens/commit/3366bfcc5acccb5b22d9225fa8bbc2ce8cb0bb0f)

### Rendering and world data

- Add focused render-queue acceptance coverage - [`c439b3a1fd`](https://github.com/Ding-Ding-Projects/worldlens/commit/c439b3a1fd44fbab8666c4f57ec0941dfce2a69b)
- Merge remote-tracking branch 'origin/main' into codex/issue-91-retire-local-webserver - [`bee28ea506`](https://github.com/Ding-Ding-Projects/worldlens/commit/bee28ea506b97d3dc9931303159a98de88e8ddda) _(summary of 4 commits, also listed here)_
- Merge issue #89 banner compatibility proof - [`e7810cf0b1`](https://github.com/Ding-Ding-Projects/worldlens/commit/e7810cf0b1d4b22964ef83ccccaf55f55261a837) _(summary of 2 commits, also listed here)_
- Add focused banner compatibility acceptance tests - [`d14203e7e4`](https://github.com/Ding-Ding-Projects/worldlens/commit/d14203e7e40a2ae4851b8bfe3476450609451570)

### Desktop shell

- Merge issue #91 runtime reachability proof - [`9176799e27`](https://github.com/Ding-Ding-Projects/worldlens/commit/9176799e273d75eeb10772940390ab4b494b8c88) _(summary of 3 commits, also listed here)_
- Add runtime reachability guard - [`e3e95d7c2c`](https://github.com/Ding-Ding-Projects/worldlens/commit/e3e95d7c2cd5a6cd6da9b30fe7a6842c435e657e)

### Build, release and tooling

- Add Lowlevel public Pages retry journey - [`39c920626a`](https://github.com/Ding-Ding-Projects/worldlens/commit/39c920626a9f900a299ee577d0e0f38e7ed8b31f)
- Internal maintenance message omitted from the public changelog - [`6b5c39ec12`](https://github.com/Ding-Ding-Projects/worldlens/commit/6b5c39ec120795acc2e58ad3786eb09ffef22863) _(summary of 2 commits, also listed here)_
- Capture private Pages refusal before render fallback - [`55f8aada78`](https://github.com/Ding-Ding-Projects/worldlens/commit/55f8aada785ad0aac6ee6b7d1752d5e5663b9097)

### Documentation

- Record render-queue acceptance evidence - [`b526739446`](https://github.com/Ding-Ding-Projects/worldlens/commit/b526739446cae2906631f83c041aa7b7ff247139)

## 1.0.1172 - 2026-08-19

Tagged at [`8fa04b7819`](https://github.com/Ding-Ding-Projects/worldlens/commit/8fa04b7819054c22af2032cd92fef5c17f9f1884).

### Server, CLI and configuration

- Merge issue #68 queue-priority proof - [`d652512fae`](https://github.com/Ding-Ding-Projects/worldlens/commit/d652512fae211b858583442b80c9dc0c80922f75) _(summary of 2 commits, also listed here)_
- Test RenderDriver queue priority at caller boundary - [`497eb61bfb`](https://github.com/Ding-Ding-Projects/worldlens/commit/497eb61bfbb9cdeba22cd8d1772fe45c4f32c566)

### Desktop shell

- Isolate and receipt Lowlevel UI captures - [`8ca5782bf6`](https://github.com/Ding-Ding-Projects/worldlens/commit/8ca5782bf6c8cc193e984ee64b892c4e390ff082)

### Build, release and tooling

- Click the visible private render action directly - [`8fa04b7819`](https://github.com/Ding-Ding-Projects/worldlens/commit/8fa04b7819054c22af2032cd92fef5c17f9f1884)
- Capture live Pages failures and private render setup - [`53af78ae93`](https://github.com/Ding-Ding-Projects/worldlens/commit/53af78ae93b33a006320e36e4d2d791b4631f0d4)
- Target repository visibility controls by keyboard - [`17cbf0a66b`](https://github.com/Ding-Ding-Projects/worldlens/commit/17cbf0a66b1bac95147d08eae69c13c0aa0040df)
- Make cloud-render recovery evidence deterministic - [`f729c8ce45`](https://github.com/Ding-Ding-Projects/worldlens/commit/f729c8ce45bef1859de06b5dfa3503ba860ea6dd)

### Documentation

- Complete receipt-backed Lowlevel recovery evidence - [`e7502bca52`](https://github.com/Ding-Ding-Projects/worldlens/commit/e7502bca522cb88b0f2cb0535b87c1e522188073)
- Promote privacy-clean Lowlevel captures - [`2dda8f9cb6`](https://github.com/Ding-Ding-Projects/worldlens/commit/2dda8f9cb692a2bbcc1bd085cec450cf0f6df092)

## 1.0.1163 - 2026-08-19

Tagged at [`11d7ccb2be`](https://github.com/Ding-Ding-Projects/worldlens/commit/11d7ccb2bee8a5eae68f93a1e80e0443e1c289c2).

### Desktop shell

- Resume cloud renders after app restart - [`a558bef666`](https://github.com/Ding-Ding-Projects/worldlens/commit/a558bef66619648e21ef77bfeb67f59d099783a1)

## 1.0.1159 - 2026-08-19

Tagged at [`89eaf06f8e`](https://github.com/Ding-Ding-Projects/worldlens/commit/89eaf06f8e768f5c4418915e747a6673dac24538).

### Build, release and tooling

- Run hidden-desktop UI verification on the hosted Windows runner - [`89eaf06f8e`](https://github.com/Ding-Ding-Projects/worldlens/commit/89eaf06f8e768f5c4418915e747a6673dac24538)

## 1.0.1158 - 2026-08-19

Tagged at [`a29ea0b5fa`](https://github.com/Ding-Ding-Projects/worldlens/commit/a29ea0b5faf336c0ac87caa8146afb735ac1d28d).

### Server, CLI and configuration

- Merge render-queue updates before UI diagnostics delivery - [`b19f020a1c`](https://github.com/Ding-Ding-Projects/worldlens/commit/b19f020a1cd9dec0b6bb5f645827de023b38300e) _(summary of 10 commits, also listed here)_

### Build, release and tooling

- Probe Session 0 GUI support when the app window is absent - [`a29ea0b5fa`](https://github.com/Ding-Ding-Projects/worldlens/commit/a29ea0b5faf336c0ac87caa8146afb735ac1d28d)
- Harden UI dispatch targeting and preserve runner launch diagnostics - [`23f75ed849`](https://github.com/Ding-Ding-Projects/worldlens/commit/23f75ed8496ec2fb0eecc55ce20f879ee9a73bd1)

## 1.0.1155 - 2026-08-19

Tagged at [`49ae802398`](https://github.com/Ding-Ding-Projects/worldlens/commit/49ae80239834c79f47e2680214d3a338241c3afc).

### Documentation

- Merge issue #68 render-priority parity - [`65cfb6c231`](https://github.com/Ding-Ding-Projects/worldlens/commit/65cfb6c2314a1a872681188a544560fe3f50ac18) _(summary of 3 commits, also listed here)_
- Match interactive render queue priority with upstream - [`92782c69d9`](https://github.com/Ding-Ding-Projects/worldlens/commit/92782c69d9caa1fb5239237d99a26241d178a410)

## 1.0.1153 - 2026-08-19

Tagged at [`9b9c16608e`](https://github.com/Ding-Ding-Projects/worldlens/commit/9b9c16608e1d662a614205d291d8f13a723156e6).

### Server, CLI and configuration

- Merge issue #64 render-queue persistence - [`3b71f4c08b`](https://github.com/Ding-Ding-Projects/worldlens/commit/3b71f4c08bf4dae54fbdf8b8393c1eaae2318c95) _(summary of 3 commits, also listed here)_
- Wire runtime render-queue persistence into the CLI - [`0a710e4345`](https://github.com/Ding-Ding-Projects/worldlens/commit/0a710e4345d395f1f8ae6ef6597d37721ef4d973)

### Desktop shell

- Merge issue #91 local WebServer retirement - [`2d8fb2193a`](https://github.com/Ding-Ding-Projects/worldlens/commit/2d8fb2193a0b68d63a8dbb2fd295c806066cb780) _(summary of 3 commits, also listed here)_
- Retire unreachable local WebServer path - [`6a2d6ae87f`](https://github.com/Ding-Ding-Projects/worldlens/commit/6a2d6ae87fcf3e9201e877514a5309e1821ae2f1)

### Build, release and tooling

- Internal maintenance message omitted from the public changelog - [`9b9c16608e`](https://github.com/Ding-Ding-Projects/worldlens/commit/9b9c16608e1d662a614205d291d8f13a723156e6) _(summary of 3 commits, also listed here)_
- Keep headless Electron attached to the Windows runner desktop - [`f013b36f98`](https://github.com/Ding-Ding-Projects/worldlens/commit/f013b36f98520789d6610253cb78473ea41f68c2)

### Documentation

- Internal maintenance message omitted from the public changelog - [`f429b5a0da`](https://github.com/Ding-Ding-Projects/worldlens/commit/f429b5a0da5bae78467e4f9eb04d162b50e44d0f) _(summary of 12 commits, also listed here)_
- Internal maintenance message omitted from the public changelog - [`a7455e787e`](https://github.com/Ding-Ding-Projects/worldlens/commit/a7455e787e674a3b247fe96332099dea0fdf15d4) _(summary of 2 commits, also listed here)_
- Internal maintenance message omitted from the public changelog - [`f0150dfbca`](https://github.com/Ding-Ding-Projects/worldlens/commit/f0150dfbca02b355feea32f3dbc7c6290cb5f3a0)
- Merge issue #89 typed banner data - [`025d68f017`](https://github.com/Ding-Ding-Projects/worldlens/commit/025d68f017c5426b8ec02098f8f6213bd818bb7b) _(summary of 2 commits, also listed here)_
- Type banner pattern and color data across Minecraft eras - [`47c3f8a523`](https://github.com/Ding-Ding-Projects/worldlens/commit/47c3f8a5237f9f5f68c3aea63e92bc6cf13c4c1b)
- Merge issue #88 LinearRegion timestamp semantics - [`ff2d72f1b6`](https://github.com/Ding-Ding-Projects/worldlens/commit/ff2d72f1b635aac7efe0831315919a03461b49b7) _(summary of 3 commits, also listed here)_
- Resolve LinearRegion timestamp widths and filtering - [`b630006961`](https://github.com/Ding-Ding-Projects/worldlens/commit/b6300069619fe196513cbcb374e9f13355d210cb)

## 1.0.1144 - 2026-08-18

Tagged at [`3b2486cea6`](https://github.com/Ding-Ding-Projects/worldlens/commit/3b2486cea65055ae07c31eb8822c3513001c09ca).

### Interface

- Fix Pages setup and extend vocabulary coverage - [`3b2486cea6`](https://github.com/Ding-Ding-Projects/worldlens/commit/3b2486cea65055ae07c31eb8822c3513001c09ca)

## 1.0.1141 - 2026-08-18

Tagged at [`41ba2dea3d`](https://github.com/Ding-Ding-Projects/worldlens/commit/41ba2dea3df13e0d2811b255769cda18738d25cd).

### Interface

- Make safe-keeper earnable, and correct two counts that had drifted - [`41ba2dea3d`](https://github.com/Ding-Ding-Projects/worldlens/commit/41ba2dea3df13e0d2811b255769cda18738d25cd)
- Repair import and dialog policy guards - [`7c3edbc16a`](https://github.com/Ding-Ding-Projects/worldlens/commit/7c3edbc16a01dafeaff00de41899d414645cbe0f)

## 1.0.1139 - 2026-08-18

Tagged at [`93aa69d192`](https://github.com/Ding-Ding-Projects/worldlens/commit/93aa69d192713c06564c6d4e2e7e0670300915ed).

### Interface

- Fix UI navigation and unsaved-close routing - [`4a4187c553`](https://github.com/Ding-Ding-Projects/worldlens/commit/4a4187c5533d3c760bc95baa575c141ad8557629)

### Server, CLI and configuration

- Restore BlueMap wire and parser parity - [`1a7f93dd1b`](https://github.com/Ding-Ding-Projects/worldlens/commit/1a7f93dd1b7da26dc555bea2b5365e8ef3dfc449)

### Desktop shell

- Expand the hidden-desktop capture contract - [`7adffcdde8`](https://github.com/Ding-Ding-Projects/worldlens/commit/7adffcdde8f9dc45fac19661e8941ba1bcaefba2)
- Harden runtime origins, updates, and state writes - [`facd06ba12`](https://github.com/Ding-Ding-Projects/worldlens/commit/facd06ba12761bbbcb2b0752506c4ab103e59589)
- Expand the hidden-desktop capture contract - [`5b88acf9c3`](https://github.com/Ding-Ding-Projects/worldlens/commit/5b88acf9c38d82f86a8d91fb676b6488baa7a72d)

### Landing page and documentation site

- feat(site): publish the complete searchable capture gallery - [`5166ba9de7`](https://github.com/Ding-Ding-Projects/worldlens/commit/5166ba9de7910934d03494f8908cb458a7667dd6)
- Align the archive download guard with verified links - [`bf907e1691`](https://github.com/Ding-Ding-Projects/worldlens/commit/bf907e16918bb80945e682f803b9c9d60ae0fbf2)
- Fix release delivery wiring and evidence - [`2c058156b4`](https://github.com/Ding-Ding-Projects/worldlens/commit/2c058156b473784b004e34857ed6a3992eeee937)
- Align the archive download guard with verified links - [`57a31f36db`](https://github.com/Ding-Ding-Projects/worldlens/commit/57a31f36db27f58d92b430df9475d104707e51a5)
- feat(site): publish the complete searchable capture gallery - [`2a0c5e8ce7`](https://github.com/Ding-Ding-Projects/worldlens/commit/2a0c5e8ce7c8359e681180bf2cb273fe97c1bcc3)

### Build, release and tooling

- Refresh reviewed workflow fingerprints - [`55866dded7`](https://github.com/Ding-Ding-Projects/worldlens/commit/55866dded7de08d05015bf83211fdc9b8c1bb677)
- Refresh reviewed workflow fingerprints - [`c9b4afd73b`](https://github.com/Ding-Ding-Projects/worldlens/commit/c9b4afd73b4da6169765ee96ade6468021b5b6f4)

### Documentation

- Refresh pre-rewrite Pages capture - [`392eca4dfa`](https://github.com/Ding-Ding-Projects/worldlens/commit/392eca4dfa2189a4d313f38fede13f797a6511dc)
- Recapture issue 107 historical Pages baseline - [`79193123b1`](https://github.com/Ding-Ding-Projects/worldlens/commit/79193123b1f8b0c2d8c099062ffbd0c5284499a6)
- Refresh issue 107 post-replacement capture - [`2b890a388e`](https://github.com/Ding-Ding-Projects/worldlens/commit/2b890a388ed1440bafac9d4529e2698ff9b4dc1e)
- Refresh pre-rewrite Pages capture - [`b6f88b7fbb`](https://github.com/Ding-Ding-Projects/worldlens/commit/b6f88b7fbbba94ea7ff2b3d4b400e8f4711915e8)
- Refresh issue 107 post-replacement capture - [`336c3cf419`](https://github.com/Ding-Ding-Projects/worldlens/commit/336c3cf4194fdb6d971b293767dcc53dbe7d910a)
- Recapture issue 107 historical Pages baseline - [`ac4ff7935d`](https://github.com/Ding-Ding-Projects/worldlens/commit/ac4ff7935d20cb0d78de5c01c87557e99ac735ae)
- Record twelve rapid-pass fixes and evidence limits - [`64523b4195`](https://github.com/Ding-Ding-Projects/worldlens/commit/64523b41956ed6d2154630dc38ff3b49a3e38dce)

### Elsewhere in the repository

- Record capture-source ancestry after integration - [`cfd69300cd`](https://github.com/Ding-Ding-Projects/worldlens/commit/cfd69300cd27f8102d8be832d529b9dabd0c2478) _(summary of 7 commits, also listed here)_
- Record source-lane ancestry without changing content - [`b8dae74bf3`](https://github.com/Ding-Ding-Projects/worldlens/commit/b8dae74bf3258b844a4bd07ed17dbf533c3d28b5) _(summary of 13 commits, also listed here)_
- Make installer cleanliness checks content-aware - [`8e835bda45`](https://github.com/Ding-Ding-Projects/worldlens/commit/8e835bda45f31c7d4bda839653e5800d7e777b32)
- Make installer cleanliness checks content-aware - [`7782d435b8`](https://github.com/Ding-Ding-Projects/worldlens/commit/7782d435b88c1c95e0c2ae19c8a27bc092fb45b6)

## 1.0.1137 - 2026-08-18

Tagged at [`35891985c9`](https://github.com/Ding-Ding-Projects/worldlens/commit/35891985c9802ca74c2cfa43109d6947b46918c0).

### Interface

- Fix UI navigation and unsaved-close routing - [`27572e97f0`](https://github.com/Ding-Ding-Projects/worldlens/commit/27572e97f03181511867ef3a56d7a44b3204902e)

### Server, CLI and configuration

- Restore BlueMap wire and parser parity - [`a8bdfba468`](https://github.com/Ding-Ding-Projects/worldlens/commit/a8bdfba468d5bb4a944f473df944badae8b97ef7)

### Desktop shell

- Harden runtime origins, updates, and state writes - [`26161ff56d`](https://github.com/Ding-Ding-Projects/worldlens/commit/26161ff56d35770135829892f528da726c754cb3)

### Landing page and documentation site

- Align the archive download guard with verified links - [`3adda0c07b`](https://github.com/Ding-Ding-Projects/worldlens/commit/3adda0c07be35bf3d907f8c7e3109d4ccf78d4a0)
- Fix release delivery wiring and evidence - [`c363f49504`](https://github.com/Ding-Ding-Projects/worldlens/commit/c363f495043bd66a83e0d0705302c735f778307d)

### Documentation

- Record twelve rapid-pass fixes and evidence limits - [`fb3e358f74`](https://github.com/Ding-Ding-Projects/worldlens/commit/fb3e358f7477dd54badde5d2addfbea2c05dc060)

### Elsewhere in the repository

- Make installer cleanliness checks content-aware - [`68b2728197`](https://github.com/Ding-Ding-Projects/worldlens/commit/68b2728197f223f339453b8cf667b6a693b946cf)

## 1.0.1135 - 2026-08-17

Tagged at [`8a1a1329c3`](https://github.com/Ding-Ding-Projects/worldlens/commit/8a1a1329c39fbd44e460451783dee9391d868917).

### Elsewhere in the repository

- Ship a run skill that drives the app instead of describing it - [`8a1a1329c3`](https://github.com/Ding-Ding-Projects/worldlens/commit/8a1a1329c39fbd44e460451783dee9391d868917)

## 1.0.1133 - 2026-08-16

Tagged at [`93e50abc0a`](https://github.com/Ding-Ding-Projects/worldlens/commit/93e50abc0a549bbe535c5e2c65ff8dd9b03caf8b).

### Interface

- Repair the four local gates nothing in CI ever runs - [`709c992833`](https://github.com/Ding-Ding-Projects/worldlens/commit/709c99283348751adff5298745f6801fdfb4bd7a)

### Server, CLI and configuration

- Retire two inventories that outlived what they described - [`5154ec2e4c`](https://github.com/Ding-Ding-Projects/worldlens/commit/5154ec2e4c5441624f606b0ddcfa555bf9737cd5)

### Documentation

- Replace every application capture from this build, and grade the map surfaces - [`47bad3bc20`](https://github.com/Ding-Ding-Projects/worldlens/commit/47bad3bc20aac077a972035602095ce3d5eceb42)

## 1.0.1127 - 2026-08-15

Tagged at [`bfe86254d7`](https://github.com/Ding-Ding-Projects/worldlens/commit/bfe86254d7666a5f8a54fd796e97dd3226693f70).

### Documentation

- Give Kid Mode's own labels a Cantonese half, and photograph the whole mode - [`bfe86254d7`](https://github.com/Ding-Ding-Projects/worldlens/commit/bfe86254d7666a5f8a54fd796e97dd3226693f70)

## 1.0.1124 - 2026-08-15

Tagged at [`a03a6da74f`](https://github.com/Ding-Ding-Projects/worldlens/commit/a03a6da74f1a07cf4e166de2127fe90d3d82ea7c).

### Interface

- Make Kid Mode survive a phone-width window - [`a03a6da74f`](https://github.com/Ding-Ding-Projects/worldlens/commit/a03a6da74f1a07cf4e166de2127fe90d3d82ea7c)

## 1.0.1122 - 2026-08-15

Tagged at [`6d1d920f70`](https://github.com/Ding-Ding-Projects/worldlens/commit/6d1d920f706e19916ca81e9583eaa79e3e56111e).

### Landing page and documentation site

- Put Kid Mode on the documentation site, including the screen that is broken - [`6d1d920f70`](https://github.com/Ding-Ding-Projects/worldlens/commit/6d1d920f706e19916ca81e9583eaa79e3e56111e)

## 1.0.1121 - 2026-08-15

Tagged at [`4e2496e44e`](https://github.com/Ding-Ding-Projects/worldlens/commit/4e2496e44edca4cc8d160c2ffb961110b30d4ede).

### Build, release and tooling

- Internal maintenance message omitted from the public changelog - [`c2b7a020cc`](https://github.com/Ding-Ding-Projects/worldlens/commit/c2b7a020cc0d9c40400479d833abda213fd7877d)

### Documentation

- Correct a README caption that claimed the opposite of its own picture - [`4e2496e44e`](https://github.com/Ding-Ding-Projects/worldlens/commit/4e2496e44edca4cc8d160c2ffb961110b30d4ede)
- Show Kid Mode on the README - [`31bfcd8fb9`](https://github.com/Ding-Ding-Projects/worldlens/commit/31bfcd8fb95ce25c07c3948941f008c42449f565)

## 1.0.1117 - 2026-08-15

Tagged at [`6eab3ab934`](https://github.com/Ding-Ding-Projects/worldlens/commit/6eab3ab9346d8073ed62e6d84f3125d86cc72e66).

### Build, release and tooling

- Stop the screenshot job's own timeout cancelling the whole run - [`6eab3ab934`](https://github.com/Ding-Ding-Projects/worldlens/commit/6eab3ab9346d8073ed62e6d84f3125d86cc72e66)

## 1.0.1114 - 2026-08-15

Tagged at [`1424ce1b02`](https://github.com/Ding-Ding-Projects/worldlens/commit/1424ce1b027a2101b4bc4494699719870eea7d3c).

### Elsewhere in the repository

- Merge the MD3 conformance and Kid Mode instruments into main - [`1424ce1b02`](https://github.com/Ding-Ding-Projects/worldlens/commit/1424ce1b027a2101b4bc4494699719870eea7d3c) _(summary of 2 commits, also listed here)_
- Add two instruments: one that measures Material 3, one that drives Kid Mode - [`71db5e7f0c`](https://github.com/Ding-Ding-Projects/worldlens/commit/71db5e7f0c1ec1c3a39ab023ce757b73e80f37ae)

## 1.0.1113 - 2026-08-15

Tagged at [`485e65987b`](https://github.com/Ding-Ding-Projects/worldlens/commit/485e65987b21d6e453d16fb15a665ba750487756).

### Interface

- Merge Kid Mode into main - [`33be4dd7b2`](https://github.com/Ding-Ding-Projects/worldlens/commit/33be4dd7b2f8d28e71a35d1904e6857163c2bde9) _(summary of 2 commits, also listed here)_
- Add Kid Mode as a second shell, and ship it turned on - [`6e32445ad4`](https://github.com/Ding-Ding-Projects/worldlens/commit/6e32445ad4935f68ce8938939fe55dcf3818595a)

### Landing page and documentation site

- Merge the screenshot viewer and Kid Mode's repairs into main - [`90484d6bc3`](https://github.com/Ding-Ding-Projects/worldlens/commit/90484d6bc36e7f8d764dfdb5e8ac2509c4a2aaf4) _(summary of 2 commits, also listed here)_
- Let people actually look at the screenshots, and make Kid Mode's rewards real - [`b55ad1f51f`](https://github.com/Ding-Ding-Projects/worldlens/commit/b55ad1f51f8f392438084fa7eb5d3193ed8b1221)

### Documentation

- Look at Kid Mode running, and fix what looking found - [`485e65987b`](https://github.com/Ding-Ding-Projects/worldlens/commit/485e65987b21d6e453d16fb15a665ba750487756)

## 1.0.1109 - 2026-08-14

Tagged at [`729c84b8b1`](https://github.com/Ding-Ding-Projects/worldlens/commit/729c84b8b1b9241f7a1d3f03076b9f55f5add0da).

### Interface

- Align personal-vocabulary uploads with the canonical contract - [`a0a477e0b5`](https://github.com/Ding-Ding-Projects/worldlens/commit/a0a477e0b57252f17cc0041706e3cec58502f932)
- Merge remote-tracking branch 'origin/main' - [`1b88610e4e`](https://github.com/Ding-Ding-Projects/worldlens/commit/1b88610e4e41c6885d15778841515844c0ef9cdf) _(summary of 9 commits, also listed here)_
- Stabilize full-suite config and watcher checks - [`fd72f4552e`](https://github.com/Ding-Ding-Projects/worldlens/commit/fd72f4552e2db4999c1429cbdce3b9d2f9168359)
- Merge remote-tracking branch 'origin/main' - [`9b46be16bf`](https://github.com/Ding-Ding-Projects/worldlens/commit/9b46be16bf26ad8c64495ea1abc98a821f982a68) _(summary of 3 commits, also listed here)_
- Align legacy identity and docs inventories - [`f41d3289a8`](https://github.com/Ding-Ding-Projects/worldlens/commit/f41d3289a8ab9e7888c4dd93c201904b2296837a)
- Harden updates, streams, and region watchers - [`57f1141c51`](https://github.com/Ding-Ding-Projects/worldlens/commit/57f1141c51227c9341afffca3ef0bc3961132692)
- Rebuild the BlueMap jars when the source moves, and say when upstream has moved - [`ee6b0a2d25`](https://github.com/Ding-Ding-Projects/worldlens/commit/ee6b0a2d251ab30ec0a6ae0f89f9bbd4b75d7533)
- Make five unreachable surfaces reachable, and show update download progress - [`00ddd0e8f2`](https://github.com/Ding-Ding-Projects/worldlens/commit/00ddd0e8f2069d05a8ebd01c4130ab4380633077)
- Add the Chunker world-conversion suite and its four execution routes - [`dd02621e04`](https://github.com/Ding-Ding-Projects/worldlens/commit/dd02621e049a758fbdfdd6ccb2bed4bb86044244)
- Build the three canonical features that were missing entirely - [`f8baa80c46`](https://github.com/Ding-Ding-Projects/worldlens/commit/f8baa80c461cfad06e1130d5c87281db972893e5)
- Capture the eight new surfaces, and register four pages the tab strip never knew about - [`b32ad1c275`](https://github.com/Ding-Ding-Projects/worldlens/commit/b32ad1c275b7c9122279a7380e05f22ff7961dd0)
- Stop the account load writing into a screen somebody has already left - [`efab5f3cfa`](https://github.com/Ding-Ding-Projects/worldlens/commit/efab5f3cfa02f01e3a30bb3f6fc8d58e9377b4f4)

### Server, CLI and configuration

- Widen watcher wait bounds under contention - [`0e900ac568`](https://github.com/Ding-Ding-Projects/worldlens/commit/0e900ac5681974ac409e59f9308ee685d63118a0)
- Make watcher timing checks contention-safe - [`fbf70c32d4`](https://github.com/Ding-Ding-Projects/worldlens/commit/fbf70c32d42e06fa457ffac9b65da68493ca5d2e)
- Model upstream client decompression - [`856fcc0a59`](https://github.com/Ding-Ding-Projects/worldlens/commit/856fcc0a5941e14f396b3f1a4cf119319ed11110)

### Desktop shell

- Say which scopes the sign-in asks for, and advertise the app honestly or not at all - [`b3b18ae79f`](https://github.com/Ding-Ding-Projects/worldlens/commit/b3b18ae79f5e1da60b3c38943a7042b6a77bcbd4)
- Assert the canonical credential helper path - [`270b250463`](https://github.com/Ding-Ding-Projects/worldlens/commit/270b250463c045f9e1689da4c41d21b21ce2e142)

### Build, release and tooling

- Check out BlueMap's own submodule before building it - [`b63f3fd022`](https://github.com/Ding-Ding-Projects/worldlens/commit/b63f3fd022fcd025c1818c3a36dac9e7f5baecd9)
- Merge branch 'assisted-gh-login' - [`db11147da2`](https://github.com/Ding-Ding-Projects/worldlens/commit/db11147da295067e69479a02cddcba6851d78f4c) _(summary of 2 commits, also listed here)_
- Stop the render workflow assuming it runs inside this repository, and hand off - [`45483ee5e5`](https://github.com/Ding-Ding-Projects/worldlens/commit/45483ee5e5bf395b229e977016c65760e073ebfe)
- Advance BlueMap to v5.23, and fix two defects the upgrade itself exposed - [`763684e772`](https://github.com/Ding-Ding-Projects/worldlens/commit/763684e77258b5ee6276e4f83720bb524446085f)

### Documentation

- Recapture for the sign-in panel's new scope disclosure - [`2f02d65447`](https://github.com/Ding-Ding-Projects/worldlens/commit/2f02d6544769add2ee048c9cc5e394bdae98b127)
- Internal maintenance message omitted from the public changelog - [`194add465c`](https://github.com/Ding-Ding-Projects/worldlens/commit/194add465c00ba6cab0e4e8c6359e3c6c0705914)
- Internal maintenance message omitted from the public changelog - [`bcf1f3b3b0`](https://github.com/Ding-Ding-Projects/worldlens/commit/bcf1f3b3b041948cf2ffc199de01ce67f87528b1) _(summary of 3 commits, also listed here)_
- Make the GitHub CLI a required dependency the bootstrap checks and installs - [`4e38c7460d`](https://github.com/Ding-Ding-Projects/worldlens/commit/4e38c7460db1c9bd359ac3ef852752dd11130ef7)
- Refresh configuration inventory docs - [`e53cd94b35`](https://github.com/Ding-Ding-Projects/worldlens/commit/e53cd94b352c58f0db27c9fbc479499681c5de22)
- Internal maintenance message omitted from the public changelog - [`3e35525aaf`](https://github.com/Ding-Ding-Projects/worldlens/commit/3e35525aaf372ea674a18f4cbfb870511d58d8dd) _(summary of 4 commits, also listed here)_
- Refresh the capture gallery against the merged tree - [`855fdf219f`](https://github.com/Ding-Ding-Projects/worldlens/commit/855fdf219ff4a601bd58b2b3c7356e845e8b961a)
- Fix seven defects an adversarial pass found in the day's own work - [`eff400fb81`](https://github.com/Ding-Ding-Projects/worldlens/commit/eff400fb81e8ee493ee7d3fe36664e3a49ab8b86)
- Lead with the map, and replace every capture from one run against a real world - [`eae243da7e`](https://github.com/Ding-Ding-Projects/worldlens/commit/eae243da7ec4fc60f93980e8bbafc30ba3ddd756)
- Give markers their own documentation category, and add a worked Bayville example - [`807491d0de`](https://github.com/Ding-Ding-Projects/worldlens/commit/807491d0de631b8b30acf97e57a751c27eb5b529)
- Paint the Home layer's own background instead of borrowing a child's - [`80f1e51573`](https://github.com/Ding-Ding-Projects/worldlens/commit/80f1e51573d9dc744d684b8b99a9673d6ac008ce)
- Photograph the surfaces that shipped unphotographed, and fix two that could not be - [`8b50828e92`](https://github.com/Ding-Ding-Projects/worldlens/commit/8b50828e927783145e81887d52d8c0c5ea8a7059)
- Document the five features that shipped without an article - [`b145e52b61`](https://github.com/Ding-Ding-Projects/worldlens/commit/b145e52b61721d830b0fd721925326ecc5966a7c)

### Elsewhere in the repository

- Align redesign inventory with schema - [`8a218ee98d`](https://github.com/Ding-Ding-Projects/worldlens/commit/8a218ee98dc2ad566927c92dad7cd884768b5863)

## 1.0.1082 - 2026-08-13

Tagged at [`f88a9e04a1`](https://github.com/Ding-Ding-Projects/worldlens/commit/f88a9e04a11631c3ae0b21c16c04b75672f8736f).

### Interface

- Give the three unreachable surfaces a page, and guard the whole class - [`8483b3da45`](https://github.com/Ding-Ding-Projects/worldlens/commit/8483b3da45737573cde00151f07cad1171bbaca1)
- Resolve the five-lane integration and gate the new destructive actions - [`13e04dda63`](https://github.com/Ding-Ding-Projects/worldlens/commit/13e04dda6311f7bb32cb4e90a0a54556dbf2e03c) _(summary of 2 commits, also listed here)_
- Reconcile the four merged lanes with the catalogue and section guards - [`8dd5474c05`](https://github.com/Ding-Ding-Projects/worldlens/commit/8dd5474c05a3b6590f41b07fba06655d888f916a)
- Merge the authenticator lane - [`af5627b8b9`](https://github.com/Ding-Ding-Projects/worldlens/commit/af5627b8b93ecfcda3ab33949fcdd03f00a3e3ad) _(summary of 2 commits, also listed here)_
- Add the built-in authenticator surface: local QR pairing, live TOTP codes - [`2ad99a0ba3`](https://github.com/Ding-Ding-Projects/worldlens/commit/2ad99a0ba34110481350ff81f09b71e745f4438d)
- Merge the vocabulary lane - [`e7880f6ab9`](https://github.com/Ding-Ding-Projects/worldlens/commit/e7880f6ab9342010e6c3e825876294ce369d8288) _(summary of 2 commits, also listed here)_
- Add local personal-vocabulary JSON upload control to app settings - [`c4e2f9e433`](https://github.com/Ding-Ding-Projects/worldlens/commit/c4e2f9e43359a3c4ca0940aba40c5da6cd9c5404)
- Merge the dimsum lane - [`03f97d3fa8`](https://github.com/Ding-Ding-Projects/worldlens/commit/03f97d3fa8ad041e7f812b5fd1e36927a64d2766) _(summary of 2 commits, also listed here)_
- Add the dim sum startup surprise (10% chance, non-blocking) - [`f20430f06a`](https://github.com/Ding-Ding-Projects/worldlens/commit/f20430f06a46694f488d59406c6c16615e0afa6a)
- Stop the structure list recording a render that never ran - [`c2769621e5`](https://github.com/Ding-Ding-Projects/worldlens/commit/c2769621e5b0b36ffc1f3a9412e36b40268abb3a)

### Desktop shell

- Render dropped structures and schematics, and land on the map page - [`73d57dfe4d`](https://github.com/Ding-Ding-Projects/worldlens/commit/73d57dfe4db7b63a508046278f5517c8cf988816)
- Merge the structure discovery and render lane - [`1cef631556`](https://github.com/Ding-Ding-Projects/worldlens/commit/1cef631556409262a0fa5d4dcad92b0fe9130142) _(summary of 2 commits, also listed here)_
- Make structure discovery and rendering real, not a stub - [`3da39defd0`](https://github.com/Ding-Ding-Projects/worldlens/commit/3da39defd04af8376bda86fa776c2e799bba0ea1)

### Build, release and tooling

- Give the Gradle wrapper its absolute path so a local build can start - [`b4cdc0c943`](https://github.com/Ding-Ding-Projects/worldlens/commit/b4cdc0c9430b81ef13f8a825a404e8d87ae370f4)

## 1.0.1077 - 2026-08-12

Tagged at [`b769c22527`](https://github.com/Ding-Ding-Projects/worldlens/commit/b769c2252758d7b7d8b64b34609707c119d814a6).

### Interface

- Stop the drop zone eating the window, and gate the two bulk deletes - [`3db6f58384`](https://github.com/Ding-Ding-Projects/worldlens/commit/3db6f583849c980209b3d6e6b1a66559b49f6041)
- Voice the three keys the new pages added - [`1a8f700caa`](https://github.com/Ding-Ding-Projects/worldlens/commit/1a8f700caaea42db7843ea4189e4206abb774c80)
- Put the structures list on a page somebody can actually open - [`f340ee71c4`](https://github.com/Ding-Ding-Projects/worldlens/commit/f340ee71c4d00adc63d5c7f58e2ff2b668ec9271)
- Accept a structure or schematic dropped onto the window - [`1fec4a2ba8`](https://github.com/Ding-Ding-Projects/worldlens/commit/1fec4a2ba809cfaee8103e540929929223f6b72c)
- Find the structures a world already holds, and render them one at a time - [`534cc594c6`](https://github.com/Ding-Ding-Projects/worldlens/commit/534cc594c6deef1e786364459093768baeb97a54)
- Draw studio markers on the map, and offer the studio where the dead end was - [`d3b212d914`](https://github.com/Ding-Ding-Projects/worldlens/commit/d3b212d914695cf23a7877e97a9bf3e92e2f097c)
- Internal maintenance message omitted from the public changelog - [`5070dcd37d`](https://github.com/Ding-Ding-Projects/worldlens/commit/5070dcd37ddcadf65bd36a698cb2c5921fff963f)
- Give the update banner a surface, and the Maps page a way back to a render - [`fafb946383`](https://github.com/Ding-Ding-Projects/worldlens/commit/fafb9463834e2b0f28367cc63d0aa63a5b368f8d)

### Rendering and world data

- Let the host say who draws the chrome, so only one bar renders - [`2b9c3be848`](https://github.com/Ding-Ding-Projects/worldlens/commit/2b9c3be848a646705670e40b434cd513bbd6e709)

### Desktop shell

- Guard the one line that makes the startup update check reach anybody - [`30c5442ed0`](https://github.com/Ding-Ding-Projects/worldlens/commit/30c5442ed050f59fd303f637941986ee824d8bf4)

## 1.0.1068 - 2026-08-12

Tagged at [`47547f485a`](https://github.com/Ding-Ding-Projects/worldlens/commit/47547f485a6ce6c2cd5a45e7770861195d8c61dc).

### Interface

- Stub elementsFromPoint, which was failing CI under a table of 735 passes - [`ae12dd672a`](https://github.com/Ding-Ding-Projects/worldlens/commit/ae12dd672a55bba5d2280819ac2202587deff817)
- Internal maintenance message omitted from the public changelog - [`57a32d6437`](https://github.com/Ding-Ding-Projects/worldlens/commit/57a32d6437861d62105722f369d19b2b961c84a5)
- Voice every lock and Support Tickets string, in both languages - [`62dcd754e2`](https://github.com/Ding-Ding-Projects/worldlens/commit/62dcd754e293798e9d92baae3349ccae8a1ff265)
- Add the lock list, the recovery desk, and the article for both - [`ceff013df8`](https://github.com/Ding-Ding-Projects/worldlens/commit/ceff013df84b352e8c6cea83638c57f046e8783e)
- Put the locks on the wrapper every element already wears - [`57a3c4f8b0`](https://github.com/Ding-Ding-Projects/worldlens/commit/57a3c4f8b07b6e37938a187e6baa001061d00613)
- Give the toy locks a store and the two surfaces a person meets - [`c0d5d37453`](https://github.com/Ding-Ding-Projects/worldlens/commit/c0d5d374534436903d94240dd95d665db04faf8c)
- Lay the toy locks' foundation: RFC 6238, and a lock that holds no secret - [`fe8a208bb1`](https://github.com/Ding-Ding-Projects/worldlens/commit/fe8a208bb14421f8167d4402707dda3fdab6388c)
- Drop the duplicate maskField the merge left behind - [`ab70d39a91`](https://github.com/Ding-Ding-Projects/worldlens/commit/ab70d39a91c46efc604c0afd203f64ae86c6207f)
- Internal maintenance message omitted from the public changelog - [`4dcdbeb18a`](https://github.com/Ding-Ding-Projects/worldlens/commit/4dcdbeb18ad60df242bb50e7f8740e558349a799)

### Build, release and tooling

- Take the lint job out of CI entirely - [`2f154daec5`](https://github.com/Ding-Ding-Projects/worldlens/commit/2f154daec58fda852bc2d2bea35c647ca7c759d7)
- Internal maintenance message omitted from the public changelog - [`e378236687`](https://github.com/Ding-Ding-Projects/worldlens/commit/e3782366879bc380462a6ce9b99e2aeebb443dc1)

### Documentation

- Merge branch 'main' of https://github.com/Ding-Ding-Projects/worldlens - [`a688c72aeb`](https://github.com/Ding-Ding-Projects/worldlens/commit/a688c72aeb55c9cd15a55ab89aa3251ed9ba6fce) _(summary of 83 commits, also listed here)_

## 1.0.1056 - 2026-08-11

Tagged at [`1faab0b9be`](https://github.com/Ding-Ding-Projects/worldlens/commit/1faab0b9be564e349d7bd1d7128466ea9ecd0d0b).

### Build, release and tooling

- Provision Java for cold-start builds - [`c25c6036e5`](https://github.com/Ding-Ding-Projects/worldlens/commit/c25c6036e5e74ab4bcccde5eb2f4a07c71914fea)

### Elsewhere in the repository

- Verify installers with PowerShell 7 - [`8bbc2db146`](https://github.com/Ding-Ding-Projects/worldlens/commit/8bbc2db146df85c61d35ac2bef6ae50955ba3c95)
- Flatten live CI run inventory - [`89049295a0`](https://github.com/Ding-Ding-Projects/worldlens/commit/89049295a0ee25aa31245c27b4ead71f9ba3037b)
- Harden installer identity comparison - [`0f8984a135`](https://github.com/Ding-Ding-Projects/worldlens/commit/0f8984a13549cfabd3160cf14f4c493c6eee4335)
- Carry Java into installer packaging - [`92cf4d99e7`](https://github.com/Ding-Ding-Projects/worldlens/commit/92cf4d99e74a0524d59d72909cea99cb6d2844e1)

## 1.0.1050 - 2026-08-11

Tagged at [`d27f29eb69`](https://github.com/Ding-Ding-Projects/worldlens/commit/d27f29eb694ef30af92ad58ba5d2ed137ad89689).

### Interface

- fix(a11y): 44px touch targets for the four biggest undersized clusters - [`9826f20ba4`](https://github.com/Ding-Ding-Projects/worldlens/commit/9826f20ba45cee10804aac3788a21e30119df373)
- feat(project editor): collapse the structure column, and give the settings the room - [`63d195d701`](https://github.com/Ding-Ding-Projects/worldlens/commit/63d195d701cb1a26e2ab440888a2b0b72a71bf2d)

### Landing page and documentation site

- Add mobile tab context-menu buttons - [`cc8fbb9cae`](https://github.com/Ding-Ding-Projects/worldlens/commit/cc8fbb9caec4f4bfaa9a87a9b1c0ccfa4d7b16b6)
- docs(site): name the three unbuilt contract features instead of omitting them - [`223d8fe385`](https://github.com/Ding-Ding-Projects/worldlens/commit/223d8fe385f33f7456387a7df5d4fcae57018c5e)

### Build, release and tooling

- Repair silent installer bootstrap - [`701e4f6af2`](https://github.com/Ding-Ding-Projects/worldlens/commit/701e4f6af2312e9d3d9c91e4255674ee7aa49db8)

## 1.0.1044 - 2026-08-11

Tagged at [`97b591ef45`](https://github.com/Ding-Ding-Projects/worldlens/commit/97b591ef45e11d5eba657f26c8bfd0a4eabd53e3).

### Interface

- fix(path-field): pin the browse controls to 44px through the component, not the sheet - [`1dee292518`](https://github.com/Ding-Ding-Projects/worldlens/commit/1dee2925189cee7202e3e4822cfeea56b2ba8b1e)
- fix(path-field): give the browse controls a 44px touch target - [`0ba36bf32f`](https://github.com/Ding-Ding-Projects/worldlens/commit/0ba36bf32f1227060755e5744d19b442de80a30f)
- fix(path-field): wrap the browse controls, and make the harness say by how much - [`5f780d7490`](https://github.com/Ding-Ding-Projects/worldlens/commit/5f780d749036ad8d9d134d9e479d06c80e315f8e)
- fix(docker): wrap the source-kind toggle instead of running it off the screen - [`78a6b57196`](https://github.com/Ding-Ding-Projects/worldlens/commit/78a6b571961459867137c6c211d36a0661f8f8e9)
- fix(docker): let the world-source toggle wrap its label instead of clipping it - [`d0d579d389`](https://github.com/Ding-Ding-Projects/worldlens/commit/d0d579d389b55c9aee6b1e53aba994555399b9e0)
- fix(settings): the reset buttons name the panel, so let the name wrap - [`b8f8903cb6`](https://github.com/Ding-Ding-Projects/worldlens/commit/b8f8903cb6d067da24e0e4219ec5547e24116e0f)
- fix(tabs): a side strip that measured the window instead of the room it was in - [`46df0c0b9c`](https://github.com/Ding-Ding-Projects/worldlens/commit/46df0c0b9c7cb1f5fd16247dfd6a2585ac6b3392)
- fix(shell): a column that was a row, and three labels the strip was eating - [`93b5cfcf8d`](https://github.com/Ding-Ding-Projects/worldlens/commit/93b5cfcf8d06350566b93f7eeae57e5658bba6b2)
- fix(shell): stop the editor eating the rail, and five surfaces that clipped - [`20aeb2d5cc`](https://github.com/Ding-Ding-Projects/worldlens/commit/20aeb2d5cc94534a6663add3fe4a3c9a2480fa7a)
- fix(shell): catalogue rows open the section they name - [`42c58e0e7b`](https://github.com/Ding-Ding-Projects/worldlens/commit/42c58e0e7b4212c30f7e8f6a483fed4f08d9859e)
- fix(shell): give the status strip's progress bar a value, on the scale the app produces - [`5784865610`](https://github.com/Ding-Ding-Projects/worldlens/commit/57848656109af21355a8d9d29b84c9bee7dc0489)

### Rendering and world data

- fix(viewer): a malformed size header no longer claims computable progress - [`91bf9898e8`](https://github.com/Ding-Ding-Projects/worldlens/commit/91bf9898e8074c5564ec7e16f65ca6e68275973a)

### Desktop shell

- fix(cirender): subscribe to the child's close before awaiting the pipeline - [`4d511d6c90`](https://github.com/Ding-Ding-Projects/worldlens/commit/4d511d6c9024db215b6de4db7c027332ffca3509)

### Landing page and documentation site

- fix(site): the landing page no longer contradicts what shipped - [`8c9a69fbfb`](https://github.com/Ding-Ding-Projects/worldlens/commit/8c9a69fbfb87a266a4edb4c223ace90f0456ca9d)

### Documentation

- docs(screenshots): replace every capture from the current build - [`7ea5730671`](https://github.com/Ding-Ding-Projects/worldlens/commit/7ea573067177f41c66e413ef8926dac5ee0e69f0)
- docs: record the eleven defects, and the four shapes that keep producing them - [`038f991b39`](https://github.com/Ding-Ding-Projects/worldlens/commit/038f991b39ab9edbbadb44c21f234e8618ad27d6)
- ci(workflows): assert the release condition and the changelog step in the linter - [`057e8e5389`](https://github.com/Ding-Ding-Projects/worldlens/commit/057e8e5389b5d9673f8573dbf4965be3043797b4)
- docs(agents): make updating GitHub Pages and refusing stale content a repository rule - [`d54147c5ab`](https://github.com/Ding-Ding-Projects/worldlens/commit/d54147c5aba1baa47bcd986e9e7b41e95586f74e)

## 1.0.1017 - 2026-08-10

Tagged at [`86cdbb3c8b`](https://github.com/Ding-Ding-Projects/worldlens/commit/86cdbb3c8be48687715a2d346a037c83a9f5175f).

### Build, release and tooling

- feat!: Worldlens 1.0 - the verified public baseline - [`6ad26921ab`](https://github.com/Ding-Ding-Projects/worldlens/commit/6ad26921abe7aa5c081929ccbc1a2ab2bab09ba1)

### Documentation

- docs: complete the bilingual corpus - every article carries its Cantonese section - [`93486bafbe`](https://github.com/Ding-Ding-Projects/worldlens/commit/93486bafbe6194c01148e48e86fee3b45f4e71a6)
- docs: add Hong Kong Cantonese sections, seventh wave - [`c02f6addd6`](https://github.com/Ding-Ding-Projects/worldlens/commit/c02f6addd64b47397651ab2076170695a1f63cd3)
- docs: add Hong Kong Cantonese sections, sixth wave - [`65ad7f4be3`](https://github.com/Ding-Ding-Projects/worldlens/commit/65ad7f4be34b36273927c7bbf212c010e16a8a7a)
- docs: add Hong Kong Cantonese sections, fifth wave - [`5b5f89a5c1`](https://github.com/Ding-Ding-Projects/worldlens/commit/5b5f89a5c12d5b13676fa896a43f8f25184039ff)
- docs: add Hong Kong Cantonese sections, fourth wave - [`45f0ee2515`](https://github.com/Ding-Ding-Projects/worldlens/commit/45f0ee251599345fd5ccf4d36bccdd3adcb45f34)
- test(identity): pin the Pages legacy marker to its bilingual site count - [`00fc212a40`](https://github.com/Ding-Ding-Projects/worldlens/commit/00fc212a40606c875718cb95b93a4b459900938b)
- docs: add Hong Kong Cantonese sections, fourth wave - [`e55ed6dc63`](https://github.com/Ding-Ding-Projects/worldlens/commit/e55ed6dc631e8099bc5164b6588253f72aaab1d4)
- docs: add Hong Kong Cantonese sections, third wave - [`6466b058a0`](https://github.com/Ding-Ding-Projects/worldlens/commit/6466b058a035b39abe450568d4e7a4762ee5c1f3)
- docs: add Hong Kong Cantonese sections, second wave - [`6834e53b7f`](https://github.com/Ding-Ding-Projects/worldlens/commit/6834e53b7f12752ab31fd49e35b0c7b5cb2999d3)
- docs: add Hong Kong Cantonese sections to the first ten articles - [`13848c1a62`](https://github.com/Ding-Ding-Projects/worldlens/commit/13848c1a62e8fc1a1289a041b06ddb5640bde4fc)

## 0.1.996 - 2026-08-10

Tagged at [`3785004fae`](https://github.com/Ding-Ding-Projects/worldlens/commit/3785004faed122ef302d45d280fb6ca6bc714c9f).

### Documentation

- feat(a11y): phase A accessibility - skip path, disclosure contracts, fail-closed shell numbers - [`fac7ea510e`](https://github.com/Ding-Ding-Projects/worldlens/commit/fac7ea510eab33cd6928d919e403749ebf44d2f1)

## 0.1.993 - 2026-08-10

Tagged at [`62619660d7`](https://github.com/Ding-Ding-Projects/worldlens/commit/62619660d7977ef912e09dbdddd4e23ac278ebf4).

### Build, release and tooling

- fix(release): give the completion stamp a window a real publish can meet - [`9b36be9319`](https://github.com/Ding-Ding-Projects/worldlens/commit/9b36be9319066f436c2b6836979cc596481d7ae8)

## 0.1.988 - 2026-08-10

Tagged at [`cb729355ab`](https://github.com/Ding-Ding-Projects/worldlens/commit/cb729355abc18b2b165eee5d4a0a3e832170695d).

### Interface

- fix(ui): revert the second corrupted splice of the project editor - [`e7307afff3`](https://github.com/Ding-Ding-Projects/worldlens/commit/e7307afff3da656f0a973da93dd9ee6acca621cc)
- Merge branch 'codex/rewrite-electron-from-redesign-final' - [`b8174ef0ae`](https://github.com/Ding-Ding-Projects/worldlens/commit/b8174ef0ae766f00cb468f214c35d853023bc48e) _(summary of 2 commits, also listed here)_
- Merge remote-tracking branch 'origin/main' into codex/rewrite-electron-from-redesign-final - [`922a5af92b`](https://github.com/Ding-Ding-Projects/worldlens/commit/922a5af92b4bdc272399482686613bdc451b73e5) _(summary of 11 commits, also listed here)_
- Repair imported UI source defects - [`ad702c0f59`](https://github.com/Ding-Ding-Projects/worldlens/commit/ad702c0f59c5f0daabf426bfbefc8a643397a47e)
- fix(ui): repair the botched merge so the redesign is actually the shipped UI - [`b46faee213`](https://github.com/Ding-Ding-Projects/worldlens/commit/b46faee21337f0431b070f21d21501f2d2c94411)
- Merge remote-tracking branch 'origin/codex/rewrite-electron-from-redesign-final' - [`110e8cc161`](https://github.com/Ding-Ding-Projects/worldlens/commit/110e8cc16111fc265809a958f7017e314a4ddb02) _(summary of 21 commits, also listed here)_
- feat(project): route map masks through one editor - [`45bb81fde0`](https://github.com/Ding-Ding-Projects/worldlens/commit/45bb81fde0fcc9bab3215529a67ab68eb904bba1)
- feat(notifications): keep redesigned shells history-only - [`45fa6f42ae`](https://github.com/Ding-Ding-Projects/worldlens/commit/45fa6f42ae9583506c9a42e69de377ed390227a2)
- fix(project): narrow legacy render routes safely - [`98db049c5e`](https://github.com/Ding-Ding-Projects/worldlens/commit/98db049c5eabc7b2519c96d6976033a0420aa9c7)
- fix(shell): make contrast mode actually reach 21 to 1 - [`4358ba022b`](https://github.com/Ding-Ding-Projects/worldlens/commit/4358ba022bb155d8df1b8b0f1c628034a2003932)
- feat(project): make every generated editor setting inspectable - [`3a68acb63d`](https://github.com/Ding-Ding-Projects/worldlens/commit/3a68acb63dd818f425efe67564b2345a3f4c9d32)
- feat(app): share School mode through a credential-checked record - [`67ad204589`](https://github.com/Ding-Ding-Projects/worldlens/commit/67ad2045892e7707ad983d34556a989c31e6caae)
- feat(settings): make School mode undiscoverable by its hidden capabilities - [`f21178c85a`](https://github.com/Ding-Ding-Projects/worldlens/commit/f21178c85a70b442e8439ff8cb27c359eabc3f78)
- feat(settings): add an honest local School mode policy - [`ab6a5bfa70`](https://github.com/Ding-Ding-Projects/worldlens/commit/ab6a5bfa709c99e929b1fbe756bff3002dee80af)
- docs(project): describe the review-before-save discovery flow - [`1e05967b1c`](https://github.com/Ding-Ding-Projects/worldlens/commit/1e05967b1cd429d59e4026314a33a61b2121a4f6)
- feat(project): rebuild the editor as a resolved three-pane workspace - [`6c3b1ecd45`](https://github.com/Ding-Ding-Projects/worldlens/commit/6c3b1ecd45bafec6c45871f72ba8f4d9c087579b)
- test(notifications): prove the configuration toast reaches the shell - [`2aa7a11adb`](https://github.com/Ding-Ding-Projects/worldlens/commit/2aa7a11adb79144c55e01d8bf4538689e7499b60)
- fix(shell): make the rail notification bell control its panel - [`545d35b81a`](https://github.com/Ding-Ding-Projects/worldlens/commit/545d35b81ad6aab68079ab06f91003f21db26934)
- fix(project): require explicit save before world project writes - [`af21df2292`](https://github.com/Ding-Ding-Projects/worldlens/commit/af21df22927bb7b590ee1701d7f4b914bc4afdb6)
- Add shared render-mask editor card & route proof - [`b90cc57146`](https://github.com/Ding-Ding-Projects/worldlens/commit/b90cc5714659ba69e73ad047d753dec07518790d)

### Rendering and world data

- feat(viewer): localize the served Material shell - [`264897262a`](https://github.com/Ding-Ding-Projects/worldlens/commit/264897262ac0ed163df3e694493691e590c33884)
- feat(viewer): preserve preferences through School mode - [`e3101aa276`](https://github.com/Ding-Ding-Projects/worldlens/commit/e3101aa2764ebc7c34403a07d53dcbeb550b1d9d)
- feat(viewer): expose terrain actions to keyboard users - [`38508e74c2`](https://github.com/Ding-Ding-Projects/worldlens/commit/38508e74c2191df6e8491b3361452f1c7bf6c75c)
- feat(viewer): make served map controls genuinely operable - [`96207e9975`](https://github.com/Ding-Ding-Projects/worldlens/commit/96207e997565b65bc862770caf01f4498102c69e)
- feat(viewer): make the served map shell compact and keyboard-safe - [`4e475fa6aa`](https://github.com/Ding-Ding-Projects/worldlens/commit/4e475fa6aac9fe9366e86f5982bd3f7451cf850b)

### Desktop shell

- fix(cirender): survive a child that exits without reading its stdin - [`eb2663e1f3`](https://github.com/Ding-Ding-Projects/worldlens/commit/eb2663e1f32b1be08074c77d96762389ed512c3c)
- fix: reconcile rename finalizer and modal inventory with the site rework - [`838c11a299`](https://github.com/Ding-Ding-Projects/worldlens/commit/838c11a299889e81ebbf6bd67743943e689d300b)
- fix: make the whole workspace test suite green (727 files) - [`6e1387ddba`](https://github.com/Ding-Ding-Projects/worldlens/commit/6e1387ddbace4b66743e078ffce4683c09bc9ddd)
- Repair baseline typecheck, lint, and screenshot evidence - [`b3f556547c`](https://github.com/Ding-Ding-Projects/worldlens/commit/b3f556547c4c6431911d49ffdf7953419bbc7cc1)
- test(captures): exercise rail notifications and fresh config toasts - [`01db881ca4`](https://github.com/Ding-Ding-Projects/worldlens/commit/01db881ca4edf73e97e8f3f49b7f1d098728f3d8)
- Merge branch 'codex/credential-boundary-20260808' - [`316e1a1112`](https://github.com/Ding-Ding-Projects/worldlens/commit/316e1a11128faa6421e111d302334c6f6e6d3983) _(summary of 3 commits, also listed here)_
- Route every GitHub credential through the gh CLI and delete the in-app token store - [`2a3684f6b4`](https://github.com/Ding-Ding-Projects/worldlens/commit/2a3684f6b45b37f9a665636192ce81c2942554d3)
- Auto commit 2026-08-09 20:05:25.178Z - [`5b35d6cf1b`](https://github.com/Ding-Ding-Projects/worldlens/commit/5b35d6cf1b55814a615da0a295bb47456b439cdf)

### Landing page and documentation site

- Merge remote-tracking branch 'origin/main' - [`fb80340bfd`](https://github.com/Ding-Ding-Projects/worldlens/commit/fb80340bfd912a6e445e9aa855da3a37c8b99c4f) _(summary of 18 commits, also listed here)_
- Render article blocks through supported conditions - [`d4f020d84f`](https://github.com/Ding-Ding-Projects/worldlens/commit/d4f020d84faef38a3a2081a0ed619177fe665146)
- Retarget compact proof to the canonical site runtime - [`cb1ef1ff3b`](https://github.com/Ding-Ding-Projects/worldlens/commit/cb1ef1ff3b20dfbe1e8177ccd335ecd3f908dbfd)
- Retarget compact proof to the canonical site runtime - [`c60e085f55`](https://github.com/Ding-Ding-Projects/worldlens/commit/c60e085f551883af94e9f8ad03946dad26755375)
- Complete responsive archive site controls - [`f731dd2615`](https://github.com/Ding-Ding-Projects/worldlens/commit/f731dd26152d4b5ce59556b4ef42c29aa328bc6a)
- Harden the offline archive runtime - [`1b2e9b1c65`](https://github.com/Ding-Ding-Projects/worldlens/commit/1b2e9b1c6544bd0b54cbb4994819d4dfc2b47840)
- Merge remote-tracking branch 'origin/main' - [`51f08d4c2b`](https://github.com/Ding-Ding-Projects/worldlens/commit/51f08d4c2bc522c104d7c23f33bf070a78b264d3) _(summary of 6 commits, also listed here)_
- Replace Pages site with the supplied Material Design 3 experience - [`f641518bbd`](https://github.com/Ding-Ding-Projects/worldlens/commit/f641518bbd0c5beb3f009444495cf3bd4ee6fede)

### Build, release and tooling

- fix(changelog): canonicalize UTC timestamps across git versions - [`5c1990b8d3`](https://github.com/Ding-Ding-Projects/worldlens/commit/5c1990b8d39b8336f9056083b84b44a067c05bac)
- feat(changelog): show the first difference when --check fails - [`1c751821c0`](https://github.com/Ding-Ding-Projects/worldlens/commit/1c751821c06ed9b65719e1cd340caa870a129ffd)
- fix(changelog): restore the generated-only fixed point and stop grading generated data as interface source - [`b30c3fdf96`](https://github.com/Ding-Ding-Projects/worldlens/commit/b30c3fdf96aae48841868a5e8ed327c84d4d789c)
- Require green correctness checks before release - [`77f833cb92`](https://github.com/Ding-Ding-Projects/worldlens/commit/77f833cb927996f82f8bfc768f8a66f5c6339ad8)

### Documentation

- feat(project): autosave with a travelling git history, and redesign fidelity - [`3572208c64`](https://github.com/Ding-Ding-Projects/worldlens/commit/3572208c64f20bc06d99e97d73901962de0e6191)
- Merge remote-tracking branch 'origin/main' - [`21f2babd0b`](https://github.com/Ding-Ding-Projects/worldlens/commit/21f2babd0bad778cce2a79507e094bae82000a26) _(summary of 3 commits, also listed here)_
- Record the reconciled default-branch handoff - [`4b00c14492`](https://github.com/Ding-Ding-Projects/worldlens/commit/4b00c14492f18c2e994bb88ad76b25012a294713)
- Capture the deployed documentation article - [`90a66a85da`](https://github.com/Ding-Ding-Projects/worldlens/commit/90a66a85dab807d7e14de65d8da6cae295758a78)
- Document the Pages redesign handoff - [`3f487aa236`](https://github.com/Ding-Ding-Projects/worldlens/commit/3f487aa23674340bde029509f9b15de409b4e7a2)
- Capture the legacy GitHub credential surface - [`67767606ad`](https://github.com/Ding-Ding-Projects/worldlens/commit/67767606adb555d974d727a91301e113ad43ae88)

### Elsewhere in the repository

- Merge branch 'main' of https://github.com/Ding-Ding-Projects/worldlens - [`4db20ee446`](https://github.com/Ding-Ding-Projects/worldlens/commit/4db20ee44619941bd61013795461b3126497c29d) _(summary of 94 commits, also listed here)_
- Harden fresh-host release tooling - [`973bcd120f`](https://github.com/Ding-Ding-Projects/worldlens/commit/973bcd120f52d727b2a6739d624eeaede574ccf4)
- Merge current main and preserve project editor fixes - [`09c2bfcd1a`](https://github.com/Ding-Ding-Projects/worldlens/commit/09c2bfcd1a5ce040ee8d0d4250e470ff380e5228) _(summary of 3 commits, also listed here)_
- Merge the compact proof lineage - [`54e796b10e`](https://github.com/Ding-Ding-Projects/worldlens/commit/54e796b10ed3182494b124c424d1d6204dde582c) _(summary of 2 commits, also listed here)_
- Make local release builds fail closed - [`40ab4a6ca7`](https://github.com/Ding-Ding-Projects/worldlens/commit/40ab4a6ca7afe66979f3e6fa442d75d9e12f318a)
- Merge concurrent redesign-folder work with the Pages replacement - [`f79df8fea2`](https://github.com/Ding-Ding-Projects/worldlens/commit/f79df8fea24f9d9e4a8a1a9985c35f7277c938b5) _(summary of 3 commits, also listed here)_
- fix(redesign): keep App.vue byte-identical to design/packages/ui - [`ca11561438`](https://github.com/Ding-Ding-Projects/worldlens/commit/ca11561438dbadc09000e5345df5fe370f03bb31)
- feat(redesign): write the full UI into the redesign folder - [`2bcaed7fc9`](https://github.com/Ding-Ding-Projects/worldlens/commit/2bcaed7fc9e6bbd30864934d8a3c0542ead14100)
- Merge pull request #136 from Ding-Ding-Projects/codex/rewrite-electron-from-redesign - [`3e89b4a87a`](https://github.com/Ding-Ding-Projects/worldlens/commit/3e89b4a87a10a7847468d9979680f0f886d9daef) _(summary of 2 commits, also listed here)_

## 0.1.943 - 2026-08-09

Tagged at [`ef45eea249`](https://github.com/Ding-Ding-Projects/worldlens/commit/ef45eea2494e9266d291d7b4d3235650819516cf).

### Interface

- fix(ui): stop the viewer forging a theme nobody chose - [`ef45eea249`](https://github.com/Ding-Ding-Projects/worldlens/commit/ef45eea2494e9266d291d7b4d3235650819516cf)

## 0.1.938 - 2026-08-09

Tagged at [`83aad54fa5`](https://github.com/Ding-Ding-Projects/worldlens/commit/83aad54fa53218dc29801a1f5968a3b71f0bafb1).

### Documentation

- fix(app): photograph the theme by using the theme control, not a media query - [`83aad54fa5`](https://github.com/Ding-Ding-Projects/worldlens/commit/83aad54fa53218dc29801a1f5968a3b71f0bafb1)

## 0.1.935 - 2026-08-09

Tagged at [`618c441fd7`](https://github.com/Ding-Ding-Projects/worldlens/commit/618c441fd7b425a985bbc30ad0a7f755cb3b2083).

### Interface

- fix(ui): give the map drawer Material Design 3, and clear ten rules that matched nothing - [`618c441fd7`](https://github.com/Ding-Ding-Projects/worldlens/commit/618c441fd7b425a985bbc30ad0a7f755cb3b2083)

## 0.1.931 - 2026-08-09

Tagged at [`924e7fdfb6`](https://github.com/Ding-Ding-Projects/worldlens/commit/924e7fdfb642a516f7d29a5d926486f3f4f1ab78).

### Landing page and documentation site

- Internal maintenance message omitted from the public changelog - [`924e7fdfb6`](https://github.com/Ding-Ding-Projects/worldlens/commit/924e7fdfb642a516f7d29a5d926486f3f4f1ab78)

## 0.1.922 - 2026-08-09

Tagged at [`e57ded531c`](https://github.com/Ding-Ding-Projects/worldlens/commit/e57ded531c2388a5563487dbd41ffdea7737ce1d).

### Landing page and documentation site

- fix(site): stop a top-docked rail hanging a scrim over the whole page - [`e57ded531c`](https://github.com/Ding-Ding-Projects/worldlens/commit/e57ded531c2388a5563487dbd41ffdea7737ce1d)

## 0.1.920 - 2026-08-09

Tagged at [`11a89a367a`](https://github.com/Ding-Ding-Projects/worldlens/commit/11a89a367af21b989bce18701b5110c61262dabd).

### Build, release and tooling

- chore: keep the installer's stashed version out of the repository - [`11a89a367a`](https://github.com/Ding-Ding-Projects/worldlens/commit/11a89a367af21b989bce18701b5110c61262dabd)

## 0.1.917 - 2026-08-09

Tagged at [`d22f5d1f43`](https://github.com/Ding-Ding-Projects/worldlens/commit/d22f5d1f4337825c37f7ccffb9a2b09fca2fe856).

### Build, release and tooling

- Merge the parallel Electron redesign branch, which fixed the same defect from the other side - [`d22f5d1f43`](https://github.com/Ding-Ding-Projects/worldlens/commit/d22f5d1f4337825c37f7ccffb9a2b09fca2fe856) _(summary of 3 commits, also listed here)_
- merge: reconcile current main before Electron redesign - [`215e849101`](https://github.com/Ding-Ding-Projects/worldlens/commit/215e849101bd96edf6140eabdef88c38da9038f9) _(summary of 14 commits, also listed here)_
- fix(build): order shared colour roles before site generation - [`5f2e4c5d88`](https://github.com/Ding-Ding-Projects/worldlens/commit/5f2e4c5d88f96a1a7caece39dbd46419e7ff8c4e)

## 0.1.916 - 2026-08-09

Tagged at [`3f3c213eb6`](https://github.com/Ding-Ding-Projects/worldlens/commit/3f3c213eb6c333022c709f9ea35491119c8bf3b2).

### Interface

- fix(tutorial): make the two map steps describe the thing they are pointing at - [`3f3c213eb6`](https://github.com/Ding-Ding-Projects/worldlens/commit/3f3c213eb6c333022c709f9ea35491119c8bf3b2)

### Documentation

- fix(docs): stop the captures describing an application that no longer exists - [`511edcd867`](https://github.com/Ding-Ding-Projects/worldlens/commit/511edcd8677ee6c0ecbf796b6896f1c702a5cb15)

## 0.1.912 - 2026-08-09

Tagged at [`16325aa135`](https://github.com/Ding-Ding-Projects/worldlens/commit/16325aa1352642087882671c9d7cfce4e4491e47).

### Interface

- feat(ui): rewrite the project editor to the prototype, and make it name real values - [`16325aa135`](https://github.com/Ding-Ding-Projects/worldlens/commit/16325aa1352642087882671c9d7cfce4e4491e47)

## 0.1.910 - 2026-08-09

Tagged at [`5d9cf99e74`](https://github.com/Ding-Ding-Projects/worldlens/commit/5d9cf99e7426e26cd29bb7e0d8179a31c85470cb).

### Desktop shell

- Finish automatic updater safety and bound screenshot capture - [`5202fd564e`](https://github.com/Ding-Ding-Projects/worldlens/commit/5202fd564ed08ea20bea6ccd4aff55a31e8b3d51)
- Keep resource branding lint-clean - [`100625f679`](https://github.com/Ding-Ding-Projects/worldlens/commit/100625f6799d35f19940d432ccc03d0be865e43d)

### Landing page and documentation site

- feat(site): the eleven features the documentation site was quietly missing - [`16f539da63`](https://github.com/Ding-Ding-Projects/worldlens/commit/16f539da63263082a4f2ebf15b58aec297232963)
- Internal maintenance message omitted from the public changelog - [`d3c5e9be38`](https://github.com/Ding-Ding-Projects/worldlens/commit/d3c5e9be38c56904b70edae240e1da2e817d12f5)

### Build, release and tooling

- Merge release integrity, and stop one missing build step failing four jobs - [`5d9cf99e74`](https://github.com/Ding-Ding-Projects/worldlens/commit/5d9cf99e7426e26cd29bb7e0d8179a31c85470cb) _(summary of 13 commits, also listed here)_
- Give the package, tag and update feed one SemVer identity, and stop losing rollback evidence at launch - [`0418d182a8`](https://github.com/Ding-Ding-Projects/worldlens/commit/0418d182a812e6407c3abd522547b11360a7ed6f)
- Make release publication prove itself before going public - [`672d7b95af`](https://github.com/Ding-Ding-Projects/worldlens/commit/672d7b95afd81a5db724de027d39e7827520d2cc)
- Pin every workflow action and make captures advisory - [`ecae18e578`](https://github.com/Ding-Ding-Projects/worldlens/commit/ecae18e5783c34919cc13c21d18b5d68b45476ab)
- Pin hosted runners and audit unsigned executables - [`a957bb8ec4`](https://github.com/Ding-Ding-Projects/worldlens/commit/a957bb8ec4ab04693e319f85ea664a47d4ed5e89)
- Repair release lock and workflow fingerprints - [`867e3fe424`](https://github.com/Ding-Ding-Projects/worldlens/commit/867e3fe424b1ef290efd4f72ed2b9425a264c79e)
- Lay unsigned release integrity foundations - [`dc61e79688`](https://github.com/Ding-Ding-Projects/worldlens/commit/dc61e79688951cdc4e5f1000abb78aefe83c14b7)

### Documentation

- Gate releases on fresh integrity records - [`42f1988abf`](https://github.com/Ding-Ding-Projects/worldlens/commit/42f1988abf15503a752aa47441f628b5553d9501)
- Internal maintenance message omitted from the public changelog - [`1930a6c914`](https://github.com/Ding-Ding-Projects/worldlens/commit/1930a6c914dfcbdcb877ecb4255cbe1d6130b8f6)

## 0.1.0-build.905 - 2026-08-09

Tagged at [`b49bbaa2d1`](https://github.com/Ding-Ding-Projects/worldlens/commit/b49bbaa2d11650575b49693cda418b9407142764).

### Interface

- fix(ui): un-bury the job strip, and stop a red test taking the screenshots with it - [`b49bbaa2d1`](https://github.com/Ding-Ding-Projects/worldlens/commit/b49bbaa2d11650575b49693cda418b9407142764)
- Internal maintenance message omitted from the public changelog - [`4b8d210763`](https://github.com/Ding-Ding-Projects/worldlens/commit/4b8d21076338f701cd798ad0516367ba2986b1e9)
- feat(copy): give the new shell its own words, in both languages - [`e72588333a`](https://github.com/Ding-Ding-Projects/worldlens/commit/e72588333a91d62dfff969b5f7c5f6078a0f2759)

### Documentation

- fix(build): stamp an installer version newer than whatever is installed - [`15e60ae561`](https://github.com/Ding-Ding-Projects/worldlens/commit/15e60ae561f39733994aad0fb852a1f0ba640336)

## 0.1.0-phase7.1 - 2026-08-09

Tagged at [`5ba8093571`](https://github.com/Ding-Ding-Projects/worldlens/commit/5ba8093571bab80eed3ec24fa60327747daeaf38).

### Interface

- Internal maintenance message omitted from the public changelog - [`5ba8093571`](https://github.com/Ding-Ding-Projects/worldlens/commit/5ba8093571bab80eed3ec24fa60327747daeaf38)

## 0.1.0-phase6.1 - 2026-08-09

Tagged at [`41e5314b7a`](https://github.com/Ding-Ding-Projects/worldlens/commit/41e5314b7ad17510797cfb0d27e83bc69055c10b).

### Interface

- test(shell): judge the new surfaces on behaviour, not on snapshots - [`41e5314b7a`](https://github.com/Ding-Ding-Projects/worldlens/commit/41e5314b7ad17510797cfb0d27e83bc69055c10b)
- feat(map,work): the control bar as one pill, and the job strip as tabs rather than buttons - [`44e6f03c5f`](https://github.com/Ding-Ding-Projects/worldlens/commit/44e6f03c5f598bc0f74054bd9c5596029fd551d3)
- feat(catalogue): give the list the prototype own anatomy, not an approximation of it - [`81f1d08a51`](https://github.com/Ding-Ding-Projects/worldlens/commit/81f1d08a51ec67c0fb765ca4c41e58e3db942c6e)
- feat(shell): match the approved prototype value for value, not just in shape - [`844298d1c6`](https://github.com/Ding-Ding-Projects/worldlens/commit/844298d1c60d418ebfeb1943b999b205e37d63e2)
- Merge branch 'main' of https://github.com/Ding-Ding-Projects/worldlens - [`4bbadb0aae`](https://github.com/Ding-Ding-Projects/worldlens/commit/4bbadb0aae05c248980d06239922c64ff0d4a8e7) _(summary of 46 commits, also listed here)_

### Rendering and world data

- feat(tokens): one colour source, so the app and the served map stop being two products - [`6455d30706`](https://github.com/Ding-Ding-Projects/worldlens/commit/6455d307065b9e482869fcb206078da0368e1df7)

### Documentation

- docs(handoff): the state the next session should read first - [`a0c99c6f89`](https://github.com/Ding-Ding-Projects/worldlens/commit/a0c99c6f89c80160012fb1406a0e0cec8e7f71b5)

### Elsewhere in the repository

- Add redesign zip folder for clarity - [`d9d18ed20f`](https://github.com/Ding-Ding-Projects/worldlens/commit/d9d18ed20f114c02065cdf28b4dfef25b3c1e1f8)

## 0.1.0-phase4.2 - 2026-08-08

Tagged at [`99c316da81`](https://github.com/Ding-Ding-Projects/worldlens/commit/99c316da81a3664f9c1546f24bba4e34f8a0d9eb).

### Interface

- feat(theme): open dark on a fresh install, and collect installers into one folder - [`99c316da81`](https://github.com/Ding-Ding-Projects/worldlens/commit/99c316da81a3664f9c1546f24bba4e34f8a0d9eb)
- test(shell): the last five, and the App suite is green - [`aedb971e0d`](https://github.com/Ding-Ding-Projects/worldlens/commit/aedb971e0db92836c856023efa02a6e26c91bad7)
- test(shell): assert what a destination is showing, not which layers exist - [`5e7c034006`](https://github.com/Ding-Ding-Projects/worldlens/commit/5e7c034006d562d4360368dc9a9d91fdc0acd51c)
- test(shell): assert the new information architecture instead of the old one - [`d38aba6636`](https://github.com/Ding-Ding-Projects/worldlens/commit/d38aba6636ca4642dc9ae1f39b304c21a4638c5b)
- test(shell): open the options editor the way the product now opens it - [`1f47553129`](https://github.com/Ding-Ding-Projects/worldlens/commit/1f47553129ea70f5c17222445cfcb184a9e167b6)

### Documentation

- docs(readme): describe the shell somebody actually opens, and say which phases are real - [`0db4de0292`](https://github.com/Ding-Ding-Projects/worldlens/commit/0db4de029234e35730b7c18d3b4c778175bbd709)

## 0.1.0-phase4.1 - 2026-08-08

Tagged at [`cb3dd0194e`](https://github.com/Ding-Ding-Projects/worldlens/commit/cb3dd0194e05d909834724b8ce91e690719821a2).

### Interface

- feat(shell): add the status strip, the problems panel and the anchored history - [`cb3dd0194e`](https://github.com/Ding-Ding-Projects/worldlens/commit/cb3dd0194e05d909834724b8ce91e690719821a2)
- test(shell): replace the FAB clearance contract with a no-FAB one, and teach App.test to use the rail - [`108ebb86e8`](https://github.com/Ding-Ding-Projects/worldlens/commit/108ebb86e8ba2b7c9329468684dbeeba874ea0d7)
- feat(shell): make the rail the shell, and stop the map being a tab - [`dc5d83a12f`](https://github.com/Ding-Ding-Projects/worldlens/commit/dc5d83a12f21baecba88f3744f896aec48cd50b4)
- feat(shell): build the rail, the five cards, the catalogue list and the Work host - [`7cbb6d2491`](https://github.com/Ding-Ding-Projects/worldlens/commit/7cbb6d24914bce197a2e0ff9ab02855fd6951029)
- fix(ci): drop the unused icon import, and stop a lint error withholding the installer - [`1e4671ca36`](https://github.com/Ding-Ding-Projects/worldlens/commit/1e4671ca361bccf9d9847dbfdee7b5d2d71c4244)
- feat(tabs): let a host seed a short strip without shrinking what the strip can hold - [`37d995b8bc`](https://github.com/Ding-Ding-Projects/worldlens/commit/37d995b8bc252499ba07977a58f5c3676aa72cff)
- feat(shell): route every catalogue row through one door, and migrate the old strip - [`6ceaa62c25`](https://github.com/Ding-Ding-Projects/worldlens/commit/6ceaa62c25b601f47c69c9a7c77640cfcf13f59f)
- feat(shell): teach the app its own map of itself, as typed data - [`1190aad355`](https://github.com/Ding-Ding-Projects/worldlens/commit/1190aad355df76e578c9b18f4c3fee3c6c17637e)

### Build, release and tooling

- ci: give lint its own job, so a style rule stops withholding the installer - [`f52a24b095`](https://github.com/Ding-Ding-Projects/worldlens/commit/f52a24b09594f3220ccdbc492d34f66f7a79eeda)

### Documentation

- docs(handoff): record the shell rewrite, including the twenty tests that are still red - [`8f817df87a`](https://github.com/Ding-Ding-Projects/worldlens/commit/8f817df87a32561eab21e4bbeacb0eb958ddb6f1)
- docs(agents): say the commit author too, not only the trailer - [`54eb95b2ff`](https://github.com/Ding-Ding-Projects/worldlens/commit/54eb95b2ffc45d871217e6d82602b30a940db3fe)
- docs(agents): mirror the build-script, lint and authorship rules into the public copy - [`7c858dd393`](https://github.com/Ding-Ding-Projects/worldlens/commit/7c858dd393c74e839f8329acc9805a4717456f24)

### Elsewhere in the repository

- fix(build): look for the installer where electron-builder actually writes it - [`44fa2ffc8f`](https://github.com/Ding-Ding-Projects/worldlens/commit/44fa2ffc8f57a97633fa01c7eba9bcc75916aa8d)
- feat(build): two scripts at the root that assume the machine has nothing - [`11615b7a61`](https://github.com/Ding-Ding-Projects/worldlens/commit/11615b7a616cb6a7c010a32874a2a21d47635736)

## 0.1.0-build.862 - 2026-08-08

Tagged at [`324e21d07b`](https://github.com/Ding-Ding-Projects/worldlens/commit/324e21d07bceabf69131250c42f6cf3c104b0500).

### Interface

- Merge pull request #124 from Ding-Ding-Projects/claude/interface-usability-clipping-k4to32 - [`6de9bc2b38`](https://github.com/Ding-Ding-Projects/worldlens/commit/6de9bc2b38c7f451a9e4e1346464330efc380a40) _(summary of 22 commits, also listed here)_
- feat(ui): seed the navigation groups open, and let the names do the de-cluttering - [`a9f9cb1133`](https://github.com/Ding-Ding-Projects/worldlens/commit/a9f9cb11334c0215db305df9b77ee2001a39d5c2)
- fix(ui): forward publishesInset narrowed, so the workspace typecheck passes - [`85ef858a6f`](https://github.com/Ding-Ding-Projects/worldlens/commit/85ef858a6fa8e46226cec818c5967387afccae5b)
- test(ui): read the group header's size and flex from the one rule that owns them - [`b08fa1575d`](https://github.com/Ding-Ding-Projects/worldlens/commit/b08fa1575db9c23bea831b2963606f6ebc7d20e3)
- fix(ui): two regressions the full suite caught, one of them a shadowed rule - [`860607abf9`](https://github.com/Ding-Ding-Projects/worldlens/commit/860607abf927fe034e05c7851e92d23cb5322457)
- fix(ui): only the shell's strip publishes its inset, and it measures the right edge - [`7eee7d046b`](https://github.com/Ding-Ding-Projects/worldlens/commit/7eee7d046bbc9033b8f4a768f207e8678906f01e)
- fix(ui): the shell's buttons sat on top of the tab strip, and a group's menu below it - [`4a77ce9d20`](https://github.com/Ding-Ding-Projects/worldlens/commit/4a77ce9d207a82849f28363c8c43114249813094)
- feat(ui): Material Design 3 Expressive motion, and two reduced-motion holes it exposed - [`a8350329b6`](https://github.com/Ding-Ding-Projects/worldlens/commit/a8350329b6915e4bdbad3902c13ef68564a76080)
- wip(ui): checkpoint the motion pass, verified green mid-flight - [`f5ba0ed6a6`](https://github.com/Ding-Ding-Projects/worldlens/commit/f5ba0ed6a67f1e2931ac68bc88a8283cb5bf024d)
- fix(ui): the wizard's run-options row was level only by coincidence - [`135c6a4dd1`](https://github.com/Ding-Ding-Projects/worldlens/commit/135c6a4dd151a9ddce7adb34963872f946f6ade2)
- feat(ui): the whole Material Design 3 token system, not only its colour half - [`b518db6f18`](https://github.com/Ding-Ding-Projects/worldlens/commit/b518db6f1898a30ff2a70de78cd18e5b97498c9c)
- feat(ui): Home becomes a landing a newcomer can read, not a wall of 25 cards - [`34dd475692`](https://github.com/Ding-Ding-Projects/worldlens/commit/34dd4756927daca306ad93a09f61f0a96a6a5295)
- fix(ui): the consent row lost the space after its colon, in every language - [`0821ab09b2`](https://github.com/Ding-Ding-Projects/worldlens/commit/0821ab09b2efcc99d72c4f12d114497b0ed24626)
- wip(ui): checkpoint the Home and navigation de-clutter waves mid-flight - [`4f04fe39eb`](https://github.com/Ding-Ding-Projects/worldlens/commit/4f04fe39eb8ad2d548fa23b987e4ab3480669dd9)

### Desktop shell

- test(app): press a collapsed group at DOM level when the click cannot land - [`ad99045528`](https://github.com/Ding-Ding-Projects/worldlens/commit/ad990455288ac49f60f83681eb42a7eab6453ad4)
- test(app): one more route to a tab, and say what the strip held when none worked - [`6546f7287e`](https://github.com/Ding-Ding-Projects/worldlens/commit/6546f7287e743c901d5150700a128df53dee0ec3)
- test(app): capture with reduced motion, so a click is not racing an animation - [`3dcab132ca`](https://github.com/Ding-Ding-Projects/worldlens/commit/3dcab132ca3d097929efef7f5eeab9db461388ff)
- test(app): the capture harness opens one tab group at a time, not all three - [`82f51bc085`](https://github.com/Ding-Ding-Projects/worldlens/commit/82f51bc085b9daf689b121a87b29a5f2b35288a8)

### Build, release and tooling

- Internal maintenance message omitted from the public changelog - [`324e21d07b`](https://github.com/Ding-Ding-Projects/worldlens/commit/324e21d07bceabf69131250c42f6cf3c104b0500) _(summary of 2 commits, also listed here)_
- Harden fresh-checkout bootstrap recovery - [`7ca58da466`](https://github.com/Ding-Ding-Projects/worldlens/commit/7ca58da466334dc06dc4b3acbac64b6b5c37f0d0)

### Documentation

- Merge origin/main into PR branch - [`2350a0cada`](https://github.com/Ding-Ding-Projects/worldlens/commit/2350a0cada82118b7e7e932d74211c32795c9599) _(summary of 82 commits, also listed here)_
- docs: record what the screenshot harness found, including what is left unfixed - [`7a38fdabd7`](https://github.com/Ding-Ding-Projects/worldlens/commit/7a38fdabd76927e58bd7191cd05361597fc886bc)
- docs: record the interface rewrite in HANDOFF - [`75d69084a7`](https://github.com/Ding-Ding-Projects/worldlens/commit/75d69084a7dc599fafb0b8b6ce55507c163d67cf)
- docs: the design system, and why Vuetify's own scale had to be re-pointed - [`576cb3bf3c`](https://github.com/Ding-Ding-Projects/worldlens/commit/576cb3bf3ccbce134170bea3b29d994137d1b3c7)

## 0.1.0-build.828 - 2026-08-08

Tagged at [`e18a0a9d8f`](https://github.com/Ding-Ding-Projects/worldlens/commit/e18a0a9d8f1e66251e1b290012ca4d7275e9a070).

### Interface

- docs: include server-hosted UI article in application index - [`e18a0a9d8f`](https://github.com/Ding-Ding-Projects/worldlens/commit/e18a0a9d8f1e66251e1b290012ca4d7275e9a070)

### Rendering and world data

- Integrate hosted Material 3 map UI / 合併 M3 server UI 同右鍵圖釘 - [`b5020c4a61`](https://github.com/Ding-Ding-Projects/worldlens/commit/b5020c4a6143dcbdbc49573efa5a47f29dd2e5d6) _(summary of 2 commits, also listed here)_
- Rewrite hosted map chrome with Material 3 / 右鍵加圖釘，地圖唔再裸奔 - [`6476dcd5e7`](https://github.com/Ding-Ding-Projects/worldlens/commit/6476dcd5e79823bca1b5b49b4ab6e3756e9a5e1f)

### Desktop shell

- test: restore map target after wizard capture - [`a101810f22`](https://github.com/Ding-Ding-Projects/worldlens/commit/a101810f22b09bc376db41833a7669c6cd14c43f)

## 0.1.0-build.823 - 2026-08-08

Tagged at [`44c5ae12c5`](https://github.com/Ding-Ding-Projects/worldlens/commit/44c5ae12c538770c6dae9ba3db6c6e00727669d9).

### Desktop shell

- test: skip popup capture without a visible map canvas - [`44c5ae12c5`](https://github.com/Ding-Ding-Projects/worldlens/commit/44c5ae12c538770c6dae9ba3db6c6e00727669d9)

## 0.1.0-build.821 - 2026-08-08

Tagged at [`26d9072cdc`](https://github.com/Ding-Ding-Projects/worldlens/commit/26d9072cdc8d478dde84dc1f712db3de4b063eb3).

### Desktop shell

- test: reset wizard state before render-location capture - [`26d9072cdc`](https://github.com/Ding-Ding-Projects/worldlens/commit/26d9072cdc8d478dde84dc1f712db3de4b063eb3)

## 0.1.0-build.819 - 2026-08-07

Tagged at [`07158651bb`](https://github.com/Ding-Ding-Projects/worldlens/commit/07158651bba24eeab15fcad9d709961606622673).

### Interface

- Merge packaged shell and settings layout fixes - [`8d5673ce5a`](https://github.com/Ding-Ding-Projects/worldlens/commit/8d5673ce5a17ba710733f31c12d3926285968466) _(summary of 2 commits, also listed here)_
- Fix narrow settings layout and CI portability - [`235056376e`](https://github.com/Ding-Ding-Projects/worldlens/commit/235056376e7e24fa2e5043370036262830c01679)
- Merge color picker viewport clamp - [`e880d12bc9`](https://github.com/Ding-Ding-Projects/worldlens/commit/e880d12bc94bb7345d3f5a2eeef2123d0bd8286b) _(summary of 2 commits, also listed here)_
- Clamp color picker popover to narrow viewports - [`09f9807b7d`](https://github.com/Ding-Ding-Projects/worldlens/commit/09f9807b7d9c3b682990024eec9b4579b7d1ca1e)
- Merge configuration heading layout fixes - [`0be5011aab`](https://github.com/Ding-Ding-Projects/worldlens/commit/0be5011aabff357c76d0c87ada65d781f9c7f8ed) _(summary of 2 commits, also listed here)_
- Fix narrow configuration group heading wrapping - [`ad88593649`](https://github.com/Ding-Ding-Projects/worldlens/commit/ad88593649b774617d2d9bd4ae83ec2d494e4fd4)
- Merge remote browser narrow layout - [`a755698531`](https://github.com/Ding-Ding-Projects/worldlens/commit/a75569853176cb718248661296d735d17b1bd5ff) _(summary of 2 commits, also listed here)_
- Prevent remote listing horizontal scroll trap - [`6b9c3515f4`](https://github.com/Ding-Ding-Projects/worldlens/commit/6b9c3515f498500edef3cfaf129eb7059de5ea08)
- Merge tab menu viewport clamp - [`9ef92354d5`](https://github.com/Ding-Ding-Projects/worldlens/commit/9ef92354d5d57fb3d0c0c1fbcfda039849880244) _(summary of 2 commits, also listed here)_
- Fix tab menu narrow viewport sizing - [`f362c3ad7c`](https://github.com/Ding-Ding-Projects/worldlens/commit/f362c3ad7c69ec42b9ed658fb5b573f2c68c8aa3)
- Merge guided GitHub CLI setup - [`fcbb8d1f50`](https://github.com/Ding-Ding-Projects/worldlens/commit/fcbb8d1f502bef79af1b23e6ccba1530798f6863) _(summary of 2 commits, also listed here)_
- Install GitHub CLI before GUI sign-in - [`c975e61d01`](https://github.com/Ding-Ding-Projects/worldlens/commit/c975e61d01ba94841191d31749eb5b404c1f08f9)
- Merge resilient cloud setup and project controls - [`a6239d5bba`](https://github.com/Ding-Ding-Projects/worldlens/commit/a6239d5bbaaf7e20cc574286e87f6ae9265c2d7b) _(summary of 7 commits, also listed here)_
- Install GitHub CLI before GUI sign-in - [`eeb62933d3`](https://github.com/Ding-Ding-Projects/worldlens/commit/eeb62933d39f4cb88238d683a134439f10d6e3ae)
- Reconcile concurrent default-branch updates - [`452acced47`](https://github.com/Ding-Ding-Projects/worldlens/commit/452acced47d05757bf5b3c81b7264abcac4880bf) _(summary of 11 commits, also listed here)_
- Merge interface usability and clipping sweep - [`ece4753992`](https://github.com/Ding-Ding-Projects/worldlens/commit/ece47539929b469fabfcea39cd412aa5d5d05066) _(summary of 5 commits, also listed here)_
- refactor(ui): the corner stack holds the two workbench controls, not four - [`7f286b0c26`](https://github.com/Ding-Ding-Projects/worldlens/commit/7f286b0c2604510a3165e1badb205a590548ab21)
- fix(ui): five sizing rules that clipped translated or bilingual text - [`db358c1c3b`](https://github.com/Ding-Ding-Projects/worldlens/commit/db358c1c3b98d830700dca29e1534d6fc929c6dd)
- Merge resilient cloud rendering and bounded world uploads - [`5ca2a9bdef`](https://github.com/Ding-Ding-Projects/worldlens/commit/5ca2a9bdef53b31bbe24de412483fdbaa55e58f2) _(summary of 7 commits, also listed here)_
- Fix managed-workflow conflict copy - [`c8424cf4ee`](https://github.com/Ding-Ding-Projects/worldlens/commit/c8424cf4eef8b2c6bfa0717a3bfd9566a613336f)
- Add resilient cloud render setup and project automation - [`16ad0bd9b0`](https://github.com/Ding-Ding-Projects/worldlens/commit/16ad0bd9b0819db0369dd781bb964ffee09c26f8)
- Merge config accessibility repairs - [`2409385e2f`](https://github.com/Ding-Ding-Projects/worldlens/commit/2409385e2f0ef78423e811d8b75bab6d8f4429da) _(summary of 2 commits, also listed here)_
- Fix config disclosure accessibility - [`4d0d47e5b9`](https://github.com/Ding-Ding-Projects/worldlens/commit/4d0d47e5b93b89a7b3d1eb0c742ab7ec5bffe48c)
- Merge tab group chip layout fixes - [`e5a52e27b1`](https://github.com/Ding-Ding-Projects/worldlens/commit/e5a52e27b1576c2adb2ba8ee7c4ebdad172593ef) _(summary of 2 commits, also listed here)_
- Fix tab-group chip clipping - [`eac2f7e890`](https://github.com/Ding-Ding-Projects/worldlens/commit/eac2f7e8908b8add07d918f25fa5183833ba04ef)
- Merge concurrent main updates - [`8326a2cd4f`](https://github.com/Ding-Ding-Projects/worldlens/commit/8326a2cd4f35c9a5e475a4282505c62accf0a8ba) _(summary of 6 commits, also listed here)_
- Merge pull request #121 from Ding-Ding-Projects/claude/interface-usability-clipping-k4to32 - [`e8c222cb72`](https://github.com/Ding-Ding-Projects/worldlens/commit/e8c222cb7222b827fdcbed479eaa4766c1a79d6a) _(summary of 5 commits, also listed here)_
- fix(ui): finish the flexed v-card-title sweep for real - the CI-render row was the last one - [`418559f1b1`](https://github.com/Ding-Ding-Projects/worldlens/commit/418559f1b120b7999c3041d3b8144601450926f5)
- feat(ui): complete the Material Design 3 colour system across all three themes - [`dfcc4923be`](https://github.com/Ding-Ding-Projects/worldlens/commit/dfcc4923bef8f8501d11c70b8181bb4aa986420d)
- Merge chip layout fixes for render offers - [`db902bc2ed`](https://github.com/Ding-Ding-Projects/worldlens/commit/db902bc2ed07b0a4473327641dd385455d2a8660) _(summary of 2 commits, also listed here)_
- Wrap Worldlens map metadata chips - [`7527ff9f9e`](https://github.com/Ding-Ding-Projects/worldlens/commit/7527ff9f9ea1f7d5c3845fbeb68292e4015b1037)
- Merge card title clipping safeguards - [`d1814a2e1e`](https://github.com/Ding-Ding-Projects/worldlens/commit/d1814a2e1e45f3382b445921aaece86196cd6ca9) _(summary of 6 commits, also listed here)_
- Unify responsive card-title geometry - [`a4538d22b1`](https://github.com/Ding-Ding-Projects/worldlens/commit/a4538d22b16a6f4df0f74f83a407859986f16de2)
- Merge remote-tracking branch 'origin/main' into codex/phase-clipping-card-titles - [`286403dc6c`](https://github.com/Ding-Ding-Projects/worldlens/commit/286403dc6cd1bf46c71b1fbe7c84f4b4eb6ed97d) _(summary of 3 commits, also listed here)_
- Fix cloud-safe Vue source assertions - [`d130a2febc`](https://github.com/Ding-Ding-Projects/worldlens/commit/d130a2febc72b16d2138752e4a3020cba9458931)

### Rendering and world data

- Merge viewer popup edge containment - [`50c8787877`](https://github.com/Ding-Ding-Projects/worldlens/commit/50c87878776d26b8fad023fed426b5252090794a) _(summary of 2 commits, also listed here)_
- Prove viewer popup edge retention - [`ff5ab38420`](https://github.com/Ding-Ding-Projects/worldlens/commit/ff5ab38420cbf710b88fdfb2a04489245dbae587)

### Desktop shell

- Merge startup policy test portability fix - [`07158651bb`](https://github.com/Ding-Ding-Projects/worldlens/commit/07158651bba24eeab15fcad9d709961606622673) _(summary of 2 commits, also listed here)_
- test: accept multiline user-data pinning - [`5ea3a62c14`](https://github.com/Ding-Ding-Projects/worldlens/commit/5ea3a62c1479c4801b4871cc4e0702aec49093bc)
- Merge first-run screenshot isolation - [`335e160737`](https://github.com/Ding-Ding-Projects/worldlens/commit/335e16073768408ba54fdf305c6ecd383532a310) _(summary of 2 commits, also listed here)_
- test: isolate onboarding screenshot storage - [`be70670721`](https://github.com/Ding-Ding-Projects/worldlens/commit/be70670721f7089e418b4b58ccfee9839a6f8ab4)
- Merge resilient screenshot capture harness - [`c4bbe96cc9`](https://github.com/Ding-Ding-Projects/worldlens/commit/c4bbe96cc9c55de47e81eb5c70e4353b6922a976) _(summary of 3 commits, also listed here)_
- test: restore isolated full screenshot capture - [`21dcde270f`](https://github.com/Ding-Ding-Projects/worldlens/commit/21dcde270f5e5f1b8e637fb7cde4ffa55430b8d5)
- test: align startup wiring and docs coverage - [`effdc0ce16`](https://github.com/Ding-Ding-Projects/worldlens/commit/effdc0ce16e6e8401d992f8a7b5b0b2be0f803a8)
- Merge bounded world upload batches - [`e2252406a7`](https://github.com/Ding-Ding-Projects/worldlens/commit/e2252406a788605e6e6a6401465fd4d6b3e71a99) _(summary of 3 commits, also listed here)_
- Fix world upload lint findings - [`73cf166b09`](https://github.com/Ding-Ding-Projects/worldlens/commit/73cf166b09f8f7c25d9357a6fc37008281ab95c5)
- Bound world repository uploads to 1.5 GB batches - [`87751099fc`](https://github.com/Ding-Ding-Projects/worldlens/commit/87751099fc813a45ca79245a3ab9445ba6a851d9)
- Merge atomic managed workflow updates - [`4c1d5c5eef`](https://github.com/Ding-Ding-Projects/worldlens/commit/4c1d5c5eef21146b63a50ce9cbf26943c66e7457) _(summary of 2 commits, also listed here)_
- Make managed workflow updates atomic - [`2690652914`](https://github.com/Ding-Ding-Projects/worldlens/commit/26906529142ca014362e55561b8c4bdfdf639aac)
- Fix world marker privacy regression test - [`917b503f2b`](https://github.com/Ding-Ding-Projects/worldlens/commit/917b503f2b89f705baa57713ceed8124b3039e35)
- Fix world upload lint findings - [`8ce7382f35`](https://github.com/Ding-Ding-Projects/worldlens/commit/8ce7382f35577b70ece4056dd659498d598902aa)
- Bound world repository uploads to 1.5 GB batches - [`5a29e16729`](https://github.com/Ding-Ding-Projects/worldlens/commit/5a29e16729e7d835edad1bca888f0490cebf12fb)
- Make managed workflow updates atomic - [`18bbbf5538`](https://github.com/Ding-Ding-Projects/worldlens/commit/18bbbf553805839c62ab2d7426fe00d1681e895c)
- Verify granted GitHub login scopes - [`605348c4de`](https://github.com/Ding-Ding-Projects/worldlens/commit/605348c4de8dde1c18aee4da2096bc8194a0f382) _(summary of 2 commits, also listed here)_
- Verify stored GitHub CLI OAuth scopes - [`f592f9f7c8`](https://github.com/Ding-Ding-Projects/worldlens/commit/f592f9f7c8932b9395638dba4254c8345cf15751)
- Merge in-app GitHub device sign-in - [`51d2281e7d`](https://github.com/Ding-Ding-Projects/worldlens/commit/51d2281e7dff7fe70d55e868dc7341ea94a46ee6) _(summary of 3 commits, also listed here)_
- Fix unused gh IPC type import - [`b6a1e5466e`](https://github.com/Ding-Ding-Projects/worldlens/commit/b6a1e5466e179c9d71c7032a67b725738cc89361)
- Add in-app gh device sign-in - [`c101270b8f`](https://github.com/Ding-Ding-Projects/worldlens/commit/c101270b8f0f55ef71416314f7f18311c91a131a)
- Restore Squirrel desktop shortcuts and enforce Worldlens logo - [`d56f651cb1`](https://github.com/Ding-Ding-Projects/worldlens/commit/d56f651cb17108f6e2a0e3b4766ade8e9419f626)
- Merge startup recovery after Pages shell - [`b7486a1bbc`](https://github.com/Ding-Ding-Projects/worldlens/commit/b7486a1bbc2a4419ba6d21748604c224a5774b50) _(summary of 5 commits, also listed here)_
- Make brand freshness check platform-safe - [`bc464aca56`](https://github.com/Ding-Ding-Projects/worldlens/commit/bc464aca565ae368366ef7f3bfc0b19b71bdf1fa)
- Add recoverable startup flow and Worldlens brand - [`6a8b9a6988`](https://github.com/Ding-Ding-Projects/worldlens/commit/6a8b9a6988ea6fc81ee27753f1a55b7bbd556dd1)

### Landing page and documentation site

- fix(site): the two corner cards never overlap, and compact tabs truncate honestly - [`a9025c3190`](https://github.com/Ding-Ding-Projects/worldlens/commit/a9025c31909bb4d37d89f3bd624009fa03794be4)
- Merge branch 'main' into claude/interface-usability-clipping-k4to32 - [`849af2a21d`](https://github.com/Ding-Ding-Projects/worldlens/commit/849af2a21dca6a9dc72531d50cf9a4eb2085a284) _(summary of 18 commits, also listed here)_
- Prevent bilingual button label clipping - [`c9757f5a37`](https://github.com/Ding-Ding-Projects/worldlens/commit/c9757f5a374128427c5a545309d030028f79be2e)
- Use Worldlens logo in expressive Pages shell - [`5aebaf4f31`](https://github.com/Ding-Ding-Projects/worldlens/commit/5aebaf4f310deae929f1faf88e5e178041b85bfb)
- Merge Material 3 Pages rebuild - [`de324d7a59`](https://github.com/Ding-Ding-Projects/worldlens/commit/de324d7a59b4fc96dab17cb0c3518f50d32b31a9) _(summary of 3 commits, also listed here)_
- feat(site): rebuild Pages as an M3 Expressive app shell - [`db8dfcd748`](https://github.com/Ding-Ding-Projects/worldlens/commit/db8dfcd74831e5421e9a5b492d8c4da8ade7774e)

### Build, release and tooling

- test: require complete screenshot evidence inventory - [`44871ee215`](https://github.com/Ding-Ding-Projects/worldlens/commit/44871ee21523d5bd21153ba5206231620fb58ab0)
- Merge screenshot evidence guard and CI wiring fixes - [`c54760b27c`](https://github.com/Ding-Ding-Projects/worldlens/commit/c54760b27c441453416f20e84e4628868182a4db) _(summary of 3 commits, also listed here)_
- test: require complete screenshot evidence inventory - [`d9a677f878`](https://github.com/Ding-Ding-Projects/worldlens/commit/d9a677f878e6d324a7056257e3f72fb2f6d0c226)
- Reconcile concurrent default-branch updates - [`b09cab5fef`](https://github.com/Ding-Ding-Projects/worldlens/commit/b09cab5fefa6e63e546fc7ac05567013f7d6e0fe) _(summary of 4 commits, also listed here)_

### Documentation

- Merge refreshed application screenshot evidence - [`dd9ae3ac2d`](https://github.com/Ding-Ding-Projects/worldlens/commit/dd9ae3ac2d27c99aad4e9a69fe5c92690c31950e) _(summary of 2 commits, also listed here)_
- docs: replace complete application screenshot set - [`b4d479e70e`](https://github.com/Ding-Ding-Projects/worldlens/commit/b4d479e70edb7625f657e91398a80d5e3d434403)
- docs: record the clipping sweep, de-clutter wave and full-gate results in HANDOFF - [`ccc1dbfdca`](https://github.com/Ding-Ding-Projects/worldlens/commit/ccc1dbfdca2dfa3719f856b2b4007013f2c9a37b)
- docs: record the display/ease-of-use and MD3 token waves in HANDOFF - [`2df5d01e4e`](https://github.com/Ding-Ding-Projects/worldlens/commit/2df5d01e4e4c06d8c01aac3b9356cc21168b6268)
- Record card-title clipping baseline surfaces - [`0a0e12b356`](https://github.com/Ding-Ding-Projects/worldlens/commit/0a0e12b3561b5dee0a532a91aeeba2dc7d42d8d7)
- Merge Worldlens identity finalization into clipping phase - [`66f2778b4d`](https://github.com/Ding-Ding-Projects/worldlens/commit/66f2778b4d10a9d212747665551eecb4af1fdf73) _(summary of 4 commits, also listed here)_
- merge: align resilience work with finalized Worldlens main - [`730d52cb40`](https://github.com/Ding-Ding-Projects/worldlens/commit/730d52cb403bbd7e5db59d48d598ab3191d578fa) _(summary of 4 commits, also listed here)_
- docs(site): capture the pre-rewrite Pages baseline - [`e5ff0d5a3c`](https://github.com/Ding-Ding-Projects/worldlens/commit/e5ff0d5a3ca3e51e4f14415aef9b5daaaac84de3)

### Elsewhere in the repository

- docs: capture the blocked startup baseline - [`9e13b93358`](https://github.com/Ding-Ding-Projects/worldlens/commit/9e13b93358548a9d8d658744911f1cbfc26fe4c1)

## 0.1.0-build.758 - 2026-08-07

Tagged at [`f583cbb091`](https://github.com/Ding-Ding-Projects/worldlens/commit/f583cbb091c640d477e00408c73bfc2c532f3789).

### Interface

- Merge pull request #120 from Ding-Ding-Projects/claude/interface-usability-clipping-k4to32 - [`f583cbb091`](https://github.com/Ding-Ding-Projects/worldlens/commit/f583cbb091c640d477e00408c73bfc2c532f3789) _(summary of 2 commits, also listed here)_
- feat(ui): Display and ease of use - interface-size dial and a theme reachable without a map - [`98269161ff`](https://github.com/Ding-Ding-Projects/worldlens/commit/98269161ff2e871d707a21547db98fd1021d5779)

## 0.1.0-build.754 - 2026-08-07

Tagged at [`68c9a4308d`](https://github.com/Ding-Ding-Projects/worldlens/commit/68c9a4308d49d441c71751e1d25fdf68341b97a9).

### Interface

- Merge pull request #108 from Ding-Ding-Projects/claude/ui-fixes-gqpko0 - [`68c9a4308d`](https://github.com/Ding-Ding-Projects/worldlens/commit/68c9a4308d49d441c71751e1d25fdf68341b97a9) _(summary of 3 commits, also listed here)_
- fix(ui): finish the flexed v-card-title sweep, six titles it missed - [`eb5b25a329`](https://github.com/Ding-Ding-Projects/worldlens/commit/eb5b25a3299dbbbaf6594142a4eb72b87f090e1f)

## 0.1.0-build.746 - 2026-08-07

Tagged at [`eef6199067`](https://github.com/Ding-Ding-Projects/worldlens/commit/eef61990675997509559c85c7ae3c5e1b27a9b1f).

### Interface

- Fix cloud-safe Vue source assertions - [`88fb85eb52`](https://github.com/Ding-Ding-Projects/worldlens/commit/88fb85eb5240e33a2950fd00c5e5c6aac4f83191)
- fix(tabs): keep the overflow menu reachable on a vertical dock below 720px - [`37597e230e`](https://github.com/Ding-Ding-Projects/worldlens/commit/37597e230e905ae385fbee2654338c582f51fa09)
- fix(ui): stop flexed v-card-title rows from silently clipping long names - [`b563046225`](https://github.com/Ding-Ding-Projects/worldlens/commit/b5630462255698b925166f02206614fd3996937d)

### Rendering and world data

- viewer: stop the map popup losing its edges when it opens near the screen border - [`a9b70422da`](https://github.com/Ding-Ding-Projects/worldlens/commit/a9b70422dac740594ed318bc12b5a59b4a29b43c)

### Desktop shell

- Integrate the audited Worldlens cutover finalizer - [`776c1f8fe8`](https://github.com/Ding-Ding-Projects/worldlens/commit/776c1f8fe80c8983583791403b2c16706f770bc9) _(summary of 2 commits, also listed here)_
- Expand the Worldlens repository cutover transaction - [`0765ea8915`](https://github.com/Ding-Ding-Projects/worldlens/commit/0765ea8915af879d022fe08843011844c901bda5)

### Landing page and documentation site

- Finalize the Worldlens repository identity - [`ea97ee8aa0`](https://github.com/Ding-Ding-Projects/worldlens/commit/ea97ee8aa020ea9d364879d8f534874d2e009a64)
- Auto commit 2026-08-07 14:43:49.681Z - [`b4b9a47f88`](https://github.com/Ding-Ding-Projects/worldlens/commit/b4b9a47f889efe35ad96da9681e91e93777d5edc)

## 0.1.0-build.734 - 2026-08-07

Tagged at [`64858ee71f`](https://github.com/Ding-Ding-Projects/worldlens/commit/64858ee71f2ee47e07dd7f6aa0de969e5ac3be02).

### Rendering and world data

- Merge Worldlens main into Pages parity - [`f713d1a5dc`](https://github.com/Ding-Ding-Projects/worldlens/commit/f713d1a5dcbc2209711f24b3ca5b7a2b3c584916) _(summary of 20 commits, also listed here)_

### Landing page and documentation site

- Integrate Pages parity and responsive navigation - [`85c7513eec`](https://github.com/Ding-Ding-Projects/worldlens/commit/85c7513eec4bb224d7134a996d355ec52f41d4fa) _(summary of 20 commits, also listed here)_
- WEBSITE EDIT - Match the panel inventory to tracked case - [`4fae06b6c4`](https://github.com/Ding-Ding-Projects/worldlens/commit/4fae06b6c4914825a6d196a134cfe7ee7ac11519)
- WEBSITE EDIT - Close the Pages integration contract gaps - [`890b934732`](https://github.com/Ding-Ding-Projects/worldlens/commit/890b93473201120429f2d57bb50d1cc12b6310e4)
- WEBSITE EDIT - Make every panel adjustable - [`5a4fe2aef8`](https://github.com/Ding-Ding-Projects/worldlens/commit/5a4fe2aef86e2ec3fb36a10a4886d09f9f0376ea)
- WEBSITE EDIT - Ship guided scheduled settings - [`a9fe3c4f25`](https://github.com/Ding-Ding-Projects/worldlens/commit/a9fe3c4f2527e1e8365260e439ce997f30e259dd)
- WEBSITE EDIT - Add recoverable scheduled settings engine - [`57e41cc8f2`](https://github.com/Ding-Ding-Projects/worldlens/commit/57e41cc8f29fae885a5d5ad65ffad9edc3594586)
- WEBSITE EDIT - Make responsive sidebar defaults truthful - [`d556c3da64`](https://github.com/Ding-Ding-Projects/worldlens/commit/d556c3da648b75ce78b77901b04c8e28039efb86)
- WEBSITE EDIT - Add collapsible responsive navigation - [`fa7f6afb4c`](https://github.com/Ding-Ding-Projects/worldlens/commit/fa7f6afb4cdbb5cebd6abb66f4bed1379fe3f088)

### Documentation

- Preserve live repository paths through Worldlens integration - [`eaa89eada4`](https://github.com/Ding-Ding-Projects/worldlens/commit/eaa89eada4112076a18368a0447f22f0699f16bb)
- WEBSITE EDIT - Refresh the verified Pages handoff - [`28902b48ed`](https://github.com/Ding-Ding-Projects/worldlens/commit/28902b48ed3c8aa3a7314c6aff791952908c97e7)
- WEBSITE EDIT - Close remaining Pages parity proof gaps - [`82139b4849`](https://github.com/Ding-Ding-Projects/worldlens/commit/82139b484903d81997e11306292983dbd55a608f)
- WEBSITE EDIT - Complete Pages parity proof and guided controls - [`10c8881bdf`](https://github.com/Ding-Ding-Projects/worldlens/commit/10c8881bdf787c229bfa9ac0ead2327cb1e1f25f)
- WEBSITE EDIT - Align Pages article coverage types - [`ab64ed6f44`](https://github.com/Ding-Ding-Projects/worldlens/commit/ab64ed6f44a62b40eb8b9b6548bd7f5f9c724e99)
- WEBSITE EDIT - Prove compact navigation without clipping - [`11a5c21310`](https://github.com/Ding-Ding-Projects/worldlens/commit/11a5c2131099eefa1773e153c4c0be974d23a33a)

## 0.1.0-build.731 - 2026-08-07

Tagged at [`ff2a8db673`](https://github.com/Ding-Ding-Projects/worldlens/commit/ff2a8db67329311357f3ffe858d1d78b25ac7ab1).

### Build, release and tooling

- Make release evidence match the published assets - [`5a33bd3944`](https://github.com/Ding-Ding-Projects/worldlens/commit/5a33bd394434423738054b70a2888d8b2151bffe)

## 0.1.0-build.729 - 2026-08-07

Tagged at [`3b35315a11`](https://github.com/Ding-Ding-Projects/worldlens/commit/3b35315a113598ca98959b9dffa174a18d6302c4).

### Interface

- Separate Worldlens identity from the display name - [`ddd7516d45`](https://github.com/Ding-Ding-Projects/worldlens/commit/ddd7516d45511cea3ce10a69c6467b0b375be4c0)

### Rendering and world data

- Integrate the Worldlens identity migration - [`6967158ff9`](https://github.com/Ding-Ding-Projects/worldlens/commit/6967158ff9f33b3be9a8f0a01484f5492bb4663f) _(summary of 16 commits, also listed here)_
- Migrate encrypted transport identity to Worldlens - [`91c846b96a`](https://github.com/Ding-Ding-Projects/worldlens/commit/91c846b96a4233a0ed2919ee56f68afc820e0c6e)
- Rename the workspace and packaged product to Worldlens - [`7b2c80b7a0`](https://github.com/Ding-Ding-Projects/worldlens/commit/7b2c80b7a0668e0864c1872c50c1e7a667fe0d07)

### Desktop shell

- Stabilize migration collision ordering - [`fddf3608dd`](https://github.com/Ding-Ding-Projects/worldlens/commit/fddf3608dd1d126abd0e179fb656e5951de20e6d)
- Harden Worldlens migration cutover and feed handoff - [`fbb4f30857`](https://github.com/Ding-Ding-Projects/worldlens/commit/fbb4f30857734d790924543f0b515b8f48af7310)
- Repair Worldlens migration recovery and feed handoff - [`ad7f1ee88e`](https://github.com/Ding-Ding-Projects/worldlens/commit/ad7f1ee88e8d1a45636f8069baee7c1af5975b3d)
- Enforce permanently unsigned Worldlens packages - [`52e322e8d6`](https://github.com/Ding-Ding-Projects/worldlens/commit/52e322e8d657ce8ac44fb7b6f69433a1e6cbd816)
- Migrate markers and project schemas to Worldlens - [`09cb967635`](https://github.com/Ding-Ding-Projects/worldlens/commit/09cb9676359e4f2a3da267e6b16620748663324e)
- Migrate legacy profiles into a verified Worldlens root - [`a0cab7962e`](https://github.com/Ding-Ding-Projects/worldlens/commit/a0cab7962e205e0973cbed7015833973436d7d93)

### Landing page and documentation site

- Carry persisted preferences into Worldlens - [`5d443b2cad`](https://github.com/Ding-Ding-Projects/worldlens/commit/5d443b2cad75b4151044e5a72ac0f97ac0ebcd4c)

### Documentation

- Harden Worldlens finalizer commit boundary - [`5652d185e6`](https://github.com/Ding-Ding-Projects/worldlens/commit/5652d185e67c381364b57ec42d5dcebab82762dd)
- Record Worldlens residual verification - [`fb06f471bd`](https://github.com/Ding-Ding-Projects/worldlens/commit/fb06f471bd530d4dc39d7912639ad81865dd5a7f)
- Repair Options tab screenshot activation - [`522e3b5ffc`](https://github.com/Ding-Ding-Projects/worldlens/commit/522e3b5ffc020f9bb07a4a5dad4e4131a3cd4475)
- Finish Worldlens current-identity migration - [`637cc696a0`](https://github.com/Ding-Ding-Projects/worldlens/commit/637cc696a0289318c856c3e3882b72325bf468ff)
- Finish visible Worldlens identity and migration guidance - [`2c85c01a4b`](https://github.com/Ding-Ding-Projects/worldlens/commit/2c85c01a4bcb12ddda09f1c87f73d6f050736924)

## 0.1.0-build.708 - 2026-08-07

Tagged at [`37104b4016`](https://github.com/Ding-Ding-Projects/worldlens/commit/37104b4016491b74619b67b56cafc6f84c19aaa3).

### Documentation

- Publish verified Server plugin tab capture - [`349178590b`](https://github.com/Ding-Ding-Projects/worldlens/commit/349178590bc79412923d76225390848f25e5e722)

## 0.1.0-build.704 - 2026-08-07

Tagged at [`f727083e5c`](https://github.com/Ding-Ding-Projects/worldlens/commit/f727083e5cb60f86aa4c493415d9e7c2b4952864).

### Build, release and tooling

- Make the release-guard fixture newline-safe - [`e21aaee356`](https://github.com/Ding-Ding-Projects/worldlens/commit/e21aaee3562c998ff49cde03af6596a8ff1d3a57)
- Fingerprint the complete release job - [`807cfd4a1e`](https://github.com/Ding-Ding-Projects/worldlens/commit/807cfd4a1ef3a090128e023c82e5e618e63158a8)
- Seal the release trust chain - [`b2e433899a`](https://github.com/Ding-Ding-Projects/worldlens/commit/b2e433899af775c9e9a4666619013f4bc671beca)
- Make release guards fail closed - [`6f53db19c0`](https://github.com/Ding-Ding-Projects/worldlens/commit/6f53db19c019975e9f717b39207195769437554f)
- Limit release privileges and verify PNG structure - [`34a9a81f01`](https://github.com/Ding-Ding-Projects/worldlens/commit/34a9a81f016ea7308fabc123d0f3483ef43cef23)
- Close workflow guard bypasses - [`19dc47ba47`](https://github.com/Ding-Ding-Projects/worldlens/commit/19dc47ba47e5f02cdd9d321a874fb81c2433fc18)
- Harden release metadata boundaries - [`0a8c52cebd`](https://github.com/Ding-Ding-Projects/worldlens/commit/0a8c52cebdbbaa1cfd020f4d5fb00eacf7459186)

### Documentation

- Merge screenshot tab activation repair - [`4e087432fb`](https://github.com/Ding-Ding-Projects/worldlens/commit/4e087432fba694e55e905004fe5d71328b94b289) _(summary of 3 commits, also listed here)_
- Repair Options tab screenshot activation - [`ae0a6894b5`](https://github.com/Ding-Ding-Projects/worldlens/commit/ae0a6894b52754a9339b8c17d4fa28a781811457)
- Document the whole-job release guard - [`ad7e2cabcc`](https://github.com/Ding-Ding-Projects/worldlens/commit/ad7e2cabcc1ec3f7de868cc919c0b32ce4f0b991)
- Document the sealed release boundary - [`c3c871c659`](https://github.com/Ding-Ding-Projects/worldlens/commit/c3c871c6592de60b09f19156208c281548e5f5a7)

## 0.1.0-build.684 - 2026-08-06

Tagged at [`e137779278`](https://github.com/Ding-Ding-Projects/worldlens/commit/e13777927876a3d7898778f18193e9465bc97cc2).

_No changes were recorded for this version: its tag points at a commit that an earlier tag already covered._

## 0.1.0-build.682 - 2026-08-06

Tagged at [`e137779278`](https://github.com/Ding-Ding-Projects/worldlens/commit/e13777927876a3d7898778f18193e9465bc97cc2).

### Interface

- Index the project editor in application docs - [`15369ae9c0`](https://github.com/Ding-Ding-Projects/worldlens/commit/15369ae9c0180305b4e2e49093239d8078c69ead)
- Index the project editor in application docs - [`26b6a5fd39`](https://github.com/Ding-Ding-Projects/worldlens/commit/26b6a5fd39871f4cdf8c66863f5314d3a1bb9e6b)
- Add unique artwork to high-impact actions - [`a90ba4439d`](https://github.com/Ding-Ding-Projects/worldlens/commit/a90ba4439d0f5056fb1061268fe3236c940e708f)
- Wire masks to measured world context - [`5d511478a1`](https://github.com/Ding-Ding-Projects/worldlens/commit/5d511478a17d687971c4fcff506e3dca41801830)
- Teleport wizard errors to their exact settings - [`62027cfd9d`](https://github.com/Ding-Ding-Projects/worldlens/commit/62027cfd9d3f149579f1ea094405e9b0b774ce23)
- Make render-mask route parity visible in the editor - [`15ab02823e`](https://github.com/Ding-Ding-Projects/worldlens/commit/15ab02823e48dd11b851ec9654d146c2f7ceef55)
- Harden project and live-speed layouts - [`d25a6c9510`](https://github.com/Ding-Ding-Projects/worldlens/commit/d25a6c9510ba6f69177c18499b09361535bd262b)
- Reset nested panel pointer input - [`75540679ab`](https://github.com/Ding-Ding-Projects/worldlens/commit/75540679abbbd713f4733220549ee9a0ccc87412)
- Bind panel pointer behavior directly - [`209e80789a`](https://github.com/Ding-Ding-Projects/worldlens/commit/209e80789a97437ffd8bbdf273dbadab697a87ef)
- Own shell panel pointer routing - [`313c858b7a`](https://github.com/Ding-Ding-Projects/worldlens/commit/313c858b7a826348704b40988897bf82f904e3ad)
- Activate nested tabs from the keyboard - [`92bb12ed91`](https://github.com/Ding-Ding-Projects/worldlens/commit/92bb12ed916b57d9ea9988392c9ebbccad0be060)
- Restore project editor interactions - [`ea04164829`](https://github.com/Ding-Ding-Projects/worldlens/commit/ea04164829d8ca30280a0d8ece7391d9ba5a0920)
- Align tab tests with docked axes - [`e9050451f7`](https://github.com/Ding-Ding-Projects/worldlens/commit/e9050451f754c54fecc41ddeb66d173193db087d)
- Add four-edge desktop tab docking - [`09b05a1c7b`](https://github.com/Ding-Ding-Projects/worldlens/commit/09b05a1c7b382fc99ee6d4b80e3fa18ac3ff5e19)
- Add unique artwork to high-impact actions - [`128bf214bb`](https://github.com/Ding-Ding-Projects/worldlens/commit/128bf214bb723c9618c01129ec9f618080384e7f)
- Wire masks to measured world context - [`d8cc7f23f8`](https://github.com/Ding-Ding-Projects/worldlens/commit/d8cc7f23f82e1e480d4077194fb2ab5aae67aa5c)
- Harden project and live-speed layouts - [`bafe088f33`](https://github.com/Ding-Ding-Projects/worldlens/commit/bafe088f33397b6bd6d199d16a39b4ab9dce0df7)
- Reset nested panel pointer input - [`17c5c3fa4d`](https://github.com/Ding-Ding-Projects/worldlens/commit/17c5c3fa4d3a6d11d687d91571b6b1984b34bcfc)
- Bind panel pointer behavior directly - [`c4c02fbd80`](https://github.com/Ding-Ding-Projects/worldlens/commit/c4c02fbd801fa7996b9c76b488e5a2a9893d5408)
- Own shell panel pointer routing - [`f2bbef7da0`](https://github.com/Ding-Ding-Projects/worldlens/commit/f2bbef7da02bb6d9403cfee2bf908c774d39356a)
- Activate nested tabs from the keyboard - [`b5f37029e7`](https://github.com/Ding-Ding-Projects/worldlens/commit/b5f37029e75e240016a79e32e225da42b3684fe6)
- Restore project editor interactions - [`539b1317ce`](https://github.com/Ding-Ding-Projects/worldlens/commit/539b1317ce3dc2ec68ca1ed8a6d03da2807db441)
- Teleport wizard errors to their exact settings - [`e9659423dc`](https://github.com/Ding-Ding-Projects/worldlens/commit/e9659423dcba4964dc44fdcb0669eef6f48f593b)
- Align tab tests with docked axes - [`d051aedf22`](https://github.com/Ding-Ding-Projects/worldlens/commit/d051aedf224a76626b1bf73c3f0c6eadf1b46402)
- Add four-edge desktop tab docking - [`0e18bb4b1d`](https://github.com/Ding-Ding-Projects/worldlens/commit/0e18bb4b1d8c4afacbaa5a7a69f0fd8f7bcd3c80)
- Make render-mask route parity visible in the editor - [`626137d7ff`](https://github.com/Ding-Ding-Projects/worldlens/commit/626137d7ffff82348345e9adfefd30ff43c9dbb9)

### Rendering and world data

- Carry complete map configs through Actions renders - [`7e5ecc9f44`](https://github.com/Ding-Ding-Projects/worldlens/commit/7e5ecc9f444ac4c14378dacb03e7374e4d65a75a)
- Carry complete map configs through Actions renders - [`6f606918da`](https://github.com/Ding-Ding-Projects/worldlens/commit/6f606918da3c6e2a9eaaf1630735c206ec0a0775)

### Server, CLI and configuration

- Port every render-mask shape into cloud renders - [`88f50a2c99`](https://github.com/Ding-Ding-Projects/worldlens/commit/88f50a2c999af47ae0410499135334c89fe2d8a5)
- Implement full TypeScript render-mask translation - [`3b9b283169`](https://github.com/Ding-Ding-Projects/worldlens/commit/3b9b28316966a5c87279635db0061675424d3481)

### Desktop shell

- Complete the packaged live-speed bridge - [`3c1ccd102f`](https://github.com/Ding-Ding-Projects/worldlens/commit/3c1ccd102f9ee6fd8bcf24b2e854feb857ef10f7)
- Support linked worktrees in repository discovery - [`121f5e04a1`](https://github.com/Ding-Ding-Projects/worldlens/commit/121f5e04a14d2d46d6cbdcf385720a3ec407c07a)
- Complete the packaged live-speed bridge - [`dfc1b31818`](https://github.com/Ding-Ding-Projects/worldlens/commit/dfc1b318189f04861f5bc5476975d060a2c75c4f)
- Support linked worktrees in repository discovery - [`4c66cdab10`](https://github.com/Ding-Ding-Projects/worldlens/commit/4c66cdab10d0199f1c1acd8a6c8227d389f9e301)

### Landing page and documentation site

- Document and verify four-edge tabs - [`4fe11e7052`](https://github.com/Ding-Ding-Projects/worldlens/commit/4fe11e70524548647fd3b5a99d08de71b423fe82)
- Preserve topbar elevation across edge docking - [`26d142081a`](https://github.com/Ding-Ding-Projects/worldlens/commit/26d142081a02b50698351cead2097e91cc147ca3)
- Dock site tabs on every edge - [`2cb8033592`](https://github.com/Ding-Ding-Projects/worldlens/commit/2cb8033592fb862b6cdde2e00c12b93079c58130)
- Document and verify four-edge tabs - [`56a7ab6410`](https://github.com/Ding-Ding-Projects/worldlens/commit/56a7ab6410a4533fb89f852fecbc4854ac6f1151)
- Preserve topbar elevation across edge docking - [`4b79d5f64a`](https://github.com/Ding-Ding-Projects/worldlens/commit/4b79d5f64abec0bbf4e20defe596f4d7c2b2462d)
- Dock site tabs on every edge - [`20cbaef19d`](https://github.com/Ding-Ding-Projects/worldlens/commit/20cbaef19d134510cd4c1359889c5e737930bfd7)

### Build, release and tooling

- Remove invalid canvas test dependencies - [`da20fd548d`](https://github.com/Ding-Ding-Projects/worldlens/commit/da20fd548dd31b7143fd07aa2d5063a688924454)
- fix: remove invalid @types_node entry from package.json - [`c55862b37f`](https://github.com/Ding-Ding-Projects/worldlens/commit/c55862b37f9470482a9dcb544b4c3b342da59268)
- Remove invalid canvas test dependencies - [`7a94124051`](https://github.com/Ding-Ding-Projects/worldlens/commit/7a94124051bde902ef0e63e4b2c10c6446ae7b55)
- Merge pull request #54 from Ding-Ding-Projects/dingdingchae-refactored-funicular - [`0181d72c47`](https://github.com/Ding-Ding-Projects/worldlens/commit/0181d72c47e07bdb179334d6a16a93cfc24f72fb) _(summary of 2 commits, also listed here)_
- test: add canvas devDependency to satisfy HTMLCanvasElement.getContext in vitest (fix CI)\n\n測試：加入 canvas 開發相依以解決 HTMLCanvasElement.getContext() 在 Vitest 中未實作的錯誤。\n\nCo-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com> - [`25166b22db`](https://github.com/Ding-Ding-Projects/worldlens/commit/25166b22db7ca258f450b3d52acaba7785732ac5)
- Merge pull request #53 from Ding-Ding-Projects/dingdingchae-refactored-funicular - [`83f56fa730`](https://github.com/Ding-Ding-Projects/worldlens/commit/83f56fa7305172a1e0726c2a1b6712b32cc0d2fb) _(summary of 2 commits, also listed here)_
- ci: allow workflow to publish releases (grant contents write)\n\nci: 允許工作流程發佈版本，將 contents 權限改為 write。\n\nCo-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com> - [`b9f6ba2298`](https://github.com/Ding-Ding-Projects/worldlens/commit/b9f6ba2298137324968fa998e23e7fbf5e17d227)

### Documentation

- Document action-specific artwork - [`26ce07f4b7`](https://github.com/Ding-Ding-Projects/worldlens/commit/26ce07f4b7a0e896a9094b83c2ea1c53da1fa4f3)
- Document exact render-mask parity - [`6019c145b8`](https://github.com/Ding-Ding-Projects/worldlens/commit/6019c145b8fe55eeb38f107493aa0d46ffd9bb1b)
- Document action-specific artwork - [`26286d9e2c`](https://github.com/Ding-Ding-Projects/worldlens/commit/26286d9e2ca261acc73488d67a55dc9267469f9e)
- Document exact render-mask parity - [`f8261e5bf6`](https://github.com/Ding-Ding-Projects/worldlens/commit/f8261e5bf6bf30fe9a437da9368ac05f12d845d0)

### Elsewhere in the repository

- Merge the documentation gate repair ancestry - [`9a3aa2fd6b`](https://github.com/Ding-Ding-Projects/worldlens/commit/9a3aa2fd6bc23f11191094466e43b1e47e10043c) _(summary of 2 commits, also listed here)_
- Merge the dialog artwork phase ancestry - [`53dade7127`](https://github.com/Ding-Ding-Projects/worldlens/commit/53dade712771471613bc79d98f4f75e216e0a4c4) _(summary of 5 commits, also listed here)_
- Merge the renderer-mask phase ancestry - [`cc0aae6290`](https://github.com/Ding-Ding-Projects/worldlens/commit/cc0aae6290fdba3a6b510cbaa0e54f18663932ef) _(summary of 8 commits, also listed here)_
- Merge the four-edge tab phase ancestry - [`767e15bddb`](https://github.com/Ding-Ding-Projects/worldlens/commit/767e15bddb0fdd45ddd9b856a945ba0fa9411623) _(summary of 13 commits, also listed here)_
- Merge the cloud-verdict phase ancestry - [`6caa0d9617`](https://github.com/Ding-Ding-Projects/worldlens/commit/6caa0d9617393fae142317d0cc6332a689501851) _(summary of 3 commits, also listed here)_
- Integrate upstream dependency repair - [`8b500ab182`](https://github.com/Ding-Ding-Projects/worldlens/commit/8b500ab182f864698b038c6272cabed32b69f953) _(summary of 3 commits, also listed here)_
- Merge pull request #55 from Ding-Ding-Projects/dingdingchae-refactored-funicular - [`76125ce006`](https://github.com/Ding-Ding-Projects/worldlens/commit/76125ce006ce046b2e2f4d5c680def23aaea1f9d) _(summary of 2 commits, also listed here)_

## 0.1.0-build.613 - 2026-08-06

Tagged at [`aa5574ed65`](https://github.com/Ding-Ding-Projects/worldlens/commit/aa5574ed6560ff087e3f83eefe513c42e5343526).

### Interface

- Repair release gates for copy, docs, and watcher readiness - [`77c12224d2`](https://github.com/Ding-Ding-Projects/worldlens/commit/77c12224d20f76e691d72f2b943a2494be68d23e)
- Wrap compact Minecraft folder action - [`4f7c71c163`](https://github.com/Ding-Ding-Projects/worldlens/commit/4f7c71c163fea47509f28d4c8a56ad8a02eac959)
- Prove Docker world-source compact layout - [`7c343fbb84`](https://github.com/Ding-Ding-Projects/worldlens/commit/7c343fbb84176ddfed9c5687e085b6b5aa047732)
- Merge corrected main into Docker world-source phase - [`f876961f74`](https://github.com/Ding-Ding-Projects/worldlens/commit/f876961f74f4bc3ac22f397adef737c05a416add) _(summary of 6 commits, also listed here)_
- Separate generated changelog data from policy scans - [`af2d372754`](https://github.com/Ding-Ding-Projects/worldlens/commit/af2d372754b336f22d65a6062d1fd2f102935b61)
- Wire Docker world sources into the map wizard - [`c977ad66ab`](https://github.com/Ding-Ding-Projects/worldlens/commit/c977ad66ab2c7bb255253e13e4e9e73bfdcaf996)
- Merge SSH phase into self-hosted CI bootstrap - [`bb56bd37a0`](https://github.com/Ding-Ding-Projects/worldlens/commit/bb56bd37a0e4705ac5dc1711dd633e25dc06727e) _(summary of 4 commits, also listed here)_
- Merge SSH world sources into the map wizard - [`515a8cf524`](https://github.com/Ding-Ding-Projects/worldlens/commit/515a8cf524d74cdb2b7722d80295bc713ff59ba8) _(summary of 3 commits, also listed here)_
- Wire SSH world sources into the map wizard - [`0db7a0d934`](https://github.com/Ding-Ding-Projects/worldlens/commit/0db7a0d9341be0a2be13bcbced8765af7a2a413c)
- Count destructive calls, not their declarations - [`26a2d49f7b`](https://github.com/Ding-Ding-Projects/worldlens/commit/26a2d49f7bc02c3e7f947dcfa70564a99b4355b9)
- Wire the git-world-repository screen into the tab strip and the palette - [`6e7ee602a7`](https://github.com/Ding-Ding-Projects/worldlens/commit/6e7ee602a7ab3bd671650dc4b52ef098dbbbe8a4)
- Give the git-world-repository host a screen: sync, track, and adopt from another computer - [`f97286af61`](https://github.com/Ding-Ding-Projects/worldlens/commit/f97286af6142670452afaa4fb77eab0348178156)
- Show the storage default's real userData leaf, not "Material BlueMap" - [`cfe44e73cd`](https://github.com/Ding-Ding-Projects/worldlens/commit/cfe44e73cd0ec2c56b05ad27f6464147e4e12757)

### Server, CLI and configuration

- cli: make -u/--watch actually watch, instead of apologising and leaving - [`61eee4a665`](https://github.com/Ding-Ding-Projects/worldlens/commit/61eee4a66560402ce756b48638375f3dd3af8384)

### Desktop shell

- Fix gh release host and account routing - [`f4a3b6c9b2`](https://github.com/Ding-Ding-Projects/worldlens/commit/f4a3b6c9b2787a6a346b6e76f4716c7f328063e0)
- Derive the update feed repository at build time instead of hardcoding it - [`6b8304ca59`](https://github.com/Ding-Ding-Projects/worldlens/commit/6b8304ca59b7cf20df5b2101374e7d32780013a2)
- Delete the four dead worldsource:* bridge methods duplicating discoverRelease's - [`c3abad0396`](https://github.com/Ding-Ding-Projects/worldlens/commit/c3abad0396df7217c63e801841071d1b7c11b9fa)
- Bridge dockerworld: wire up the ipc.ts nobody ever called - [`64c0f9a294`](https://github.com/Ding-Ding-Projects/worldlens/commit/64c0f9a2948f1281508303f8b4d4955a4cc6d868)
- Bridge worldsource:ssh: a wizard step that could see the channel, not use it - [`76abb04b43`](https://github.com/Ding-Ding-Projects/worldlens/commit/76abb04b43eb4f9fdd898be33e2d7d54939e35af)
- Bridge worldrepo: the 11-channel git world host that had no way in - [`639308d855`](https://github.com/Ding-Ding-Projects/worldlens/commit/639308d8558a713ece5582519717028ad4aa0ae3)

### Build, release and tooling

- Make changelog checks independent of line endings - [`b061962e1d`](https://github.com/Ding-Ding-Projects/worldlens/commit/b061962e1d3edce3277e5023cb46c0dbb1a97ce7)
- Preserve historical generated-only changelog commits - [`baee22be34`](https://github.com/Ding-Ding-Projects/worldlens/commit/baee22be34dcbe4451f2465d2fc7d2b6561f818a)
- Bootstrap every self-hosted CI dependency - [`ee9087c2fb`](https://github.com/Ding-Ding-Projects/worldlens/commit/ee9087c2fbd4f3f4c37270a12e0303ea0ab5945a)

### Documentation

- Record the recovered exact-SHA release gate - [`d3c6354e15`](https://github.com/Ding-Ding-Projects/worldlens/commit/d3c6354e15c83954672b27eeeeabf5882616cf14)
- Document and index the gh release repair - [`c6093b3914`](https://github.com/Ding-Ding-Projects/worldlens/commit/c6093b3914701b40744ff4893364b8409be54200)
- Merge cloud-runner phase into gh release repair - [`4a7ea0f843`](https://github.com/Ding-Ding-Projects/worldlens/commit/4a7ea0f8438612cd7a541eec64f0568a62f502fe) _(summary of 5 commits, also listed here)_
- Repair hosted-runner documentation links - [`7bf8e2a3d1`](https://github.com/Ding-Ding-Projects/worldlens/commit/7bf8e2a3d1344d38e971ee54f4dad1ec0341d082)
- Restore GitHub-hosted workflow runners - [`b76c3d6a69`](https://github.com/Ding-Ding-Projects/worldlens/commit/b76c3d6a691d71a5ab0b5e2b36887262da41129a)
- Merge phase 1 super-confirmation coverage - [`ebf00b2d14`](https://github.com/Ding-Ding-Projects/worldlens/commit/ebf00b2d14ea8b5dc36afe9b34409f2680d320d4) _(summary of 3 commits, also listed here)_
- Guard world branch deletion with super confirmation - [`c1fef94f33`](https://github.com/Ding-Ding-Projects/worldlens/commit/c1fef94f33ab7d3d641fa3ad771b358d31c56fa3)
- Document that the git-world-repository and adoption features are now reachable - [`2b8bf0d9e0`](https://github.com/Ding-Ding-Projects/worldlens/commit/2b8bf0d9e0ddebf43db1c2bd9557f2284d44eaf1)

## 0.1.0-build.612 - 2026-08-06

Tagged at [`7a2a3993a0`](https://github.com/Ding-Ding-Projects/worldlens/commit/7a2a3993a08d917cf69c319f8aebaf3b22d497ea).

### Desktop shell

- Screenshots: reach the Pages tab through overflow when it does not fit - [`7a2a3993a0`](https://github.com/Ding-Ding-Projects/worldlens/commit/7a2a3993a08d917cf69c319f8aebaf3b22d497ea)

## 0.1.0-build.611 - 2026-08-06

Tagged at [`a4ed52e69c`](https://github.com/Ding-Ding-Projects/worldlens/commit/a4ed52e69c6bab8f4ceca221555535fa499e5b70).

### Interface

- Give App.test.ts its own 60s timeout, measured rather than doubled - [`674c1920d2`](https://github.com/Ding-Ding-Projects/worldlens/commit/674c1920d2db855f96d05f354ebb1fe8b4f7a9e6)
- Cover DimensionSelection.vue in the world.ts call-site inventory - [`8db5170afa`](https://github.com/Ding-Ding-Projects/worldlens/commit/8db5170afadf6d25ac51e1fd4dd0aeb6b9066e7f)
- Exempt DiscoveredWorldsPanel.vue's rename field from the browse-button rule - [`7efa80c211`](https://github.com/Ding-Ding-Projects/worldlens/commit/7efa80c21147ff9eb730b390825b145360f8ee6d)
- Register four new context menus in the menu-search coverage inventory - [`abe78d04d6`](https://github.com/Ding-Ding-Projects/worldlens/commit/abe78d04d6a40079c7853bdb9210135a316095fc)
- Register two new AppearanceTarget wrappers in the overlay-dismissal inventory - [`d6ea6eb909`](https://github.com/Ding-Ding-Projects/worldlens/commit/d6ea6eb909ac6c6c35404b8572d277d57f2e1901)
- Declare three new destructive call sites in the super-confirm inventory - [`eed6990631`](https://github.com/Ding-Ding-Projects/worldlens/commit/eed69906317e623766da834c2226f5b966401588)
- Warn once when a render-mask list exceeds the cloud renderer's one-box limit - [`8c6a356ce3`](https://github.com/Ding-Ding-Projects/worldlens/commit/8c6a356ce3d9205214e8544ad2d76b82a1b37039)
- Restore 45 dropped safety facts in the renders-in-progress copy, kill an em-dash, remove a dead catalogue key - [`8559f81761`](https://github.com/Ding-Ding-Projects/worldlens/commit/8559f81761e8b135d32ff6729cbfcc20d82e2c09)
- Voice the backup screen's create-repository and repository-search copy - [`f552d7a983`](https://github.com/Ding-Ding-Projects/worldlens/commit/f552d7a983eb69c08ea2ed12b616be5c25216694)
- Give the mask canvas's slider handles a value, not just a name - [`734c7a804c`](https://github.com/Ding-Ding-Projects/worldlens/commit/734c7a804c863822f9982722d3a4c91cf84629c4)
- Wire the live speed dial into the interface and fix a broken build - [`459136c9b0`](https://github.com/Ding-Ding-Projects/worldlens/commit/459136c9b02bd202aab52c69ae6687a9bd3cf06b)
- Give the idle preview panel a real Not hosting chip - [`760153a9d6`](https://github.com/Ding-Ding-Projects/worldlens/commit/760153a9d64713e86c8b3f49270a40e62611b581)
- Give the render mask a drawing surface, so nobody has to already know the coordinates - [`c0d7633997`](https://github.com/Ding-Ding-Projects/worldlens/commit/c0d7633997449e2d0e58608df261195ab198ffe2)
- Bug-hunt fixes: id collisions, chip wrapping, a redundant tooltip - [`dca118e4a0`](https://github.com/Ding-Ding-Projects/worldlens/commit/dca118e4a014bdc18b7d785bb958ea5025354868)
- Add the Watch it live tab, its copy, and the live-preview docs article - [`02304666e2`](https://github.com/Ding-Ding-Projects/worldlens/commit/02304666e2c67eb1a51cf8268f608b08dae8f7bd)
- Let the create-a-map wizard render several dimensions at once - [`6328f2d3de`](https://github.com/Ding-Ding-Projects/worldlens/commit/6328f2d3de0c8939ab36d93d0d7a934fee8df41c)
- Stop declaring Translate and T twice in one file - [`b9c56c419a`](https://github.com/Ding-Ding-Projects/worldlens/commit/b9c56c419a2ace58dd90f01b8cc0e8e442cdd330)
- Give the download row's log its own auto-scroll checkbox - [`8426e7c6e0`](https://github.com/Ding-Ding-Projects/worldlens/commit/8426e7c6e00cb1979c6f4c07af5b4fa560d6d14b)
- Give a running backup's log its own auto-scroll checkbox - [`e12bcd5ef3`](https://github.com/Ding-Ding-Projects/worldlens/commit/e12bcd5ef3b30a5248fe81cc2d90f15cb433fbc6)
- Give the render console a real auto-scroll checkbox - [`28ee5db2f1`](https://github.com/Ding-Ding-Projects/worldlens/commit/28ee5db2f17159eaa1cf6f7ab80373a13d419163)
- Add shared sticky-scroll following for streaming logs - [`bdb7c5ac98`](https://github.com/Ding-Ding-Projects/worldlens/commit/bdb7c5ac9819d110b313657ab94b9e75e693c879)
- Test that a missing folder stays on the discovered-worlds panel - [`53b86e5d5c`](https://github.com/Ding-Ding-Projects/worldlens/commit/53b86e5d5cc2a3f0e2cb088419e934ea517afedc)
- Add a Renders in progress page: every render, every route, never lost to a tab change - [`4374cc85be`](https://github.com/Ding-Ding-Projects/worldlens/commit/4374cc85be4d59a366ebdd57db8f92f28ee4ebed)
- Show worlds ready to use on the Projects tab, discovered automatically - [`502767e4c7`](https://github.com/Ding-Ding-Projects/worldlens/commit/502767e4c7730c812de4181a9e0f2a2e1b2f900e)
- Wire the gh CLI accounts list into the GitHub settings section - [`28c1c623cb`](https://github.com/Ding-Ding-Projects/worldlens/commit/28c1c623cb37a6dac0b38ae1911758e80dd6be8c)
- Add the value layer for drawing a render mask: two-way binding, honest cost, cloud-fidelity check, export/import - [`7240bfc870`](https://github.com/Ding-Ding-Projects/worldlens/commit/7240bfc870982cd367abbb8d4aba1451e7a0f581)
- Register the gh CLI accounts copy surface into the merged catalogue - [`8d6aee27d7`](https://github.com/Ding-Ding-Projects/worldlens/commit/8d6aee27d7a75ea4932e014dc9faebdb71c2ce7f)
- Surface local git history in notifications and settings, with real pruning and export - [`2406372b85`](https://github.com/Ding-Ding-Projects/worldlens/commit/2406372b8577690f9dccc482ab7eefb3c5e1d541)
- Unbreak the typecheck the overlay work left behind, and register two menus - [`5bbd3e3a1d`](https://github.com/Ding-Ding-Projects/worldlens/commit/5bbd3e3a1d2782c9c5bda49a3fde7c8825fd1e35)
- Fix null-byte corruption in ghCliAccountsStore.ts - [`ba8930c07f`](https://github.com/Ding-Ding-Projects/worldlens/commit/ba8930c07f2d56edeeeadbc86ebd421029247c88)
- Give the notification centre a date range, behind a collapsible filters row - [`75bdf0aa5e`](https://github.com/Ding-Ding-Projects/worldlens/commit/75bdf0aa5e7cbce5638668f6c65581ac4a9ff555)
- Give profile and app-settings history a search bar and a date picker - [`b647b15843`](https://github.com/Ding-Ding-Projects/worldlens/commit/b647b15843db83f5eeea0d78b4095063e90a1a53)
- Restore aria-owns on AppearanceTarget's hand-wired ARIA - [`45bf3c6c29`](https://github.com/Ding-Ding-Projects/worldlens/commit/45bf3c6c297b65b5848eab09e4b27050b002f9f9)
- Restore keyboard focus into the appearance popup on ArrowDown/ArrowUp - [`6a099936ce`](https://github.com/Ding-Ding-Projects/worldlens/commit/6a099936ce3343850ab43a7e7cd7e5fe227ad5e6)
- Detect v-bind object-spread activator/target collision on v-menu - [`9b5dcf636b`](https://github.com/Ding-Ding-Projects/worldlens/commit/9b5dcf636b92ac1b354c6b4a4ed4a25d07781744)
- Re-land kebab-case <appearance-target> fix lost to a concurrent stale-overwrite - [`f0dab6741c`](https://github.com/Ding-Ding-Projects/worldlens/commit/f0dab6741ceca95ccd4baf64979d26d234bb8407)
- Add the claimAppearancePopup/releaseAppearancePopup pair AppearanceTarget.vue already imports - [`2f3f22eb2b`](https://github.com/Ding-Ding-Projects/worldlens/commit/2f3f22eb2b175719645ff93f0f2cc88d75d7de78)
- Detect v-bind object-spread activator/target collision on v-menu - [`f92b4c8375`](https://github.com/Ding-Ding-Projects/worldlens/commit/f92b4c837508d5029340440f36bac0eb846aa375)
- Fix aria-haspopup staying "menu" when the popup is the editor, not a menu - [`c86f4b7b93`](https://github.com/Ding-Ding-Projects/worldlens/commit/c86f4b7b937b532d01746ce7332ec0f5f2228a26)
- Fix kebab-case <appearance-target> escaping the overlay-dismissal inventory guard - [`22db2013a5`](https://github.com/Ding-Ding-Projects/worldlens/commit/22db2013a5e982174222d96612208a5f11f108f2)
- Return focus after context menu closes via Escape or outside click - [`75f85dbaa9`](https://github.com/Ding-Ding-Projects/worldlens/commit/75f85dbaa91670b5631c7786c61cc84d2b6d77f2)
- Fix: context menu's Escape/outside-click close never returned focus - [`901d285473`](https://github.com/Ding-Ding-Projects/worldlens/commit/901d285473904bb39295f9b3e3f2e66e2c26dc66)
- Recognise single-quoted :activator/:target in overlay collision detector - [`5205958ce5`](https://github.com/Ding-Ding-Projects/worldlens/commit/5205958ce5c3bc52fb04396093979318c752075e)
- Add a guard: docs/README.md and docsModel.ts's category arrays must agree - [`e8319c7e49`](https://github.com/Ding-Ding-Projects/worldlens/commit/e8319c7e49b2d98f4604883b273f0566a4124b55)

### Server, CLI and configuration

- Extend the import-tracking guard to catch a missing export, not just a missing file - [`09c326be6e`](https://github.com/Ding-Ding-Projects/worldlens/commit/09c326be6e72b92d9263a5fd586128ba91e997a9)

### Desktop shell

- Gate the three real-Windows CurseForge/Bedrock discovery tests to win32 - [`be82630e90`](https://github.com/Ding-Ding-Projects/worldlens/commit/be82630e90da48e1d4845042c279cbcf97cebbc2)
- Guard the downloads bridge's worldsource routing with a reachability test - [`27d98c36a8`](https://github.com/Ding-Ding-Projects/worldlens/commit/27d98c36a81753536733b908bc40431385c3d511)
- Remove three identifiers nobody was using - [`96cd2ca834`](https://github.com/Ding-Ding-Projects/worldlens/commit/96cd2ca8348daf75c6137528094852d76ec994ba)
- Serve a render's own folder live, loopback by default, while it still runs - [`a97e06f8df`](https://github.com/Ding-Ding-Projects/worldlens/commit/a97e06f8dfc828d9bc1a5a673f119201ddac8ae0)
- Detect every dimension a world folder really has - [`3d0b5f083b`](https://github.com/Ding-Ding-Projects/worldlens/commit/3d0b5f083b52948b31d69be11e579ced7930e1fe)
- Refuse a foreign file at the marker's own path, as the module already promised - [`5e933b2ca8`](https://github.com/Ding-Ding-Projects/worldlens/commit/5e933b2ca8da50010edb4aafe5ddc6ca5b707dcf)
- Adjust a render's speed live, while it is still running - [`5b3573ec69`](https://github.com/Ding-Ding-Projects/worldlens/commit/5b3573ec6987127464aec451e251962938052d67)
- Let the app prepare an unready repository for CI rendering itself - [`68dc465900`](https://github.com/Ding-Ding-Projects/worldlens/commit/68dc465900a3960cfaa4207d06b9499bc817e306)
- Let the app prepare an empty or unprepared repository for CI rendering - [`5e9ae2917a`](https://github.com/Ding-Ding-Projects/worldlens/commit/5e9ae2917a6abcf3fa488652e6cfd16eae227910)
- Recognise and adopt a repository this app already prepared for CI rendering - [`7281721d2d`](https://github.com/Ding-Ding-Projects/worldlens/commit/7281721d2d6e2e98feaffed13241869b7d8487aa)
- Discover Bedrock and CurseForge worlds, and multi-instance launcher roots - [`93ed8b919e`](https://github.com/Ding-Ding-Projects/worldlens/commit/93ed8b919e02e31b52af5419cd3a5e5033f70c5b)
- Let the backup screen create a new GitHub repository, not just pick one - [`c7197d8276`](https://github.com/Ding-Ding-Projects/worldlens/commit/c7197d82761c2455468211244b0715c6a994bed7)
- Add gh CLI account listing/switching and credential-routing fallback - [`4c44201e3f`](https://github.com/Ding-Ding-Projects/worldlens/commit/4c44201e3f1abff4220ab0d8e4474b2eca9d4b19)
- Autosave projects into their local git history, debounced and quit-safe - [`72acd1da67`](https://github.com/Ding-Ding-Projects/worldlens/commit/72acd1da6747c81fd279530971777ff7675cf4c7)

### Landing page and documentation site

- Stop picking your own repository from reading as a name collision - [`ff6ed2a544`](https://github.com/Ding-Ding-Projects/worldlens/commit/ff6ed2a54482b109ef80d145478fe08dd9fb5546)
- Add regression coverage for the appearance editor's own colour/font popovers - [`4c85b56631`](https://github.com/Ding-Ding-Projects/worldlens/commit/4c85b5663127de11fcf3f3702380a0f1aa8851ab)
- Give keyboard-only visitors a real Tab route into non-interactive appearance targets - [`44c2b7c9d3`](https://github.com/Ding-Ding-Projects/worldlens/commit/44c2b7c9d3ae735595b6ca6da73400043c852d36)
- Stop the AnchoredPanel sweep tripping over its own capture group - [`f14d2c6ab2`](https://github.com/Ding-Ding-Projects/worldlens/commit/f14d2c6ab2f183bd3110f2994853c721f963a018)
- Add regression test for Escape closing only the nested regex builder - [`30fabfdd5d`](https://github.com/Ding-Ding-Projects/worldlens/commit/30fabfdd5d13172953d443d6a2c099b4714780f7)
- Add regression test for AnchoredPanel focus-return guard - [`fa02e95240`](https://github.com/Ding-Ding-Projects/worldlens/commit/fa02e95240c3d23d757067b57b614a64a5459c2a)
- Stop the element context menu closing under its own regex builder - [`3df11ad75e`](https://github.com/Ding-Ding-Projects/worldlens/commit/3df11ad75e59f16fcaa7f5eb339a74d4eaba6f9d)
- Exempt a menu's own regex-builder popover from closing the menu - [`6b4a2d8550`](https://github.com/Ding-Ding-Projects/worldlens/commit/6b4a2d8550bc6348dc5e6c231571223af50d34b7)
- Resolve import aliases before sweeping AnchoredPanel construction sites - [`2c6077bd67`](https://github.com/Ding-Ding-Projects/worldlens/commit/2c6077bd67ade0a1d460ee4587947a46d957d8af)

### Build, release and tooling

- Put the GitHub CLI on the release job's PATH - [`a4ed52e69c`](https://github.com/Ding-Ding-Projects/worldlens/commit/a4ed52e69c6bab8f4ceca221555535fa499e5b70)
- Give Electron its own GTK library and prove its binary exists before launching - [`2926d17560`](https://github.com/Ding-Ding-Projects/worldlens/commit/2926d175608f634569c5e195dbba984860c0bc23)
- Point the Windows job's bash steps at Git Bash instead of WSL - [`1b4f038ef3`](https://github.com/Ding-Ding-Projects/worldlens/commit/1b4f038ef356c1b2a35829d8dc4c7b3b38d121d2)
- CI: stop reinstalling Playwright's apt deps on every single run - [`fa79fea41d`](https://github.com/Ding-Ding-Projects/worldlens/commit/fa79fea41d1445d2a4ad18978be15a8c9b8df0a8)
- CI: give ForgeGradle a real JDK 8 so it stops downloading a broken one - [`f5df69ee06`](https://github.com/Ding-Ding-Projects/worldlens/commit/f5df69ee0612cd8d0554bb67729c69c5b3d70f39)
- Give the test run the same heap the typecheck step just needed - [`2773fc2729`](https://github.com/Ding-Ding-Projects/worldlens/commit/2773fc2729cd47433d076d9909d64f5c8b34fdde)
- Give the typecheck step enough heap to survive its own project - [`d8719ceb1e`](https://github.com/Ding-Ding-Projects/worldlens/commit/d8719ceb1e54d117062c1868d38f480b8571974f)
- CI: move project workflows to self-hosted runners, drop pull_request, add per-job concurrency - [`778d703e05`](https://github.com/Ding-Ding-Projects/worldlens/commit/778d703e05013c16dd7017acf48048fb94ebc413)

### Documentation

- Document the gh CLI accounts feature - [`5799697aa6`](https://github.com/Ding-Ding-Projects/worldlens/commit/5799697aa62d69ec1dacc86e78516b52034013dd)
- Document repository adoption, and index it beside its sibling articles - [`9ae3e94ef6`](https://github.com/Ding-Ding-Projects/worldlens/commit/9ae3e94ef63f3adbb132f86a1761050649b2f1d8)
- Document creating a backup repository and searching the picker - [`b68ab86f5f`](https://github.com/Ding-Ding-Projects/worldlens/commit/b68ab86f5f327da5aad50dda5f8274504fc51a40)

## 0.1.0-build.548 - 2026-08-05

Tagged at [`cbd32528a7`](https://github.com/Ding-Ding-Projects/worldlens/commit/cbd32528a7afa47da49df99d7d1b8c1b3081ee28).

### Server, CLI and configuration

- Add a guard: fail vitest when a committed import targets an untracked file - [`cbd32528a7`](https://github.com/Ding-Ding-Projects/worldlens/commit/cbd32528a7afa47da49df99d7d1b8c1b3081ee28)

## 0.1.0-build.547 - 2026-08-05

Tagged at [`c9428a7699`](https://github.com/Ding-Ding-Projects/worldlens/commit/c9428a76995111fd9fe5dd06cfea91b611ba9064).

### Desktop shell

- Fix winget exit codes silently failing to match their own constants - [`c9428a7699`](https://github.com/Ding-Ding-Projects/worldlens/commit/c9428a76995111fd9fe5dd06cfea91b611ba9064)

## 0.1.0-build.546 - 2026-08-05

Tagged at [`c00a861bc6`](https://github.com/Ding-Ding-Projects/worldlens/commit/c00a861bc658f585cb128cd9444ff5df03ced16a).

### Interface

- Land first-run setup on Home, not the wizard; make its guard test real - [`c00a861bc6`](https://github.com/Ding-Ding-Projects/worldlens/commit/c00a861bc658f585cb128cd9444ff5df03ced16a)
- Re-index 9 shipped docs articles into the in-app docs browser's categories - [`ec86f50606`](https://github.com/Ding-Ding-Projects/worldlens/commit/ec86f506064673cd7962d88c2689085da4816a05)

## 0.1.0-build.544 - 2026-08-05

Tagged at [`8a6e8c56bf`](https://github.com/Ding-Ding-Projects/worldlens/commit/8a6e8c56bfb20dfb532b971c56184bcfad37a872).

### Interface

- Register the dependency installer's context menu in the coverage guard - [`8a6e8c56bf`](https://github.com/Ding-Ding-Projects/worldlens/commit/8a6e8c56bfb20dfb532b971c56184bcfad37a872)
- Voice the dependency installer in both languages, at every funny level - [`c54ddf9db7`](https://github.com/Ding-Ding-Projects/worldlens/commit/c54ddf9db73c533c7f5d07283b06df13d2022a12)
- Wire the dependency installer into the settings screen's own tabs - [`ae57308c82`](https://github.com/Ding-Ding-Projects/worldlens/commit/ae57308c82f4160ec09d4f94ef35549a30d4142a)
- Voice Home's own copy, and register it with the guard tests it needs - [`c8db5b5956`](https://github.com/Ding-Ding-Projects/worldlens/commit/c8db5b5956531d5d9c1802d5826e7a6998a7f997)
- Wire a Home tab: every capability in one place, opening menus not just tabs - [`156c0de173`](https://github.com/Ding-Ding-Projects/worldlens/commit/156c0de17393c995f579ebbf9504e2dbdcb59c21)
- Build the one-button winget/Chocolatey installer panel - [`7046c8af4f`](https://github.com/Ding-Ding-Projects/worldlens/commit/7046c8af4f1d50b98341225cdfb055a8f59e23f3)
- Cite the real Temurin download size, and document the Chunker button - [`12495923cb`](https://github.com/Ding-Ding-Projects/worldlens/commit/12495923cb1393edd7eef4a9c240960d7f0112eb)
- Give the Java row a real download button, and wire up the Chunker one too - [`547f29f10f`](https://github.com/Ding-Ding-Projects/worldlens/commit/547f29f10fa55661eaec574d4178282b0b5251d6)
- Add a Home tab and the pin-on-first-seen mechanics it needs - [`73921c4286`](https://github.com/Ding-Ding-Projects/worldlens/commit/73921c428610cfe35bc9be144cf90102e19213e3)
- Fix right-click menus not closing on an outside click - [`412d9075c9`](https://github.com/Ding-Ding-Projects/worldlens/commit/412d9075c958c580de5f0688ff3c7b7f85730439)
- Guard every overlay's outside-click dismissal, in both packages - [`a2d22409c4`](https://github.com/Ding-Ding-Projects/worldlens/commit/a2d22409c46af20de9bc4d8a6a43aa5a6699722d)

### Desktop shell

- Stop pinning stdout/stderr interleaving in the spawn runner test - [`4786eb0c02`](https://github.com/Ding-Ding-Projects/worldlens/commit/4786eb0c021c492da136ddee81ff3a83b3b9e5bf)
- Expose the sysdeps installer bridge, alongside the Java provisioning one - [`fe1d7b652a`](https://github.com/Ding-Ding-Projects/worldlens/commit/fe1d7b652a073d293a94229d4fdbbe50f0c1b3d0)
- Wire the winget/Chocolatey installer into the app's main process - [`5caedc348b`](https://github.com/Ding-Ding-Projects/worldlens/commit/5caedc348b968dffef81cd02120d9b44be1d25b7)
- Add the batch-install IPC channel for winget/Chocolatey dependencies - [`912abc7dbb`](https://github.com/Ding-Ding-Projects/worldlens/commit/912abc7dbb99e533ed9e1798057c94011684d3c8)
- Add winget/Chocolatey provisioning engine with honest progress - [`34906ca49c`](https://github.com/Ding-Ding-Projects/worldlens/commit/34906ca49c8c1ff218cb67fd72611708235d9cac)

### Documentation

- Document the one-button settings screen for system dependencies - [`c6f2e13063`](https://github.com/Ding-Ding-Projects/worldlens/commit/c6f2e13063819e21ab0e42047100c7389db67c78)
- Retire the "JDK provisioning is only fake-tested" caveat, which is now false - [`86afbd39fa`](https://github.com/Ding-Ding-Projects/worldlens/commit/86afbd39fa60aa925ab3ce394b1d663b2158fd9c)
- Restore the Java-provisioning deep-dive article lost to a merge - [`04cb4a2f65`](https://github.com/Ding-Ding-Projects/worldlens/commit/04cb4a2f65d9142afa31b859ce7d6f2e916fb6cb)
- Document automatic dependency provisioning, and index it - [`31a572036d`](https://github.com/Ding-Ding-Projects/worldlens/commit/31a572036decc7d8c030d09b9ca2a4bce2cd08d4)

## 0.1.0-build.527 - 2026-08-05

Tagged at [`012d01ff54`](https://github.com/Ding-Ding-Projects/worldlens/commit/012d01ff547225dfdf96c382b19c3911537dd247).

### Landing page and documentation site

- Fix appearance editor's anchor swallowing outside clicks and dropping focus - [`012d01ff54`](https://github.com/Ding-Ding-Projects/worldlens/commit/012d01ff547225dfdf96c382b19c3911537dd247)

## 0.1.0-build.526 - 2026-08-05

Tagged at [`283bb64ff6`](https://github.com/Ding-Ding-Projects/worldlens/commit/283bb64ff670af0d7a8e131749803f43a4b79ac6).

### Desktop shell

- Prove JDK auto-provisioning against a real Adoptium download, not fakes - [`283bb64ff6`](https://github.com/Ding-Ding-Projects/worldlens/commit/283bb64ff670af0d7a8e131749803f43a4b79ac6)

## 0.1.0-build.525 - 2026-08-05

Tagged at [`aed41a42b2`](https://github.com/Ding-Ding-Projects/worldlens/commit/aed41a42b2bdf3bbd408f593a94c02fe457ebff5).

### Desktop shell

- Wire Java provisioning behind explicit consent, not just discovery - [`aed41a42b2`](https://github.com/Ding-Ding-Projects/worldlens/commit/aed41a42b2bdf3bbd408f593a94c02fe457ebff5)

## 0.1.0-build.522 - 2026-08-05

Tagged at [`b708d4236d`](https://github.com/Ding-Ding-Projects/worldlens/commit/b708d4236da642c723e8fecd351c557703953782).

### Landing page and documentation site

- Make the changelog CSS test survive a CRLF checkout - [`b708d4236d`](https://github.com/Ding-Ding-Projects/worldlens/commit/b708d4236da642c723e8fecd351c557703953782)

## 0.1.0-build.521 - 2026-08-05

Tagged at [`8796c5152a`](https://github.com/Ding-Ding-Projects/worldlens/commit/8796c5152a66df07e86dc4920c31b468883e50b5).

### Interface

- Exempt the remote file browser's own path field from the local-dialog guard - [`8796c5152a`](https://github.com/Ding-Ding-Projects/worldlens/commit/8796c5152a66df07e86dc4920c31b468883e50b5)
- Add a Settings control for how many parts a download fetches at once - [`e02dd349a2`](https://github.com/Ding-Ding-Projects/worldlens/commit/e02dd349a28d5380258faf6c7c3892e057d655c2)
- Fix CI typecheck: narrow the remote hosting test mocks to their real union arms - [`6f0e9f7c97`](https://github.com/Ding-Ding-Projects/worldlens/commit/6f0e9f7c972a074e80d52c3b759b251b2da67123)
- Put a Scheduled re-rendering panel on the CI-render screen - [`df661a992b`](https://github.com/Ding-Ding-Projects/worldlens/commit/df661a992b8fcb43c7e8f0bd972a685be151a155)
- Fix CI lint: use the schedule fake's owner/repo, drop a leftover probe test - [`4e43d53c01`](https://github.com/Ding-Ding-Projects/worldlens/commit/4e43d53c015ba3c84c81042705885cde77ce0016)
- Give the render memory ceiling a place in the version history too - [`6be888404b`](https://github.com/Ding-Ding-Projects/worldlens/commit/6be888404b8ce3ec6fed7f526defe65f87a1343c)
- Declare the remote file browser's dialog in the blocking-surface inventory - [`a756a47525`](https://github.com/Ding-Ding-Projects/worldlens/commit/a756a47525fbc91619d712359f28dbc38bcc893a)
- Let people choose how long a toast stays before it vanishes - [`85fcbd25f2`](https://github.com/Ding-Ding-Projects/worldlens/commit/85fcbd25f28a2a21c668bd5b394aa027b23ee0ba)
- Add an SSH file browser with world-folder recognition, Explorer-style - [`cb30adbb22`](https://github.com/Ding-Ding-Projects/worldlens/commit/cb30adbb2231523d3a59332eaff6e5434b5c81d0)
- Wire scheduled re-rendering's status and controls into the CI-render composable - [`8c34944d76`](https://github.com/Ding-Ding-Projects/worldlens/commit/8c34944d76a9aaff8f79b9978215f33ea517e6cd)
- Add the remote-hosting UI panel: publish, verify, and a gated stop - [`aa5a437c2c`](https://github.com/Ding-Ding-Projects/worldlens/commit/aa5a437c2c102187b92caeb3f92bdebf91f4bf26)
- Give the render memory ceiling an actual settings row - [`6293d10592`](https://github.com/Ding-Ding-Projects/worldlens/commit/6293d1059207025c8493722bd36f26eedc8b09d0)
- Correct docs/backup.md and BackupScreen.vue's restore claims, and record the live proof - [`9a1af80561`](https://github.com/Ding-Ding-Projects/worldlens/commit/9a1af80561c60001561de1d9d2a81a64645ef92d)
- Saved SSH hosts: last-used ordering and a Duplicate action - [`5e404764d8`](https://github.com/Ding-Ding-Projects/worldlens/commit/5e404764d8f734d1d3dffb2c1aba493b86269226)
- Fix a fakeBridge left behind by a lost edit, and cover the link field - [`e77e69b3f1`](https://github.com/Ding-Ding-Projects/worldlens/commit/e77e69b3f16f2255ba1960cd909313693952db65)
- Cover the downloads bridge's new parseLink capability with tests - [`f2d7ff324e`](https://github.com/Ding-Ding-Projects/worldlens/commit/f2d7ff324e33c1d71624a038b5b295f87220f20b)
- Let the downloads panel resolve a pasted link into owner/repo/tag - [`2b8b4012e2`](https://github.com/Ding-Ding-Projects/worldlens/commit/2b8b4012e20bdf5c218235446d8e8d223c1c57d2)

### Rendering and world data

- Teach the scheduled-render change check a fourth world-source: git - [`8468933278`](https://github.com/Ding-Ding-Projects/worldlens/commit/846893327859aadf5acf70c39d8f8c92620426d2)
- Add fingerprint/schedule-due/schedule-check to the render-actions CLI - [`7b81b7d4a6`](https://github.com/Ding-Ding-Projects/worldlens/commit/7b81b7d4a6770e7af24514d07c75222418433372)
- Share one world-fingerprint function between the desktop app and CI - [`afe4969912`](https://github.com/Ding-Ding-Projects/worldlens/commit/afe4969912b5ccb2ec79e6de5941868dcd09abd6)

### Server, CLI and configuration

- Gate release on the real Java config round-trip, fix stale CI comment - [`a6ffa75fbb`](https://github.com/Ding-Ding-Projects/worldlens/commit/a6ffa75fbb0f69168703da6f3b7382ef9d4a6f49)

### Desktop shell

- Investigate the two upload part sizes; conclude neither is a user setting - [`f7445d408e`](https://github.com/Ding-Ding-Projects/worldlens/commit/f7445d408e07025a2fbe2e478abc9fc3e7bbec92)
- Wire the download-concurrency store into main/index.ts - [`ce917dd1e8`](https://github.com/Ding-Ding-Projects/worldlens/commit/ce917dd1e866b905623142d1c924f162d00901d9)
- Make part-fetch concurrency a live setting instead of a construction-time freeze - [`db0e0b47cc`](https://github.com/Ding-Ding-Projects/worldlens/commit/db0e0b47cc5ee6907252281d925812fbe8c06c68)
- Add a persisted download-concurrency store, read fresh like the render ceiling - [`df72c916a3`](https://github.com/Ding-Ding-Projects/worldlens/commit/df72c916a313dd56c567d82657f7fb853891432f)
- Fix the Docker world source's overclaimed test count, false no-override claim, and unwired change check - [`c29a9a60d7`](https://github.com/Ding-Ding-Projects/worldlens/commit/c29a9a60d70d887c5e371ba6e463970131edeb12)
- Export REMOTE_HOSTING_EVENT_CHANNEL, wired to main/index.ts's broadcast - [`8103b6b59f`](https://github.com/Ding-Ding-Projects/worldlens/commit/8103b6b59f871609a0424d61e5c1504b5a847d20)
- Carry scheduled re-rendering across the preload and into the UI bridge - [`beaf22f21c`](https://github.com/Ding-Ding-Projects/worldlens/commit/beaf22f21c684a47413dd8831802d84b42d51431)
- Expose scheduled re-rendering over IPC: cirender:scheduleRead/Write - [`f3f28000c0`](https://github.com/Ding-Ding-Projects/worldlens/commit/f3f28000c0dfe3e7ebefacfcae399291c2130b7c)
- Wire the git world source into CI, the app, and prove it stays incremental - [`e5a34daa9f`](https://github.com/Ding-Ding-Projects/worldlens/commit/e5a34daa9fa433df45985acb80719f64039e4839)
- Let the app read and write scheduled re-rendering's configuration - [`ea2638f5ad`](https://github.com/Ding-Ding-Projects/worldlens/commit/ea2638f5ad8fe626983ce0c5a0cf343ceadaeaad)
- Teach both CI-render credential routes to read and write repository variables - [`65c993281b`](https://github.com/Ding-Ding-Projects/worldlens/commit/65c993281bf916dea592f76c71247256a5adcaac)
- Expose the remote-hosting bridge from the preload script - [`26136a548a`](https://github.com/Ding-Ding-Projects/worldlens/commit/26136a548a36f6d75d6224f6a4d82de18eef0021)
- Fix the live resume test's own cancellation timing, then run it for real - [`c29a7afd39`](https://github.com/Ding-Ding-Projects/worldlens/commit/c29a7afd394562776049f1a607e7912db5d58a35)
- Wire the SSH world source into the desktop app's IPC bootstrap - [`7dc95f1c0c`](https://github.com/Ding-Ding-Projects/worldlens/commit/7dc95f1c0cd23d62b4b5534475de18d8312a6973)
- Test the Docker world source: 74 cases, no daemon and no Docker required - [`ad001e0de3`](https://github.com/Ding-Ding-Projects/worldlens/commit/ad001e0de31679899d5f081a7b346d3f1f34a0a0)
- Fix a real bug found by testing backups against live GitHub: not every 422 is a taken tag - [`0e8646c980`](https://github.com/Ding-Ding-Projects/worldlens/commit/0e8646c980fe8c0688b0650c1c354f94e52f0e61)
- Wire the hosting IPC channel and export it from remote/index.ts - [`4d75529988`](https://github.com/Ding-Ding-Projects/worldlens/commit/4d755299888824f1b1b84822e5930ffc4814b6d0)
- Cover the SSH world-source IPC layer and its fetch tracker - [`dbed3a7069`](https://github.com/Ding-Ding-Projects/worldlens/commit/dbed3a7069cb6371d241ffb5de2bdf27aa6f28c2)
- Cover the hosting orchestrator against fakes: no SSH, no Docker, no server - [`b32550c7e2`](https://github.com/Ding-Ding-Projects/worldlens/commit/b32550c7e2bb5b24b12360eba5380fe2a522263c)
- Add a git-repository world source: publish and sync a world incrementally - [`7823191120`](https://github.com/Ding-Ding-Projects/worldlens/commit/78231911200cb154c3642618f922b4bd081ab5de)
- java-render-path: drive the orchestrator with a real JVM, not just java -jar - [`cde99fc5fa`](https://github.com/Ding-Ding-Projects/worldlens/commit/cde99fc5fac2d9225768e01c1102a3a3f34cdeba)
- Fetch worlds over SSH, from Linux and from Windows - [`4b06a0ad75`](https://github.com/Ding-Ding-Projects/worldlens/commit/4b06a0ad75ca17eb9e61eb216d2f09020b049447)
- Reach a world that lives in Docker: bind mount, named volume, or a container copy - [`cf5e0b1437`](https://github.com/Ding-Ding-Projects/worldlens/commit/cf5e0b1437ec42054703d3fd15f3b5b970e0b95c)
- Correct the backup barrel's restore claim and export restore.ts - [`af66df04cf`](https://github.com/Ding-Ding-Projects/worldlens/commit/af66df04cff7d38e6592576b3ae5199ffd77241d)
- Add the remote hosting plan and orchestrator (host a rendered map over SSH/Docker) - [`0c791cf3a5`](https://github.com/Ding-Ding-Projects/worldlens/commit/0c791cf3a59aab37886f8cefc415c03ba26f17d0)
- Add the Cheap LFS restore engine backups never had - [`6aa433d4b5`](https://github.com/Ding-Ding-Projects/worldlens/commit/6aa433d4b5fb19a4a22ebd78391aa7029728ca2a)
- Prove the memory ceiling reaches the JVM, not just the config file - [`45cdb6950e`](https://github.com/Ding-Ding-Projects/worldlens/commit/45cdb6950ef5040cb09fccd8b24c55e54f79f6d2)
- Apply the chosen render memory ceiling to every render, not just the setting file - [`1370791789`](https://github.com/Ding-Ding-Projects/worldlens/commit/1370791789f1f81f52b01bd9ad7eb6a4c7eda56a)
- Route release downloads through worldsource, so cross-repo actually works - [`08d5197f17`](https://github.com/Ding-Ding-Projects/worldlens/commit/08d5197f17eb84909a5c48e3e479c280741f84b1)

### Landing page and documentation site

- Voice the downloads link field, and stop contract articles quoting stale test counts - [`d5136880a1`](https://github.com/Ding-Ding-Projects/worldlens/commit/d5136880a10ac4cfa44363b3bfff296bcf2c96f3)
- Site: promote resource-packs and publishing-to-pages to shipped, add a status-drift guard - [`4577591f3b`](https://github.com/Ding-Ding-Projects/worldlens/commit/4577591f3bed28382e35c9468f1977f2d8dee902)
- Document remote hosting: docs article, site article, and cross-links - [`7ccd96a505`](https://github.com/Ding-Ding-Projects/worldlens/commit/7ccd96a505df505f729284cee838a0bf23a9733b)
- Finish the site rebrand: colour the feature cards, fix the settings dead zone - [`1cb604b0d0`](https://github.com/Ding-Ding-Projects/worldlens/commit/1cb604b0d003f7179e35ecda08df80a9a71945e8)
- Close the marker regex builder's silent key collision, finish two localization gaps, and correct five stale contract pages - [`e2fc5f1901`](https://github.com/Ding-Ding-Projects/worldlens/commit/e2fc5f190139b6d27e3140857fe3e053aa04b0b1)
- backups: promote to shipped, on real proof, and name the one real gap left - [`e319bc3096`](https://github.com/Ding-Ding-Projects/worldlens/commit/e319bc3096a1358a6edac31c2aa60e06f1ae5967)
- Bring the home page's release-downloads card in line with the article - [`302b9718dc`](https://github.com/Ding-Ding-Projects/worldlens/commit/302b9718dc577269fe17b33a96071861ff4cc432)
- Fix the release-downloads article: it described a field that did not exist - [`bbc8f12d9a`](https://github.com/Ding-Ding-Projects/worldlens/commit/bbc8f12d9a8d6b643fcec52299cc55029780c1f6)
- options-gui: run the exit check and a real hand-driven save, correct stale test counts - [`414b63e81e`](https://github.com/Ding-Ding-Projects/worldlens/commit/414b63e81e7655fb4ccd928e73f58ec7b68c7da6)
- github-sign-in: prove the device flow and token check against real github.com - [`831258681e`](https://github.com/Ding-Ding-Projects/worldlens/commit/831258681e06f0f36c154ba17d72eaeaec61e430)

### Build, release and tooling

- CI: actually run the real Java CLI round-trip test, not skip it - [`3a90ca5af6`](https://github.com/Ding-Ding-Projects/worldlens/commit/3a90ca5af6eec2aee383ec8ad0cc8cc27d711869)

### Documentation

- Document the git-repository world source - [`0f296e0715`](https://github.com/Ding-Ding-Projects/worldlens/commit/0f296e0715bd1bd739f3786edeec2458bfaaa14b)
- Document the Docker world source: three routes in, one refusal with no override - [`af0dfd2397`](https://github.com/Ding-Ding-Projects/worldlens/commit/af0dfd239710d943c4c684a8837d1ed7d087981b)
- Document worlds hosted on your own SSH server - [`23cee21208`](https://github.com/Ding-Ding-Projects/worldlens/commit/23cee212085c6b0de0606e7952b81753e1e85718)
- Wake up hourly, render only when the world actually changed - [`f6b9f5d927`](https://github.com/Ding-Ding-Projects/worldlens/commit/f6b9f5d927006af853440587833d76eb33f4b72a)
- Retire the world-sources doc's warning: the desktop UI is wired now - [`fb459c1b1e`](https://github.com/Ding-Ding-Projects/worldlens/commit/fb459c1b1ecdd369fef5319baff4686cd72c0ec4)

## 0.1.0-build.463 - 2026-08-05

Tagged at [`9b0c43b553`](https://github.com/Ding-Ding-Projects/worldlens/commit/9b0c43b55389fcb5455d44e3147c97b879da2ccd).

### Desktop shell

- Bedrock worlds: run a real Chunker conversion, and stop saying "ported" - [`9b0c43b553`](https://github.com/Ding-Ding-Projects/worldlens/commit/9b0c43b55389fcb5455d44e3147c97b879da2ccd)

## 0.1.0-build.459 - 2026-08-05

Tagged at [`b61cc8a398`](https://github.com/Ding-Ding-Projects/worldlens/commit/b61cc8a398bd2f70c954882524129a84a7f5b6c4).

### Landing page and documentation site

- Rebuild the landing page as a rebrand, not a retouch - [`b61cc8a398`](https://github.com/Ding-Ding-Projects/worldlens/commit/b61cc8a398bd2f70c954882524129a84a7f5b6c4)

## 0.1.0-build.458 - 2026-08-05

Tagged at [`3fb1586e69`](https://github.com/Ding-Ding-Projects/worldlens/commit/3fb1586e6942821c100da51e78855cbedfa73120).

### Landing page and documentation site

- Undo an accidental over-commit: main.ts had picked up unrelated in-flight work - [`3fb1586e69`](https://github.com/Ding-Ding-Projects/worldlens/commit/3fb1586e6942821c100da51e78855cbedfa73120)
- Give the chrome and settings surfaces the Beacon Cartography identity - [`46aff77464`](https://github.com/Ding-Ding-Projects/worldlens/commit/46aff77464c68d4f140dbb73d71ff64e8fb155e1)

## 0.1.0-build.457 - 2026-08-05

Tagged at [`107a032e25`](https://github.com/Ding-Ding-Projects/worldlens/commit/107a032e25e7bd56fef0137282d743245922e82f).

### Landing page and documentation site

- Rebrand the site's Material 3 identity system: Beacon Cartography - [`107a032e25`](https://github.com/Ding-Ding-Projects/worldlens/commit/107a032e25e7bd56fef0137282d743245922e82f)

## 0.1.0-build.454 - 2026-08-05

Tagged at [`3e2d60da4a`](https://github.com/Ding-Ding-Projects/worldlens/commit/3e2d60da4ace9f7426374c5b1eab5cd37e1d2727).

### Landing page and documentation site

- Extract commit links from changelog entries even when prose trails them - [`3e2d60da4a`](https://github.com/Ding-Ding-Projects/worldlens/commit/3e2d60da4ace9f7426374c5b1eab5cd37e1d2727)

## 0.1.0-build.452 - 2026-08-05

Tagged at [`d3d523ee5a`](https://github.com/Ding-Ding-Projects/worldlens/commit/d3d523ee5ab6e1baa6234184c3d06e36be902861).

### Landing page and documentation site

- Stop the Changelog page scrolling sideways at phone widths - [`d3d523ee5a`](https://github.com/Ding-Ding-Projects/worldlens/commit/d3d523ee5ab6e1baa6234184c3d06e36be902861)

## 0.1.0-build.450 - 2026-08-05

Tagged at [`840bbc875b`](https://github.com/Ding-Ding-Projects/worldlens/commit/840bbc875b01dcb1069de1b5223dedfc3ef4af64).

### Landing page and documentation site

- Replace the phone-width tab strip's overflow menu with scrollable tabs - [`840bbc875b`](https://github.com/Ding-Ding-Projects/worldlens/commit/840bbc875b01dcb1069de1b5223dedfc3ef4af64)

## 0.1.0-build.449 - 2026-08-05

Tagged at [`5f9e069bff`](https://github.com/Ding-Ding-Projects/worldlens/commit/5f9e069bff952ce8fa02707008726ccf5f5c372c).

### Build, release and tooling

- Fix CI: pin vitest to two forks so the RPC heartbeat stops timing out - [`5f9e069bff`](https://github.com/Ding-Ding-Projects/worldlens/commit/5f9e069bff952ce8fa02707008726ccf5f5c372c)

## 0.1.0-build.444 - 2026-08-05

Tagged at [`e3cadaa135`](https://github.com/Ding-Ding-Projects/worldlens/commit/e3cadaa135bad327b4cbb24da2a69ce869f2ede0).

### Landing page and documentation site

- Give appearance presets real multi-select, bulk delete and a scoped export - [`e3cadaa135`](https://github.com/Ding-Ding-Projects/worldlens/commit/e3cadaa135bad327b4cbb24da2a69ce869f2ede0)

## 0.1.0-build.443 - 2026-08-05

Tagged at [`630f6ae9d8`](https://github.com/Ding-Ding-Projects/worldlens/commit/630f6ae9d8d0cb8cf67c5b9b04431fc472ae15d1).

### Landing page and documentation site

- Give the notification centre real multi-select, bulk delete and scoped export - [`630f6ae9d8`](https://github.com/Ding-Ding-Projects/worldlens/commit/630f6ae9d8d0cb8cf67c5b9b04431fc472ae15d1)

## 0.1.0-build.442 - 2026-08-05

Tagged at [`43e12111e9`](https://github.com/Ding-Ding-Projects/worldlens/commit/43e12111e9ea878af68f2eaf6a45144bf4ef3272).

### Server, CLI and configuration

- Fix Screenshots-job EULA capture and widen a real-timer debounce test's margin - [`43e12111e9`](https://github.com/Ding-Ding-Projects/worldlens/commit/43e12111e9ea878af68f2eaf6a45144bf4ef3272)

## 0.1.0-build.441 - 2026-08-05

Tagged at [`0f46fa5d21`](https://github.com/Ding-Ding-Projects/worldlens/commit/0f46fa5d21cf6e57863355ab40f8647a4ff90bd8).

### Landing page and documentation site

- Voice the site's chrome that content rendering adds: badges, page titles, error boundary - [`0f46fa5d21`](https://github.com/Ding-Ding-Projects/worldlens/commit/0f46fa5d21cf6e57863355ab40f8647a4ff90bd8)
- Fix: [hidden] tabs kept rendering, and settings clear buttons showed text not icons - [`3d7fda350b`](https://github.com/Ding-Ding-Projects/worldlens/commit/3d7fda350bb25da72aa101d7b68149257c696dbc)
- Extend the destructive-action and blocking-dialog guards to the site - [`623db68ce7`](https://github.com/Ding-Ding-Projects/worldlens/commit/623db68ce7edb4aa1dce5a92c5da4467469525ce)

## 0.1.0-build.434 - 2026-08-05

Tagged at [`a6652d09f5`](https://github.com/Ding-Ding-Projects/worldlens/commit/a6652d09f5594a1ca59df1b7b68816dd55b517f9).

### Landing page and documentation site

- Make every appearance target findable and teleportable, not just settings - [`a6652d09f5`](https://github.com/Ding-Ding-Projects/worldlens/commit/a6652d09f5594a1ca59df1b7b68816dd55b517f9)

## 0.1.0-build.433 - 2026-08-05

Tagged at [`9bbedf6d9b`](https://github.com/Ding-Ding-Projects/worldlens/commit/9bbedf6d9b8ea72ccbde2fe1583398dbfe8227c1).

### Landing page and documentation site

- Remove the site's dead shell/panels.ts, orphaned since its first commit - [`9bbedf6d9b`](https://github.com/Ding-Ding-Projects/worldlens/commit/9bbedf6d9b8ea72ccbde2fe1583398dbfe8227c1)

## 0.1.0-build.432 - 2026-08-05

Tagged at [`00341f0985`](https://github.com/Ding-Ding-Projects/worldlens/commit/00341f0985f587d64b157a4801d3a8e543eca7f6).

### Interface

- Test the tour's reduced-motion path directly, not just claim it in a comment - [`00341f0985`](https://github.com/Ding-Ding-Projects/worldlens/commit/00341f0985f587d64b157a4801d3a8e543eca7f6)

## 0.1.0-build.430 - 2026-08-05

Tagged at [`9902962789`](https://github.com/Ding-Ding-Projects/worldlens/commit/99029627890465794f862c40e0dfb2bb3d92fabb).

### Interface

- Register GlossaryTerm.vue's popover in the menu-coverage guard - [`9902962789`](https://github.com/Ding-Ding-Projects/worldlens/commit/99029627890465794f862c40e0dfb2bb3d92fabb)
- Stop the tour's own doc comment tripping the catalogue scanner it explains - [`6e3204dac0`](https://github.com/Ding-Ding-Projects/worldlens/commit/6e3204dac0651847e1e282da641af55f0cc716cd)
- Explain the vocabulary in place: a click-to-open glossary affordance beside every undefined term - [`21a1c1f596`](https://github.com/Ding-Ding-Projects/worldlens/commit/21a1c1f596a4788641c7362b8b2b7ea1de17ca08)
- Add the interactive tour: a guided, anchored walkthrough of the real first-run path - [`5e492cd83f`](https://github.com/Ding-Ding-Projects/worldlens/commit/5e492cd83f52bf2298bd54bb9ee6fd54f03b7615)
- Fix the viewer-menu search never filtering its own option lists; clear the settings-drawer search of any bug - [`261a5cb580`](https://github.com/Ding-Ding-Projects/worldlens/commit/261a5cb580c32cad0de875a3ca3aba6075bce47f)
- Give the landing page a real hero, tonal stat cards, and a beginner's path - [`584a4ba0c1`](https://github.com/Ding-Ding-Projects/worldlens/commit/584a4ba0c1594ce9b838467269a27177d5edfc69)
- Fix the viewer-menu search never filtering its own option lists; clear the settings-drawer search of any bug - [`bdc36eb017`](https://github.com/Ding-Ding-Projects/worldlens/commit/bdc36eb01734a9e08d59a9c5bfbf412f40553462)
- Show containers left running from an earlier session, on the world screen - [`6cb22b54c1`](https://github.com/Ding-Ding-Projects/worldlens/commit/6cb22b54c15b69a4a958be8cc1d702edfc34084b)

### Landing page and documentation site

- Restyle the settings tab row as an M3 segmented button group - [`2bc27c1ffc`](https://github.com/Ding-Ding-Projects/worldlens/commit/2bc27c1ffce8ae3c327dfd5601ab3336b38375e3)

### Documentation

- Fix docs/world-sources.md: stop claiming the desktop app wires a channel it never calls - [`e59f4540b7`](https://github.com/Ding-Ding-Projects/worldlens/commit/e59f4540b7aa46bf9ceda776cb2fdcf534969678)

### Elsewhere in the repository

- Merge origin/main: reconcile after a same-second local/remote commit race - [`f1a6e8d07e`](https://github.com/Ding-Ding-Projects/worldlens/commit/f1a6e8d07edbc6456934415bc434249a2731be3e) _(summary of 2 commits, also listed here)_

## 0.1.0-build.419 - 2026-08-05

Tagged at [`d704cf1771`](https://github.com/Ding-Ding-Projects/worldlens/commit/d704cf1771fb4559eeee98dc8affb83db6082a08).

### Interface

- Wire the project History tab: main-process history existed, nothing ever showed it - [`d704cf1771`](https://github.com/Ding-Ding-Projects/worldlens/commit/d704cf1771fb4559eeee98dc8affb83db6082a08)
- Make empty states teach: what a thing is, why you'd want one, and the button that fixes it - [`9421c31cdc`](https://github.com/Ding-Ding-Projects/worldlens/commit/9421c31cdcb1ca6bea6acd77b8ef333a61062b8c)
- Wire cirender:active to the bridge; delete two channels nothing ever called - [`29383715b4`](https://github.com/Ding-Ding-Projects/worldlens/commit/29383715b47bddbbb100cd87f15b2467808d3745)
- Fix batch-2 audit findings: zstd main-process crash, stale README phases, stale coverage comment, GitHub sign-out gate - [`ea6528a3d8`](https://github.com/Ding-Ding-Projects/worldlens/commit/ea6528a3d8e2321d0efe5ae39a6f7c40e143451a)

### Landing page and documentation site

- Wire the anchored regex builder into the two site search fields that skipped it - [`a1eb01a128`](https://github.com/Ding-Ding-Projects/worldlens/commit/a1eb01a1282438a9a3da726a23c9917b46eec0d9)

## 0.1.0-build.412 - 2026-08-05

Tagged at [`57a6476eaa`](https://github.com/Ding-Ding-Projects/worldlens/commit/57a6476eaa40a24a843979b3867dcb2fe5db42b9).

### Landing page and documentation site

- Give the site's command palette real inline setting controls, not just a link - [`a72fa8f43f`](https://github.com/Ding-Ding-Projects/worldlens/commit/a72fa8f43f31a8677357a47424a6ee6d3ccb2e67)

### Build, release and tooling

- Publish RELEASES and the Squirrel .nupkg as their own release assets, not only zipped - [`e613e68439`](https://github.com/Ding-Ding-Projects/worldlens/commit/e613e68439ee22a87e00c4015fb7f2358c78a68d)

### Documentation

- Bring HANDOFF and ROADMAP up to the current tip after the UI-defect wave - [`b4e2879650`](https://github.com/Ding-Ding-Projects/worldlens/commit/b4e287965076e32e2d22c4901547a3abe181dab1)

### Elsewhere in the repository

- Publish RELEASES and the Squirrel .nupkg as their own release assets, not only zipped - [`b66725b7f7`](https://github.com/Ding-Ding-Projects/worldlens/commit/b66725b7f7eaa375c7330c5e38f85fba1f066d6e)

## 0.1.0-build.407 - 2026-08-05

Tagged at [`9bf33b3c66`](https://github.com/Ding-Ding-Projects/worldlens/commit/9bf33b3c661c7d7ad6991e061f54cf4d133b210d).

### Interface

- Give the placement chooser, the new-tab picker and the overflow list a search field - [`9bf33b3c66`](https://github.com/Ding-Ding-Projects/worldlens/commit/9bf33b3c661c7d7ad6991e061f54cf4d133b210d)

### Landing page and documentation site

- Site: publish a newcomer glossary, reachable from the install article - [`67358ace08`](https://github.com/Ding-Ding-Projects/worldlens/commit/67358ace083674a5917f26924016ae9115e9e071)

### Documentation

- Recapture the six render-*.png screenshots with real consent, and cite them in eula-and-consent.md - [`8ca84fa7f7`](https://github.com/Ding-Ding-Projects/worldlens/commit/8ca84fa7f78653c5bf0fad019801a14834d06537)

## 0.1.0-build.403 - 2026-08-05

Tagged at [`1ce004035c`](https://github.com/Ding-Ding-Projects/worldlens/commit/1ce004035c89ca4fb3cc1fa77ab25de878e6e8e4).

### Landing page and documentation site

- Site: cover appearance/colour, confirm gate, notifications and dim sum with tests - [`1ce004035c`](https://github.com/Ding-Ding-Projects/worldlens/commit/1ce004035c89ca4fb3cc1fa77ab25de878e6e8e4)

## 0.1.0-build.402 - 2026-08-05

Tagged at [`dafbad470f`](https://github.com/Ding-Ding-Projects/worldlens/commit/dafbad470fb88d8e05c21797014cb997ea328eec).

### Interface

- Fix the repair panel's agent chip clipping its own sentence at the docked-right width - [`56b12939f8`](https://github.com/Ding-Ding-Projects/worldlens/commit/56b12939f844f713f52dbde397324fc10c3c073a)
- Prove the settings drawer needs no FAB gutter: its z-index already wins - [`cf80e54a8c`](https://github.com/Ding-Ding-Projects/worldlens/commit/cf80e54a8c4dbd2628c0a80449daf771e4a6424d)

### Landing page and documentation site

- Bring settings, content and search surfaces onto the M3 token layer - [`dafbad470f`](https://github.com/Ding-Ding-Projects/worldlens/commit/dafbad470fb88d8e05c21797014cb997ea328eec)
- Site: document the world-sources release-downloads path, tidy two blank table headers - [`f18c50b9dc`](https://github.com/Ding-Ding-Projects/worldlens/commit/f18c50b9dcd709f37f5fe492b98444fc36e3a7be)
- Fix four stale/missing claims: update copy, two render-location docs, and a Windows installer shipping no CLI jar - [`c13916cddc`](https://github.com/Ding-Ding-Projects/worldlens/commit/c13916cddc24879c771fbfcc464ebf33e23de986)
- Give automatic repair a site article; fix two stale facts and a missing roadmap credit - [`aacfb707ff`](https://github.com/Ding-Ding-Projects/worldlens/commit/aacfb707ffd72af5d0fc4f23601992734b4ee883)
- Add site articles for world discovery and Bedrock conversion; correct a stale "pending" CI claim - [`2c2ae68ad6`](https://github.com/Ding-Ding-Projects/worldlens/commit/2c2ae68ad6519b42434a259964ddfa2a18f2d47b)

### Documentation

- Make Java the standing render default, not a placeholder for the gate - [`be296c29b3`](https://github.com/Ding-Ding-Projects/worldlens/commit/be296c29b3df70ed5d7ed2982e7d1df856f07745)
- Audit the whole session against reality: 24 done, 2 partial, one stale summary caught - [`0ce6ed0c46`](https://github.com/Ding-Ding-Projects/worldlens/commit/0ce6ed0c468c150c83ee7d649f5f7c7ccea6683d)

## 0.1.0-build.393 - 2026-08-05

Tagged at [`c02e867cb0`](https://github.com/Ding-Ding-Projects/worldlens/commit/c02e867cb02ab9592b00a157d72328564ca94e16).

### Interface

- Fix EULA export rows that dim with no stated reason: the doc comment already promised one - [`c02e867cb0`](https://github.com/Ding-Ding-Projects/worldlens/commit/c02e867cb02ab9592b00a157d72328564ca94e16)

## 0.1.0-build.392 - 2026-08-05

Tagged at [`8e2c44b57f`](https://github.com/Ding-Ding-Projects/worldlens/commit/8e2c44b57ffbce4380f54bd8fb11631dcf719655).

### Interface

- Fix the Cantonese funny-level caption landing on top of its own tick label - [`8e2c44b57f`](https://github.com/Ding-Ding-Projects/worldlens/commit/8e2c44b57ffbce4380f54bd8fb11631dcf719655)
- Fix the bottom-left FAB stack painting over page text at every width and scale - [`26d74a8a28`](https://github.com/Ding-Ding-Projects/worldlens/commit/26d74a8a28061adeb2d56de2d4a795f99df3d1f9)

### Documentation

- Document the test-and-capture pass: two real bugs, the cleared screenshot backlog - [`8ae6a0a7ba`](https://github.com/Ding-Ding-Projects/worldlens/commit/8ae6a0a7ba6a1950fed587074e9d10cb8fc58f15)

## 0.1.0-build.389 - 2026-08-05

Tagged at [`b3ab47a548`](https://github.com/Ding-Ding-Projects/worldlens/commit/b3ab47a548f50873e83a17fe5d427e37bee1fb9e).

### Interface

- Fix: the save gate could ellipsis a file path with no way to read it back - [`d7cda3bb41`](https://github.com/Ding-Ding-Projects/worldlens/commit/d7cda3bb419abc787a38944982b5f52a0d5b9685)

### Desktop shell

- Add a per-render account picker to CI render setup, no active-account switch - [`44e8453262`](https://github.com/Ding-Ding-Projects/worldlens/commit/44e84532628bb9a623d45d9b1ff5a1fcc51c701b)

### Documentation

- Refresh both live-Pages screenshots against the real hosted proof sites - [`b3ab47a548`](https://github.com/Ding-Ding-Projects/worldlens/commit/b3ab47a548f50873e83a17fe5d427e37bee1fb9e)

## 0.1.0-build.386 - 2026-08-05

Tagged at [`7dbfc17754`](https://github.com/Ding-Ding-Projects/worldlens/commit/7dbfc177547db4456db22c7c9797822ade3d6a1a).

### Interface

- Fix: the docs browser's index and search results ellipsed titles with no recovery - [`7dbfc17754`](https://github.com/Ding-Ding-Projects/worldlens/commit/7dbfc177547db4456db22c7c9797822ade3d6a1a)
- Fix: a long marker set id could overflow its own panel header - [`7601828449`](https://github.com/Ding-Ding-Projects/worldlens/commit/76018284492955b7a80d666bd6ec0c35cb9e3154)
- Fix: tab search results and the group picker lost long labels to a silent ellipsis - [`df1037d947`](https://github.com/Ding-Ding-Projects/worldlens/commit/df1037d947098ea654f2b435a269a663d0b4fc1f)
- Fix the whole GUI wearing a hand cursor: answer Vuetify's [aria-controls] rule at the appearance wrapper - [`01d21eb901`](https://github.com/Ding-Ding-Projects/worldlens/commit/01d21eb901c5785c08dd3b759780925c595c2210)

## 0.1.0-build.382 - 2026-08-05

Tagged at [`1074ea3325`](https://github.com/Ding-Ding-Projects/worldlens/commit/1074ea332537fbe9832085558553dba007bef4dc).

### Interface

- Fix docked panels not scrolling: floating panels had no real height, and the body's flex chain to nested content was broken - [`2b04a82f5b`](https://github.com/Ding-Ding-Projects/worldlens/commit/2b04a82f5b9bc8198978904c508b2bcc5279c49c)

### Documentation

- Refresh 49 documentation screenshots against a quiet machine, fix the settings-tab capture gap the sweep exposed - [`1074ea3325`](https://github.com/Ding-Ding-Projects/worldlens/commit/1074ea332537fbe9832085558553dba007bef4dc)

## 0.1.0-build.380 - 2026-08-05

Tagged at [`89702241b2`](https://github.com/Ding-Ding-Projects/worldlens/commit/89702241b2abf007af5138a03d8028dfce4d09cf).

### Documentation

- Record a screenshot-by-screenshot visual audit of the current build - [`89702241b2`](https://github.com/Ding-Ding-Projects/worldlens/commit/89702241b2abf007af5138a03d8028dfce4d09cf)

## 0.1.0-build.378 - 2026-08-05

Tagged at [`c533c8c8d4`](https://github.com/Ding-Ding-Projects/worldlens/commit/c533c8c8d49655194057882a5896e583c35ffd8e).

### Rendering and world data

- Give the hyphenated-map-id resume test its own real-I/O timeout - [`623807459a`](https://github.com/Ding-Ding-Projects/worldlens/commit/623807459a7fe8325a9889144462f06ec5ad2c88)

### Desktop shell

- Fix #resume: a resumed backup renamed every part and re-uploaded all of them - [`c533c8c8d4`](https://github.com/Ding-Ding-Projects/worldlens/commit/c533c8c8d49655194057882a5896e583c35ffd8e)

## 0.1.0-build.374 - 2026-08-05

Tagged at [`0e9b4edf53`](https://github.com/Ding-Ding-Projects/worldlens/commit/0e9b4edf53185ae3e12553ac29933274eb7cff29).

### Build, release and tooling

- Release notes: link the changelog they never mentioned - [`0e9b4edf53`](https://github.com/Ding-Ding-Projects/worldlens/commit/0e9b4edf53185ae3e12553ac29933274eb7cff29)

## 0.1.0-build.373 - 2026-08-05

Tagged at [`0ad90f07be`](https://github.com/Ding-Ding-Projects/worldlens/commit/0ad90f07be4fe747a0ad3453c56c4407669713ed).

_No changes were recorded for this version: its tag points at a commit that an earlier tag already covered._

## 0.1.0-build.372 - 2026-08-05

Tagged at [`db9affde7c`](https://github.com/Ding-Ding-Projects/worldlens/commit/db9affde7cfa1bdf1cdefc95fe94c609fa0c6a62).

### Documentation

- Stamp HANDOFF and ROADMAP to the green tip: CI run 31013825875, release v0.1.0-build.370, zero open issues - [`db9affde7c`](https://github.com/Ding-Ding-Projects/worldlens/commit/db9affde7cfa1bdf1cdefc95fe94c609fa0c6a62)

## 0.1.0-build.370 - 2026-08-05

Tagged at [`9d8de68592`](https://github.com/Ding-Ding-Projects/worldlens/commit/9d8de685922f116d9d9215c5df15ebfbbac6c4c9).

### Interface

- Fix the second blocker CI queued behind the first: a collapsed tab strip and a wrong-tab menu button - [`9d8de68592`](https://github.com/Ding-Ding-Projects/worldlens/commit/9d8de685922f116d9d9215c5df15ebfbbac6c4c9)

## 0.1.0-build.368 - 2026-08-05

Tagged at [`3dc7ef57f4`](https://github.com/Ding-Ding-Projects/worldlens/commit/3dc7ef57f4f454e966987c981ac82c76d12e73d6).

### Desktop shell

- Fix Screenshots: the EULA panel has a hidden evil twin, and the wait was watching it - [`3dc7ef57f4`](https://github.com/Ding-Ding-Projects/worldlens/commit/3dc7ef57f4f454e966987c981ac82c76d12e73d6)

## 0.1.0-build.366 - 2026-08-05

Tagged at [`86277c5f37`](https://github.com/Ding-Ding-Projects/worldlens/commit/86277c5f377cd9697f8398ee7a66942f08fc5e25).

### Rendering and world data

- Fix #47: mirror BlueMap's own map-id sanitiser instead of guessing at the hyphen - [`1dfe8a1f60`](https://github.com/Ding-Ding-Projects/worldlens/commit/1dfe8a1f607ac443ee15c24e8659d0a4303dd2a4)

## 0.1.0-build.364 - 2026-08-05

Tagged at [`a1f8172402`](https://github.com/Ding-Ding-Projects/worldlens/commit/a1f81724026d5d86b3f74eaef0e909cc7410a596).

### Interface

- Fix MarkerMenu.test.ts's flaky filters-open assertion: give it its own localStorage - [`a1f8172402`](https://github.com/Ding-Ding-Projects/worldlens/commit/a1f81724026d5d86b3f74eaef0e909cc7410a596)
- Add the missing test for MarkerMenu's settings-history mirror - [`2a06e1979f`](https://github.com/Ding-Ding-Projects/worldlens/commit/2a06e1979f49938a43d6229126178a53bb931d63)

### Build, release and tooling

- Close issue #32: SQL storage proven cross-compatible with upstream's Java engine - [`b2c8261649`](https://github.com/Ding-Ding-Projects/worldlens/commit/b2c8261649b684454b47108e1617b62732d7d0b9)

### Documentation

- Record issue #39's real two-wave dispatch: df numbers, not arithmetic anymore - [`e4e62dba88`](https://github.com/Ding-Ding-Projects/worldlens/commit/e4e62dba88572575d2864a7c516b9fcf8cfe6593)

## 0.1.0-build.358 - 2026-08-05

Tagged at [`321e0cf634`](https://github.com/Ding-Ding-Projects/worldlens/commit/321e0cf634c245fa9db7eceb46527bfc0a066f3b).

### Build, release and tooling

- Close issue #31: modded textures.json parity, proven offline - [`321e0cf634`](https://github.com/Ding-Ding-Projects/worldlens/commit/321e0cf634c245fa9db7eceb46527bfc0a066f3b)

## 0.1.0-build.357 - 2026-08-05

Tagged at [`cfab9a1f73`](https://github.com/Ding-Ding-Projects/worldlens/commit/cfab9a1f736ac96ef3429386a4ab03efc1cf7979).

### Interface

- Fix four more stores: mirror settings history even with no local storage - [`cfab9a1f73`](https://github.com/Ding-Ding-Projects/worldlens/commit/cfab9a1f736ac96ef3429386a4ab03efc1cf7979)

## 0.1.0-build.356 - 2026-08-05

Tagged at [`e569e47831`](https://github.com/Ding-Ding-Projects/worldlens/commit/e569e478313b21fd84e5e789a76965f0fda56598).

### Interface

- Fix writeEulaStrip: mirror the EULA tab layout even with no localStorage at all - [`e569e47831`](https://github.com/Ding-Ding-Projects/worldlens/commit/e569e478313b21fd84e5e789a76965f0fda56598)
- Finish wiring every localStorage settings store into the history mirror - [`cd0a78d2c1`](https://github.com/Ding-Ding-Projects/worldlens/commit/cd0a78d2c101061341cadcc488c1449ed5c6a3f7)
- Chore: sync appearance store, palette prefs, remote targets, setup i18n, tabs storage, update model, settings dock placement, eula storage, marker menu, appSettingsHistorySync - [`20613ead77`](https://github.com/Ding-Ding-Projects/worldlens/commit/20613ead7775d54bb522b6300ae97393dfef4766)
- CI: silence pointless vue-i18n warning flood that was tripping vitest's RPC timeout - [`e77f11ac22`](https://github.com/Ding-Ding-Projects/worldlens/commit/e77f11ac22350a73dbb5f8aca747073e62624118)
- Wire the two staged history/repair channels into their real mutation and failure sites - [`cae7ee86f3`](https://github.com/Ding-Ding-Projects/worldlens/commit/cae7ee86f30d8f29c12e7503e79737b5e365ae93)
- Fix palette Debug-row test collision and the CLI e2e webapp-bundle gap - [`49160ef0c7`](https://github.com/Ding-Ding-Projects/worldlens/commit/49160ef0c75e289428a41ad88c7021f6950ff28c)
- Find the real bug behind a test left honestly red: TabGroupPicker's own trap was fine - [`711e534b7a`](https://github.com/Ding-Ding-Projects/worldlens/commit/711e534b7a583c93dac99e71411263c25b6adbef)
- Give the progress panel real tile-count honesty, real upload bytes, wave truth, and its route (#38) - [`d4f83fa540`](https://github.com/Ding-Ding-Projects/worldlens/commit/d4f83fa540d4782762974ccbc18f762340e58489)
- Bridge and mount automatic repair diagnostics - [`6981bf9ca4`](https://github.com/Ding-Ding-Projects/worldlens/commit/6981bf9ca4f19896aef88872d32ccfb23ad4f66b)
- Register the last unwired copy surfaces and fix a genuine tab-group-picker search leak - [`f8e828318b`](https://github.com/Ding-Ding-Projects/worldlens/commit/f8e828318befff17f9fdae4d340feb23fef874cd)
- Bridge and mount Bedrock world detection and conversion - [`bb94e7b39c`](https://github.com/Ding-Ding-Projects/worldlens/commit/bb94e7b39c40e0275400c3111c299ea841f27b6d)
- Fix the History capture's stale Vuetify selectors, and settle #36 as format conformance - [`2a1405b9cb`](https://github.com/Ding-Ding-Projects/worldlens/commit/2a1405b9cbd60bb07bf79466835d7e628f7dc5d0)
- Bridge and mount browse/restore for the profile-list and settings histories - [`a66e34a13a`](https://github.com/Ding-Ding-Projects/worldlens/commit/a66e34a13a48f53e07164bdeecf66ea2c84325c6)
- Fix the notification bulk-delete gate's completion hold and surface hidden previews - [`b87c91deb6`](https://github.com/Ding-Ding-Projects/worldlens/commit/b87c91deb6f15b3da68bb434a78b236b2c7f4803)
- Name the reason Go Fullscreen is disabled instead of leaving it blank - [`343285f5ac`](https://github.com/Ding-Ding-Projects/worldlens/commit/343285f5acaef63496547efb232144fd8e8cdaec)
- Fix the typecheck errors the parse-crash fix had been hiding all along - [`e551d934d8`](https://github.com/Ding-Ding-Projects/worldlens/commit/e551d934d883e5bed291ec1b8e185ee10ba09c9b)
- Fix the vue-tsc parse crash that was flunking every CI run since the sweep - [`d92b71c5ef`](https://github.com/Ding-Ding-Projects/worldlens/commit/d92b71c5ef2ff4c65bf1642ac016aacd6acddd7d)
- Fix CI-render sign-in wiring and add ARIA live regions - [`0ca1d645bd`](https://github.com/Ding-Ding-Projects/worldlens/commit/0ca1d645bdb559a32bb8ff32ef7015492a3ac091)
- Give the wizard's downloads disclosure an aria-controls target - [`033bd8f916`](https://github.com/Ding-Ding-Projects/worldlens/commit/033bd8f9165fbba9b336be22612fd66ba38f83ea)
- Make the save dialog's Escape and outside-click honour the in-flight guard - [`5e3104fe76`](https://github.com/Ding-Ding-Projects/worldlens/commit/5e3104fe768becdae434bf8e7e388c89d0b7f4db)
- Let Escape reach the settings regex builder's popover - [`dc8f2fe89e`](https://github.com/Ding-Ding-Projects/worldlens/commit/dc8f2fe89e2e5df16280feba9749131cc7741232)
- Fix: small UI and config cleanup, align paths, fix test expectations - [`649869166c`](https://github.com/Ding-Ding-Projects/worldlens/commit/649869166cf58a84d1643d238dea2eda222ca41e)
- Auto commit 2026-08-05 04:37:15.299Z - [`78a87fbf39`](https://github.com/Ding-Ding-Projects/worldlens/commit/78a87fbf39542ba9e4da99f470876a0183334efb)

### Rendering and world data

- Prove SQL storage against real MySQL/MariaDB/PostgreSQL servers (issue #32) - [`926ae2b5be`](https://github.com/Ding-Ding-Projects/worldlens/commit/926ae2b5be36a987bc07ce327b3642a44c5ff4a5)
- Gate the flattening rename on both world AND pack era, not world alone (#46) - [`1642a29371`](https://github.com/Ding-Ding-Projects/worldlens/commit/1642a293718066fd59702b7775599fa7c06e5493)
- Prove Phase C check 2: a real 1.12.2 jar through the legacy compat path, and a genuine finding (issue #31) - [`965af52d6c`](https://github.com/Ding-Ding-Projects/worldlens/commit/965af52d6c2aaa9c4211148f1cd3e204792269cd)
- storage/sql: cover render-state grids and the always-uncompressed markers/players - [`250e7e700a`](https://github.com/Ding-Ding-Projects/worldlens/commit/250e7e700a6d2326d037ebf4bff76ab08bc1be52)
- storage: dialect resolution, driver-adapter and byte-fidelity tests; ROADMAP + deviations - [`b32f423b26`](https://github.com/Ding-Ding-Projects/worldlens/commit/b32f423b2687711f734fc2447fec132c5e194e33)
- storage: port upstream's SQL storage (sql.js/mysql2/pg, pure JS, no native modules) - [`0bc90c2c25`](https://github.com/Ding-Ding-Projects/worldlens/commit/0bc90c2c25dbc17dcf8c83f18cf9a75261b943b4)
- RenderManager: expose saveRenderTaskQueue / loadRenderTaskQueue (#30) - [`8f61600f44`](https://github.com/Ding-Ding-Projects/worldlens/commit/8f61600f44a1819bfc4f0c8e124c4754fe572866)
- Port SerializableRenderTask and the per-task Serialized forms (#30) - [`a5e5cf7ab7`](https://github.com/Ding-Ding-Projects/worldlens/commit/a5e5cf7ab7e92b4cf123caea8f14ffe9fd03b478)
- Drop yauzl-promise from engine's ZipFileSystem: esbuild cannot bundle its native crc32 addon - [`e976ee9f6c`](https://github.com/Ding-Ding-Projects/worldlens/commit/e976ee9f6c196d7bfe89499b558ef242ed040116)

### Server, CLI and configuration

- Make the vendor cross-checks loud, and stop grading a stale config build - [`da1f5057fe`](https://github.com/Ding-Ding-Projects/worldlens/commit/da1f5057fe563990ca4f27bdebf627de493f21cb)
- Internal maintenance message omitted from the public changelog - [`cbc135cbe7`](https://github.com/Ding-Ding-Projects/worldlens/commit/cbc135cbe79f6f0adad8fbbe69d1a03c2a37a8a6)
- cli: build the real standalone server CLI, reusing the config package's own flag model - [`53e647469a`](https://github.com/Ding-Ding-Projects/worldlens/commit/53e647469aec343f30190895de520deb82bbdda6)
- test+docs: prove the head-of-queue race is safe, drop #40 from ROADMAP's gap list - [`d9486357ae`](https://github.com/Ding-Ding-Projects/worldlens/commit/d9486357aea445c51a5cec0263d81583e2f662b5)
- server: bridge region-file watch events to real WorldRegionUpdateTask scheduling (#40) - [`50e4b1abe8`](https://github.com/Ding-Ding-Projects/worldlens/commit/50e4b1abe8a79c50d8b67651e1a633e8c98b4f67)
- server: drive the real RenderManager from a map-update request - [`19103df5a9`](https://github.com/Ding-Ding-Projects/worldlens/commit/19103df5a9a481550726432eab9069c49263dc63)
- server: live/sse, live/players.json, live/markers.json with honest empty stubs - [`00261d4af0`](https://github.com/Ding-Ding-Projects/worldlens/commit/00261d4af0cc63b0d3f7a06757a258268d15f1f3)
- server: port MapStorageRequestHandler for real tiles/settings/textures/assets over HTTP - [`d78bbbce53`](https://github.com/Ding-Ding-Projects/worldlens/commit/d78bbbce534a102ef3a7d37a4961714b4c634e6f)

### Desktop shell

- Revert "Remove WebServer": that gap now belongs to a dedicated session - [`2e37bcb69e`](https://github.com/Ding-Ding-Projects/worldlens/commit/2e37bcb69e7801bd69f5a5e4313ab2938c3e24ba)
- Remove WebServer: nothing ever asked the engine to run one twice - [`07bab3e294`](https://github.com/Ding-Ding-Projects/worldlens/commit/07bab3e294f86207135df65b4d677d44c8e0bff6)

### Build, release and tooling

- CI: retry vitest's own RPC-heartbeat flake only, and fix a real dynamic-require crash the fix will now expose - [`3791655e07`](https://github.com/Ding-Ding-Projects/worldlens/commit/3791655e079bcd8dbf901bd3029cf1fe7cd83773)
- Fetch the vendored BlueMap submodule in CI, and let its absence fail loud - [`cb87a9fce0`](https://github.com/Ding-Ding-Projects/worldlens/commit/cb87a9fce0256c979e877e56abd114670b10dbb9)
- Prove Phase C check 1: textures.json is semantically identical, java vs port (issue #31) - [`6ec9beac2d`](https://github.com/Ding-Ding-Projects/worldlens/commit/6ec9beac2dd4fff32474dd79030260e7fef0b400)
- Record the server package's two deviations, and prove RenderDriver on a real generated world - [`2b86de90ca`](https://github.com/Ding-Ding-Projects/worldlens/commit/2b86de90ca8c9ff357e187d805c952d803ad9e4b)

### Documentation

- Record Phase C's exit-check disposition: 2 pass, 1 finds a real defect (issue #31) - [`9b3613f9c0`](https://github.com/Ding-Ding-Projects/worldlens/commit/9b3613f9c016138be7063e00ba5d22e3c1c42520)
- docs: catch HANDOFF and ROADMAP up with the 2026-08-05 multi-agent pass - [`0047b713d2`](https://github.com/Ding-Ding-Projects/worldlens/commit/0047b713d2ceef83e4e5704c5e09b3452af0e218)
- docs: refresh ROADMAP.md's Phase E entries for #41 and #29 - [`6a019e4e85`](https://github.com/Ding-Ding-Projects/worldlens/commit/6a019e4e85daedf58db11c93c90bbbe58b40f8e0)
- Add real captures of the five screens issue #34 asked for - [`dbbfa60d67`](https://github.com/Ding-Ding-Projects/worldlens/commit/dbbfa60d671b67f7ed7dc10b954fb430c363a2a4)
- Refresh 34 documentation screenshots from a live capture of the current build - [`186b5d7c9d`](https://github.com/Ding-Ding-Projects/worldlens/commit/186b5d7c9da76c636d8d148dffc45a0c5b4f71a9)

## 0.1.0-build.300 - 2026-08-04

Tagged at [`00dafe826a`](https://github.com/Ding-Ding-Projects/worldlens/commit/00dafe826a6bdac8d531f686db9e84fbf281bd84).

### Interface

- Turn CI green: fix a self-flagging comment, a leaky test, a category gap - [`00dafe826a`](https://github.com/Ding-Ding-Projects/worldlens/commit/00dafe826a6bdac8d531f686db9e84fbf281bd84)
- Prove profile shortcuts in the rendered menu - [`9cbce505af`](https://github.com/Ding-Ding-Projects/worldlens/commit/9cbce505af08a45a94d713aa2bc4b54e281242c7)
- Show the real profile-row opening keys - [`ac5ac795d7`](https://github.com/Ding-Ding-Projects/worldlens/commit/ac5ac795d751ab121f4c5b75103bcd7143b06deb)
- Prove profile shortcuts in the rendered menu - [`2b8595b9ea`](https://github.com/Ding-Ding-Projects/worldlens/commit/2b8595b9ead3c687a30b5926a1024cace0c3408b)
- Keep one profile keyboard hint in the catalogue - [`5f4bfee8cd`](https://github.com/Ding-Ding-Projects/worldlens/commit/5f4bfee8cd2c83942937bca7afc2f754a74b6089)
- Show the real profile-row opening keys - [`45a07d9bfd`](https://github.com/Ding-Ding-Projects/worldlens/commit/45a07d9bfd5dfc6684b7f22602771addc4669d28)
- Voice the config surfaces and harden capture cleanup - [`688bccec17`](https://github.com/Ding-Ding-Projects/worldlens/commit/688bccec17ecda7727711cd926a46c5955c95c09)
- Document the fixed appearance editor tabs - [`17d0dc6b67`](https://github.com/Ding-Ding-Projects/worldlens/commit/17d0dc6b67ca21f8d3f7733f9e7500ff0f53afa8)
- Complete tabbed material surfaces and resumable Pages publishing - [`1e9ae1b379`](https://github.com/Ding-Ding-Projects/worldlens/commit/1e9ae1b37973f169e010c759455fc8dbefe8f716)
- Wire the map control bar and the history panel into the appearance editor - [`796ac32b17`](https://github.com/Ding-Ding-Projects/worldlens/commit/796ac32b178af46b10961f1d7aabb465c40200f0)
- Give every tab and group Edit appearance, not just the strip they sit in - [`cd09b84541`](https://github.com/Ding-Ding-Projects/worldlens/commit/cd09b845419eafeb1c4e87156038308516cb54ec)
- Voice the tab strip, appearance editor, downloads, console and menus - [`f1188a684f`](https://github.com/Ding-Ding-Projects/worldlens/commit/f1188a684f947395832f64081aa20b3191b71b78)
- Voice history, backups, GitHub runners, profiles and Pages - [`978c207072`](https://github.com/Ding-Ding-Projects/worldlens/commit/978c207072d58b842e442bcc9190af36b6a2a87b)
- Test every door the palette now opens, and stop the docs describing the old one - [`cca197db50`](https://github.com/Ding-Ding-Projects/worldlens/commit/cca197db50a3a0f71f8e5a075254cfae41ddd8e8)
- Stop hardcoding "Enter", "Space" and "-marker" past the copy layer - [`3afccfcadb`](https://github.com/Ding-Ding-Projects/worldlens/commit/3afccfcadb10797dff37396c03b219fc6973175f)
- Voice the changelog viewer, all 73 keys of it - [`af5ffeb7a3`](https://github.com/Ding-Ding-Projects/worldlens/commit/af5ffeb7a3cc15d5f0aff8c7fe38fa54dc6835f6)
- Assert catalogue coverage per surface, so a mute screen cannot ship quietly - [`24fa34e84d`](https://github.com/Ding-Ding-Projects/worldlens/commit/24fa34e84d4326ce928e943d70c3d1cf582d42c7)
- Give the Surface and Presets tabs a search, and teach the guard to miss one - [`1af2d86c59`](https://github.com/Ding-Ding-Projects/worldlens/commit/1af2d86c59f6bb955d6166ea226efdf4a00488ec)
- Split the copy catalogue into per-surface modules and voice the app chrome - [`99ffa877c1`](https://github.com/Ding-Ding-Projects/worldlens/commit/99ffa877c1eae4bd5bcd6b8a5a3eb76ddea3170e)
- Tell somebody why the backup button will not go, instead of just greying it - [`33371b2959`](https://github.com/Ding-Ding-Projects/worldlens/commit/33371b2959f46618e9ead37d4179c3c4f1dcf55d)
- Add Pages capture and stale-build guard - [`54559eb4c7`](https://github.com/Ding-Ding-Projects/worldlens/commit/54559eb4c772b8778bfdda719cd0b8aae0a1558a)
- Localize Pages publishing copy - [`e7bd4038f0`](https://github.com/Ding-Ding-Projects/worldlens/commit/e7bd4038f00bee5ab0f79e5f9c08fb3eb0b4bd16)
- Add the Pages publishing tab - [`22b475a8a2`](https://github.com/Ding-Ding-Projects/worldlens/commit/22b475a8a2b066299100ce4fc3909b279c9202cb)
- Add the Pages hosting state bridge - [`ddf388bc26`](https://github.com/Ding-Ding-Projects/worldlens/commit/ddf388bc26df276c3f4c52cfa7f574f9133e6f02)
- Offer to host a CI-rendered map on Pages, and make the map survive the trip - [`7e1adaaddd`](https://github.com/Ding-Ding-Projects/worldlens/commit/7e1adaadddc2c9bd68af35111119417db7498767)
- Add guarded GitHub Pages map hosting - [`f7b2b7fa6d`](https://github.com/Ding-Ding-Projects/worldlens/commit/f7b2b7fa6da0f66f41f3b9ae544e223f23051397)
- Close the missing screen capture gaps - [`6e17d09de5`](https://github.com/Ding-Ding-Projects/worldlens/commit/6e17d09de58ca6c57b85a0e6e26ac0effea1ae29)

### Rendering and world data

- Test the complete-map planning boundary - [`fe4e38cbb3`](https://github.com/Ding-Ding-Projects/worldlens/commit/fe4e38cbb3c29ae7494b093d117c4559dd58a6fa)
- Keep complete maps within merge capacity - [`526202c9f9`](https://github.com/Ding-Ding-Projects/worldlens/commit/526202c9f95583f017cef5c12ad2373d0b1b863f)
- Fix static-host summary mutation - [`b80ecd610c`](https://github.com/Ding-Ding-Projects/worldlens/commit/b80ecd610cd5e522135c8f03c3fa19c3f454839d)
- Prepare a rendered map for a host that only ever serves files - [`4979978596`](https://github.com/Ding-Ding-Projects/worldlens/commit/4979978596cbfe036b6fe9f1b41076755d19192e)
- Plan render shards for useful parallel speed - [`1031cd97f9`](https://github.com/Ding-Ding-Projects/worldlens/commit/1031cd97f9dde4e1a4e66818f60dd3c5fed0151f)
- Let the planner find an overworld where the renderer already looked - [`96a373e12d`](https://github.com/Ding-Ding-Projects/worldlens/commit/96a373e12d73e1ef2fb04360a1b58a5d16fe883b)

### Desktop shell

- Scope the tab finder capture to its visible instance - [`ba29f1a495`](https://github.com/Ding-Ding-Projects/worldlens/commit/ba29f1a495b747ee48d67d7d5fc01fce106e7f07)
- Give the anchored editor room to breathe - [`5f8e24d93f`](https://github.com/Ding-Ding-Projects/worldlens/commit/5f8e24d93f382bff924d8e90a58865fa31051dce)
- Refuse to photograph a build that is older than the code - [`93a229834f`](https://github.com/Ding-Ding-Projects/worldlens/commit/93a229834f8e5168c3a5cb98528a9cca45225d0a)
- Test the Pages host safety gates - [`c68e1e3df0`](https://github.com/Ding-Ding-Projects/worldlens/commit/c68e1e3df03c1ca42a3c144122dcab0e1bdf371a)
- Expose Pages hosting to the renderer - [`9f075acdb2`](https://github.com/Ding-Ding-Projects/worldlens/commit/9f075acdb25bf405e2e7f954a198335ce90a7989)
- Expose Pages hosting through app IPC - [`c4bc76f7bc`](https://github.com/Ding-Ding-Projects/worldlens/commit/c4bc76f7bc8596504861b0f30bf4ea2242f54f5d)
- Batch large Bedrock conversions safely - [`55bb19e860`](https://github.com/Ding-Ding-Projects/worldlens/commit/55bb19e86055e8f5266861eddebdf6a82fcb18b3)

### Landing page and documentation site

- Document publishing a map to Pages, and say what is still unproven - [`e9febb435b`](https://github.com/Ding-Ding-Projects/worldlens/commit/e9febb435be3b14637e70a4e07fead1615675ddc)

### Build, release and tooling

- Internal maintenance message omitted from the public changelog - [`39b869e16d`](https://github.com/Ding-Ding-Projects/worldlens/commit/39b869e16da9b1b1a7e717023ddc77c6d2054d03)
- Stop a new CI run cancelling the one before it - [`451304984a`](https://github.com/Ding-Ding-Projects/worldlens/commit/451304984aae74e84dc4b21b1e0f3faeab8029c1)
- Publish rendered maps to plain file hosts - [`bd63de8080`](https://github.com/Ding-Ding-Projects/worldlens/commit/bd63de80804b3913ff3b9c00c111cb6449158b9a)

### Documentation

- Hand off: what is proven, what is not, and the two traps that cost hours - [`cf4d2dc5fa`](https://github.com/Ding-Ding-Projects/worldlens/commit/cf4d2dc5fa5d67409b2df05f29f3dfddaca68852)
- Write down which surfaces actually mounted the tab strip, and why one did not - [`51f7ccad79`](https://github.com/Ding-Ding-Projects/worldlens/commit/51f7ccad79422ef1f836a77d9ef50566c76fbdcc)
- Record the map the application itself published to Pages - [`d8e1ee15b0`](https://github.com/Ding-Ding-Projects/worldlens/commit/d8e1ee15b08b82f3cb294150eead80f6e8274d0a)
- Show the map hosted on Pages, with the evidence and the trap - [`a8276c8a42`](https://github.com/Ding-Ding-Projects/worldlens/commit/a8276c8a42a5188df2610b110ea53030f6eaecc7)
- Add a real hosted map capture - [`e571a49a46`](https://github.com/Ding-Ding-Projects/worldlens/commit/e571a49a46def0d43c19391e00d16c73b3a21c5e)
- Document static Pages map hosting - [`c85a3bf686`](https://github.com/Ding-Ding-Projects/worldlens/commit/c85a3bf68674f10bf5a3a144f43be737a5fc3df8)

### Elsewhere in the repository

- Merge the preserved profile shortcut branch - [`f940fd2fef`](https://github.com/Ding-Ding-Projects/worldlens/commit/f940fd2fef4d50770d20b3ad11c219efa5fb57be) _(summary of 3 commits, also listed here)_

## 0.1.0-build.257 - 2026-08-04

Tagged at [`e680b40540`](https://github.com/Ding-Ding-Projects/worldlens/commit/e680b405403153d9621ff9a4e75b8953e28155fa).

### Interface

- Stop fetching Mojang's licence nobody asked for, and show a render in detail - [`969ae1ae97`](https://github.com/Ding-Ding-Projects/worldlens/commit/969ae1ae97a057ae837136e26dff26e31a97d705)
- Give every render route a door, and stop a broken shard reporting success - [`73caa95b09`](https://github.com/Ding-Ding-Projects/worldlens/commit/73caa95b097153af987ca9e7d74e9b3ce3306efc)

### Rendering and world data

- Port the render tasks, and fix a strategy that scheduled every region twice - [`9f34cff887`](https://github.com/Ding-Ding-Projects/worldlens/commit/9f34cff887bac82af440bc651d02ad3bb9208d87)
- Port the render manager, and let the part size be a choice - [`311942567f`](https://github.com/Ding-Ding-Projects/worldlens/commit/311942567f8390c9d261665160381f0fe160b9a0)

### Desktop shell

- Keep renderer defaults alive and name converter memory limits - [`d90d12b2ed`](https://github.com/Ding-Ding-Projects/worldlens/commit/d90d12b2ed37f0591713927037cef12b55fbff58)
- Port Bedrock worlds and keep render choices honest - [`16705f6b0f`](https://github.com/Ding-Ding-Projects/worldlens/commit/16705f6b0fadeb159b408526ee5d71e8fe9356c9)
- Let a render be asked to run in a container, and refuse rather than pretend - [`f9b412be2a`](https://github.com/Ding-Ding-Projects/worldlens/commit/f9b412be2a0e595818307d77f7ae4d47035fd59e)
- Make the gh CLI a route that can finish the job, and record a render that really ran - [`7bc28c89b9`](https://github.com/Ding-Ding-Projects/worldlens/commit/7bc28c89b98525e2dba562a48a95ac5bc7c3e3a2)

### Build, release and tooling

- Add measured timing to release notes - [`aac39451c1`](https://github.com/Ding-Ding-Projects/worldlens/commit/aac39451c1172691b029863852869e9e3f07420d)

### Documentation

- Capture the render location before it can lie - [`e680b40540`](https://github.com/Ding-Ding-Projects/worldlens/commit/e680b405403153d9621ff9a4e75b8953e28155fa)
- Document Bedrock conversion honestly - [`216024ae7b`](https://github.com/Ding-Ding-Projects/worldlens/commit/216024ae7bfa937076abb9d2278a56796e0a0ec1)
- Record render checkpoint parity - [`1e036c1aac`](https://github.com/Ding-Ding-Projects/worldlens/commit/1e036c1aacb7fb093a3356565040648306ed0cc0)

## 0.1.0-build.244 - 2026-08-04

Tagged at [`ecc5168e94`](https://github.com/Ding-Ding-Projects/worldlens/commit/ecc5168e94234f87ebdcd595a1655dfebfa723b6).

### Interface

- Put the licence in front of people, and let them decide where a panel sits - [`80369ec080`](https://github.com/Ding-Ding-Projects/worldlens/commit/80369ec080d1fda83376e0ccc026e9ccd3045b8c)
- Make a project the thing you edit, and the wizard the quick way in - [`f4d3abd693`](https://github.com/Ding-Ding-Projects/worldlens/commit/f4d3abd6936b52ebd0c6daa7c13ca054dde6ba85)
- Let the palette find the History tab, and stop the README claiming seven - [`2437bc69a7`](https://github.com/Ding-Ding-Projects/worldlens/commit/2437bc69a750aa19cc96b14dec775495ac48df34)

### Server, CLI and configuration

- Preserve config line endings across Windows and Unix - [`c386e76272`](https://github.com/Ding-Ding-Projects/worldlens/commit/c386e76272bf9810fef3c0c65c236aa06e33e2a2)
- Let one project cover several worlds, without pretending to know where they are - [`88924b0a44`](https://github.com/Ding-Ding-Projects/worldlens/commit/88924b0a4438f718aafd20524db3b8c33d6e81c8)
- Give a world a project file, so its settings outlive one render - [`1eb15bc46e`](https://github.com/Ding-Ding-Projects/worldlens/commit/1eb15bc46edcc51de18cedd3395e3ba3064a0fce)

### Desktop shell

- Register the two subsystems nobody could reach, and show the update banner - [`56fcd97fc6`](https://github.com/Ding-Ding-Projects/worldlens/commit/56fcd97fc6f00e9675a4e1fd70992f3e203bb77c)
- Read the scan result, not the wrapper around it - [`92c392ff0d`](https://github.com/Ding-Ding-Projects/worldlens/commit/92c392ff0d3f86081211951f00bf1c13b36d819e)
- Remote renders over SSH, worlds from any release, and a test that stopped asserting its own platform - [`897ecad166`](https://github.com/Ding-Ding-Projects/worldlens/commit/897ecad1662c59e5a87affd1d89627b289d91d71)
- Complete CI render project-map fixtures - [`7c07514aba`](https://github.com/Ding-Ding-Projects/worldlens/commit/7c07514aba98258c0d774eae2c63623d1ee86651)
- Merge current default history into Pages continuation - [`857a16da4a`](https://github.com/Ding-Ding-Projects/worldlens/commit/857a16da4af93c85647fdad172695d852ab1c2c6) _(summary of 5 commits, also listed here)_
- Merge current default history into Pages continuation - [`0e4f831538`](https://github.com/Ding-Ding-Projects/worldlens/commit/0e4f831538a2d0b9f3b02e98a83fb0711dd905fe) _(summary of 3 commits, also listed here)_
- Let the renderer ask for a render it will not run itself - [`b600dc3e2f`](https://github.com/Ding-Ding-Projects/worldlens/commit/b600dc3e2f75e333b3c967ed9b37c2731c0e70e4)
- Hand a render to GitHub's machines, for people whose own machine cannot - [`180c8627b3`](https://github.com/Ding-Ding-Projects/worldlens/commit/180c8627b3b56283306da72e8489814efbc8b0f4)
- Turn the updater on, and put rendered maps somewhere a person can find - [`039ee266ce`](https://github.com/Ding-Ding-Projects/worldlens/commit/039ee266ce6737c1f056c1827c763ff469ef85c8)
- Consume the update feed the installer has been producing all along - [`4a8a5703cd`](https://github.com/Ding-Ding-Projects/worldlens/commit/4a8a5703cd03d64b0de40f7dd5a62fee75b7146a)
- Wire the project and the deeper history across to the renderer - [`55a6f41400`](https://github.com/Ding-Ding-Projects/worldlens/commit/55a6f414005f537b19380caff43fcaea3ad5e13a)
- Render in a container or on this machine, and diagnose a failure before guessing at it - [`d7cbd34ab3`](https://github.com/Ding-Ding-Projects/worldlens/commit/d7cbd34ab36616ec160a6bb7369366d43fdcaca5)
- Photograph the backup screen, which shipped without a picture - [`fc9679098b`](https://github.com/Ding-Ding-Projects/worldlens/commit/fc9679098b1fd6d8aa7850da409d312a720c54eb)

### Landing page and documentation site

- Gate destructive Pages actions - [`2ba959d91f`](https://github.com/Ding-Ding-Projects/worldlens/commit/2ba959d91fba9603c75e81b9e9602622a475a1de)
- Document the render console and hosted Pages gate - [`28bcd3a124`](https://github.com/Ding-Ding-Projects/worldlens/commit/28bcd3a124bd2c6321d529569d5447528d33a73c)
- Merge pull request #26 from Ding-Ding-Projects/pages-material3-full-continuation - [`5c1254ce44`](https://github.com/Ding-Ding-Projects/worldlens/commit/5c1254ce44e227d2f383d8d67f01dfbee65964d3) _(summary of 20 commits, also listed here)_
- Preserve regex mode when reopening bulk close builder - [`acd7674aa3`](https://github.com/Ding-Ding-Projects/worldlens/commit/acd7674aa3c648c5658b756790fda58d0299e718)
- Wire searchable menus and shell regex builder - [`5499b828e8`](https://github.com/Ding-Ding-Projects/worldlens/commit/5499b828e8ee073b801ca02342fdbeee4aaa6930)
- Close Pages appearance and discovery gaps - [`6b5fdd7f82`](https://github.com/Ding-Ding-Projects/worldlens/commit/6b5fdd7f824bbfac05976142e14341059ee860a3)

### Documentation

- Document gated Pages cleanup - [`70caf29017`](https://github.com/Ding-Ding-Projects/worldlens/commit/70caf29017334d88604903d0dd3104531c5ec2bb)
- Record the latest registered flows in the handoff - [`6e3260fd9e`](https://github.com/Ding-Ding-Projects/worldlens/commit/6e3260fd9ed421a8f407d96b6e3eba891119df08)
- Align handoff with the current default tip - [`cee6779b6b`](https://github.com/Ding-Ding-Projects/worldlens/commit/cee6779b6b3eb2e5bbda4f365e983fb466c060d5)
- Record the fresh full workspace gate - [`393401be9f`](https://github.com/Ding-Ding-Projects/worldlens/commit/393401be9f1dd8a0bf49506267dda5cd028fa0fa)
- Document current workspace verification - [`ab2ae1ee02`](https://github.com/Ding-Ding-Projects/worldlens/commit/ab2ae1ee0213ac83af5d5e2355c0275690f22011)
- Merge current default branch into Pages continuation - [`76153d0965`](https://github.com/Ding-Ding-Projects/worldlens/commit/76153d0965556208e9095faf8bee43046801308a) _(summary of 3 commits, also listed here)_
- Photograph a real render, from an empty field to tiles on screen - [`c37c2be9ce`](https://github.com/Ding-Ding-Projects/worldlens/commit/c37c2be9ce7875636014a4c46a0432627442a8e3)
- Audit BlueMapGUI feature by feature, from its source rather than its readme - [`0a99147394`](https://github.com/Ding-Ding-Projects/worldlens/commit/0a99147394dbe1e719df9f3399da8e953a45eb3e)
- Merge pull request #25 from Ding-Ding-Projects/pages-material3-continuation - [`8fd2fc5b1f`](https://github.com/Ding-Ding-Projects/worldlens/commit/8fd2fc5b1f03fa7c4a06e0618b1a1a688825a466) _(summary of 5 commits, also listed here)_
- Internal maintenance message omitted from the public changelog - [`12432939ae`](https://github.com/Ding-Ding-Projects/worldlens/commit/12432939aec0a423693303b1f35719a3a18027ed) _(summary of 16 commits, also listed here)_
- Mention the Pages tab appearance editor - [`542e7eeeaa`](https://github.com/Ding-Ding-Projects/worldlens/commit/542e7eeeaaac172737a1d093cade00ddc6d57c3a)
- Photograph the History tab, and every wizard step, from a green run - [`531b817588`](https://github.com/Ding-Ding-Projects/worldlens/commit/531b8175889dfd9c7f50de9683dba48b5f84dc1e)

## 0.1.0-build.196 - 2026-08-04

Tagged at [`0008dd4df1`](https://github.com/Ding-Ding-Projects/worldlens/commit/0008dd4df1e57a29327cf1772e719fb5307ee11f).

### Build, release and tooling

- Refresh the committed captures with a command instead of a memory - [`0008dd4df1`](https://github.com/Ding-Ding-Projects/worldlens/commit/0008dd4df1e57a29327cf1772e719fb5307ee11f)

## 0.1.0-build.193 - 2026-08-04

Tagged at [`a796eab97f`](https://github.com/Ding-Ding-Projects/worldlens/commit/a796eab97fde7252401ed0f25de729485b4dd68d).

### Build, release and tooling

- Find the world archive instead of parsing ls, which shellcheck refuses - [`a796eab97f`](https://github.com/Ding-Ding-Projects/worldlens/commit/a796eab97fde7252401ed0f25de729485b4dd68d)

## 0.1.0-build.192 - 2026-08-04

Tagged at [`715d5c4c52`](https://github.com/Ding-Ding-Projects/worldlens/commit/715d5c4c526d940abb21ff4cb996d615c948518c).

### Desktop shell

- Generate the world the wizard needs instead of noting its absence - [`49af1816f7`](https://github.com/Ding-Ding-Projects/worldlens/commit/49af1816f77c5dcd796c883985692342890617bb)

### Landing page and documentation site

- Document three shipped features, and stop betting tests on the runner's disk - [`715d5c4c52`](https://github.com/Ding-Ding-Projects/worldlens/commit/715d5c4c526d940abb21ff4cb996d615c948518c)

## 0.1.0-build.189 - 2026-08-04

Tagged at [`8491f0d3c3`](https://github.com/Ding-Ding-Projects/worldlens/commit/8491f0d3c39a02358fe0adf213fece51603bdf90).

### Desktop shell

- Point the capture harness at controls that still exist - [`8491f0d3c3`](https://github.com/Ding-Ding-Projects/worldlens/commit/8491f0d3c39a02358fe0adf213fece51603bdf90)

## 0.1.0-build.187 - 2026-08-04

Tagged at [`5c810d0277`](https://github.com/Ding-Ding-Projects/worldlens/commit/5c810d0277fc4cafbbcf76bafc3dca80c3d441e6).

### Interface

- Open the options editor on settings, not on a locked door - [`5c810d0277`](https://github.com/Ding-Ding-Projects/worldlens/commit/5c810d0277fc4cafbbcf76bafc3dca80c3d441e6)

### Desktop shell

- Back a world up to release assets, in the pointer format the sibling app already speaks - [`8cbac63341`](https://github.com/Ding-Ding-Projects/worldlens/commit/8cbac6334136948301c8f83d8e57702ff71fdaf6)

## 0.1.0-build.183 - 2026-08-04

Tagged at [`157f4c3eb3`](https://github.com/Ding-Ding-Projects/worldlens/commit/157f4c3eb3cacff1d82b0010f59a5f5827d7710a).

### Interface

- Give every config folder a memory it cannot lose, even about being restored - [`1b77779a41`](https://github.com/Ding-Ding-Projects/worldlens/commit/1b77779a4144ef97271c6727c9894e5d1646e724)

### Documentation

- Document the config-folder history, promises and betrayals both - [`157f4c3eb3`](https://github.com/Ding-Ding-Projects/worldlens/commit/157f4c3eb3cacff1d82b0010f59a5f5827d7710a)

## 0.1.0-build.181 - 2026-08-04

Tagged at [`6b8ef7bd00`](https://github.com/Ding-Ding-Projects/worldlens/commit/6b8ef7bd0075a2a817f33e68e0292a11d9649ff1).

### Server, CLI and configuration

- Show the file's own value in every select, and every colour in the real picker - [`6b8ef7bd00`](https://github.com/Ding-Ding-Projects/worldlens/commit/6b8ef7bd0075a2a817f33e68e0292a11d9649ff1)

## 0.1.0-build.177 - 2026-08-04

Tagged at [`f3fb53e8de`](https://github.com/Ding-Ding-Projects/worldlens/commit/f3fb53e8dee31c0669a602c78528fda195fb06c2).

### Landing page and documentation site

- Internal maintenance message omitted from the public changelog - [`79b286f959`](https://github.com/Ding-Ding-Projects/worldlens/commit/79b286f959bbb55ef4434d12c110eae3af1e9195)

### Documentation

- Merge pull request #24 from Ding-Ding-Projects/pages-material3-continuation - [`f3fb53e8de`](https://github.com/Ding-Ding-Projects/worldlens/commit/f3fb53e8dee31c0669a602c78528fda195fb06c2) _(summary of 5 commits, also listed here)_
- Record the verified Pages deployment - [`2b861490a7`](https://github.com/Ding-Ding-Projects/worldlens/commit/2b861490a76ad62c2a32578210ea30398629741d)

## 0.1.0-build.171 - 2026-08-04

Tagged at [`7c52520e24`](https://github.com/Ding-Ding-Projects/worldlens/commit/7c52520e247e94a08f9c439b16c0bf2c05d17aea).

### Desktop shell

- Merge current default fixes into Pages continuation - [`e95d6f2ccd`](https://github.com/Ding-Ding-Projects/worldlens/commit/e95d6f2ccdca73a54ca8632cad589ad8abd8a0db) _(summary of 3 commits, also listed here)_
- Follow the wizard tab in screenshot capture - [`4bd233808c`](https://github.com/Ding-Ding-Projects/worldlens/commit/4bd233808c4f521e0b3acda3c7ef058f6caaa90d)
- Keep mounted folder labels cross-platform - [`b9391b8584`](https://github.com/Ding-Ding-Projects/worldlens/commit/b9391b858476c6aa7aebdda23088567bb6c95c7e)

### Landing page and documentation site

- Merge remote-tracking branch 'origin/main' into pages-material3-continuation - [`8e6875b8c5`](https://github.com/Ding-Ding-Projects/worldlens/commit/8e6875b8c557d83a3aa2289b09674afdaeaccd42) _(summary of 4 commits, also listed here)_
- Search the settings page's own tabs, and pin it with a test - [`3ccd32c636`](https://github.com/Ding-Ding-Projects/worldlens/commit/3ccd32c636571e34e86a59b1920ba7aac9716273)

### Build, release and tooling

- Check the PR head for generated changelog drift - [`f6307576db`](https://github.com/Ding-Ding-Projects/worldlens/commit/f6307576dbcedec562a91aac60d7e297e4474e27)

### Documentation

- Merge pull request #23 from Ding-Ding-Projects/pages-material3-continuation - [`7c52520e24`](https://github.com/Ding-Ding-Projects/worldlens/commit/7c52520e247e94a08f9c439b16c0bf2c05d17aea) _(summary of 16 commits, also listed here)_
- Record the screenshot verification boundary - [`65ee28815a`](https://github.com/Ding-Ding-Projects/worldlens/commit/65ee28815a4925414dd9bfd53bb10985077fd189)
- Give every settings tab its own search - [`4c20d5ced2`](https://github.com/Ding-Ding-Projects/worldlens/commit/4c20d5ced2d0e77e0d52f99a20327a796e2822b1)

## 0.1.0-build.165 - 2026-08-04

Tagged at [`cf5358eba5`](https://github.com/Ding-Ding-Projects/worldlens/commit/cf5358eba55ce7ca1ae5775b53c9991d3db59f7b).

### Desktop shell

- Open the tab before photographing what is behind it - [`cf5358eba5`](https://github.com/Ding-Ding-Projects/worldlens/commit/cf5358eba55ce7ca1ae5775b53c9991d3db59f7b)

## 0.1.0-build.160 - 2026-08-04

Tagged at [`d95dccb0ff`](https://github.com/Ding-Ding-Projects/worldlens/commit/d95dccb0ffd6c922940adb2385b0cdb48a356460).

### Interface

- Merge remote-tracking branch 'origin/main' into pages-material3-continuation - [`7582eb7d21`](https://github.com/Ding-Ding-Projects/worldlens/commit/7582eb7d21b01e3357335649679d015078eff5cf) _(summary of 3 commits, also listed here)_
- Offer the worlds people already have, from every Minecraft folder they own - [`638c0b1b9d`](https://github.com/Ding-Ding-Projects/worldlens/commit/638c0b1b9dbe31d85766097aa044c7dfc59948ec)

### Desktop shell

- Name a Windows mount on a Linux runner, and stop asking CI for the impossible - [`d95dccb0ff`](https://github.com/Ding-Ding-Projects/worldlens/commit/d95dccb0ffd6c922940adb2385b0cdb48a356460)

### Landing page and documentation site

- Put the tabs on screen, and stop offering two doors to one room - [`19a51466fc`](https://github.com/Ding-Ding-Projects/worldlens/commit/19a51466fcd67126459429eac088ae106958e6c7)
- Merge pull request #22 from Ding-Ding-Projects/pages-material3-continuation - [`183b7be957`](https://github.com/Ding-Ding-Projects/worldlens/commit/183b7be957217f9aa253788ca0190be0f25a10bf) _(summary of 3 commits, also listed here)_
- Index every article in the command palette - [`6080c4be7f`](https://github.com/Ding-Ding-Projects/worldlens/commit/6080c4be7f3de2304a18db298efd00b95a5096ec)
- Merge pull request #19 from Ding-Ding-Projects/pages-material3-continuation - [`6b319f9547`](https://github.com/Ding-Ding-Projects/worldlens/commit/6b319f954784c995f64ccda27f78181d746d94f1) _(summary of 6 commits, also listed here)_
- Test localized Pages controls - [`a5c10d70ab`](https://github.com/Ding-Ding-Projects/worldlens/commit/a5c10d70ab37a1faef614ae6bfdc97f8a2ba552b)
- Localize Pages shell and anchor changelog ranges - [`5375a9195c`](https://github.com/Ding-Ding-Projects/worldlens/commit/5375a9195c05a6fbd584c20751fb5d2cc17c195d)

### Documentation

- Bring the changelog, the handoff and the world docs up to what shipped - [`553b532617`](https://github.com/Ding-Ding-Projects/worldlens/commit/553b5326177a9a9cf4ee3f8d247685da4ae5be38)
- Merge pull request #21 from Ding-Ding-Projects/pages-material3-continuation - [`21a35bc524`](https://github.com/Ding-Ding-Projects/worldlens/commit/21a35bc52487069ef0e5f04db2f9d87bfec2547d) _(summary of 3 commits, also listed here)_
- Record the current Pages CI boundary - [`decd78179e`](https://github.com/Ding-Ding-Projects/worldlens/commit/decd78179e70d59d628c3f93b825d543348f3d53)
- Merge pull request #20 from Ding-Ding-Projects/pages-material3-continuation - [`352a2b1bf6`](https://github.com/Ding-Ding-Projects/worldlens/commit/352a2b1bf6c836075f0596683d5a57cc6e4f3a8a) _(summary of 4 commits, also listed here)_
- Make notification history searchable and exportable - [`52f0fb318a`](https://github.com/Ding-Ding-Projects/worldlens/commit/52f0fb318a46cc1a42931a6d0ccb165696ca4f0f)
- Merge remote-tracking branch 'origin/main' into pages-material3-continuation - [`f31bd13e38`](https://github.com/Ding-Ding-Projects/worldlens/commit/f31bd13e3876a0f5eda3be9ba189c207e39035e2) _(summary of 3 commits, also listed here)_

## 0.1.0-build.137 - 2026-08-04

Tagged at [`e32de9f1aa`](https://github.com/Ding-Ding-Projects/worldlens/commit/e32de9f1aac14873ec15781645a589869b6621c0).

### Interface

- Make the maps and servers list a listbox, and let each map be restyled - [`e32de9f1aa`](https://github.com/Ding-Ding-Projects/worldlens/commit/e32de9f1aac14873ec15781645a589869b6621c0)
- Make "the builder is on every search bar" a test rather than a memory - [`a23b5409a3`](https://github.com/Ding-Ding-Projects/worldlens/commit/a23b5409a389521af96b03f50581cbf090258cf4)

### Documentation

- Photograph the render guide end to end, from the installed build - [`ecfa1d122b`](https://github.com/Ding-Ding-Projects/worldlens/commit/ecfa1d122bc79edf891f05bdfe1adea990cf61eb)

## 0.1.0-build.132 - 2026-08-04

Tagged at [`9523d9197e`](https://github.com/Ding-Ding-Projects/worldlens/commit/9523d9197e56fcf6ff5c6eaa616d7e24f104ac2a).

### Interface

- Make every colour continuous, every typeface adjustable, and every refusal loud - [`9523d9197e`](https://github.com/Ding-Ding-Projects/worldlens/commit/9523d9197e56fcf6ff5c6eaa616d7e24f104ac2a)

### Documentation

- Photograph every screen, gate every delete, and unblock the options editor - [`6c4fb6fecc`](https://github.com/Ding-Ding-Projects/worldlens/commit/6c4fb6fecc12aaa5ab4508c0cae6dc3f18bb2f6a)

## 0.1.0-build.130 - 2026-08-04

Tagged at [`970d2a1eb4`](https://github.com/Ding-Ding-Projects/worldlens/commit/970d2a1eb4a18b93a96529b88c43cfdb16662a0e).

### Interface

- Refresh the generated changelog for Pages - [`46456772c4`](https://github.com/Ding-Ding-Projects/worldlens/commit/46456772c4baac6c5c0e6dfef2b405e20e483f09)

### Landing page and documentation site

- Merge the Material 3 Pages rewrite - [`fe747eedb8`](https://github.com/Ding-Ding-Projects/worldlens/commit/fe747eedb811fbdffdd1caabe0660869f5cc5407) _(summary of 2 commits, also listed here)_
- Wire the Material 3 Pages feature surfaces - [`5550ff5f6a`](https://github.com/Ding-Ding-Projects/worldlens/commit/5550ff5f6a34e6807ba603f960a4bb0ad4dd635a)

### Build, release and tooling

- Exclude changelog-only maintenance commits - [`0286c386b7`](https://github.com/Ding-Ding-Projects/worldlens/commit/0286c386b771f8e8eadd1e6f0b24490994006cdf)

### Documentation

- Document the desktop capture matrix - [`d3a28999df`](https://github.com/Ding-Ding-Projects/worldlens/commit/d3a28999df31459e44e6228586be9dee388ba422)

## 0.1.0-build.126 - 2026-08-04

Tagged at [`fc084e8b8d`](https://github.com/Ding-Ding-Projects/worldlens/commit/fc084e8b8d17e86bf3c082de208f9e5d36e168b2).

### Interface

- Give the app a palette, a notice history, a changelog, and a builder on every search - [`fc084e8b8d`](https://github.com/Ding-Ding-Projects/worldlens/commit/fc084e8b8d17e86bf3c082de208f9e5d36e168b2)

## 0.1.0-build.123 - 2026-08-04

Tagged at [`f1b03475cd`](https://github.com/Ding-Ding-Projects/worldlens/commit/f1b03475cdb565c74f3100ef0e4911691ae6e251).

### Build, release and tooling

- Let a repository that has never published Pages create its own site - [`f1b03475cd`](https://github.com/Ding-Ding-Projects/worldlens/commit/f1b03475cdb565c74f3100ef0e4911691ae6e251)
- Let the site know which repository it is being served from - [`81715bf346`](https://github.com/Ding-Ding-Projects/worldlens/commit/81715bf34696542939948994e64f1c277f29d544)

## 0.1.0-build.121 - 2026-08-04

Tagged at [`1997278fcb`](https://github.com/Ding-Ding-Projects/worldlens/commit/1997278fcba1143fd525eacdb033cbccadea4c11).

### Documentation

- The Phase D gate is closed: 961 of 961 tiles, byte for byte - [`1997278fcb`](https://github.com/Ding-Ding-Projects/worldlens/commit/1997278fcba1143fd525eacdb033cbccadea4c11)

## 0.1.0-build.119 - 2026-08-04

Tagged at [`499e338a0a`](https://github.com/Ding-Ding-Projects/worldlens/commit/499e338a0a3d543d8f05d2a23afb126c87d630dc).

### Rendering and world data

- Load a boundary tile's chunks before judging it ungenerated - [`499e338a0a`](https://github.com/Ding-Ding-Projects/worldlens/commit/499e338a0a3d543d8f05d2a23afb126c87d630dc)

## 0.1.0-build.117 - 2026-08-04

Tagged at [`7a56827727`](https://github.com/Ding-Ding-Projects/worldlens/commit/7a568277270903c18ff7a92c1e55d8c9d74fa3a6).

### Build, release and tooling

- Compare the gallery on the pictures, and the Phase D gate passes - [`7a56827727`](https://github.com/Ding-Ding-Projects/worldlens/commit/7a568277270903c18ff7a92c1e55d8c9d74fa3a6)

## 0.1.0-build.114 - 2026-08-03

Tagged at [`23af24364e`](https://github.com/Ding-Ding-Projects/worldlens/commit/23af24364eec20d7d6eaabc71583f2d06f4a7a2a).

### Build, release and tooling

- Compare render state on what it decided, not on when it decided it - [`23af24364e`](https://github.com/Ding-Ding-Projects/worldlens/commit/23af24364eec20d7d6eaabc71583f2d06f4a7a2a)

## 0.1.0-build.112 - 2026-08-03

Tagged at [`4b481f6a69`](https://github.com/Ding-Ding-Projects/worldlens/commit/4b481f6a696cd5478fbfc8ee623369e600b3f17f).

### Rendering and world data

- Port the task that decides a tile should not be rendered at all - [`4b481f6a69`](https://github.com/Ding-Ding-Projects/worldlens/commit/4b481f6a696cd5478fbfc8ee623369e600b3f17f)

## 0.1.0-build.111 - 2026-08-03

Tagged at [`b353c77b25`](https://github.com/Ding-Ding-Projects/worldlens/commit/b353c77b2501e4b88a2fe64003f6476f3b2e38f9).

### Build, release and tooling

- Feed the ported engine the same resources java gets, and every shared tile matches - [`b353c77b25`](https://github.com/Ding-Ding-Projects/worldlens/commit/b353c77b2501e4b88a2fe64003f6476f3b2e38f9)

## 0.1.0-build.109 - 2026-08-03

Tagged at [`e8ee16788d`](https://github.com/Ding-Ding-Projects/worldlens/commit/e8ee16788d5d7012b33a866221deab435c7aa33a).

### Build, release and tooling

- Type-check after the build, since that is what emits the types it reads - [`e8ee16788d`](https://github.com/Ding-Ding-Projects/worldlens/commit/e8ee16788d5d7012b33a866221deab435c7aa33a)
- Make the gate grade the source it was handed, not the build from three hours ago - [`0dcebcfe70`](https://github.com/Ding-Ding-Projects/worldlens/commit/0dcebcfe702596b45e39f57116729b0d0e199f64)

## 0.1.0-build.105 - 2026-08-03

Tagged at [`a2ea79fe2c`](https://github.com/Ding-Ding-Projects/worldlens/commit/a2ea79fe2c020406498be3b4747bd687a9a6277e).

### Landing page and documentation site

- Document every door this session opened, and correct four articles that undersold the app - [`a2ea79fe2c`](https://github.com/Ding-Ding-Projects/worldlens/commit/a2ea79fe2c020406498be3b4747bd687a9a6277e)

## 0.1.0-build.102 - 2026-08-03

Tagged at [`78ee15e102`](https://github.com/Ding-Ding-Projects/worldlens/commit/78ee15e1020703962f8a6c3fe171a5ec7d9ac586).

### Documentation

- Open the handoff with a plain-language summary any reader can follow - [`78ee15e102`](https://github.com/Ding-Ding-Projects/worldlens/commit/78ee15e1020703962f8a6c3fe171a5ec7d9ac586)

## 0.1.0-build.100 - 2026-08-03

Tagged at [`744f7da508`](https://github.com/Ding-Ding-Projects/worldlens/commit/744f7da5086de7a4fb99baed0b9e196eae2be125).

### Interface

- Give sign-in and downloads their screens, and the version a page to stand on - [`25e178edaa`](https://github.com/Ding-Ding-Projects/worldlens/commit/25e178edaa42bd8f46a4e63745893691e2e7ee32)

### Documentation

- Record the Material title bar, unobstructed, from the packaged app - [`744f7da508`](https://github.com/Ding-Ding-Projects/worldlens/commit/744f7da5086de7a4fb99baed0b9e196eae2be125)

## 0.1.0-build.98 - 2026-08-03

Tagged at [`1421c93316`](https://github.com/Ding-Ding-Projects/worldlens/commit/1421c933161f1d94931ae8ebb7382c9a94223535).

### Build, release and tooling

- Float the control bar below the title bar it was sitting on - [`1421c93316`](https://github.com/Ding-Ding-Projects/worldlens/commit/1421c933161f1d94931ae8ebb7382c9a94223535)

## 0.1.0-build.96 - 2026-08-03

Tagged at [`d30b2833af`](https://github.com/Ding-Ding-Projects/worldlens/commit/d30b2833afbeb8752f787762283eb1f8ff7634d7).

### Interface

- Open the doors the audit found painted shut, and build the bridge behind one - [`f6e3099042`](https://github.com/Ding-Ding-Projects/worldlens/commit/f6e3099042d058fae7a6606813b44d574394aba4)

### Desktop shell

- Assert the maps folder's one true spelling through readdir, not exists() - [`d30b2833af`](https://github.com/Ding-Ding-Projects/worldlens/commit/d30b2833afbeb8752f787762283eb1f8ff7634d7)

## 0.1.0-build.93 - 2026-08-03

Tagged at [`3d0cf8948a`](https://github.com/Ding-Ding-Projects/worldlens/commit/3d0cf8948afb43431b5d9ffe58ba421c394687eb).

### Interface

- Give 69 messages their values back, and wire the Java runtime row - [`8de0f5ad71`](https://github.com/Ding-Ding-Projects/worldlens/commit/8de0f5ad71240a2db1efcbffe86b898a3455a191)
- Name the settings region distinctly for screen readers - [`c19088d681`](https://github.com/Ding-Ding-Projects/worldlens/commit/c19088d68119f00416f08b1dd6b52cf78c723e3f)
- Give the app a door: title bar, map wizard and settings, all mounted - [`a4658378b3`](https://github.com/Ding-Ding-Projects/worldlens/commit/a4658378b3ff986b9cd4341d6b1c29890d61535e)
- Reconnect three finished features the preload never exposed - [`9a9bb81cae`](https://github.com/Ding-Ding-Projects/worldlens/commit/9a9bb81caeb5719956f30ce6366baeaeb89a7536)

### Desktop shell

- Let the map copy to the clipboard, and give the window a Material title bar - [`b3b75269c1`](https://github.com/Ding-Ding-Projects/worldlens/commit/b3b75269c119fb6bd789374f254d3a0578d8e8d5)
- Sign in to GitHub, and render a private world without exposing it - [`a06d9f4d92`](https://github.com/Ding-Ding-Projects/worldlens/commit/a06d9f4d92f796dfdba4adc811d461453e292723)

### Build, release and tooling

- Unbreak CI on its own lint comment and a Squirrel.exe that never existed - [`3d0cf8948a`](https://github.com/Ding-Ding-Projects/worldlens/commit/3d0cf8948afb43431b5d9ffe58ba421c394687eb)
- Bundle Roboto, the typeface every surface asked for and no file provided - [`5c89904b5b`](https://github.com/Ding-Ding-Projects/worldlens/commit/5c89904b5badf85aea6bb47722d9a04c45a12e92)
- Register Render world by removing arithmetic GitHub cannot do - [`a6c6cb245b`](https://github.com/Ding-Ding-Projects/worldlens/commit/a6c6cb245b255a3e631d7192b624b71ecb3ec6ec)
- Give every build its own version, and cut the release to three downloads - [`db926cb665`](https://github.com/Ding-Ding-Projects/worldlens/commit/db926cb66534d77bec53542c752d94a3d64750b8)

### Documentation

- Record the settings surface, and 69 messages missing their values - [`3493cde861`](https://github.com/Ding-Ding-Projects/worldlens/commit/3493cde86162535966af1c7c368146fbaa74d15a)
- Bring the roadmap and handoff up to date, including what is not done - [`c799918500`](https://github.com/Ding-Ding-Projects/worldlens/commit/c799918500ed304df8568922ab3889e8fff140e0)

## 0.1.0-build.79 - 2026-08-03

Tagged at [`069c5f6c0b`](https://github.com/Ding-Ding-Projects/worldlens/commit/069c5f6c0becb8b96ff34d66857e397fb9a0ac10).

### Rendering and world data

- Phase D: the mesher, byte-identical to the Java writer it replaces - [`069c5f6c0b`](https://github.com/Ding-Ding-Projects/worldlens/commit/069c5f6c0becb8b96ff34d66857e397fb9a0ac10)
- Split oversized release assets into rejoinable parts - [`adc17568f2`](https://github.com/Ding-Ding-Projects/worldlens/commit/adc17568f295c252d6a67284453c7bf8b56ee42a)

## 0.1.0-build.76 - 2026-08-03

Tagged at [`e4da154157`](https://github.com/Ding-Ding-Projects/worldlens/commit/e4da154157f262058e14a78ac78111b43f639cef).

### Rendering and world data

- Make rendering survive being interrupted, and stop capping worlds at 256 shards - [`e4da154157`](https://github.com/Ding-Ding-Projects/worldlens/commit/e4da154157f262058e14a78ac78111b43f639cef)

## 0.1.0-build.75 - 2026-08-03

Tagged at [`141260cd18`](https://github.com/Ding-Ding-Projects/worldlens/commit/141260cd18d5decab10f1573f101d4d9fbcc0e97).

### Interface

- Stop a fresh install from contacting a stranger's server unasked - [`141260cd18`](https://github.com/Ding-Ding-Projects/worldlens/commit/141260cd18d5decab10f1573f101d4d9fbcc0e97)

## 0.1.0-build.73 - 2026-08-03

Tagged at [`ec1e8b40f4`](https://github.com/Ding-Ding-Projects/worldlens/commit/ec1e8b40f49a1176a2ac6ed394bb3d5373d16343).

### Interface

- Land the JVM product: config schema, toolchain, render path, options GUI, setup - [`89d7e57774`](https://github.com/Ding-Ding-Projects/worldlens/commit/89d7e577746dc247461ced4b47570789f7da1172)

### Rendering and world data

- Render a world in GitHub Actions, splitting it across jobs when it is too big - [`2585d0ba56`](https://github.com/Ding-Ding-Projects/worldlens/commit/2585d0ba5697aea41c3a4fb48895ecd4cd61a420)

### Desktop shell

- Make JDK discovery honour the platform it is asked about - [`d0d28eba06`](https://github.com/Ding-Ding-Projects/worldlens/commit/d0d28eba06776abbbfd273c9cedc93349e2a3abe)
- Stop a path test from passing only on the author's operating system - [`3d32f6ec6b`](https://github.com/Ding-Ding-Projects/worldlens/commit/3d32f6ec6bda039e988abbaa6eacb44878a85ff1)
- Fix the installed app not launching: it shipped without its renderer - [`900a1236f7`](https://github.com/Ding-Ding-Projects/worldlens/commit/900a1236f712709847b5dfe586e614ae422b962a)

### Build, release and tooling

- Resolve the CLI jar absolutely, since the render runs from elsewhere - [`ec1e8b40f4`](https://github.com/Ding-Ding-Projects/worldlens/commit/ec1e8b40f49a1176a2ac6ed394bb3d5373d16343)
- Render our own test world in CI instead of borrowing someone's demo server - [`8e8477f74a`](https://github.com/Ding-Ding-Projects/worldlens/commit/8e8477f74a1ea29506f791f79d6214fcb4510ade)

### Documentation

- Bring the handoff up to date with the last few hours - [`eb5d18ca0b`](https://github.com/Ding-Ding-Projects/worldlens/commit/eb5d18ca0b50c7f29a17e1cfb47c4358d0eef0eb)
- Unbreak CI on a stale lockfile, and record the installed app running - [`ae4375f99c`](https://github.com/Ding-Ding-Projects/worldlens/commit/ae4375f99c0a5f60b85c3c375e1bc5b3df431dc2)

## 0.1.0-build.63 - 2026-08-03

Tagged at [`6c64985d4c`](https://github.com/Ding-Ding-Projects/worldlens/commit/6c64985d4cd46708a5a8aa38755115686818d2de).

### Build, release and tooling

- Install every dependency automatically, and verify each one works - [`6c64985d4c`](https://github.com/Ding-Ding-Projects/worldlens/commit/6c64985d4cd46708a5a8aa38755115686818d2de)

## 0.1.0-build.61 - 2026-08-03

Tagged at [`da9308ef5a`](https://github.com/Ding-Ding-Projects/worldlens/commit/da9308ef5ab675c0619ee6db8dac02d55b8296cd).

### Desktop shell

- Wait for the map to draw before photographing it - [`da9308ef5a`](https://github.com/Ding-Ding-Projects/worldlens/commit/da9308ef5ab675c0619ee6db8dac02d55b8296cd)

## 0.1.0-build.59 - 2026-08-03

Tagged at [`8ff4e5348f`](https://github.com/Ding-Ding-Projects/worldlens/commit/8ff4e5348f1be3e560c95f5f681841d7f80677aa).

### Interface

- Port every upstream webapp component to Material Design 3 - [`8ff4e5348f`](https://github.com/Ding-Ding-Projects/worldlens/commit/8ff4e5348f1be3e560c95f5f681841d7f80677aa)

## 0.1.0-build.56 - 2026-08-03

Tagged at [`0268451592`](https://github.com/Ding-Ding-Projects/worldlens/commit/0268451592fab2e707ce6dd157bcf89b9c83e272).

### Landing page and documentation site

- Fix the blank documentation site: it mounted on the wrong element - [`0268451592`](https://github.com/Ding-Ding-Projects/worldlens/commit/0268451592fab2e707ce6dd157bcf89b9c83e272)

## 0.1.0-build.55 - 2026-08-03

Tagged at [`64e516a3f4`](https://github.com/Ding-Ding-Projects/worldlens/commit/64e516a3f4a819d3c280c5a6095631c1cd4a110a).

### Desktop shell

- Ask for Mojang consent once at first launch, and never again - [`64e516a3f4`](https://github.com/Ding-Ding-Projects/worldlens/commit/64e516a3f4a819d3c280c5a6095631c1cd4a110a)

## 0.1.0-build.53 - 2026-08-03

Tagged at [`79236eb9c9`](https://github.com/Ding-Ding-Projects/worldlens/commit/79236eb9c91532c7d946dfa89c7e043281e10557).

### Build, release and tooling

- Prove the Java render path end to end, and stop it writing into the repo - [`79236eb9c9`](https://github.com/Ding-Ding-Projects/worldlens/commit/79236eb9c91532c7d946dfa89c7e043281e10557)

## 0.1.0-build.50 - 2026-08-03

Tagged at [`6474fc0447`](https://github.com/Ding-Ding-Projects/worldlens/commit/6474fc0447d749b60bcb784a989e1420fd6b2eaf).

### Documentation

- Switch local rendering to the Java engine, and say so plainly - [`6474fc0447`](https://github.com/Ding-Ding-Projects/worldlens/commit/6474fc0447d749b60bcb784a989e1420fd6b2eaf)

## 0.1.0-build.49 - 2026-08-03

Tagged at [`aa316fdcb7`](https://github.com/Ding-Ding-Projects/worldlens/commit/aa316fdcb7a07c0af33810b5cf5992ca55711e61).

### Documentation

- Bring the README up to date with what actually shipped - [`aa316fdcb7`](https://github.com/Ding-Ding-Projects/worldlens/commit/aa316fdcb7a07c0af33810b5cf5992ca55711e61)

## 0.1.0-build.47 - 2026-08-03

Tagged at [`f3a7715beb`](https://github.com/Ding-Ding-Projects/worldlens/commit/f3a7715beb845c1f40cecbaf05898876caae6a6c).

### Landing page and documentation site

- Add the worldgen package and the Pages site, salvaged from a session limit - [`f3a7715beb`](https://github.com/Ding-Ding-Projects/worldlens/commit/f3a7715beb845c1f40cecbaf05898876caae6a6c)

## 0.1.0-build.45 - 2026-08-03

Tagged at [`074a59e9cd`](https://github.com/Ding-Ding-Projects/worldlens/commit/074a59e9cd8fdb11d9b734afacec1a97506c5197).

### Documentation

- The app renders, and here is the proof - [`074a59e9cd`](https://github.com/Ding-Ding-Projects/worldlens/commit/074a59e9cd8fdb11d9b734afacec1a97506c5197)

## 0.1.0-build.43 - 2026-08-03

Tagged at [`f59ca091f2`](https://github.com/Ding-Ding-Projects/worldlens/commit/f59ca091f2fd2c28f3aaf888a93b2db260e00a68).

### Rendering and world data

- Phase C wave 3: legacy 1.12 compat, the closing proofs, and two CSP landmines - [`f59ca091f2`](https://github.com/Ding-Ding-Projects/worldlens/commit/f59ca091f2fd2c28f3aaf888a93b2db260e00a68)

## 0.1.0-build.41 - 2026-08-03

Tagged at [`9f9177cd14`](https://github.com/Ding-Ding-Projects/worldlens/commit/9f9177cd14f0541328c03a303a7fd1c16ad5825b).

### Server, CLI and configuration

- Stop the locale baseline from depending on which machine read the files - [`9f9177cd14`](https://github.com/Ding-Ding-Projects/worldlens/commit/9f9177cd14f0541328c03a303a7fd1c16ad5825b)
- Replace the eval-based HOCON parser so the UI can actually render - [`bcb371913d`](https://github.com/Ding-Ding-Projects/worldlens/commit/bcb371913d18d366b0081088f47ae18eba11ab17)

## 0.1.0-build.37 - 2026-08-03

Tagged at [`98988e3c2e`](https://github.com/Ding-Ding-Projects/worldlens/commit/98988e3c2ec6b8af1101e2c97363dfcb41031d72).

### Documentation

- Say "ported" where the roadmap wanted to say "done" - [`98988e3c2e`](https://github.com/Ding-Ding-Projects/worldlens/commit/98988e3c2ec6b8af1101e2c97363dfcb41031d72)

## 0.1.0-build.36 - 2026-08-03

Tagged at [`12da79a249`](https://github.com/Ding-Ding-Projects/worldlens/commit/12da79a249315e387b042c7041843c948467b8bc).

### Rendering and world data

- Phase C wave 2: ResourcePack orchestrator, atlas layer, texture gallery - [`12da79a249`](https://github.com/Ding-Ding-Projects/worldlens/commit/12da79a249315e387b042c7041843c948467b8bc)

## 0.1.0-build.33 - 2026-08-03

Tagged at [`97a1888e77`](https://github.com/Ding-Ding-Projects/worldlens/commit/97a1888e770272fa653aecbe6eba9b0e219de36a).

### Desktop shell

- Stop the embedded server from 403ing the app's own bundle - [`97a1888e77`](https://github.com/Ding-Ding-Projects/worldlens/commit/97a1888e770272fa653aecbe6eba9b0e219de36a)

## 0.1.0-build.31 - 2026-08-03

Tagged at [`bbc7634fe2`](https://github.com/Ding-Ding-Projects/worldlens/commit/bbc7634fe267812f01447b6f9c03b1d745f05faa).

### Rendering and world data

- Phase C wave 1: pack foundations, version acquisition, blockstates, models, textures - [`bbc7634fe2`](https://github.com/Ding-Ding-Projects/worldlens/commit/bbc7634fe267812f01447b6f9c03b1d745f05faa)

## 0.1.0-build.30 - 2026-08-03

Tagged at [`94725e3d0f`](https://github.com/Ding-Ding-Projects/worldlens/commit/94725e3d0fef496c4850c365e4172e51545c7091).

### Rendering and world data

- Merge origin/main into claude/goofy-leakey-804933 - [`2e55fd26e6`](https://github.com/Ding-Ding-Projects/worldlens/commit/2e55fd26e6dc4690281e4aa4c7b8a6c8e3906451) _(summary of 4 commits, also listed here)_

### Desktop shell

- Merge remote-tracking branch 'origin/main' into claude/goofy-leakey-804933 - [`94725e3d0f`](https://github.com/Ding-Ding-Projects/worldlens/commit/94725e3d0fef496c4850c365e4172e51545c7091) _(summary of 2 commits, also listed here)_

### Build, release and tooling

- Fix pnpm build filter that silently matched nothing on Windows - [`c9321b6a08`](https://github.com/Ding-Ding-Projects/worldlens/commit/c9321b6a08a508c933c78176788b431e296f502b)

### Documentation

- Make a build that matches no packages fail instead of pass - [`4fa01b0cb2`](https://github.com/Ding-Ding-Projects/worldlens/commit/4fa01b0cb225cc3ccaf44a747dba344b7448e81b)

## 0.1.0-build.27 - 2026-08-03

Tagged at [`0a67c35222`](https://github.com/Ding-Ding-Projects/worldlens/commit/0a67c352225125561dcb0dbcc5b25463d4bebcf0).

### Desktop shell

- Make the screenshot harness report what it saw instead of just timing out - [`0a67c35222`](https://github.com/Ding-Ding-Projects/worldlens/commit/0a67c352225125561dcb0dbcc5b25463d4bebcf0)

## 0.1.0-build.24 - 2026-08-03

Tagged at [`c40913434d`](https://github.com/Ding-Ding-Projects/worldlens/commit/c40913434db89cd935f6ca4be15c6e0f655b8e1b).

### Build, release and tooling

- Capture screenshots of the real app in CI, not of a mockup - [`c40913434d`](https://github.com/Ding-Ding-Projects/worldlens/commit/c40913434db89cd935f6ca4be15c6e0f655b8e1b)

## 0.1.0-build.22 - 2026-08-03

Tagged at [`1a22cbb695`](https://github.com/Ding-Ding-Projects/worldlens/commit/1a22cbb695cadb968ffd761437b381fcb41febbc).

### Interface

- Add MD3 UI shell and hardened Electron app shell (Phase A) - [`47e37d90f4`](https://github.com/Ding-Ding-Projects/worldlens/commit/47e37d90f4ebb93df09a24d024fcc00fa4c5b443)

### Rendering and world data

- Make main green, and give the repo a front door and a release pipeline - [`3072b71f36`](https://github.com/Ding-Ding-Projects/worldlens/commit/3072b71f369453a0632be27890585f91446f2269)
- Merge pull request #1 from Ding-Ding-Projects/claude/bluemap-design-port-8xs2dk - [`4484b03b90`](https://github.com/Ding-Ding-Projects/worldlens/commit/4484b03b905d515781ee7dd34e5aaca3c245a3a2) _(summary of 18 commits, also listed here)_
- WIP: Wave C1 ZipFileSystem (workflow still writing) - [`ee9a7ab80f`](https://github.com/Ding-Ding-Projects/worldlens/commit/ee9a7ab80f13b8e78e8bfc9bd6ca3833e83f3ae6)
- Handoff: Phase C Wave 1 WIP salvage + full handoff doc - [`b293d4825d`](https://github.com/Ding-Ding-Projects/worldlens/commit/b293d4825dba2233ff467f416b28733977fdf767)
- Prep Phase C: pngjs + yauzl-promise deps, bundle resourceExtensions assets - [`a66d879960`](https://github.com/Ding-Ding-Projects/worldlens/commit/a66d879960db51ffb691c5daa1339270f6c10b67)
- Complete Phase B: engine world layer green with 1.18 + 1.12.2 e2e proofs - [`5704048830`](https://github.com/Ding-Ding-Projects/worldlens/commit/5704048830d495f43e145660dd7cf63f720f6739)
- Phase B Wave 2: world model + MCA decoders 1.12.2-26.x (WIP: integration pending) - [`8b652f4538`](https://github.com/Ding-Ding-Projects/worldlens/commit/8b652f4538fcb98c5a4456b15d068635169fa235)
- Phase B Wave 1: complete shared foundations, NBT package, compression layer - [`c8d4f0bf59`](https://github.com/Ding-Ding-Projects/worldlens/commit/c8d4f0bf5947d5405bcd9509e9466093e262916d)
- Add ROADMAP/HANDOFF docs and legacy 1.12 mapping data - [`b7680d01e3`](https://github.com/Ding-Ding-Projects/worldlens/commit/b7680d01e36bdadd22267ff2db011ccd5eba9dae)
- Complete Phase A: full viewer port integrated, remote mode end-to-end - [`c4832c84dd`](https://github.com/Ding-Ding-Projects/worldlens/commit/c4832c84dda428d8c8cdb496e579db49e897e9df)
- WIP: viewer port in progress (util, map loaders, PRBM parser) - [`0933934d54`](https://github.com/Ding-Ding-Projects/worldlens/commit/0933934d543ed2b99baa4e853400daa8bc60a10e)

### Server, CLI and configuration

- Fix unused-param lint in salvaged Grid.ts - [`8ae9eee5cd`](https://github.com/Ding-Ding-Projects/worldlens/commit/8ae9eee5cda0392cdf297e20eaa7f006b2e82b1a)
- Salvage partial Phase B foundations (shared Key/Registry/Grid/math, nbt TagType) - [`a9e9396476`](https://github.com/Ding-Ding-Projects/worldlens/commit/a9e93964760f6d5ff432363d9ce09f3cab15e285)
- Add Phase A embedded server: localhost HTTP server + remote reverse proxy - [`095bd69adb`](https://github.com/Ding-Ding-Projects/worldlens/commit/095bd69adb5d59c9c08209efc2aff6a926375ecc)

### Desktop shell

- Give Squirrel the icon it refuses to build without - [`1a22cbb695`](https://github.com/Ding-Ding-Projects/worldlens/commit/1a22cbb695cadb968ffd761437b381fcb41febbc)

### Build, release and tooling

- Add engine package dependencies for Phase B - [`100b008e9a`](https://github.com/Ding-Ding-Projects/worldlens/commit/100b008e9ae84187106e5feaa231702a393ee4d0)
- Scaffold design/ TypeScript monorepo (Phase 0) - [`70f58523b9`](https://github.com/Ding-Ding-Projects/worldlens/commit/70f58523b9243623d3991ef6fc1224cf09e0eed2)
- Add BlueMap submodule under vendor/BlueMap - [`d48a1987e7`](https://github.com/Ding-Ding-Projects/worldlens/commit/d48a1987e718662587bafded05d09f37eb8d7f60)
- Initial commit - [`07698ecd42`](https://github.com/Ding-Ding-Projects/worldlens/commit/07698ecd423853684fad51c9bc34f9b152844578)

### Documentation

- Adopt global product contracts: regex builder, tabs, appearance, i18n, super-confirm - [`71fd14e788`](https://github.com/Ding-Ding-Projects/worldlens/commit/71fd14e788a38ac167cc96fb1dc2b8c976c2353c)
- Add plan.md: full BlueMap port plan (design/ monorepo, Electron + server, MD3) - [`307d798460`](https://github.com/Ding-Ding-Projects/worldlens/commit/307d798460f986336b51e59b15285df56b082e14)

### Elsewhere in the repository

- Unbreak lint and strip a private repo link from the public tree - [`7205b1242f`](https://github.com/Ding-Ding-Projects/worldlens/commit/7205b1242f28da27b2bff472778f2bc3264f885b)
