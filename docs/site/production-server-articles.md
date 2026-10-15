# Production server articles

The production documentation renderer reads five current articles directly from
`docs/mcserver-hosting.md`, `docs/server-management/adoption-ownership.md`,
`docs/server-management/ssh-process-lifecycle.md`, `docs/server-management/ssh-process-readiness.md`
and `docs/build/maintained-viewer.md`. The archive plugin combines them with the
59 preserved articles, giving 64 entries. Missing sources, duplicate identifiers and duplicate
titles fail the build. The TypeScript article catalogue is not the production entry point.

Paragraphs, headings, fenced code and lists are rendered as text and structured blocks. Table
rows are preserved in code blocks. Inline Markdown links remain literal text; complete link,
anchor and wiki navigation is still pending. Each of the five current articles carries its
actual source path. The shared article sidebar no longer invents a verification result, update
date or revision, and no longer presents unrelated historical images as article evidence.

Dynamic image sources and SVG paths are inert in the initial HTML. The runtime binds them after
initialization, avoiding placeholder image requests and invalid SVG parsing. Other content
security restrictions remain in place. Framing restrictions require an HTTP response header;
the static HTML does not claim to enforce them through an ignored meta directive.

## Production homepage and delivery correction on 2026-10-15

The deployed homepage is the archive template in `design/packages/site/index.html`, not
`src/content/home.ts`. Both representations now describe read-only SSH readiness and its limits.
The production article inventory explicitly includes the readiness and maintained-viewer guides;
a source catalogue update alone does not establish production delivery.

Six assembly/conversion/negative tests and the production build passed. Focused fresh-context
Linux Chromium observations at 1280x900 and 390x844 showed the notice with no document-width
overflow. Both new guide routes displayed the intended heading and actual source path, with
zero observed page exceptions. These are built-output observations, not complete accessibility,
native Windows, live deployment or full language/theme/scale acceptance.

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

正式文件畫面而家直接讀取五篇現行文章，再同原有 59 篇合併，一共 64 篇。
2026-10-15 補返 SSH 準備檢查同維護版檢視器建置指南；正式首頁用 archive 範本，
單改 home.ts 唔會更新正式首頁，所以兩個位置都要更新。六項文章組裝檢查同正式建置通過；
Linux Chromium 喺 1280x900 同 390x844 顯示到提示而冇文件闊度溢出，兩篇新文章都
顯示到標題同來源路徑，觀察期間冇頁面例外。呢啲唔代表原生 Windows、正式部署或者
完整語言／主題／比例驗收。
共用側欄唔會再憑空聲稱驗證成功或者填入舊日期。實際重建後，桌面同模擬手機畫面
都顯示到新文章，亦冇再出現範本圖片 404 或 SVG 解析錯誤。圖片放大、Esc 關閉同
焦點返回亦已實際檢查。臨時瀏覽器設定檔刪除被自動審批拒絕，所以完整清理仍未完成；
其他語言、比例、正式網站同完整文件連結驗收都仲未完成。
