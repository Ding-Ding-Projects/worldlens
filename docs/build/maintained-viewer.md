# Maintained viewer build ordering

## Behaviour

The workspace `build` command first runs `scripts/build-maintained-webapp.mjs`. It installs the exact npm lockfile and builds `vendor/BlueMap-Material/common/webapp`, then starts the normal recursive workspace build. The source remains pinned by the parent repository's submodule entry. Initialize that submodule before building. No fallback to the unmodified BlueMap reference is permitted.

The helper stops on missing source or lockfile, a spawn error, signal, nonzero install/build result, or missing index, script or stylesheet output. It does not treat an old warm bundle as success after a failed command. The existing CLI staging helper still checks the maintained bundle before replacing its previous output. On Windows, fixed npm arguments use the command shell to reach `npm.cmd`; the source path is passed through `cwd`, never interpolated into command text.

The CLI Dockerfile builds from that same maintained source instead of the upstream reference. Its context excludes both source trees' warm dependencies, Gradle outputs and viewer build outputs. The image builds its own viewer before the filtered CLI workspace build. No production container was launched by this repair.

## Verification and limits

The original failure reproduced locally and in CI run `38790625328`: the CLI required a maintained viewer bundle before that bundle existed. The pinned maintained viewer and complete workspace build passed locally after the repair. Eight helper/staging cases cover build order, dependency/build failures, absent outputs, stale-output preservation and the Windows invocation shape. Windows execution, Docker image/runtime acceptance and current remote CI remain separate verdicts. The Linux workspace command does not substitute for the Windows root `build.bat` or installer entrypoint.

## 廣東話

workspace 嘅 build 會先用固定 npm lockfile 安裝同建置 `vendor/BlueMap-Material/common/webapp`，再建置其他套件。來源仍然由主 repository 嘅 submodule 固定；冇初始化就清楚報錯，唔會退返未改版 BlueMap。安裝、建置、程序啟動或者輸出檢查失敗都會停低，唔會用舊 bundle 扮成功。

Dockerfile 而家亦建置同一份 maintained source，再建置 CLI。context 排除兩份來源嘅舊依賴、Gradle 同 viewer 輸出，唔會靠某部電腦之前留低嘅 bundle。Windows 只用固定 npm 參數經 command shell 執行，路徑經 cwd 傳入。

原本欠缺 viewer bundle 嘅問題喺本機同 CI `38790625328` 都重現。修正次序之後，固定 viewer 同完整 workspace 本機建置通過，八個針對性測試涵蓋次序、失敗、缺少輸出、保留舊輸出同 Windows 呼叫形狀。真正 Windows、Docker 同最新遠端 CI 仍須分開驗證，Linux workspace 結果唔可以代替根目錄 Windows 建置同安裝入口。
