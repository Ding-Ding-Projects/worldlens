# Creating Minecraft servers

The New server wizard sends creation through the main-process server handler. Local Docker and SSH Docker create new containers; adoption remains a separate action for containers that already exist. This article describes source implementation and focused tests. Real packaged UI interaction, image downloads, container startup and playable server topology remain pending verification.

新增伺服器精靈會經主程序建立伺服器。本機 Docker 同 SSH Docker 都會建立新容器，唔會將新伺服器送去「採用現有伺服器」櫃位。本文記錄程式實作同針對性測試；正式封裝介面、映像下載、容器啟動同實際可連線伺服器組合仍然未完成驗證。

## Configuration

1. Choose the server flavour and exact catalogue version. Composite catalogue versions retain their selected build or loader identity.
2. Choose Local process, Local Docker, or a saved SSH Docker profile. AWS is outside this verification pass.
3. For a local container, choose a Java image from the searchable picker. The proposed image follows the selected catalogue Java requirement. An explicit override remains selected, but an image whose declared Java is too old blocks creation with a reason. A requirement newer than the listed images does not silently downgrade.
4. Advanced image input accepts an immutable digest. Saved SSH profiles supply their own image and absolute dedicated host parent directory. Image-family mismatch is rejected for known itzg images.
5. Choose memory and the host port, review the request, and explicitly accept the EULA. Creation does not start the container.

先揀種類同版本，再揀執行位置。本機容器有可搜尋嘅 Java 映像選單，預設跟所選版本需要；自己改過嘅選擇會保留，但 Java 太舊就清楚講原因，唔會照開一個注定起唔到嘅容器。SSH 用已儲存設定入面嘅映像同絕對父目錄。記憶體、連接埠同 EULA 都要確認，建立完成唔等於已啟動。

### Image and version contracts

| Flavour | Image family | Container directory | Selected version mapping |
| --- | --- | --- | --- |
| Vanilla | `itzg/minecraft-server` | `/data` | `VERSION` is the selected game version |
| Paper | `itzg/minecraft-server` | `/data` | `game#build` becomes `VERSION` plus `PAPER_BUILD` |
| Purpur | `itzg/minecraft-server` | `/data` | `game#build` becomes `VERSION` plus `PURPUR_BUILD` |
| Spigot | `itzg/minecraft-server` | `/data` | `VERSION` plus `BUILD_FROM_SOURCE=true`; the game picker uses Mojang release metadata, not a claim that a Spigot binary is published |
| Fabric | `itzg/minecraft-server` | `/data` | Separate game picker supplies `VERSION`; selected loader supplies `FABRIC_LOADER_VERSION` |
| Forge | `itzg/minecraft-server` | `/data` | `game-loader` becomes `VERSION` plus `FORGE_VERSION` |
| NeoForge | `itzg/minecraft-server` | `/data` | Supported `minor.patch.build` naming maps the game version; complete loader version supplies `NEOFORGE_VERSION` |
| Velocity | `itzg/mc-proxy` | `/server` | `version#build` becomes `VELOCITY_VERSION` plus `VELOCITY_BUILD_ID` |

These are container image contracts, not proof that every historic loader works with every Java version. The guided image is pulled and its registry digest inspected before creation. The container is created from that digest, not the mutable tag. An unknown or malformed response stops creation. Advanced images must implement the documented environment and directory contract; a digest identifies bytes and does not prove application compatibility.

上表將遊戲版本、載入器版本同代理版本分清楚，唔會全部塞入同一個 `VERSION`。一般映像會先下載、查摘要，再用固定摘要建立。摘要只識認位元組，唔會替一個唔相容嘅自訂映像變魔術。Velocity 係代理，仍然需要另外設定真實後端伺服器，建立代理本身唔代表已經有完整可玩組合。

## Port, storage and ownership

The selected host port is authoritative. The plan must contain exactly that port mapped to container port `25565`; a stale conflicting plan is rejected. Existing transport behavior binds the published host port to loopback, so remote clients require a separately reviewed connection or forwarding configuration.

Local creation makes a new child of the application server directory and refuses to reuse an existing folder. SSH creation uses a unique child beneath the saved profile's absolute parent. Containers carry application ownership labels and a random creation identifier. No arbitrary shell command is accepted.

所選主機連接埠係唯一依據；計劃同畫面唔一致就拒絕。主機連接埠維持只綁 loopback，其他電腦唔會因此自動連到。本機拒絕重用已有資料夾；SSH 每次用獨立子目錄，容器加上擁有權標籤同本次建立識別碼。

## Failure modes and recovery

Image download or digest inspection failure prevents container creation. Duplicate registry IDs and conflicting loader overrides are refused. SSH profile changes require reloading the selection.

If container creation succeeds but registry persistence fails, rollback independently inspects the exact container. It requires the current invocation's creation identifier, matching ownership labels, an immutable container ID and a stopped state. Only then does it remove that immutable ID without force. Folder cleanup uses `rmdir`, so nonempty data is retained. Missing proof, a running container, removal failure, or a nonempty directory is reported explicitly. A retained container can be recovered through Adopt existing server; automatic retries never remove an unproven container.

如果容器建立成功但清單寫唔到，回復程序先查返容器本身：標籤、本次識別碼、固定 ID 同停止狀態全部吻合先移除，唔用強制刪除。資料夾只用 `rmdir`，入面有資料就保留。證據唔夠就停手並講清楚，可從「採用現有伺服器」復原。

## Verification and current limits

Focused tests cover each container flavour's exact environment, mounted local/SSH submissions, selected-port mismatch, guided image digest resolution, saved-profile SSH dispatch, and registry-failure rollback that preserves unrelated containers. Typechecks require the workspace declarations to be built first, including `@worldlens/bridge`, `@worldlens/render-actions` and `@worldlens/viewer`.

These checks use command-runner fixtures and mounted components. They do not establish real image download, container readiness, backend reachability, or a playable Velocity topology. Local-process Fabric installer resolution and Forge/NeoForge installer execution remain separate adapter work; this container repair does not claim those local routes are operational.

測試覆蓋每種容器設定、精靈提交、連接埠矛盾、摘要解析、SSH 路由同失敗回復。佢哋仍然係命令執行器測試同掛載元件測試，唔係真實容器啟動證據。本機程序嘅 Fabric 安裝器解析同 Forge/NeoForge 安裝器執行仍屬另一項配接工作。

## Sources and suggested articles

- [Image server-type contract](https://docker-minecraft-server.readthedocs.io/en/latest/types-and-platforms/)
- [Fabric variables](https://docker-minecraft-server.readthedocs.io/en/latest/types-and-platforms/server-types/fabric/)
- [Forge and NeoForge variables](https://docker-minecraft-server.readthedocs.io/en/latest/types-and-platforms/server-types/forge/)
- [Published Java variants](https://docker-minecraft-server.readthedocs.io/en/latest/versions/java/)
- [Proxy image contract](https://github.com/itzg/docker-mc-proxy/blob/master/README.md)
- [SSH host profiles](mcserver-host-profiles.md)
- [Transport boundaries](mcserver-transport.md)
- [Configuration editing](mcserver-config.md)
