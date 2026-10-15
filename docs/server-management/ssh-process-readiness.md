# Read-only SSH-process readiness

## Behaviour

In **New server → Version → Where it runs**, choose **Remote process (readiness only)** and a saved SSH host profile. Set the proposed memory allocation and TCP port, then choose **Check host readiness**. The existing host-list search includes its adjacent regular-expression builder. English, Cantonese and bilingual presentation use the application's shared language controls.

The typed `mcserver:creation:sshProcess:preflight` route accepts only `hostId`, `minecraftVersion`, `memoryMb` and `port`. It resolves the exact saved profile and app-owned host-trust paths. It reads the validated cached Vanilla catalogue without refreshing or writing it, requires an exact published release entry and takes that entry's Java requirement. Refresh the version catalogue first when the selected release is absent. Snapshots and historical versions outside the supported release-request format remain unavailable for this increment. Mod-loader and proxy compatibility are not established by this base Java-release check.

The ordered checks inspect:

1. Public-key-only SSH authentication with strict host-key checking.
2. Linux on the selected host.
3. systemd 254 or newer, a reachable user manager and already-enabled user lingering.
4. The saved profile's existing writable, searchable parent folder at its exact canonical absolute path. Root, traversal, unsupported characters and symlink redirects do not pass. No directory is created.
5. Java discovered on the remote PATH, its canonical executable and a bounded recognizable version meeting the selected release's minimum. The HotSpot probe disables performance-data creation. Local Java is never used to satisfy this check.
6. Available memory covering the proposed allocation plus a 1 GiB reserve.
7. At least 1 GiB free under the saved parent, measured in bytes. This is a minimum prerequisite, not an estimate of the world's eventual size.
8. No observed TCP listener on the proposed unprivileged port, using the remote `ss` tool.

The first unmet condition stops the sequence. Missing tools, malformed observations, lost connections and deadlines do not count as success. The observation has one 30-second deadline, bounded output and abort propagation. The IPC handler allows only one readiness observation at a time. Changing host, version, memory or port invalidates displayed results; late responses cannot replace the current selection. A profile edited or forgotten during observation returns a stale-profile failure.

## Boundaries and recovery

A report is a dated observation, not a resource reservation, installation authorization or guarantee that a later server will start. It always returns `canCreate: false`. **Next and Create remain unavailable for this target even when every check passes.** Choose a supported target to create a server.

The check does not change host trust, enable lingering, provision Java, download a server, accept the EULA, create an ownership identifier, write a server registry record, create a service or start/stop a server. Changed host keys never receive a replacement-key acceptance button. Unknown keys use the separate saved-host trust flow after independent fingerprint verification. Messages use bounded reason codes; raw SSH diagnostics and credential paths are not returned to the interface.

Remote accounts, their selected executable and their startup configuration remain trusted inputs. The probe does not sandbox a malicious Java executable or prevent operating-system auditing or administrator-configured runtime logging. `-XX:-UsePerfData` addresses HotSpot's incidental performance directory; the application sends no filesystem-mutation command. Permission, capacity, process and port observations can change immediately, so an eventual installer must repeat all relevant checks and preserve ownership boundaries.

## Verification

Focused source tests cover strict request shapes, exact catalogue membership, malformed Java versions, host-key classifications, supervisor and path prerequisites, resource parsing, unknown states, cancellation, deadlines, profile changes, bridge forwarding, mounted controls and late-result isolation. The readiness route does not establish remote installation, invocation-bound console, full server management or all-feature acceptance.

The initial continuation ran on Linux. At that point, Windows packaging, live SSH/Minecraft acceptance, native Windows captures and the complete layout matrix were unverified. Subsequent controlled SSH and packaging results appear below; Minecraft execution, interactive Windows and the full layout matrix remain pending. The initial broad build encountered the absent pinned BlueMap viewer bundle. After the build-order repair described in [maintained viewer builds](../build/maintained-viewer.md), the complete workspace build passed. That Linux workspace result does not establish Windows installer or live-host acceptance.

## Linux SSH acceptance on 2026-10-15

Five opt-in cases passed against an isolated Ubuntu 24.04 container with real systemd, OpenSSH and Java 21. The production profile store, validated cache reader and default command runner observed all eight prerequisites, refused unknown trust and an unauthorized identity, refused a missing parent without creating it, and detected a real occupied TCP port. Local trust/profile/catalogue bytes and existing remote content were preserved; every result kept `canCreate: false`.

Run `node scripts/acceptance/ssh-process/run.mjs` from the repository root on Linux. [Fixture instructions](../../scripts/acceptance/ssh-process/README.md) describe the privileged private-cgroup container, loopback-only binding, generated fixture keys and verified teardown. The catalogue is synthetic and schema-valid. This establishes controlled Linux SSH backend behaviour, not wizard interaction, Windows, deployment-host acceptance, installation, Minecraft execution or console support. The receipt records the starting commit and exact acceptance-input hashes, including dirty-source state.

