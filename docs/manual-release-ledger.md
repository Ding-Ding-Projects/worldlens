# Manual release ledger

The repository keeps one release-evidence record for each completed implementation phase. The
ledger is a record of facts read back from the exact integrated default-branch commit; it is not a
plan and it does not infer a cloud verdict from a local build.

## Record contract

`docs/release-ledger.json` uses schema version `1`. Every phase record has:

- the phase name and full 40-character integration commit;
- one unique published release tag and release id, only after verification;
- `running`, `failed`, or `verified` state and an explanatory note;
- UTC start, completion, and `HH:mm:ss` duration;
- manual receipt or workflow-run evidence, including separate local-build and cloud-verdict facts;
- every published asset's name, byte count, and SHA-256;
- installer signature state, archive/Squirrel index evidence, and release-note evidence in the
  associated evidence record;
- the line-count command/table, explicit exclusions, and surviving-line attribution method; and
- the bilingual dim-sum code name and link to the public catalog photo, when catalog resolution
  succeeded. The photo bytes are never copied into this repository.

The validator rejects draft/prereleases, duplicate phases, duplicate tags, duplicate integration
commits, and a verified record without assets or line-count evidence. New failed phases use no
release identity: failure is a durable fact, not an almost-release. Historical records may use
`releaseDisposition: "shipped-nonconforming"` to preserve a release that really shipped but fails
the current contract; those records must remain `failed` and explain the exact conformance gap.

## Recording evidence

Read the release metadata with an explicit `gh api` repository target, then build a record with
`recordReleaseEvidence()` and append it to the ledger. The metadata must report the exact
`target_commitish`; callers still read back each asset, hash, archive index, installer signature,
and release-note marker before recording `verified`.

```sh
node scripts/manual-release-ledger.mjs verify docs/release-ledger.json
```

Local packaging is evidence of a local build only. It never upgrades `cloudVerdictVerified`, and
the module refuses a `verified` record when those two facts are conflated.

## Completeness

The hand-written phase inventory is the caller's `integratedPhases` list. Pass it to
`validateLedger(ledger, { integratedPhases })` at the release/issue integration point. The check
fails when an integrated phase is absent, so a phase cannot silently disappear from the ledger.
The existing `.613` release owned by issue #51 is intentionally not duplicated here; its proof
remains on that issue and the public release record. The four earlier `v0.1.0-build.*` records in
the JSON are historical read-backs: their exact tags, targets, release ids, assets, byte sizes,
SHA-256 values, workflow timing, line-count summaries, and code-name links are retained, while
their copied photo attachments are explicitly marked shipped-but-nonconforming under the current
link-only photo policy.

## Current four-row ledger

The populated `docs/release-ledger.json` contains four historical release rows.
All four are deliberately `failed` with `shipped-nonconforming` disposition:
their release, target, workflow, timing, assets, hashes, line-count data, and
release-note evidence were read back, but each copied and attached a dim-sum
photo. Current policy requires linking to the public catalog photo without
copying or attaching it, so none is presented as `verified`.

| Phase | Integration commit | Release | Timing | Code name | State |
| --- | --- | --- | --- | --- | --- |
| Public-1.0 baseline release 682 | `e13777927876a3d7898778f18193e9465bc97cc2` | [`v0.1.0-build.682`](https://github.com/Ding-Ding-Projects/worldlens/releases/tag/v0.1.0-build.682) | `2026-08-07T03:41:20Z` → `2026-08-07T03:57:46Z` (`00:16:26`) | Shrimp Glutinous Rice Dumplings · 鮮蝦鹹水角 | **failed — copied release photo; historical notes identify material-bluemap** |
| Public-1.0 baseline release 704 | `f727083e5cb60f86aa4c493415d9e7c2b4952864` | [`v0.1.0-build.704`](https://github.com/Ding-Ding-Projects/worldlens/releases/tag/v0.1.0-build.704) | `2026-08-07T05:32:51Z` → `2026-08-07T05:48:57Z` (`00:16:06`) | Sesame Balls · 煎堆 | **failed — copied and attached catalog photo** |
| Public-1.0 baseline release 708 | `37104b4016491b74619b67b56cafc6f84c19aaa3` | [`v0.1.0-build.708`](https://github.com/Ding-Ding-Projects/worldlens/releases/tag/v0.1.0-build.708) | `2026-08-07T06:09:06Z` → `2026-08-07T06:25:06Z` (`00:16:00`) | Lotus Paste Sesame Balls · 蓮蓉煎堆 | **failed — copied and attached catalog photo** |
| Public-1.0 baseline release 731 | `ff2a8db67329311357f3ffe858d1d78b25ac7ab1` | [`v0.1.0-build.731`](https://github.com/Ding-Ding-Projects/worldlens/releases/tag/v0.1.0-build.731) | `2026-08-07T12:50:00Z` → `2026-08-07T13:05:26Z` (`00:15:26`) | Peanut Sesame Balls · 花生煎堆 | **failed — copied and attached catalog photo** |

The JSON ledger remains authoritative for each row's full asset/hash table,
archive-index facts, installer-signature note, line-count breakdown, exclusions,
workflow URL, and public catalog URL. The article intentionally does not copy or
recreate issue #51's `.613` proof. It does not promote local packaging, source
presence, or a release listing to `verified`.

No tests, builds, installer runs, workflow dispatches, runtime sessions, or
captures were performed for this documentation update.
