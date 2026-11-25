# Phone PDF edition of the documentation

Every release of WorldLens carries a PDF edition of the documentation, built for a phone screen. It is an extra download that sits beside the installer on the release page. It supplements the hosted documentation site and never replaces it: the interactive tools on the site (the Base64 toolkit, the search bar and its regex builder, the settings page) do not run inside a PDF.

## What is in it

- **Phone-size pages.** Every page is 390 by 844 CSS pixels (about 4.06 by 8.79 inches), so text is readable without zooming on a phone.
- **A cover** with the release tag and the exact commit the edition was built from.
- **A linked contents page.** Every article is a tappable line. The same list is also in the PDF outline, so a reader's bookmark pane works too.
- **Part 1, site articles.** Every structured article the documentation site renders, including its status badge, sections, suggested next articles and sources.
- **Part 2, reference documents.** Every Markdown document under `docs/`, which includes the server articles the site renders from the same files.
- **Part 3, wiki pages.** Any Markdown under a `wiki/` or `docs/wiki/` folder. This repository keeps no separate wiki folder today, so the part is absent and the build says so in its inventory.
- **Working internal links.** A link from one article to another, including links written as repository URLs, becomes a jump inside the PDF. A relative link to a file that is not part of the edition keeps its words and loses the dead link. Links to other websites stay as ordinary links.

## How it is built

The edition is generated from the same reviewed sources as the site, in the release build, by `design/packages/site/scripts/build-pdf-edition.mjs`:

1. It loads the structured articles through Vite from `src/content/articles`, reads the server article list from `scripts/server-articles.mjs`, and reads every Markdown file under `docs/`.
2. It builds one print HTML document with stable anchors, rewrites internal links, and refuses to continue if any link points at a missing anchor or any anchor appears twice.
3. It compares what it rendered with the inventory the sources describe, and fails the build when an article or document is missing or unexpected.
4. It renders the document with headless Chromium at the phone page size, with outline generation and tagged output turned on. Every network request is blocked during the render and any attempt fails the build, so no remote asset can enter the file. The cover logo is embedded, and text uses the system font stack.
5. It writes `worldlens-docs-<version>.pdf` and a matching `.inventory.json` that lists every entry the PDF must contain.

Run it locally with `pnpm --filter @worldlens/site run pdf`. Set `PDF_EDITION_BROWSER` to a Chromium based browser if Playwright has no browser installed.

## Verification

`verify-pdf-edition.mjs` reads the finished PDF back and checks:

- every page is the phone size;
- the outline has one entry per inventory item, in order, under the three part titles, plus a Contents entry;
- the contents page and the articles carry internal links, at least one per inventory entry;
- every internal link resolves to a real page inside the file.

The release job runs the builder and the verifier before it attaches the file, and a failure fails the job instead of publishing a release without the PDF. `pnpm --filter @worldlens/site run test:pdf` runs the unit tests for link rewriting, anchor stability, inventory equality, page size and a PDF with a broken link.

## Failure modes

- A new article that is missing from the site's article list fails the existing article bundle check, and a new document under `docs/` is picked up automatically.
- A Markdown file whose first heading is missing is listed under its path instead of a title.
- Very large documentation sets produce a large file. The edition is roughly 2,000 pages today.
- The hosted GitHub wiki is a separate repository and is not read by the build. Its pages are part of the edition only when they are also present in a `wiki/` folder.

## 廣東話

每個 WorldLens 版本都附一份 PDF 版文件,專登做俾手機睇。佢係額外嘅下載,同安裝程式一齊擺喺發佈頁,補充網站而唔係取代網站:網站上面嘅互動工具(Base64 工具、搜尋同正則表達式建構器、設定頁)喺 PDF 入面行唔到。

- **手機尺寸頁面:** 每頁 390 乘 844 CSS 像素,唔使縮放都睇得清楚。
- **封面:** 有版本標籤同砌建嗰個提交。
- **有連結嘅目錄頁:** 每篇文章一行,撳得落去。同一份清單都喺 PDF 大綱入面,所以閱讀器嘅書籤欄一樣用得。
- **第一部分,網站文章:** 網站顯示嘅每一篇結構化文章,連狀態標籤、章節、建議下一篇同來源。
- **第二部分,參考文件:** `docs/` 底下每個 Markdown 文件,包括網站用同一批檔案顯示嘅伺服器文章。
- **第三部分,wiki 頁:** `wiki/` 或者 `docs/wiki/` 底下嘅 Markdown。呢個 repository 而家冇獨立 wiki 資料夾,所以呢部分唔存在,清單會寫明。
- **內部連結會跳:** 文章之間嘅連結(包括寫成 repository 網址嘅)變成 PDF 內部跳轉。指去唔屬於本版嘅檔案嘅相對連結會保留文字、拎走死連結。指去其他網站嘅連結照舊。

由 `design/packages/site/scripts/build-pdf-edition.mjs` 喺發佈砌建入面用同網站一樣嘅來源生成。連結指去唔存在嘅錨點、錨點重複,或者文章同清單對唔上,砌建就會失敗。渲染用無頭 Chromium,每個網絡請求都會被擋,任何嘗試都令砌建失敗,所以唔會有遠端資源混入。本機執行:`pnpm --filter @worldlens/site run pdf`。

`verify-pdf-edition.mjs` 會讀返個 PDF 檢查:每頁尺寸、大綱同清單逐項對得上、目錄同文章有內部連結、每個內部連結都真係指去檔案入面嘅頁。發佈 job 附上檔案之前會行砌建同驗證,失敗就令 job 失敗,唔會靜靜雞發佈一個冇 PDF 嘅版本。

**未做:** GitHub 上面嘅 wiki 係另一個 repository,砌建唔會讀;佢嘅頁只有喺 `wiki/` 資料夾入面都有嘅時候先會入 PDF。
