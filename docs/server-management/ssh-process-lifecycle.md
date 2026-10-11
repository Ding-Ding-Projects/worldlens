# SSH process lifecycle foundation

## Behaviour

The internal Linux lifecycle module uses a deterministic systemd user-service name derived from the installation's persisted owner UUID, host ID and server ID. Reconnecting reuses that identity. Running status requires the exact unit description, invocation ID, main PID, executable, working directory and NUL-delimited JVM arguments. A second service snapshot checks that the invocation remained stable during process inspection. An unreachable host remains unknown and does not authorize another launch.

Starting requires systemd 254 or newer, enabled user lingering and an available user manager. The module does not enable lingering or alter host configuration. It uses Type=exec, disables environment expansion and restart, and collects inactive units. A successful start command alone is not Minecraft readiness.

Graceful shutdown requires an injected authenticated console that is bound to the reviewed invocation. It never escalates to a signal. Each SSH status command receives the remaining absolute observation deadline and no further command starts after that deadline. Forced termination is unsupported: a unit-name kill is not atomic with invocation verification and could otherwise reach a replacement process.

## Configuration and limitations

The caller must persist the owner UUID once at installation and supply canonical absolute Linux paths. The jar must be inside the managed server folder. Control characters, percent specifiers, noncanonical paths and invalid memory limits are rejected. Spaces, quotes, dollar signs and backslashes are serialized through the existing quoted OpenSSH route. Host-key verification stays strict and password authentication stays disabled.

The registered `ssh-process` transport persists its host ID, server ID, owner UUID, canonical directory, Java executable, jar path and memory limit. Registry reloads retain the same identity. Records with unknown fields, mismatched server IDs, a local runtime or an adopted origin are rejected. This increment is limited to installations explicitly created by the application; it does not grant adoption authority.

The factory resolves the exact saved host profile, with no local fallback. The production IPC path warms that profile store and publishes the resolved transport's actual capabilities. Start is independently available when permitted; stop, console, creation and file operations remain unavailable and return explicit unsupported results. The UI model consumes individual start/stop capabilities instead of claiming that one available operation proves the entire lifecycle. The RCON path also rejects this target until it can bind the console to the verified remote invocation.

The server list requests capabilities and status in batches of four records. Each new observation clears the old cached result; an unreachable host cannot retain a stale permission grant or running indicator. Request generations prevent older responses, including responses arriving after a record is forgotten, from restoring obsolete state. A failed probe leaves lifecycle actions unavailable with the existing explanatory text. A failed status observation explicitly stores Unknown instead of returning the record to Not checked yet.

Installation and file operations, authenticated console integration and the creation workflow remain unfinished. The creation wizard does not offer this incomplete target. Windows SSH hosts and hosts without the required systemd user service remain unsupported by this route. There is no new HTTP endpoint or Postman collection.

## Verification

Eighteen controlled lifecycle cases cover ownership separation, invalid paths, contradictory status, foreign services, reconnect without duplicate launch, command serialization, unreachable hosts, stale invocation, graceful timeout, unsupported forced stop, absolute probe deadline and synchronous duplicate activation. Seventeen transport/registry/IPC cases cover persisted identity, malformed records, adopted-record rejection with zero SSH execution, host lookup, production/default runner wiring, capability publication, permission reduction and reconnect without duplicate launch. The wider selected registry, IPC and UI-model checks also pass. Command fixtures prove generated arguments and response handling. They do not prove real systemd argument serialization, persistence after SSH disconnect, remote filesystem operations, live Minecraft readiness or end-to-end GUI acceptance. Those runtime requirements remain pending.

Official implementation references: [systemd-run](https://github.com/systemd/systemd/blob/main/man/systemd-run.xml), [service properties](https://github.com/systemd/systemd/blob/main/man/systemd.service.xml), [process termination](https://github.com/systemd/systemd/blob/main/man/systemd.kill.xml), [user lingering](https://github.com/systemd/systemd/blob/main/man/loginctl.xml). These are capability references, not runtime acceptance evidence.

## Bounded native observation

The exact root `build.bat /s` and full UI type check passed at `f1d51b2dd46c7f193d1e5a5e8474bc2e3961b5ab`, with source digest `265f934eb3eb386ed05884c71aecb09fffc053c934e9c8855862ef06715d58a4`. The first attempt ran alongside a full type check and exhausted this host's memory; the serial retry passed. Build and type-check producers must run separately on this host.

A fresh hidden native application with an isolated profile loaded a saved SSH-process fixture whose host profile did not exist. At 1280x752 and 800x600 CSS pixels, English/dark, CDP scale 1.5, it displayed Unknown and disabled Start/Stop with an unavailable-host explanation. The record and controls remained within their owning bounds; the minimum-size document had no horizontal overflow. Recorded interaction intervals contained zero console errors, unhandled exceptions and page errors. This verifies the unavailable-host UI path, not a live SSH connection or physical display scaling.

The 153 distinct cases across selected transport, lifecycle, registry, IPC, UI-model, mounted-list and store runs passed. The final status-state edit was followed by all 24 mounted-list/store cases, independent source review, the exact root build and the full UI type check. Four recorded native process identities, both listeners and the named desktop were absent after normal Close. The temporary profile remains retained after an earlier automatic-approval rejection of profile deletion; no alternate deletion route was attempted. Consequently full cleanup acceptance is incomplete and the inspected captures remain unpromoted. The [sanitized observation record](../evidence/ssh-process-unavailable-f1d51b2d.json) preserves the source binding, measured capture times and limited verdicts.

## 廣東話

呢個內部 Linux 模組用安裝時保存嘅 owner UUID、host ID 同 server ID 決定服務名稱，重新連線唔會另開一個程序。狀態檢查要核對服務資料、invocation ID、PID、執行檔、工作目錄同完整 JVM 參數，再讀一次服務狀態確認中途冇換程序。SSH 連唔到只會記錄未知，唔會當成可以再開服。

啟動需要 systemd 254 或以上、已啟用 user lingering 同可用嘅 user manager。模組唔會自行更改主機設定。正常關服要經過綁定該次程序嘅認證控制台，等候逾時亦唔會自動升級成強制終止。用服務名稱發訊號可能誤中替代程序，所以目前唔提供強制終止。每次 SSH 狀態指令只用剩餘期限，期限過咗唔會再開下一個查詢。

十八個受控測試驗證身分、參數序列化、重連、防重複操作同期限處理。新增十七個測試涵蓋保存及重讀安裝身分、拒絕無效或領養記錄、主機查找、正式 SSH 執行路徑、能力傳遞同防止重複啟動。記錄及 transport 已接入；建立流程、檔案操作、認證控制台同完整圖形介面仍未接好。真正主機、斷線後持續運行、完整開服同介面驗收亦未完成。

最新隔離原生介面測試確認：不存在嘅主機會顯示 Unknown，開始及停止按鈕保持停用，正常及最小尺寸都冇橫向溢出。呢個只證明主機不可用時嘅介面行為，唔係真正 SSH 開服證明。程序、連接埠同隱藏桌面已正常結束；暫存設定保留，完整清理驗收同圖片發布仍未完成。
