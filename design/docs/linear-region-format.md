# Linear region timestamp format decision

This record is authoritative for the timestamp values exposed by the `.linear`
reader and its chunk filter.

## Decision

- **Time basis:** all timestamps are Unix epoch seconds: non-negative seconds
  elapsed since 1970-01-01 00:00:00 UTC. The reference writer obtains the
  region modification time with Python `os.path.getmtime`, whose documented
  value is seconds since the epoch.
- **Outer timestamp:** the outer header stores `Newest Timestamp` as a
  big-endian unsigned 64-bit integer (`Q`). It is located after the one-byte
  version field. It must be read as unsigned; signed 64-bit interpretation is
  not part of the format.
- **Inner timestamps:** each of the 1024 z-major inner entries stores its
  timestamp as a big-endian unsigned 32-bit integer (`I`), immediately after
  that entry's four-byte payload length. Values above `0x7fffffff` are valid
  epoch seconds and must not be treated as negative.

## Version and filtering semantics

- **Version 1:** the outer unsigned 64-bit `Newest Timestamp` is the timestamp
  reported for every populated chunk. The inner timestamp words remain part of
  the fixed entry layout but do not replace the v1 region timestamp.
- **Version 2:** each populated chunk reports its own unsigned 32-bit inner
  timestamp. The outer timestamp remains a header value and is not substituted
  for a v2 chunk timestamp.
- **Filtering:** determine the timestamp from the version rule above, then call
  the consumer filter before loading the chunk payload. A rejected populated
  chunk advances over its payload without decoding it; an accepted chunk is
  loaded and delivered normally. Empty entries have no payload and are not
  filter calls.

## Sources

- [BlueMap change introducing Linear timestamps (#424)](https://github.com/BlueMap-Minecraft/BlueMap/commit/b9dbb100e4ed8cbc0ef09297c2701bda8680883b)
  — establishes v1 region timestamps, v2 per-chunk timestamps, and filtering
  before payload loading.
- [Reference `linear.py` format reader/writer](https://github.com/xymb-endcrystalme/LinearRegionFileFormatTools/blob/master/linear.py)
  — uses `>QBQbhIQ` for the outer header and `>II` for each inner entry,
  including the unsigned timestamp fields.
- [Python `os.path.getmtime` documentation](https://docs.python.org/3/library/os.path.html#os.path.getmtime)
  — defines the filesystem modification time returned by the reference writer
  in seconds since the Unix epoch.
