# Linux SSH readiness acceptance

Run from the repository root on Linux after installing the locked design workspace dependencies:

```sh
node scripts/acceptance/ssh-process/run.mjs
```

This explicit local check requires Docker on `/var/run/docker.sock`, OpenSSH client tools,
Node and Corepack. It builds an Ubuntu 24.04 fixture with real systemd, OpenSSH and Java 21,
creates fresh fixture keys, and runs five opt-in cases through the production profile store,
validated cached catalogue reader and default SSH command runner. Normal unit runs skip them.
The catalogue is a synthetic, schema-valid fixture for the published 1.21.4 release; this does
not verify catalogue downloads or a Minecraft server artifact.

The cases cover all eight readiness observations, unknown host trust, unauthorized identity,
missing parent directory and a real occupied TCP port. Every report keeps creation disabled.
Checks assert byte-for-byte preservation of local trust/profile/catalogue files and retained
remote content; the missing-directory case also verifies that no directory was created.

The container runs privileged solely to support its private cgroup namespace and real systemd.
It has no host filesystem or Docker socket mounts and no host networking. SSH is published
only on a dynamically allocated loopback port. All setup writes are confined to that owned
fixture. Docker endpoint selectors are cleared for child commands so an inherited remote
context cannot redirect the check. Proxy and registry configuration remain inherited.

Creation and startup are separate so a failed start still leaves an exact container ID for
cleanup. The harness stops/removes that ID, verifies its absence, removes its image tag and
fixture keys, and retains a diagnostic log and receipt in a new temporary directory. Cleanup
failure exits unsuccessfully. Build cache may remain. Receipts identify the starting commit,
whether the source tree was clean, and hashes of the acceptance inputs; a dirty-tree run does
not become evidence for an untouched commit.

This is backend acceptance. It does not establish desktop interaction, Windows acceptance,
remote installation, a Minecraft process, invocation-bound console or the full display matrix.
Readiness remains separate from authority to create a server.

## 廣東話

呢個明確執行嘅 Linux 檢查會建立獨立 Docker fixture，用真實 systemd、SSH 同 Java 21，
再經正式 profile store、cache 讀取同 SSH runner 跑五個測試。catalogue 係符合 schema
嘅測試資料，唔代表已驗證下載來源或者 Minecraft server。一般 unit run 會跳過呢組。

容器只為 private cgroup 同 systemd 使用 privileged 模式，冇掛載主機檔案或者 Docker
socket，SSH 只開喺 loopback。開始前先記低精確容器 ID，完成後停止、移除同確認不存在，
再移除 fixture image tag 同測試金鑰。清理失敗會回傳失敗；log 同來源雜湊收據會保留。
呢啲係後端驗收，唔代表原生介面、Windows、安裝開服、console 或完整畫面矩陣完成。
