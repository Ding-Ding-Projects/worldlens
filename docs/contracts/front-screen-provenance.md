# Front-screen version and update provenance

The native desktop caption displays the running version and the selected build's recorded update event before navigation, including while first-run setup is open. The native metadata handler obtains the version from the running package. The build script records one canonical UTC build-event timestamp at its own start and embeds that value into both desktop and hosted bundles. An explicit WORLDLENS_BUILD_TIMESTAMP supplied by a trusted build producer takes precedence.

The new updatedAt field and timestampOrigin distinguish this event from the legacy builtAt field, which can describe the source commit date. Source-only and unclassified timestamps are never presented as update events. A source date is not evidence that the binary was built at that instant. The renderer accepts only canonical calendar-valid UTC timestamps with build or release origin, then displays local date/time including seconds and a timezone label. An unavailable channel, invalid value or rejected response leaves an explicit unavailable state. Launch time and file timestamps are never substituted.

The caption allows wrapping and publishes its measured height to the surrounding shell so map content starts below it. The observer disconnects on teardown. English, Cantonese and bilingual labels use the existing translation resources.

Focused checks cover recorded metadata, missing/invalid/source-only values, rejected channels, the initial caption consumer and timestamp origin. The negative regression removes each consumer/origin boundary and must fail before byte-exact restoration returns green. Native minimum-size/high-scale layouts and other surface consumers require separate real-build acceptance. The current source unit does not establish hosted/pre-authentication, documentation or embedded-viewer front-screen acceptance.

No secrets are carried by this metadata channel. The renderer validates bounded version text and timestamp values before display; transport rejection details are not shown in the caption.

## Verified native caption increment

Exact build.bat /s passed at e9cad90a383667fe25354b472e64a2076730aa49 with source digest 0c5da3f543ba70acbda9048adce8b48527e9f8d6c6b4e0b2e848b031e8f4b98c. Twenty-four focused setup/provenance checks pass. The rebuilt setup overlay reserves the caption's measured height. Forty-eight validated layout receipts and independently inspected original captures cover dark first-run setup and light home, English, Cantonese and bilingual, 1280 x 752 and 800 x 600 CSS viewports, and CDP scale values 1, 1.25, 1.5 and 2. No caption overflow or overlay occlusion was observed. The recorded build event is 2026-10-11T12:54:54.268Z, displayed with seconds and EDT. The representative original capture is registered in both screenshot inventories and linked from README.

This matrix does not establish physical Windows DPI acceptance beyond the native 150% run, light-theme first-run, date localization, hosted/pre-authentication, documentation or embedded-viewer consumers. Cantonese labels translate while the date retains English formatting. Existing home shortcut translations are outside this caption verdict. Broader contract acceptance remains pending. Normal GUI close left all four recorded owned processes, the debug listener and the named hidden desktop absent.
