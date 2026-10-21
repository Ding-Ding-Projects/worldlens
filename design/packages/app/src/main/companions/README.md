# Companion build host foundation

This module is not registered with a renderer and does not deliver a companion executable.
It supplies the source validation, fixed root commands, observed process lifecycle and local
history foundation for the reviewed companion design.

- `source.ts` resolves the repository common directory and individual checkout identity,
  requires clean source, validates both root batch entrypoints and the Worldlens manifest,
  and binds their hashes to immutable run inputs. Only Build, Build and run, and Build
  installer are accepted. Installer ordinals are positive decimal strings of at most nine
  digits without leading zero. Selected paths never enter shell command text.
  Assume-unchanged, skip-worktree and other unsupported index entries are rejected, including
  in initialized submodules, because ordinary status can conceal modified source in those states.
- `process.ts` launches the exact root batch basename in the selected working directory
  through the Windows command interpreter. Runtime-loader, credential, alternate Git-root
  and inherited build-mode environment overrides are not forwarded. Output is bounded per
  event and stdout/stderr remain distinct.
- `runs.ts` prevents concurrent runs for the same checkout in one host instance, saves run
  identity before launch, observes close and real exit status, rechecks source, and emits
  bounded output and observed phase events. A zero exit is `completed-unverified`, never
  accepted packaging, application health or release proof.
  Persisted phase metadata comes only from the fixed reviewed root-script label table;
  arbitrary console labels remain transient and never enter the run journal.
- `journal.ts` stores owner-local run metadata atomically, without console output or environment
  values. Records must remain in a private application-data directory, outside exports and
  repository source. Unfinished historical runs read as `interrupted`, with process state
  explicitly unknown. History never supplies executable arguments or process IDs to resume or
  terminate a process.

## Integration requirements

Inject a real owned-process-tree controller before enabling cancellation in a production GUI.
The native transport deliberately returns `unavailable` without one; killing just the batch
parent would leave its build children alive. A controller receives only the actual live child
created by this transport and must prove its tree has been controlled without addressing
unrelated processes. The coordinator waits for process completion before reporting `cancelled`.
The caller must retain the host while a run is active, including when its window closes.

Recovery does not authorize retrying an unknown historical process. Reconcile its actual state
before offering a new run. Cross-process exclusive checkout ownership is not implemented by
the in-memory active set and must be added before several companion host instances can run.

Final receipt/artifact acceptance, structured installer stages, application-ready detection,
GUI setup/navigation, portable packaging, IPC registration and release publication are outside
this foundation. The existing root scripts remain responsible for their own acquisition and
output checks. The host does not trigger privilege consent, change security settings or initiate
host power operations. Native Windows launch and cancellation still require runtime verification.

## 廣東話

呢組模組只係伴隨程式嘅主機基礎，未接駁介面，亦未提供可攜式執行檔。
佢會核對儲存庫同工作目錄身分、乾淨來源、兩個根目錄指令碼同雜湊，只接受三個固定建置動作。
退出碼零仍然係未驗證完成，唔代表安裝包、程式健康狀態或者發佈已獲接納。
隱藏索引旗標同不支援索引狀態會被拒絕；儲存嘅階段名稱只來自固定審核清單，任意主控台文字唔會存入歷史。

正式介面啟用取消之前，必須提供只控制本次程序樹嘅主機實作；現時冇呢個能力就清楚回報不可用，
唔會只殺批次檔父程序而遺留子程序。歷史記錄唔會自動重新連線、終止或者重試舊程序。
多個主機實例之間嘅獨佔鎖、正式驗證記錄接納、介面、安裝封裝同發佈仍然未完成。
