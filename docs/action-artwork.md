# Action-specific artwork

## Behaviour

Selected high-impact actions include realistic artwork that explains the operation before a
person acts. The artwork is part of the owning surface, not a reusable hero with a different
caption. Five actions currently have five different bundled images:

| Action                                            | Owning surface          | Bundled image                    |
| ------------------------------------------------- | ----------------------- | -------------------------------- |
| Set up a repository and start a cloud render      | `CiRenderScreen.vue`    | `cloud-render-setup.png`         |
| Choose local render intensity                     | `SpeedControl.vue`      | `local-render-speed.png`         |
| Restart to install a ready update                 | `UpdateBanner.vue`      | `restart-to-install.png`         |
| Pack and publish a repository backup              | `BackupScreen.vue`      | `repository-publication.png`     |
| Review config writes and permanent file deletions | `ConfigApplyDialog.vue` | `config-delete-confirmation.png` |

The config deletion image appears only when the save plan really deletes files. A write-only
save does not borrow destructive imagery. The restart image stays in the non-blocking update
banner, and does not turn that banner into a dialog. Every action button, consent, progress
state, and destructive gate remains a real control owned by the existing feature.

Each image has semantic alternative text in the active language catalogue. English remains the
component-level fallback if a translated value is ever unavailable. The common renderer uses a
wide aspect ratio at ordinary widths and a taller crop below 560 CSS pixels. The image fills its
bounded card with `object-fit: cover`, keeps the subject centred, and adds no animation.

## Configuration

There is no artwork setting. The files ship with the application under
`packages/ui/src/assets/action-artwork/`, work offline, and make no network request. An owner
selects its image with an explicit `ActionArtwork` inventory key. New entries must name:

- the precise action;
- the exact owning component;
- a unique local filename;
- a semantic English fallback for `alt`; and
- the imported asset source.

Localized surfaces pass their translated alternative text into the shared renderer. Loading is
lazy by default. Above-the-fold cloud setup and the blocking deletion review opt into eager
loading so the relevant image does not arrive after the decision it explains.

## Failure modes

- A missing file fails the hand-written inventory test before Vite can publish a broken URL.
- Reusing one filename for two actions fails the uniqueness assertion.
- Moving an image to the wrong component, removing it, or renaming its inventory key fails the
  owner-wiring assertion.
- Empty or token alternative text fails the inventory length checks; mounted tests also prove
  the translated override and English fallback reach the real `<img>`.
- An unsupported narrow layout is caught by the component contract for the 560-pixel breakpoint,
  the 4:3 compact frame, and the owner suites that already exercise bilingual controls.

## Security considerations

All five files are local application assets. They contain no links, scripts, metadata-driven
actions, remote requests, analytics, or controls. The images deliberately contain no legible
buttons or product UI that could be mistaken for something clickable. The existing upload
consents, repository permission checks, update restart guard, and two-key deletion confirmation
remain authoritative; artwork never authorizes or performs an operation.

## Verification

`ActionArtwork.test.ts` is the explicit completeness boundary. It maps each action to one owner,
filename, and alternative text; checks that every file exists; rejects filename reuse; reads each
owner to prove the declared artwork is rendered there; mounts the shared component; and pins the
responsive and reduced-motion CSS. The focused owner suites cover the existing interactions, and
the production workspace build proves Vite fingerprints and emits all five PNG files.

Verified in the implementation phase:

- 5 inventory/component tests passed;
- 143 focused tests passed across 7 files, including every owning surface and the bilingual copy
  catalogue; and
- the full 13-package production build completed and emitted five distinct hashed artwork files.

## Suggested articles

- [Rendering a world in GitHub Actions](./render-in-actions.md)
- [Backing up a world or a rendered map](./backup.md)
- [Automatic updates](./automatic-updates.md)
- [Super confirmation](./super-confirmation.md)
- [Language modes and funny levels](./language-and-tone.md)

## 廣東話

### 行為 (Behaviour)

部分高影響力嘅操作會配一幅寫實嘅插圖 (action-specific artwork)，喺用戶落手做之前就講清楚呢個操作係做乜。呢啲圖係擁有嗰個介面嘅一部分，唔係一幅共用 hero 圖再換個 caption 咁求其。而家一共有五個操作，各自用五幅唔同嘅內置圖片。

