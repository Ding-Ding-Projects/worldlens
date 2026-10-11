# Front-screen version and update provenance

The native desktop caption displays the running version and the selected build's recorded update event before navigation, including while first-run setup is open. The native metadata handler obtains the version from the running package. The build script records one canonical UTC build-event timestamp at its own start and embeds that value into both desktop and hosted bundles. An explicit WORLDLENS_BUILD_TIMESTAMP supplied by a trusted build producer takes precedence.

The new updatedAt field and timestampOrigin distinguish this event from the legacy builtAt field, which can describe the source commit date. Source-only and unclassified timestamps are never presented as update events. A source date is not evidence that the binary was built at that instant. The renderer accepts only canonical calendar-valid UTC timestamps with build or release origin, then displays local date/time including seconds and a timezone label. An unavailable channel, invalid value or rejected response leaves an explicit unavailable state. Launch time and file timestamps are never substituted.

The caption allows wrapping and publishes its measured height to the surrounding shell so map content starts below it. The observer disconnects on teardown. English, Cantonese and bilingual labels use the existing translation resources.

Focused checks cover recorded metadata, missing/invalid/source-only values, rejected channels, the initial caption consumer and timestamp origin. The negative regression removes each consumer/origin boundary and must fail before byte-exact restoration returns green. Native minimum-size/high-scale layouts and other surface consumers require separate real-build acceptance. The current source unit does not establish hosted/pre-authentication, documentation or embedded-viewer front-screen acceptance.

No secrets are carried by this metadata channel. The renderer validates bounded version text and timestamp values before display; transport rejection details are not shown in the caption.