The rebuilt Linux Electron application also exercised the call through its real preload bridge and main-process IPC: all eight checks passed, creation remained disabled, and no page exceptions were observed. The renderer URL contained no query credential. That IPC observation did not exercise wizard clicks; the subsequent wizard check below did. [Evidence receipt](../evidence/linux-ssh-readiness-20261015.json) separates backend, native IPC and remaining limits.

Linux wizard acceptance on 2026-10-15 passed in the rebuilt Electron application at 1280×800, English/dark: saved profile selection, eight readiness results, disabled Next, report invalidation after a port edit and occupied-port refusal. This exposed and fixed a profile-loading defect when choosing remote process directly; both remote targets have regression coverage (30 selected UI tests pass). No page exceptions were observed. This is one controlled desktop tuple, not Windows, deployment-host, installation or console acceptance.

CI run 38799594959 passed at 8b6a6a3 and published v1.0.2073, including Windows packaging. Interactive Windows acceptance remains pending.

## 廣東話

喺新增伺服器嘅版本步驟之後，揀「遠端程序（只檢查準備狀態）」同已儲存 SSH 主機，再設定預計記憶體同 TCP 連接埠，按檢查。主機清單保留搜尋同旁邊嘅正規表示式工具。介面跟隨共用英文、廣東話同雙語設定。

唯讀 API 只接受已儲存主機 ID、Minecraft 正式版本、記憶體同連接埠。版本要喺已驗證嘅本機 Vanilla 目錄快取有確實記錄；檢查唔會更新或者寫入快取。目錄冇嗰個版本就先喺 wizard 更新。呢一階段未接受快照同部分歷史版本，亦唔代表已驗證 mod loader 或 proxy 相容。

檢查依次確認 SSH 同嚴格主機金鑰信任、Linux、systemd 254 或以上、已可用同持續運作嘅使用者服務管理器、現有可寫入而且冇符號連結轉向嘅標準絕對路徑、遠端 Java、預計用量加 1 GiB 預留嘅記憶體、最少 1 GiB 剩餘空間，同所選 TCP 連接埠未有監聽。唔會用本機 Java 頂替遠端 Java。Java 檢查停用 HotSpot performance data，避免嗰種附帶資料夾寫入。

第一個未符合或者未能確認嘅條件會停低。全部觀察共用 30 秒期限，輸出有上限，同一時間只做一個檢查。更改主機、版本、記憶體或者連接埠就清除舊結果；遲到回覆唔會覆蓋新選擇。途中改咗或者刪咗主機設定，結果會標明已過時。

即使全部檢查通過，下一步同建立仍然停用。結果只係當時觀察，唔係預留資源或者安裝許可。冇接受 EULA、下載、安裝 Java、建立資料夾、服務、擁有權或者伺服器記錄，亦冇開服關服或者修改信任設定。金鑰變咗唔會提供直接接受替代金鑰嘅按鈕。原始 SSH 診斷同憑證路徑唔會送入介面。

遠端帳戶、執行檔同啟動設定仍屬信任範圍，唔代表已隔離惡意 Java，亦唔會阻止作業系統審計或者管理員預先設定嘅日誌。權限、記憶體、空間同連接埠隨時會變，將來真正安裝要重新核對。針對性測試涵蓋輸入、版本、金鑰、資源、逾時、主機設定變更、橋接同實際掛載介面。最初 Linux 驗證遇到欠缺已固定 BlueMap viewer bundle；修正建置次序後完整 workspace build 通過。其後受控 SSH 同 Windows 包裝結果見下文；Minecraft 執行、Windows 互動同完整畫面矩陣仍待驗證。

2026-10-15 五項 Linux SSH 實際後端檢查通過：八項準備條件、未知主機信任、未授權金鑰、欠缺資料夾同被佔用連接埠。用真實 systemd、OpenSSH 同 Java 21，但 catalogue 係測試資料；本機信任／profile／cache 同既有遠端內容保持不變，仍然唔會啟用建立。fixture 清理已確認；唔代表原生介面、Windows、實際部署主機、安裝開服或者 console 驗收。

重建 Linux Electron 亦經真實 preload bridge 同 main-process IPC 通過八項檢查，建立仍停用，觀察期間冇頁面例外，renderer URL 冇 query 憑證。嗰次 IPC 觀察未做精靈逐步點擊；其後精靈驗收見下文，收據分開記錄後端、原生 IPC、精靈同限制。

2026-10-15 重建 Linux Electron 精靈驗收通過：1280×800 英文深色畫面，可選已儲存主機、顯示八項結果，下一步維持停用，改連接埠會清除舊結果，並拒絕已佔用連接埠。直接選遠端程序時未載入 profile 嘅問題已修正，兩種遠端目標都有回歸測試，30 項介面測試通過，冇觀察到頁面例外。只代表一組受控畫面，唔代表 Windows、部署主機、安裝或者 console 驗收。

CI run 38799594959 已通過，並由 8b6a6a3 發佈 v1.0.2073，包括 Windows 安裝包建置；Windows 互動驗收仍未完成。