五個操作分別係：喺 `CiRenderScreen.vue` 設定 repository 同開始 cloud render，用 `cloud-render-setup.png`；喺 `SpeedControl.vue` 揀本地 render 強度，用 `local-render-speed.png`；喺 `UpdateBanner.vue` 重新啟動去安裝已經準備好嘅更新，用 `restart-to-install.png`；喺 `BackupScreen.vue` 打包同發佈 repository backup，用 `repository-publication.png`；喺 `ConfigApplyDialog.vue` 檢視 config 寫入同永久刪除檔案，用 `config-delete-confirmation.png`。

config 刪除嗰幅圖淨係喺 save plan 真係會刪檔嘅時候先會出現。淨係寫入嘅 save 唔會借用呢種帶破壞性意味嘅圖。重新啟動嗰幅圖留喺唔阻塞嘅 update banner 入面，唔會令個 banner 變成 dialog。每一個操作掣、同意步驟、進度狀態同破壞性關卡，全部都仲係由原本功能擁有嘅真控件。

每幅圖喺當前語言目錄入面都有語義化嘅替代文字 (alternative text)。如果譯文冇咗，英文就係 component 層嘅 fallback。共用嘅 renderer 喺一般闊度用闊嘅長寬比，喺細過 560 CSS pixels 嘅時候改用高啲嘅裁切。圖片用 `object-fit: cover` 填滿佢個有邊界嘅 card，主體保持置中，亦都冇任何動畫。

### 設定 (Configuration)

冇任何 artwork 相關嘅設定。啲檔案跟住 application 一齊出，放喺 `packages/ui/src/assets/action-artwork/`，可以離線用，亦都唔會發任何網絡請求。擁有者要用一個明確嘅 `ActionArtwork` inventory key 去揀自己嗰幅圖。新加嘅 entry 一定要寫明：

- 具體係邊個操作；
- 準確嘅擁有 component；
- 唯一嘅本地檔名；
- `alt` 用嘅語義化英文 fallback；同埋
- import 入嚟嘅 asset source。

本地化嘅介面會將自己譯咗嘅替代文字傳畀共用 renderer。預設係 lazy loading。喺 above-the-fold 嘅 cloud setup 同會阻塞操作嘅刪除檢視兩處會改用 eager loading，咁幅圖就唔會喺個決定做完之後先至到。

### 失敗情況 (Failure modes)

- 檔案唔見咗，會喺 Vite 有機會發佈一條爛 URL 之前，就已經令手寫嘅 inventory test 失敗。
- 兩個操作用同一個檔名，會令唯一性斷言失敗。
- 將圖搬去錯嘅 component、刪咗佢、或者改咗佢個 inventory key，都會令 owner-wiring 斷言失敗。
- 替代文字係空白或者求其擺個 token，會令 inventory 長度檢查失敗；mount 測試仲會證明譯文覆寫同英文 fallback 真係去到實際嘅 `<img>`。
- 唔支援嘅窄版面會畀 component contract 捉到，涵蓋 560 pixel 嘅 breakpoint、4:3 嘅 compact frame，以及原本已經測緊雙語控件嘅 owner 測試組。

### 保安考慮 (Security considerations)

五個檔案全部都係本地 application asset。入面冇連結、冇 script、冇由 metadata 驅動嘅操作、冇遠端請求、冇 analytics、亦都冇任何控件。啲圖係刻意唔畫任何睇得出嘅按鈕或者產品 UI，避免有人誤會可以撳。原有嘅上載同意、repository 權限檢查、更新重啟守衛同兩重鎖匙嘅刪除確認，依然係話事嘅一方；artwork 永遠唔會授權或者執行任何操作。

### 驗證 (Verification)

`ActionArtwork.test.ts` 就係明確嘅完整性邊界。佢將每個操作對應到一個 owner、一個檔名同一段替代文字；檢查每個檔案都存在；拒絕重複檔名；讀返每個 owner 去證明所宣告嘅 artwork 真係喺嗰度 render；mount 共用 component；亦都釘死 responsive 同 reduced-motion 嘅 CSS。針對性嘅 owner 測試組覆蓋原有嘅互動，而 production workspace build 就證明到 Vite 會為全部五個 PNG 檔加 fingerprint 同 emit 出嚟。

實作階段驗證咗嘅結果：5 個 inventory/component 測試通過；跨 7 個檔案共 143 個針對性測試通過，包括每個擁有介面同雙語文案目錄；仲有完整 13 個 package 嘅 production build 完成，並且 emit 咗五個唔同嘅 hashed artwork 檔案。

### 建議文章 (Suggested articles)

上面英文版最後列咗五篇相關文章嘅連結：喺 GitHub Actions render 世界、備份世界或者已 render 嘅地圖、自動更新、super confirmation，同埋語言模式同搞笑程度。連結原文照用。
