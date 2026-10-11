# SSH process lifecycle foundation

## Behaviour

The internal Linux lifecycle module uses a deterministic systemd user-service name derived from the installation's persisted owner UUID, host ID and server ID. Reconnecting reuses that identity. Running status requires the exact unit description, invocation ID, main PID, executable, working directory and NUL-delimited JVM arguments. A second service snapshot checks that the invocation remained stable during process inspection. An unreachable host remains unknown and does not authorize another launch.

Starting requires systemd 254 or newer, enabled user lingering and an available user manager. The module does not enable lingering or alter host configuration. It uses Type=exec, disables environment expansion and restart, and collects inactive units. A successful start command alone is not Minecraft readiness.

Graceful shutdown requires an injected authenticated console that is bound to the reviewed invocation. It never escalates to a signal. Each SSH status command receives the remaining absolute observation deadline and no further command starts after that deadline. Forced termination is unsupported: a unit-name kill is not atomic with invocation verification and could otherwise reach a replacement process.

## Configuration and limitations

The caller must persist the owner UUID once at installation and supply canonical absolute Linux paths. The jar must be inside the managed server folder. Control characters, percent specifiers, noncanonical paths and invalid memory limits are rejected. Spaces, quotes, dollar signs and backslashes are serialized through the existing quoted OpenSSH route. Host-key verification stays strict and password authentication stays disabled.

This module is an internal foundation. Transport registration, installation and file operations, registry persistence, console integration, creation workflow and GUI controls are not connected yet. Windows SSH hosts and hosts without the required systemd user service remain unsupported by this route. There is no new HTTP endpoint or Postman collection.

## Verification

Eighteen controlled lifecycle cases cover ownership separation, invalid paths, contradictory status, foreign services, reconnect without duplicate launch, command serialization, unreachable hosts, stale invocation, graceful timeout, unsupported forced stop, absolute probe deadline and synchronous duplicate activation. Command fixtures prove generated arguments and response handling. They do not prove real systemd argument serialization, persistence after SSH disconnect, remote filesystem operations, live Minecraft readiness or end-to-end GUI acceptance. Those runtime requirements remain pending.

Official implementation references: [systemd-run](https://github.com/systemd/systemd/blob/main/man/systemd-run.xml), [service properties](https://github.com/systemd/systemd/blob/main/man/systemd.service.xml), [process termination](https://github.com/systemd/systemd/blob/main/man/systemd.kill.xml), [user lingering](https://github.com/systemd/systemd/blob/main/man/loginctl.xml). These are capability references, not runtime acceptance evidence.

## 廣東話

呢個內部 Linux 模組用安裝時保存嘅 owner UUID、host ID 同 server ID 決定服務名稱，重新連線唔會另開一個程序。狀態檢查要核對服務資料、invocation ID、PID、執行檔、工作目錄同完整 JVM 參數，再讀一次服務狀態確認中途冇換程序。SSH 連唔到只會記錄未知，唔會當成可以再開服。

啟動需要 systemd 254 或以上、已啟用 user lingering 同可用嘅 user manager。模組唔會自行更改主機設定。正常關服要經過綁定該次程序嘅認證控制台，等候逾時亦唔會自動升級成強制終止。用服務名稱發訊號可能誤中替代程序，所以目前唔提供強制終止。每次 SSH 狀態指令只用剩餘期限，期限過咗唔會再開下一個查詢。

十八個受控測試驗證身分、參數序列化、重連、防重複操作同期限處理。建立流程、檔案操作、保存記錄、控制台同圖形介面仍未接好；真正主機、斷線後持續運行、完整開服同介面驗收亦未完成。
