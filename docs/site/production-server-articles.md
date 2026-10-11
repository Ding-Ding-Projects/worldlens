# Production server articles

The production documentation renderer reads the three current server articles directly from
`docs/mcserver-hosting.md`, `docs/server-management/adoption-ownership.md` and
`docs/server-management/ssh-process-lifecycle.md`. The archive plugin combines them with the
59 preserved articles, giving 62 entries. Missing sources, duplicate identifiers and duplicate
titles fail the build. The TypeScript article catalogue is not the production entry point.

Paragraphs, headings, fenced code and lists are rendered as text and structured blocks. Table
rows are preserved in code blocks. Inline Markdown links remain literal text; complete link,
anchor and wiki navigation is still pending. Each of the three current articles carries its
actual source path. The shared article sidebar no longer invents a verification result, update
date or revision, and no longer presents unrelated historical images as article evidence.

Dynamic image sources and SVG paths are inert in the initial HTML. The runtime binds them after
initialization, avoiding placeholder image requests and invalid SVG parsing. Other content
security restrictions remain in place. Framing restrictions require an HTTP response header;
the static HTML does not claim to enforce them through an ignored meta directive.

## Verification on 2026-10-11

Exact `build.bat /s` passed at `167b70d5f112da7331ba0aeb230460ba426dc626` with source digest
`d6d2e50f380919797097a38a72848ce3a7e3fd88b82ce140817bbdec931dcb08`.
Six focused article/hydration cases and 26 publication/inventory cases passed before that build.

The assembled static output was served by an isolated loopback server and opened in a fresh
Microsoft Edge profile on a named hidden desktop. Complete target-list proofs identified exactly
one intended page before interaction and capture. Page-only captures and raw observations were
retained for the SSH lifecycle article at 1440 x 1000 and emulated mobile 390 x 844, scale 1,
English, light theme and reduced motion. Both showed the current article and source path, zero
body overflow, zero unnamed interactive accessibility nodes, and visible keyboard focus.
The observed reload produced zero console errors, exceptions, failed resource responses or
unexpected third-party requests. The earlier build's 26 console messages and placeholder 404
were absent. These are focused observations, not full accessibility or all-surface acceptance.

The image viewer also loaded the selected real image, exposed no unresolved image/SVG binding,
closed with Escape and returned visible focus to its original control. Two observation-script
defects and a receipt-name collision were corrected during this separate interaction check;
the final direct observations are retained without rewriting the earlier attempts.

All nine recorded owned process identities and both listening ports were absent after teardown.
The named desktop returned the native not-found result. Automatic approval rejected removal of
the exact temporary browser profile, so it remains retained. Complete cleanup and the skill's
all-green audit receipt are therefore **not claimed**, and these captures are not promoted into
the accepted public gallery. Physical mobile testing, other language/theme/scale combinations,
live deployment, complete documentation/wiki navigation and installer acceptance remain pending.

## 廣東話

正式文件畫面而家直接讀取三篇伺服器文章，再同原有 59 篇合併，一共 62 篇。
共用側欄唔會再憑空聲稱驗證成功或者填入舊日期。實際重建後，桌面同模擬手機畫面
都顯示到新文章，亦冇再出現範本圖片 404 或 SVG 解析錯誤。圖片放大、Esc 關閉同
焦點返回亦已實際檢查。臨時瀏覽器設定檔刪除被自動審批拒絕，所以完整清理仍未完成；
其他語言、比例、正式網站同完整文件連結驗收都仲未完成。
